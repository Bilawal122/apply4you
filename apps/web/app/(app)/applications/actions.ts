"use server";

import { revalidatePath } from "next/cache";
import {
  PLANS,
  FILLABLE_FIELD_TYPES,
  isDemographicField,
  ReviewMetricsSchema,
  type ReviewMetrics,
  currentUsagePeriod,
  type Field,
  type PlanId,
  type ResolvedValues,
  type UnresolvedField,
} from "@apply4you/shared";
import { resolveFieldsWithLlm } from "@apply4you/ai";
import { createClient } from "@/lib/supabase/server";
import { rowToProfile, type ProfileRow } from "@/lib/profile";
import { ensureUsageSink } from "@/lib/ai-usage";
import { createAdminClient } from "@/lib/supabase/admin";
import { enqueueSubmit } from "@/lib/queue";

type ActionResult = { error?: string; approved?: number };

/** User edits to filled values — allowed while draft / needs_review (RLS-enforced). */
export async function saveApplicationFields(
  applicationId: string,
  resolvedFields: ResolvedValues,
  coverLetter: string | null,
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const { data: app } = await supabase
    .from("applications")
    .select("id, status, form_schema, resolved_fields")
    .eq("id", applicationId)
    .single();
  if (!app) return { error: "Application not found" };
  if (!["draft", "needs_review"].includes(app.status)) return { error: "Already approved or submitted" };

  const schema = (app.form_schema ?? []) as Field[];
  const knownIds = new Set(schema.map((f) => f.id));
  const merged: ResolvedValues = { ...(app.resolved_fields as ResolvedValues) };
  for (const [id, value] of Object.entries(resolvedFields)) {
    if (knownIds.has(id)) merged[id] = value === "" ? null : value;
  }

  const unresolved: UnresolvedField[] = schema
    .filter((f) => f.type !== "file" && (merged[f.id] ?? null) === null)
    .map((f) => ({ id: f.id, label: f.label, required: f.required }));
  const status = unresolved.some((u) => u.required) ? "needs_review" : "draft";

  const { error } = await supabase
    .from("applications")
    .update({
      resolved_fields: merged,
      cover_letter: coverLetter ?? undefined,
      unresolved_fields: unresolved,
      status,
    })
    .eq("id", applicationId);
  if (error) return { error: error.message };

  revalidatePath("/applications", "page");
  return {};
}

