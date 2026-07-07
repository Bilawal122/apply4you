import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/** Hard delete: storage objects + auth user (DB rows cascade via FK). */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();

  for (const bucket of ["resumes", "artifacts"]) {
    const { data: files } = await admin.storage.from(bucket).list(user.id, { limit: 100 });
    if (files?.length) {
      await admin.storage.from(bucket).remove(files.map((f) => `${user.id}/${f.name}`));
    }
  }
  // Failure screenshots are keyed by application id — find them via the rows first.
  const { data: apps } = await admin.from("applications").select("id").eq("user_id", user.id);
  if (apps?.length) {
    await admin.storage.from("artifacts").remove(apps.map((a) => `failures/${a.id}.png`));
  }

  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ deleted: true });
}
