import { Worker, type Job } from "bullmq";
import {
  QUEUES,
  isDemographicField,
  isExcludedFromResolution,
  FILLABLE_FIELD_TYPES,
  resolveFromLibrary,
  type Field,
  type ResolvedValues,
  type UnresolvedField,
  type AtsType,
} from "@apply4you/shared";
import { getAdapter, type JobRef } from "@apply4you/ats";
import { resolveDeterministic, resolveFieldsWithLlm, generateCoverLetter, tailorCv } from "@apply4you/ai";
import { workerConnection } from "../queues.js";
import { supabaseAdmin } from "../supabase.js";
import { loadProfileAndPrefs } from "../profile-data.js";

type ResolveData = { applicationId: string };

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

/** Exported so the resolve path can be exercised inline, without a queue. */
export async function resolveApplication(applicationId: string): Promise<void> {
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

  const { profile, answerLibrary } = await loadProfileAndPrefs(app.user_id);
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
  const workable = formSchema.filter((f) => !isExcludedFromResolution(f));
  const coverLetterField = workable.find(isCoverLetterField);
  const resolvable = workable.filter((f) => !isCoverLetterField(f));

  // 3. Deterministic pass (FR-12), then the user's own saved answers, then one
  //    batched LLM call (FR-13) for whatever is still open.
  //
  //    The library sits BEFORE the model on purpose: these are questions a CV
  //    can never answer (expected salary, notice period, sponsorship), so the
  //    model would null them and park the application. A saved answer is the
  //    user's own words, matched by deterministic patterns — it removes a
  //    needs_review AND saves a model call.
  const { resolved: deterministic, remaining } = resolveDeterministic(resolvable, profile);

  const fromLibrary = resolveFromLibrary(remaining, answerLibrary);
  const stillOpen = remaining.filter((f) => !(f.id in fromLibrary));

  const llmResolved = await resolveFieldsWithLlm(
    { profile, job: { title: jobRow.title, company: jobRow.company, description: jobRow.description ?? "" } },
    stillOpen,
  );
  const resolvedFields: ResolvedValues = { ...deterministic, ...fromLibrary, ...llmResolved };

  // Provenance recorded at resolve time, never inferred at render time.
  const answerSources: Record<string, string> = {};
  for (const id of Object.keys(deterministic)) answerSources[id] = "profile";
  for (const id of Object.keys(fromLibrary)) answerSources[id] = "library";
  for (const [id, v] of Object.entries(llmResolved)) if (v !== null) answerSources[id] = "ai";

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

  // 5. Tailored CV selection (task #40). Best-effort: a failure here must never
  //    cost the user an otherwise-complete application, so it degrades to null
  //    and the packet view falls back to the untailored profile.
  let tailoredCv = null;
  try {
    tailoredCv = await tailorCv({
      profile,
      job: { title: jobRow.title, company: jobRow.company, description: jobRow.description ?? "" },
    });
  } catch (err) {
    console.error(`[resolve] ${applicationId}: tailored CV failed (continuing):`, String(err).slice(0, 200));
  }

  // 6. Unresolved bookkeeping (FR-16).
  const unresolved: UnresolvedField[] = workable
    .filter((f) => f.type !== "file" && resolvedFields[f.id] === null)
    .map((f) => ({ id: f.id, label: f.label, required: f.required }));

  // Pre-flight (DECISIONS.md D3): a required field the fill layer can't
  // reliably drive (consent checkboxes, date pickers, unknown widgets) or a
  // required demographic question parks the application for the human — no
  // best-effort fills on real employers.
  for (const f of formSchema) {
    if (!f.required) continue;
    const unfillable = !FILLABLE_FIELD_TYPES.has(f.type);
    const requiredDemographic = isDemographicField(f.id, f.label);
    if ((unfillable || requiredDemographic) && !unresolved.some((u) => u.id === f.id)) {
      resolvedFields[f.id] = null;
      unresolved.push({ id: f.id, label: f.label, required: true });
    }
  }

  const hasRequiredGap = unresolved.some((u) => u.required);
  const status = hasRequiredGap ? "needs_review" : "draft";

  const { error } = await db
    .from("applications")
    .update({
      form_schema: formSchema,
      resolved_fields: resolvedFields,
      unresolved_fields: unresolved,
      cover_letter: coverLetter,
      tailored_cv: tailoredCv,
      answer_sources: answerSources,
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
    `[resolve] ${applicationId}: ${formSchema.length} fields, ${Object.values(resolvedFields).filter((v) => v !== null).length} resolved (${Object.keys(fromLibrary).length} from your answer library), ${unresolved.length} unresolved -> ${status}`,
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
        // Fire on the LAST attempt, whatever `attempts` is set to. This was
        // `job.attemptsMade >= 2`, which assumed attempts:3 — but no producer
        // set `attempts` at all, BullMQ defaults it to 0/1, and attemptsMade is
        // 0 on the only run. The guard was never true, so a failed resolve
        // wrote no failure_reason, emitted no event, and left the application
        // in `draft` — indistinguishable from one still being worked on.
        const maxAttempts = Math.max(1, job.opts?.attempts ?? 1);
        if (job.attemptsMade >= maxAttempts - 1) {
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
    { connection: workerConnection(), concurrency: 3, limiter: { max: 30, duration: 60_000 } },
  );
}
