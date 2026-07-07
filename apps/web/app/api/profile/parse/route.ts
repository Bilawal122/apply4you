import { NextResponse, type NextRequest } from "next/server";
import { parseResumePdf, parseResumeText } from "@apply4you/ai";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 60; // Gemini parse can take a while

const ACCEPTED = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
} as const;

const MAX_BYTES = 10 * 1024 * 1024;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await request.formData();
  const file = formData.get("resume");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No resume file provided" }, { status: 400 });
  }
  const kind = ACCEPTED[file.type as keyof typeof ACCEPTED];
  if (!kind) {
    return NextResponse.json({ error: "Only PDF or DOCX resumes are supported" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Resume must be under 10 MB" }, { status: 400 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());

  // Store the original file — the workers upload this exact file to ATS forms.
  const storagePath = `${user.id}/resume.${kind}`;
  const { error: uploadError } = await supabase.storage
    .from("resumes")
    .upload(storagePath, bytes, { contentType: file.type, upsert: true });
  if (uploadError) {
    return NextResponse.json({ error: `Upload failed: ${uploadError.message}` }, { status: 500 });
  }

  let parsed;
  try {
    if (kind === "pdf") {
      parsed = await parseResumePdf(bytes);
    } else {
      const mammoth = await import("mammoth");
      const { value } = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
      parsed = await parseResumeText(value);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "parse failed";
    return NextResponse.json({ error: `Could not parse resume: ${message}` }, { status: 502 });
  }

  await supabase
    .from("profiles")
    .update({ resume_storage_path: storagePath, resume_filename: file.name })
    .eq("user_id", user.id);

  return NextResponse.json({ parsed });
}