async function checkLimits(
  userId: string,
  requested: number,
): Promise<{ allowed: number; error?: string }> {
  const admin = createAdminClient();
  const [{ data: prefs }, { data: sub }, { count: todaySubmitted }, { count: inFlight }] = await Promise.all([
    admin.from("preferences").select("daily_cap").eq("user_id", userId).single(),
    admin.from("subscriptions").select("plan, applications_limit, period_start").eq("user_id", userId).single(),
    admin
      .from("applications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("submitted_at", new Date(new Date().setUTCHours(0, 0, 0, 0)).toISOString()),
    admin
      .from("applications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .in("status", ["approved", "submitting"]),
  ]);

  const dailyCap = prefs?.daily_cap ?? 25;
  const dailyRoom = Math.max(0, dailyCap - (todaySubmitted ?? 0) - (inFlight ?? 0));
  if (dailyRoom === 0) return { allowed: 0, error: `Daily cap (${dailyCap}) reached — try again tomorrow` };

  let planRoom = Infinity;
  if (sub) {
    const limit = sub.applications_limit ?? PLANS[(sub.plan as PlanId) ?? "free"].applicationsLimit;
    // Usage = applications submitted in the current rolling period (auto-resets),
    // plus approved/submitting in-flight so a burst of approvals can't exceed the cap.
    const { start } = currentUsagePeriod(sub.period_start);
    const { count: usedThisPeriod } = await admin
      .from("applications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("status", "submitted")
      .gte("submitted_at", start.toISOString());
    planRoom = Math.max(0, limit - (usedThisPeriod ?? 0) - (inFlight ?? 0));
    if (planRoom === 0) return { allowed: 0, error: "Plan application limit reached" };
  }

  return { allowed: Math.min(requested, dailyRoom, planRoom) };
}

async function approveOne(userId: string, applicationId: string): Promise<string | null> {
  const admin = createAdminClient();

  const { data: app } = await admin
    .from("applications")
    .select("id, user_id, status, unresolved_fields, form_schema, jobs!inner(ats_type, closed_at)")
    .eq("id", applicationId)
    .eq("user_id", userId)
    .single();
  if (!app) return "not found";
  if (app.status !== "draft") {
    if (app.status === "needs_review") return "answer the required fields first";
    return `already ${app.status}`;
  }

  // The posting can close between queueing and approval. The submit worker
  // already fails gracefully on a dead form (DECISIONS.md D3), but only after
  // claiming a daily-cap slot and spending a browser run — and the user has
  // spent their attention reviewing something that was never going to send.
  // If the poller has already recorded closed_at, say so now.
  if ((app.jobs as unknown as { closed_at: string | null }).closed_at) {
    return "this posting has closed since it was queued — nothing to send, so Skip it";
  }

  // A required field type the fill layer can't drive (consent checkbox, date
  // picker, unknown widget) would fail on the employer's validation every
  // time — refuse the approval instead (DECISIONS.md D3).
  const undrivable = ((app.form_schema ?? []) as Field[]).find(
    (f) => f.required && !FILLABLE_FIELD_TYPES.has(f.type),
  );
  if (undrivable) {
    return `this form has a required "${undrivable.label.slice(0, 60)}" (${undrivable.type}) we can't fill automatically — apply via the posting link, then Skip this one`;
  }

  const { data: transitioned } = await admin
    .from("applications")
    .update({ status: "approved" })
    .eq("id", applicationId)
    .eq("status", "draft")
    .select("id");
  if (!transitioned?.length) return "already picked up";

  await admin.from("application_events").insert({
    application_id: applicationId,
    user_id: userId,
    status: "approved",
    message: "Approved — queued for submission",
  });

  const atsType = (app.jobs as unknown as { ats_type: string }).ats_type;
  await enqueueSubmit(atsType, applicationId);
  return null;
}

/**
 * Review-quality metrics are stored on the way through (C2 / D6). They are
 * advisory data, never a gate: a bad-looking review must not block the user's
 * own application, so a malformed payload is dropped rather than rejected.
 */
async function recordReviewMetrics(applicationId: string, metrics?: ReviewMetrics): Promise<void> {
  if (!metrics) return;
  const parsed = ReviewMetricsSchema.safeParse(metrics);
  if (!parsed.success) return;
  await createAdminClient()
    .from("applications")
    .update({ review_metrics: parsed.data })
    .eq("id", applicationId);
}

export async function approveApplication(
  applicationId: string,
  metrics?: ReviewMetrics,
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const limits = await checkLimits(user.id, 1);
  if (limits.allowed < 1) return { error: limits.error ?? "Limit reached" };

  const error = await approveOne(user.id, applicationId);
  if (error) return { error };
  await recordReviewMetrics(applicationId, metrics);

  revalidatePath("/applications", "page");
  return { approved: 1 };
}

export async function approveAllDrafts(): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const admin = createAdminClient();
  // Closed postings are excluded here, not just refused by approveOne: they
  // would otherwise inflate the count fed to checkLimits and consume slots in
  // the slice below, so the user would get fewer real submissions than their
  // cap allows — and never be told why.
  const { data: drafts } = await admin
    .from("applications")
    .select("id, jobs!inner(closed_at)")
    .eq("user_id", user.id)
    .eq("status", "draft")
    .is("jobs.closed_at", null)
    .order("created_at", { ascending: true });
  if (!drafts?.length) return { error: "No drafts ready to approve" };

  const limits = await checkLimits(user.id, drafts.length);
  if (limits.allowed < 1) return { error: limits.error ?? "Limit reached" };

  let approved = 0;
  for (const draft of drafts.slice(0, limits.allowed)) {
    const error = await approveOne(user.id, draft.id);
    if (error) continue;
    approved++;
    // Recorded as a genuine zero-second, never-opened review rather than left
    // blank. An unreviewed approval is the single most important observation
    // D6 asks for; omitting it would flatter the median into meaninglessness.
    await recordReviewMetrics(draft.id, {
      openedCount: 0,
      seconds: 0,
      fieldsEdited: 0,
      aiFieldsEdited: 0,
      coverLetterEdited: false,
      bulk: true,
    });
  }

  revalidatePath("/applications", "page");
  return { approved };
}

/** User decides not to apply after reviewing. */
export async function skipApplication(applicationId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const admin = createAdminClient();
  const { data: transitioned } = await admin
    .from("applications")
    .update({ status: "skipped" })
    .eq("id", applicationId)
    .eq("user_id", user.id)
    .in("status", ["draft", "needs_review"])
    .select("id");
  if (!transitioned?.length) return { error: "Cannot skip at this stage" };

  await admin.from("application_events").insert({
    application_id: applicationId,
    user_id: user.id,
    status: "skipped",
    message: "Skipped by you",
  });

  revalidatePath("/applications", "page");
  return {};
}

/**
 * "Fill with AI" — draft one specific answer on demand (user-initiated).
 *
 * The resolver deliberately leaves a field null when it can't ground an answer
 * in the profile, which is right for an automated pass but leaves the user
 * staring at a blank box. This lets them ask for a draft for that one field,
 * explicitly, and then edit it.
 *
 * It is still grounded in the profile and still refuses to invent facts — the
 * difference is consent and scope, not licence. The result is marked as
 * AI-written in answer_sources so provenance stays honest.
 */
export async function fillFieldWithAi(
  applicationId: string,
  fieldId: string,
): Promise<{ value?: string; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const { data: app } = await supabase
    .from("applications")
    .select("id, status, form_schema, resolved_fields, answer_sources, jobs!inner(title, company, description)")
    .eq("id", applicationId)
    .maybeSingle<{
      id: string;
      status: string;
      form_schema: Field[] | null;
      resolved_fields: ResolvedValues | null;
      answer_sources: Record<string, string> | null;
      jobs: { title: string; company: string; description: string | null };
    }>();
  if (!app) return { error: "Application not found" };
  if (!["draft", "needs_review"].includes(app.status)) {
    return { error: "This application is no longer editable" };
  }

  const field = (app.form_schema ?? []).find((f) => f.id === fieldId);
  if (!field) return { error: "Unknown field" };

  // Demographic/EEO questions are never machine-answered, on request or
  // otherwise (DECISIONS.md D3.5). Asking nicely does not change that.
  if (isDemographicField(field.id, field.label)) {
    return { error: "We never answer demographic questions for you — this one is yours alone." };
  }

  const { data: profileRow } = await supabase.from("profiles").select("*").maybeSingle<ProfileRow>();
  if (!profileRow) return { error: "No profile yet" };

  await ensureUsageSink();
  let value: string | null = null;
  try {
    const resolved = await resolveFieldsWithLlm(
      {
        profile: rowToProfile(profileRow),
        job: {
          title: app.jobs.title,
          company: app.jobs.company,
          description: app.jobs.description ?? "",
        },
      },
      [field],
    );
    value = resolved[field.id] ?? null;
  } catch (err) {
    return { error: `Couldn't draft an answer: ${String(err).slice(0, 120)}` };
  }

  if (!value) {
    return {
      error:
        "Nothing in your profile answers this one, so we won't guess. Add it to your profile or answer it yourself.",
    };
  }

  const { error } = await supabase
    .from("applications")
    .update({
      resolved_fields: { ...(app.resolved_fields ?? {}), [fieldId]: value },
      answer_sources: { ...(app.answer_sources ?? {}), [fieldId]: "ai" },
    })
    .eq("id", applicationId);
  if (error) return { error: error.message };

  revalidatePath("/applications", "page");
  return { value };
}
