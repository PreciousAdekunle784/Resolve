"use server";

import { redirect } from "next/navigation";
import { authErrorMessage, safeNextPath } from "@/lib/auth-errors";
import { getSiteUrl, isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/types";
import {
  fieldErrors,
  forgotPasswordSchema,
  formDataToObject,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
} from "@/lib/validation";

const NOT_CONFIGURED: ActionResult = {
  ok: false,
  error: "Resolve is not connected to Supabase yet. Add the Supabase settings to .env.local (see README).",
};

export async function loginAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const parsed = loginSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return { ok: false, error: "Please check the highlighted fields.", fieldErrors: fieldErrors(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { ok: false, error: authErrorMessage(error) };

  redirect(safeNextPath(formData.get("next") as string | null));
}

export async function registerAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const parsed = registerSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return { ok: false, error: "Please check the highlighted fields.", fieldErrors: fieldErrors(parsed.error) };

  const next = safeNextPath(formData.get("next") as string | null, "/onboarding");
  const onboardingPath = next === "/cases/new" ? "/onboarding?next=/cases/new" : "/onboarding";
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.fullName },
      emailRedirectTo: `${getSiteUrl()}/auth/confirm?next=${encodeURIComponent(onboardingPath)}`,
    },
  });
  if (error) return { ok: false, error: authErrorMessage(error) };

  // Email confirmation disabled: the user is signed in immediately.
  if (data.session) redirect(onboardingPath);

  // Email confirmation enabled (or the address is already registered — Supabase
  // deliberately returns the same response so accounts can't be discovered).
  return {
    ok: true,
    message: `We've sent a confirmation link to ${parsed.data.email}. Open it to activate your account, then continue to Resolve.`,
  };
}

export async function forgotPasswordAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const parsed = forgotPasswordSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return { ok: false, error: "Please check the highlighted fields.", fieldErrors: fieldErrors(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${getSiteUrl()}/auth/confirm?next=${encodeURIComponent("/reset-password")}`,
  });
  // Rate-limit errors are worth showing; anything else gets the same neutral
  // message so the form can't be used to discover registered emails.
  if (error && (error.status === 429 || error.code?.startsWith("over_"))) {
    return { ok: false, error: authErrorMessage(error) };
  }
  return {
    ok: true,
    message: `If an account exists for ${parsed.data.email}, you'll receive an email with a link to reset your password.`,
  };
}

export async function resetPasswordAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const parsed = resetPasswordSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return { ok: false, error: "Please check the highlighted fields.", fieldErrors: fieldErrors(parsed.error) };

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) {
    return { ok: false, error: "Your reset link has expired or was already used. Please request a new one." };
  }
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { ok: false, error: authErrorMessage(error) };
  redirect("/dashboard?passwordUpdated=1");
}

export async function signOutAction() {
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  redirect("/login?signedOut=1");
}
