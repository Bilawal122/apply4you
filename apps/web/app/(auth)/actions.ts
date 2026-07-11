"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type AuthState = { error: string } | { confirmEmail: true } | null;

export async function signIn(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: error.message };

  redirect("/feed");
}

export async function signUp(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  if (password.length < 8) return { error: "Password must be at least 8 characters." };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) return { error: error.message };

  // Email confirmation on: no session yet — tell the user to check their inbox
  // instead of bouncing them to a login they can't pass.
  if (!data.session) return { confirmEmail: true };

  redirect("/onboarding");
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export type ResetState = { error: string } | { sent: true } | null;

export async function requestPasswordReset(_prev: ResetState, formData: FormData): Promise<ResetState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { error: "Enter your email address." };

  const supabase = await createClient();
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${appUrl}/auth/confirm?next=/update-password`,
  });
  // Same response whether or not the account exists — no user enumeration.
  if (error && !/rate/i.test(error.message)) {
    console.error("[auth] resetPasswordForEmail:", error.message);
  }
  if (error && /rate/i.test(error.message)) return { error: "Too many requests — try again in a minute." };
  return { sent: true };
}

export type UpdatePasswordState = { error: string } | null;

export async function updatePassword(
  _prev: UpdatePasswordState,
  formData: FormData,
): Promise<UpdatePasswordState> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (password.length < 8) return { error: "Password must be at least 8 characters." };
  if (password !== confirm) return { error: "Passwords don't match." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Your reset link expired — request a new one." };

  // Note: this authorizes on any valid session (the standard Supabase recovery
  // pattern — the recovery link mints a full session via verifyOtp). There is
  // no in-app "change password" surface, so /update-password is only reachable
  // via a recovery link or an already-authenticated session. When we add a
  // settings "change password" flow, require the current password there
  // (updateUser supports `current_password`).
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: error.message };

  redirect("/feed");
}
