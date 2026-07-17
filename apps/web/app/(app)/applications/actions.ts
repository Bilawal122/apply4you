"use server";

import { revalidatePath } from "next/cache";
import {
  PLANS,
  FILLABLE_FIELD_TYPES,
  currentUsagePeriod,
  type Field,
  type PlanId,
  type ResolvedValues,
  type UnresolvedField,
} from "@apply4you/shared";
import { createClient } from "@/lib/supabase/server";
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
    .select("id, user_id, status, unresolved_fields, form_schema, jobs!inner(ats_type)")
    .eq("id", applicationId)
    .eq("user_id", userId)
    .single();
  if (!app) return "not found";
  if (app.status !== "draft") {
    if (app.status === "needs_review") return "answer the required fields first";
    return `already ${app.status}`;
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

export async function approveApplication(applicationId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const limits = await checkLimits(user.id, 1);
  if (limits.allowed < 1) return { error: limits.error ?? "Limit reached" };

  const error = await approveOne(user.id, applicationId);
  if (error) return { error };

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
  const { data: drafts } = await admin
    .from("applications")
    .select("id")
    .eq("user_id", user.id)
    .eq("status", "draft")
    .order("created_at", { ascending: true });
  if (!drafts?.length) return { error: "No drafts ready to approve" };

  const limits = await checkLimits(user.id, drafts.length);
  if (limits.allowed < 1) return { error: limits.error ?? "Limit reached" };

  let approved = 0;
  for (const draft of drafts.slice(0, limits.allowed)) {
    const error = await approveOne(user.id, draft.id);
    if (!error) approved++;
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
