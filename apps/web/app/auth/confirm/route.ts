import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

const OTP_TYPES: EmailOtpType[] = ["signup", "invite", "magiclink", "recovery", "email_change", "email"];

/** Only same-origin relative paths — never redirect off-site from an auth link. */
function safeNext(next: string | null, fallback = "/feed"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return fallback;
  return next;
}

/**
 * Lands Supabase email links (signup confirmation, password recovery,
 * email change). Handles both link styles:
 *  - token_hash + type  (recommended {{ .TokenHash }} email templates)
 *  - code               (default {{ .ConfirmationURL }} templates, PKCE)
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");
  // Fresh signups start onboarding; everything else defaults to the feed.
  const next = safeNext(searchParams.get("next"), type === "signup" ? "/onboarding" : "/feed");

  const redirectTo = request.nextUrl.clone();
  redirectTo.search = "";

  const supabase = await createClient();

  if (tokenHash && type && OTP_TYPES.includes(type)) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      redirectTo.pathname = type === "recovery" ? "/update-password" : next;
      return NextResponse.redirect(redirectTo);
    }
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      redirectTo.pathname = next;
      return NextResponse.redirect(redirectTo);
    }
  }

  redirectTo.pathname = "/auth/error";
  return NextResponse.redirect(redirectTo);
}
