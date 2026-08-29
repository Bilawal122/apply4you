import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const PAGE = 100;

/**
 * Remove every object directly under `prefix` in `bucket`, paginating until
 * the listing is exhausted. Returns the number removed; throws on any
 * list/remove error so the caller can abort before the account is touched.
 * Always re-lists from offset 0 because each remove shifts the listing.
 */
async function removeAllUnderPrefix(
  admin: SupabaseClient,
  bucket: string,
  prefix: string,
): Promise<number> {
  let removed = 0;
  for (;;) {
    const { data: files, error } = await admin.storage.from(bucket).list(prefix, { limit: PAGE });
    if (error) throw new Error(`list ${bucket}/${prefix}: ${error.message}`);
    if (!files?.length) return removed;
    const paths = files.map((f) => `${prefix}/${f.name}`);
    const { error: removeError } = await admin.storage.from(bucket).remove(paths);
    if (removeError) throw new Error(`remove in ${bucket}: ${removeError.message}`);
    removed += paths.length;
    if (files.length < PAGE) return removed;
  }
}

/**
 * Hard delete. Order matters: storage first (artifact paths are keyed by
 * application id, and the id→user mapping dies with the DB rows), verified
 * clean, and only then the auth user (DB rows cascade via FK). Any storage
 * failure returns 500 with the account intact, so the request is retriable
 * and the UI's "immediate and complete" claim stays true. Idempotent: every
 * step tolerates already-removed objects.
 */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  // Held outside the try so the post-deletion sweep below can reuse it.
  let artifactPaths: string[] = [];

  try {
    // Resumes live flat under resumes/<uid>/ (resume.pdf and/or resume.docx —
    // a format switch leaves the old file behind, so never assume one).
    await removeAllUnderPrefix(admin, "resumes", user.id);

    // Application artifacts are keyed by application id under three prefixes.
    const { data: apps, error: appsError } = await admin
      .from("applications")
      .select("id")
      .eq("user_id", user.id);
    if (appsError) throw new Error(`list applications: ${appsError.message}`);
    if (apps?.length) {
      artifactPaths = apps.flatMap((a) => [
        `failures/${a.id}.png`,
        `confirmations/${a.id}.png`,
        `cvs/${a.id}.pdf`,
      ]);
      for (let i = 0; i < artifactPaths.length; i += PAGE) {
        // remove() ignores paths that don't exist — most applications never
        // produced all three artifacts.
        const { error: removeError } = await admin.storage
          .from("artifacts")
          .remove(artifactPaths.slice(i, i + PAGE));
        if (removeError) throw new Error(`remove artifacts: ${removeError.message}`);
      }
    }

    // Verify nothing survived before destroying the id→user mapping.
    const { data: leftover, error: verifyError } = await admin.storage
      .from("resumes")
      .list(user.id, { limit: 1 });
    if (verifyError) throw new Error(`verify resumes: ${verifyError.message}`);
    if (leftover?.length) throw new Error(`verify resumes: ${leftover.length}+ object(s) remain`);
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: `Could not remove stored files (${detail}). Nothing was deleted — try again.` },
      { status: 500 },
    );
  }

  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Second sweep, after the cascade. A submit worker holding one of these
  // applications can upload a tailored CV or a screenshot in the seconds
  // between the pass above and this delete — and once the rows cascade, the
  // application-id-to-user mapping is gone and nothing could ever find those
  // files again. remove() is idempotent, so re-running the same path list is
  // free; failures here are logged, not surfaced, because the account is
  // already gone and the orphan sweep script is the backstop.
  for (let i = 0; i < artifactPaths.length; i += PAGE) {
    const { error: sweepError } = await admin.storage
      .from("artifacts")
      .remove(artifactPaths.slice(i, i + PAGE));
    if (sweepError) console.error(`[account/delete] post-deletion sweep: ${sweepError.message}`);
  }

  return NextResponse.json({ deleted: true });
}
