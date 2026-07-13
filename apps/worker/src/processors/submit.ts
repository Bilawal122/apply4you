import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Worker, type Job } from "bullmq";
import type { Page } from "playwright";
import {
  submitQueueFor,
  PLANS,
  currentUsagePeriod,
  type AtsType,
  type Field,
  type PlanId,
  type ResolvedValues,
  type SubmitResult,
} from "@apply4you/shared";
import { getAdapter, type JobRef, type LocalFile } from "@apply4you/ats";
import { connection } from "../queues.js";
import { supabaseAdmin } from "../supabase.js";
import { withBrowserContext } from "../browser/pool.js";

type SubmitData = { applicationId: string };

const ATS_TYPES: AtsType[] = ["greenhouse", "lever", "ashby", "workable"];

async function logEvent(applicationId: string, userId: string, status: string, message: string): Promise<void> {
  await supabaseAdmin().from("application_events").insert({
    application_id: applicationId,
    user_id: userId,
    status,
    message,
  });
}

/**
 * Atomic claim: approved -> submitting. Also the second dailyCap / plan-limit
 * enforcement point (the approval API is the first) — the queue can lag past
 * midnight or a user can approve from two tabs.
 */
async function claimApplication(applicationId: string): Promise<
  | { ok: true; userId: string; jobId: string }
  | { ok: false; reason: string }
> {
  const db = supabaseAdmin();

  const { data: app } = await db
    .from("applications")
    .select("id, user_id, job_id, status")
    .eq("id", applicationId)
    .single();
  if (!app) return { ok: false, reason: "not found" };
  if (app.status !== "approved") return { ok: false, reason: `status is ${app.status}` };

  const [{ data: prefs }, { data: sub }, { count: todayCount }] = await Promise.all([
    db.from("preferences").select("daily_cap").eq("user_id", app.user_id).single(),
    db.from("subscriptions").select("plan, applications_limit, period_start").eq("user_id", app.user_id).single(),
    db
      .from("applications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", app.user_id)
      .gte("submitted_at", new Date(new Date().setUTCHours(0, 0, 0, 0)).toISOString()),
  ]);

  const dailyCap = prefs?.daily_cap ?? 25;
  if ((todayCount ?? 0) >= dailyCap) return { ok: false, reason: "daily cap reached" };

  if (sub) {
    const planLimit = sub.applications_limit ?? PLANS[(sub.plan as PlanId) ?? "free"].applicationsLimit;
    // Count submissions in the current rolling period (auto-resets) — same source
    // of truth as the web approval gate, so the two never disagree.
    const { start } = currentUsagePeriod(sub.period_start);
    const { count: usedThisPeriod } = await db
      .from("applications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", app.user_id)
      .eq("status", "submitted")
      .gte("submitted_at", start.toISOString());
    if ((usedThisPeriod ?? 0) >= planLimit) return { ok: false, reason: "plan limit reached" };
  }

  // Conditional transition prevents double-pickup across workers.
  const { data: claimed } = await db
    .from("applications")
    .update({ status: "submitting", attempts: 1 })
    .eq("id", applicationId)
    .eq("status", "approved")
    .select("id");
  if (!claimed?.length) return { ok: false, reason: "already claimed" };

  return { ok: true, userId: app.user_id, jobId: app.job_id };
}

async function saveFailureScreenshot(page: Page, applicationId: string): Promise<void> {
  try {
    const shot = await page.screenshot({ fullPage: false });
    await supabaseAdmin()
      .storage.from("artifacts")
      .upload(`failures/${applicationId}.png`, shot, { contentType: "image/png", upsert: true });
  } catch {
    // best-effort
  }
}

