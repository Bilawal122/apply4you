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
    .select("id, user_id, job_id, status, jobs!inner(ats_type, company)")
    .eq("id", applicationId)
    .single();
  if (!app) return { ok: false, reason: "not found" };
  if (app.status !== "approved") return { ok: false, reason: `status is ${app.status}` };
  const jobMeta = app.jobs as unknown as { ats_type: string; company: string };

  // Circuit breaker (DECISIONS.md D3): a tripped ATS holds its queue. The
  // application stays `approved`; re-arm (paused=false) and re-enqueue to resume.
  const { data: health } = await db
    .from("ats_health")
    .select("paused")
    .eq("ats_type", jobMeta.ats_type)
    .single();
  if (health?.paused) {
    await logEvent(applicationId, app.user_id, "approved", `Held — ${jobMeta.ats_type} submissions are paused (circuit breaker)`);
    return { ok: false, reason: `${jobMeta.ats_type} paused by circuit breaker` };
  }

  // Blocklist backstop (DECISIONS.md D3): companies the user applied to
  // manually (or never wants touched) must never receive an automated submit,
  // even if a draft was queued before the company was listed.
  const { data: prefsRow } = await db
    .from("preferences")
    .select("excluded_companies")
    .eq("user_id", app.user_id)
    .single();
  const excluded = (prefsRow?.excluded_companies ?? []) as string[];
  if (excluded.some((c) => c.trim().toLowerCase() === jobMeta.company.trim().toLowerCase())) {
    await db.from("applications").update({ status: "skipped" }).eq("id", applicationId).eq("status", "approved");
    await logEvent(applicationId, app.user_id, "skipped", `Blocked — ${jobMeta.company} is on your do-not-apply list`);
    return { ok: false, reason: `company blocklisted: ${jobMeta.company}` };
  }

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

/** Proof of what the ATS showed after a successful submit (DECISIONS.md D3). */
async function saveConfirmationScreenshot(page: Page, applicationId: string): Promise<void> {
  try {
    const shot = await page.screenshot({ fullPage: false });
    await supabaseAdmin()
      .storage.from("artifacts")
      .upload(`confirmations/${applicationId}.png`, shot, { contentType: "image/png", upsert: true });
  } catch {
    // best-effort
  }
}

const CIRCUIT_BREAKER_THRESHOLD = 3;

/**
 * Circuit breaker bookkeeping (DECISIONS.md D3): consecutive submission
 * failures trip the breaker for that ATS; a success resets it. Captcha rate is
 * the leading indicator of bot detection — pausing early protects every
 * user's account standing with that ATS.
 */
async function recordAtsOutcome(atsType: AtsType, ok: boolean, reason?: string): Promise<void> {
  const db = supabaseAdmin();
  const { data: health } = await db
    .from("ats_health")
    .select("consecutive_failures, paused")
    .eq("ats_type", atsType)
    .single();
  if (!health) return;

  if (ok) {
    if (health.consecutive_failures > 0 || health.paused) {
      await db
        .from("ats_health")
        .update({ consecutive_failures: 0, last_failure_reason: null, updated_at: new Date().toISOString() })
        .eq("ats_type", atsType);
    }
    return;
  }

  const failures = health.consecutive_failures + 1;
  const paused = failures >= CIRCUIT_BREAKER_THRESHOLD;
  await db
    .from("ats_health")
    .update({
      consecutive_failures: failures,
      paused: health.paused || paused,
      last_failure_reason: reason ?? "unknown",
      updated_at: new Date().toISOString(),
    })
    .eq("ats_type", atsType);
  if (paused && !health.paused) {
    console.error(
      `[submit] CIRCUIT BREAKER TRIPPED for ${atsType} after ${failures} consecutive failures (${reason}) — submissions paused until ats_health.paused is manually reset`,
    );
  }
}

/**
 * Text signatures of a CLOSED-posting page. Deliberately narrow — phrases like
 * "until the position has been filled" or "no longer accepting agency
 * submissions" appear inside live job descriptions, so a match only counts
 * when the page ALSO has no application form (no submit control). A false
 * closed_at self-heals on the next 2h poll (open jobs upsert closed_at=null).
 */
const CLOSED_POSTING_PATTERN =
  /(this (job|posting|position|role) (is no longer|has been) (open|available|closed|removed|filled)|job (posting )?(is )?(closed|not found|expired)|no longer accepting applications|position is no longer available)/i;

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
      "id, user_id, form_schema, resolved_fields, cover_letter, jobs!inner(id, ats_type, external_id, apply_url, title, company, location, description, board_sources(slug))",
    )
    .eq("id", applicationId)
    .single();
  if (!app) throw new Error("application vanished after claim");

  const jobRow = app.jobs as unknown as {
    ats_type: AtsType;
    external_id: string;
    apply_url: string;
    title: string;
    company: string;
    location: string | null;
    description: string | null;
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

  // Human-ish pacing (DECISIONS.md D3): never fire the instant the queue hands
  // us a job — 10-45s of jitter on top of the per-ATS rate limiter.
  await new Promise((r) => setTimeout(r, 10_000 + Math.random() * 35_000));

  try {
    const result: SubmitResult = await withBrowserContext(async (context) => {
      const page = await context.newPage();
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
      await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => undefined);

      // Staleness guard (DECISIONS.md D3): the posting may have closed between
      // queueing and submission — fail gracefully, never fill a dead form.
      // Closed text alone is not enough (live JDs contain similar phrases);
      // a truly closed page also has no application form to submit.
      const bodyText = await page.locator("body").innerText({ timeout: 5000 }).catch(() => "");
      const hasSubmitControl =
        (await page.locator('button[type="submit"], input[type="submit"]').count()) > 0;
      if (CLOSED_POSTING_PATTERN.test(bodyText.slice(0, 3000)) && !hasSubmitControl) {
        await supabaseAdmin().from("jobs").update({ closed_at: new Date().toISOString() }).eq("id", claim.jobId);
        return { outcome: "failed", reason: "posting_closed", detail: "posting closed before submission" } satisfies SubmitResult;
      }

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
      // Proof of success: capture what the ATS showed (DECISIONS.md D3).
      if (submitResult.outcome === "submitted") await saveConfirmationScreenshot(page, applicationId);
      return submitResult;
    });

    if (result.outcome === "submitted") {
      await db
        .from("applications")
        .update({
          status: "submitted",
          submitted_fields: values, // immutable snapshot (FR-33)
          // Retention (DECISIONS.md D4): the job row may be purged 30 days
          // after closing — everything interview prep or an audit needs
          // lives on the application from the moment of submission.
          job_snapshot: {
            title: jobRow.title,
            company: jobRow.company,
            location: jobRow.location,
            description: jobRow.description,
            apply_url: jobRow.apply_url,
            ats_type: jobRow.ats_type,
            captured_at: new Date().toISOString(),
          },
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
      await recordAtsOutcome(jobRow.ats_type, true);
      console.log(`[submit] ${applicationId}: submitted`);
    } else {
      await fail(result.reason, result.detail);
      // Only genuine bot-detection signals count toward the breaker —
      // form_error / timeouts / stale postings are application-specific and
      // must not halt an entire ATS for every user.
      if (result.reason === "captcha" || result.reason === "bot_wall") {
        await recordAtsOutcome(jobRow.ats_type, false, result.reason);
      }
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
          // DECISIONS.md D3: minutes apart, not seconds — 1 per 3min per ATS
          // (plus 10-45s jitter inside the processor).
          limiter: { max: 1, duration: 180_000 },
        },
      ),
  );
}
