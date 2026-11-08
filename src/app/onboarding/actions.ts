"use server";

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/types";
import { fieldErrors, formDataToObject, onboardingSchema } from "@/lib/validation";

export async function completeOnboardingAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Your session has ended. Please sign in again." };

  const parsed = onboardingSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) {
    return { ok: false, error: "Please check the highlighted fields.", fieldErrors: fieldErrors(parsed.error) };
  }
  const v = parsed.data;
  const now = new Date().toISOString();
  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: v.fullName,
      phone: v.phone ?? null,
      country: v.country,
      account_type: v.accountType,
      business_name: v.accountType === "business" ? (v.businessName ?? null) : null,
      preferred_contact_method: v.preferredContactMethod,
      ai_processing_consent: v.aiConsent,
      ai_processing_consent_at: v.aiConsent ? now : null,
      terms_accepted_at: now,
      onboarding_completed_at: now,
    })
    .eq("id", user.id);
  if (error) return { ok: false, error: "We couldn't save your details. Please try again." };

  const next = formData.get("next");
  redirect(typeof next === "string" && next === "/cases/new" ? "/cases/new" : "/dashboard?welcome=1");
}