async function submitApplication(applicationId: string): Promise<void> {
  const db = supabaseAdmin();

  const claim = await claimApplication(applicationId);
  if (!claim.ok) {
    console.log(`[submit] ${applicationId}: not submitting (${claim.reason})`);
    return;
  }

  const { data: app } = await db
    .from("applications")
    .select(
      "id, user_id, form_schema, resolved_fields, cover_letter, jobs!inner(id, ats_type, external_id, apply_url, board_sources(slug))",
    )
    .eq("id", applicationId)
    .single();
  if (!app) throw new Error("application vanished after claim");

  const jobRow = app.jobs as unknown as {
    ats_type: AtsType;
    external_id: string;
    apply_url: string;
    board_sources: { slug: string } | null;
  };
  const fields = (app.form_schema ?? []) as Field[];
  const values = (app.resolved_fields ?? {}) as ResolvedValues;

  const fail = async (reason: string, detail?: string): Promise<void> => {
    await db
      .from("applications")
      .update({ status: "failed", failure_reason: detail ? `${reason}: ${detail}` : reason })
      .eq("id", applicationId);
    await logEvent(applicationId, app.user_id, "failed", `Submission failed (${reason}) — you can apply manually via the posting link`);
  };

  // Resume file comes from Storage; Playwright needs it on disk.
  const { data: profileRow } = await db
    .from("profiles")
    .select("resume_storage_path, resume_filename")
    .eq("user_id", app.user_id)
    .single();
  if (!profileRow?.resume_storage_path) {
    await fail("no_resume", "no resume on file");
    return;
  }
  const { data: blob, error: dlError } = await db.storage.from("resumes").download(profileRow.resume_storage_path);
  if (dlError || !blob) {
    await fail("resume_download", dlError?.message);
    return;
  }

  const tempDir = await mkdtemp(join(tmpdir(), "a4y-"));
  const resumePath = join(tempDir, profileRow.resume_filename ?? "resume.pdf");
  await writeFile(resumePath, Buffer.from(await blob.arrayBuffer()));
  const resume: LocalFile = {
    path: resumePath,
    filename: profileRow.resume_filename ?? "resume.pdf",
    mimeType: resumePath.endsWith(".docx")
      ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      : "application/pdf",
  };

  const adapter = getAdapter(jobRow.ats_type);
  const jobRef: JobRef = {
    atsType: jobRow.ats_type,
    externalId: jobRow.external_id,
    applyUrl: jobRow.apply_url,
    boardSlug: jobRow.board_sources?.slug ?? "",
  };
  const url = adapter.fillUrl?.(jobRef) ?? jobRef.applyUrl;

  await logEvent(applicationId, app.user_id, "submitting", "Opening the application form");

  try {
    const result: SubmitResult = await withBrowserContext(async (context) => {
      const page = await context.newPage();
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
      await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => undefined);

      const preBlock = await adapter.detectBlock(page);
      if (preBlock) {
        await saveFailureScreenshot(page, applicationId);
        return { outcome: "failed", reason: preBlock === "captcha" ? "captcha" : "bot_wall" } satisfies SubmitResult;
      }

      await adapter.fillForm(page, fields, values, resume);

      const postBlock = await adapter.detectBlock(page);
      if (postBlock) {
        await saveFailureScreenshot(page, applicationId);
        return { outcome: "failed", reason: postBlock === "captcha" ? "captcha" : "bot_wall" } satisfies SubmitResult;
      }

      // The submit click itself is single-shot — never blind-retried (a
      // timeout may still have submitted; the adapter re-checks confirmation).
      const submitResult = await adapter.submit(page);
      if (submitResult.outcome === "failed") await saveFailureScreenshot(page, applicationId);
      return submitResult;
    });

    if (result.outcome === "submitted") {
      await db
        .from("applications")
        .update({
          status: "submitted",
          submitted_fields: values, // immutable snapshot (FR-33)
          submitted_at: new Date().toISOString(),
        })
        .eq("id", applicationId);
      // Metering (FR-40).
      const { data: sub } = await db
        .from("subscriptions")
        .select("applications_used")
        .eq("user_id", app.user_id)
        .single();
      if (sub) {
        await db
          .from("subscriptions")
          .update({ applications_used: sub.applications_used + 1 })
          .eq("user_id", app.user_id);
      }
      await logEvent(applicationId, app.user_id, "submitted", "Application submitted");
      console.log(`[submit] ${applicationId}: submitted`);
    } else {
      await fail(result.reason, result.detail);
      console.log(`[submit] ${applicationId}: failed (${result.reason})`);
    }
  } catch (err) {
    await fail("navigation_error", String(err).slice(0, 300));
    console.error(`[submit] ${applicationId}: error`, err);
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

export function startSubmitWorkers(): Worker[] {
  return ATS_TYPES.map(
    (atsType) =>
      new Worker(
        submitQueueFor(atsType),
        async (job: Job) => submitApplication((job.data as SubmitData).applicationId),
        {
          connection,
          concurrency: 1, // one browser submission at a time per ATS
          limiter: { max: 6, duration: 60_000 }, // conservative per-ATS pace
        },
      ),
  );
}
