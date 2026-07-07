import { Worker, type Job } from "bullmq";
import { QUEUES, type Field, type ResolvedValues, type UnresolvedField, type AtsType } from "@apply4you/shared";
import { getAdapter, type JobRef } from "@apply4you/ats";
import { resolveDeterministic, resolveFieldsWithLlm, generateCoverLetter } from "@apply4you/ai";
import { connection } from "../queues.js";
import { supabaseAdmin } from "../supabase.js";
import { loadProfileAndPrefs } from "../profile-data.js";

type ResolveData = { applicationId: string };

/** Fields that are filled mechanically or never answered — excluded from resolution. */
function isExcluded(field: Field): boolean {
  if (field.type === "file") return true; // resume upload handled at fill time
  if (field.id === "resume_text") return true; // Greenhouse paste-resume textarea
  if (/^eeo\[/.test(field.id)) return true;
  return false;
}

function isCoverLetterField(field: Field): boolean {
  return field.type === "textarea" && /cover.?letter/i.test(`${field.id} ${field.label}`);
}

async function logEvent(applicationId: string, userId: string, status: string, message: string): Promise<void> {
  await supabaseAdmin().from("application_events").insert({
    application_id: applicationId,
    user_id: userId,
    status,
    message,
  });
}

async function resolveApplication(applicationId: string): Promise<void> {
  const db = supabaseAdmin();

  const { data: app } = await db
    .from("applications")
    .select("id, user_id, job_id, status, jobs!inner(id, ats_type, external_id, apply_url, title, company, description, board_sources(slug))")
    .eq("id", applicationId)
    .single();
  if (!app) throw new Error(`application ${applicationId} not found`);
  if (app.status !== "draft") {
    console.log(`[resolve] ${applicationId} status=${app.status}, skipping`);
    return;
  }

  const jobRow = app.jobs as unknown as {
    id: string;
    ats_type: AtsType;
    external_id: string;
    apply_url: string;
    title: string;
    company: string;
    description: string | null;
    board_sources: { slug: string } | null;
  };

  const { profile } = await loadProfileAndPrefs(app.user_id);
  const adapter = getAdapter(jobRow.ats_type);
  const jobRef: JobRef = {
    atsType: jobRow.ats_type,
    externalId: jobRow.external_id,
    applyUrl: jobRow.apply_url,
    boardSlug: jobRow.board_sources?.slug ?? "",
  };

  // 1. Read the form (API-first for all four ATSs).
  const formSchema = await adapter.readForm(jobRef);

  // 2. Partition: excluded / cover letter / resolvable.
  const workable = formSchema.filter((f) => !isExcluded(f));
  const coverLetterField = workable.find(isCoverLetterField);
  const resolvable = workable.filter((f) => !isCoverLetterField(f));

  // 3. Deterministic pass (FR-12) then one batched LLM call (FR-13).
  const { resolved: deterministic, remaining } = resolveDeterministic(resolvable, profile);
  const llmResolved = await resolveFieldsWithLlm(
    { profile, job: { title: jobRow.title, company: jobRow.company, description: jobRow.description ?? "" } },
    remaining,
  );
  const resolvedFields: ResolvedValues = { ...deterministic, ...llmResolved };

  // 4. Cover letter (FR-17), only when the form asks for one.
  let coverLetter = "";
  if (coverLetterField) {
    const result = await generateCoverLetter({
      profile,
      job: { title: jobRow.title, company: jobRow.company, description: jobRow.description ?? "" },
      maxLength: coverLetterField.maxLength,
    });
    if (result.ok) {
      coverLetter = result.text;
      resolvedFields[coverLetterField.id] = result.text;
    } else {
      resolvedFields[coverLetterField.id] = null;
    }
  }

  // 5. Unresolved bookkeeping (FR-16).
  const unresolved: UnresolvedField[] = workable
    .filter((f) => f.type !== "file" && resolvedFields[f.id] === null)
    .map((f) => ({ id: f.id, label: f.label, required: f.required }));
  const hasRequiredGap = unresolved.some((u) => u.required);
  const status = hasRequiredGap ? "needs_review" : "draft";

  const { error } = await db
    .from("applications")
    .update({
      form_schema: formSchema,
      resolved_fields: resolvedFields,
      unresolved_fields: unresolved,
      cover_letter: coverLetter,
      status,
    })
    .eq("id", applicationId);
  if (error) throw new Error(`application update failed: ${error.message}`);

  await logEvent(
    applicationId,
    app.user_id,
    status,
    hasRequiredGap
      ? `Filled, but ${unresolved.filter((u) => u.required).length} required field(s) need your answer`
      : "Filled and ready for your review",
  );

  console.log(
    `[resolve] ${applicationId}: ${formSchema.length} fields, ${Object.values(resolvedFields).filter((v) => v !== null).length} resolved, ${unresolved.length} unresolved -> ${status}`,
  );
}

export function startResolveWorker(): Worker {
  return new Worker(
    QUEUES.resolve,
    async (job: Job) => {
      const { applicationId } = job.data as ResolveData;
      try {
        await resolveApplication(applicationId);
      } catch (err) {
        if (job.attemptsMade >= 2) {
          // Final attempt: surface the failure on the application.
          const db = supabaseAdmin();
          const { data: app } = await db
            .from("applications")
            .select("user_id")
            .eq("id", applicationId)
            .single();
          await db
            .from("applications")
            .update({ status: "failed", failure_reason: `resolution failed: ${String(err).slice(0, 300)}` })
            .eq("id", applicationId);
          if (app) await logEvent(applicationId, app.user_id, "failed", "Could not read or fill this application form");
        }
        throw err;
      }
    },
    { connection, concurrency: 3, limiter: { max: 30, duration: 60_000 } },
  );
}
