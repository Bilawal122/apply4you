import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Two-user RLS / storage isolation suite (P1-09). TESTING.md designed these
 * (WEB-5.1, the CV-route fixture, job_embeddings anon checks) but nothing
 * implemented them — multi-tenancy has never been proven, only trusted.
 *
 * Seeds two throwaway users plus a fixture job/application with the service
 * role, then asserts as user A, user B, and anon that nothing crosses
 * accounts. Cleans up after itself (deleting the users cascades the rows).
 *
 * SAFETY: refuses to run against a non-local SUPABASE_URL unless
 * --allow-remote is passed, because it creates and deletes real auth users.
 *
 * Run (local stack):  supabase start, then
 *   pnpm --filter @apply4you/worker exec tsx --env-file=../../.env src/scripts/test-rls.ts
 * Requires SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and the anon key in
 * NEXT_PUBLIC_SUPABASE_ANON_KEY (or SUPABASE_ANON_KEY).
 */

let failures = 0;
function check(name: string, ok: boolean, detail?: string): void {
  if (ok) {
    console.log(`  ok    ${name}`);
  } else {
    failures++;
    console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function main(): Promise<void> {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY;
  if (!url || !serviceKey || !anonKey) {
    console.error(
      "SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set",
    );
    process.exit(1);
  }
  const host = new URL(url).hostname;
  const local = host === "localhost" || host === "127.0.0.1" || host.endsWith(".local");
  if (!local && !process.argv.includes("--allow-remote")) {
    console.error(
      `refusing to run against non-local Supabase (${host}) — this creates and deletes auth users. Pass --allow-remote if you really mean it.`,
    );
    process.exit(1);
  }

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const stamp = Date.now();
  const password = `rls-test-${stamp}-Aa1!`;
  const emails = [`rls-a-${stamp}@example.com`, `rls-b-${stamp}@example.com`];
  const userIds: string[] = [];
  let jobId: string | null = null;
  let boardId: string | null = null;

  try {
    // ── Fixtures (service role) ─────────────────────────────────────────
    for (const email of emails) {
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (error || !data.user) throw new Error(`createUser ${email}: ${error?.message}`);
      userIds.push(data.user.id); // handle_new_user trigger seeds profile/prefs/subscription
    }
    const [aId, bId] = userIds as [string, string];

    const { data: board, error: boardErr } = await admin
      .from("board_sources")
      .insert({ ats_type: "greenhouse", slug: `rls-test-${stamp}`, company_name: "RLS Test Co", active: false })
      .select("id")
      .single();
    if (boardErr || !board) throw new Error(`board fixture: ${boardErr?.message}`);
    boardId = board.id as string;

    const { data: job, error: jobErr } = await admin
      .from("jobs")
      .insert({
        board_source_id: boardId,
        ats_type: "greenhouse",
        external_id: `rls-${stamp}`,
        title: "RLS Test Role",
        company: "RLS Test Co",
        apply_url: "https://example.com/apply",
        description: "fixture",
      })
      .select("id")
      .single();
    if (jobErr || !job) throw new Error(`job fixture: ${jobErr?.message}`);
    jobId = job.id as string;

    const { data: appA, error: appErr } = await admin
      .from("applications")
      .insert({ user_id: aId, job_id: jobId, mode: "auto", status: "draft", resolved_fields: { secret: "A's answer" } })
      .select("id")
      .single();
    if (appErr || !appA) throw new Error(`application fixture: ${appErr?.message}`);
    await admin.from("application_events").insert({
      application_id: appA.id,
      user_id: aId,
      status: "draft",
      message: "fixture event",
    });
    await admin.from("job_matches").upsert({ user_id: aId, job_id: jobId, score: 90 });

    const signIn = async (email: string): Promise<SupabaseClient> => {
      const client = createClient(url, anonKey, { auth: { persistSession: false } });
      const { error } = await client.auth.signInWithPassword({ email, password });
      if (error) throw new Error(`sign-in ${email}: ${error.message}`);
      return client;
    };
    const asA = await signIn(emails[0]!);
    const asB = await signIn(emails[1]!);
    const asAnon = createClient(url, anonKey, { auth: { persistSession: false } });

    // ── User A sees their own rows ──────────────────────────────────────
    console.log("as user A (owner):");
    const { data: ownApp } = await asA.from("applications").select("id").eq("id", appA.id);
    check("A reads their own application", (ownApp ?? []).length === 1);
    const { data: ownProfile } = await asA.from("profiles").select("user_id").eq("user_id", aId);
    check("A reads their own profile", (ownProfile ?? []).length === 1);

    // ── User B must see nothing of A's ──────────────────────────────────
    console.log("as user B (other account):");
    for (const [table, filter] of [
      ["profiles", { user_id: aId }],
      ["preferences", { user_id: aId }],
      ["applications", { id: appA.id }],
      ["application_events", { user_id: aId }],
      ["job_matches", { user_id: aId }],
      ["subscriptions", { user_id: aId }],
    ] as const) {
      const { data } = await asB.from(table).select("*").match(filter as Record<string, string>);
      check(`B cannot read A's ${table}`, (data ?? []).length === 0, `got ${data?.length} row(s)`);
    }

    // Cross-user UPDATE by direct id must be a no-op (WEB-5.1).
    await asB.from("applications").update({ resolved_fields: { secret: "B was here" } }).eq("id", appA.id);
    const { data: afterUpdate } = await admin
      .from("applications")
      .select("resolved_fields")
      .eq("id", appA.id)
      .single();
    check(
      "B's update of A's application is a no-op",
      (afterUpdate?.resolved_fields as { secret?: string })?.secret === "A's answer",
    );

    // Cross-user INSERT impersonation must be refused.
    const { error: forgeErr } = await asB
      .from("applications")
      .insert({ user_id: aId, job_id: jobId, mode: "auto", status: "draft" });
    check("B cannot insert an application as A", forgeErr !== null);

    // ── Storage isolation ───────────────────────────────────────────────
    const bytes = new Blob(["rls test"], { type: "text/plain" });
    const { error: aUp } = await asA.storage.from("resumes").upload(`${aId}/resume.pdf`, bytes);
    check("A can write their own resume path", aUp === null, aUp?.message);
    const { error: bUp } = await asB.storage.from("resumes").upload(`${aId}/evil.pdf`, bytes);
    check("B cannot write into A's resume prefix", bUp !== null);
    const { data: bRead } = await asB.storage.from("resumes").download(`${aId}/resume.pdf`);
    check("B cannot download A's resume", !bRead);
    const { data: bList } = await asB.storage.from("resumes").list(aId);
    check("B cannot list A's resume folder", (bList ?? []).length === 0);

    // ── Anonymous sees nothing ──────────────────────────────────────────
    console.log("as anon:");
    for (const table of ["profiles", "applications", "job_matches", "application_events", "job_embeddings"]) {
      const { data } = await asAnon.from(table).select("*").limit(1);
      check(`anon reads zero rows from ${table}`, (data ?? []).length === 0, `got ${data?.length}`);
    }
  } finally {
    // ── Cleanup: users cascade their rows; fixture job/board removed too ──
    for (const id of userIds) {
      await admin.storage.from("resumes").remove([`${id}/resume.pdf`, `${id}/evil.pdf`]);
      await admin.auth.admin.deleteUser(id).catch(() => undefined);
    }
    if (jobId) await admin.from("jobs").delete().eq("id", jobId);
    if (boardId) await admin.from("board_sources").delete().eq("id", boardId);
  }

  if (failures > 0) {
    console.error(`\n${failures} RLS check(s) FAILED`);
    process.exit(1);
  }
  console.log("\nall RLS checks passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
