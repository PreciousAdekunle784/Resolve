"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { EVIDENCE_BUCKET } from "@/lib/constants";
import { createAdminClient, isAdminClientConfigured } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/types";
import { fieldErrors, formDataToObject, profileSchema } from "@/lib/validation";

const SESSION_ENDED: ActionResult = { ok: false, error: "Your session has ended. Please sign in again." };

export async function updateProfileAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return SESSION_ENDED;
  const parsed = profileSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return { ok: false, error: "Please check the highlighted fields.", fieldErrors: fieldErrors(parsed.error) };
  const v = parsed.data;
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
    })
    .eq("id", user.id);
  if (error) return { ok: false, error: "We couldn't save your profile. Please try again." };
  revalidatePath("/", "layout");
  return { ok: true, message: "Profile saved." };
}

export async function updatePrivacyAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return SESSION_ENDED;
  const consent = formData.get("aiConsent") === "on";
  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ ai_processing_consent: consent, ai_processing_consent_at: consent ? new Date().toISOString() : null })
    .eq("id", user.id);
  if (error) return { ok: false, error: "We couldn't save your choice. Please try again." };
  revalidatePath("/", "layout");
  return { ok: true, message: consent ? "AI analysis is turned on." : "AI analysis is turned off. Nothing new will be sent to the AI provider." };
}

export async function updateNotificationsAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return SESSION_ENDED;
  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      notify_case_updates: formData.get("notifyCaseUpdates") === "on",
      notify_follow_up_reminders: formData.get("notifyFollowUps") === "on",
    })
    .eq("id", user.id);
  if (error) return { ok: false, error: "We couldn't save your preferences. Please try again." };
  return { ok: true, message: "Preferences saved." };
}

/**
 * Permanently deletes the account: all evidence files in storage, then the
 * auth user (which cascades to every row the user owns).
 */
export async function deleteAccountAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return SESSION_ENDED;
  if (formData.get("confirm") !== "DELETE MY ACCOUNT") {
    return { ok: false, error: "Type DELETE MY ACCOUNT to confirm.", fieldErrors: { confirm: ["Type DELETE MY ACCOUNT exactly"] } };
  }
  if (!isAdminClientConfigured()) {
    return {
      ok: false,
      error: "Account deletion isn't available yet because the server's Supabase secret key isn't configured. Please contact support.",
    };
  }

  const supabase = await createClient();
  // 1. Delete evidence files (listed through the database as the user).
  const { data: files, error: listError } = await supabase.from("evidence").select("file_path").eq("user_id", user.id);
  if (listError) return { ok: false, error: "We couldn't delete your account. Please try again." };

  const admin = createAdminClient();
  const paths = (files ?? []).map((f) => f.file_path as string);
  // Also remove any files uploaded but never attached (e.g. an interrupted upload).
  const { data: folders } = await admin.storage.from(EVIDENCE_BUCKET).list(user.id, { limit: 1000 });
  for (const folder of folders ?? []) {
    const { data: inner } = await admin.storage.from(EVIDENCE_BUCKET).list(`${user.id}/${folder.name}`, { limit: 1000 });
    for (const f of inner ?? []) paths.push(`${user.id}/${folder.name}/${f.name}`);
  }
  const unique = Array.from(new Set(paths));
  for (let i = 0; i < unique.length; i += 100) {
    const { error } = await admin.storage.from(EVIDENCE_BUCKET).remove(unique.slice(i, i + 100));
    if (error) return { ok: false, error: "We couldn't delete your files. Nothing else was deleted — please try again." };
  }

  // 2. Delete the auth user; database rows cascade.
  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
  if (deleteError) return { ok: false, error: "Your files were deleted, but we couldn't delete your account. Please try again." };

  await supabase.auth.signOut().catch(() => undefined);
  redirect("/login?deleted=1");
}
