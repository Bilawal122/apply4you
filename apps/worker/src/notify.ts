import { supabaseAdmin } from "./supabase.js";

/**
 * Optional Resend email (mirrors the Sentry pattern in index.ts): inert until
 * RESEND_API_KEY is set, so this ships safely with no account yet configured.
 * Phase 1 of the email plan (VISION.md 2d) — transactional, tied to an action
 * the user themselves took (approving an application), not marketing.
 */
type ResendClient = { emails: { send(opts: { from: string; to: string; subject: string; html: string }): Promise<unknown> } };

let resend: ResendClient | null = null;
let initTried = false;

async function client(): Promise<ResendClient | null> {
  if (initTried) return resend;
  initTried = true;
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  try {
    const { Resend } = await import("resend");
    resend = new Resend(key) as unknown as ResendClient;
    console.log("[notify] resend enabled");
  } catch (err) {
    console.error("[notify] resend init failed:", String(err).slice(0, 200));
  }
  return resend;
}

const FROM = process.env.NOTIFY_FROM_EMAIL ?? "Apply4You <notifications@apply4you.app>";

async function accountEmail(userId: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin().auth.admin.getUserById(userId);
  if (error || !data?.user?.email) return null;
  return data.user.email;
}

function escapeHtml(s: string): string {
  const map: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return s.replace(/[&<>"']/g, (c) => map[c] ?? c);
}

async function send(userId: string, subject: string, html: string): Promise<void> {
  const r = await client();
  if (!r) return;
  try {
    const to = await accountEmail(userId);
    if (!to) return;
    await r.emails.send({ from: FROM, to, subject, html });
  } catch (err) {
    // Never let a notification failure affect the submission it's reporting on.
    console.error("[notify] send failed:", String(err).slice(0, 200));
  }
}

export async function notifySubmitted(
  userId: string,
  job: { title: string; company: string; applyUrl: string },
): Promise<void> {
  const title = escapeHtml(job.title);
  const company = escapeHtml(job.company);
  await send(
    userId,
    `Applied: ${job.title} at ${job.company}`,
    `<p>Your application to <strong>${title}</strong> at <strong>${company}</strong> was submitted.</p>
     <p><a href="${job.applyUrl}">View the original posting</a></p>
     <p style="color:#888;font-size:12px">Every answer we submitted is saved and reviewable in your Apply4You dashboard.</p>`,
  );
}

export async function notifyFailed(
  userId: string,
  job: { title: string; company: string },
  reason: string,
): Promise<void> {
  const title = escapeHtml(job.title);
  const company = escapeHtml(job.company);
  await send(
    userId,
    `Needs attention: ${job.title} at ${job.company}`,
    `<p>We couldn't submit your application to <strong>${title}</strong> at <strong>${company}</strong> (${escapeHtml(reason)}).</p>
     <p>You can review it, or apply manually, from your Apply4You dashboard.</p>`,
  );
}
