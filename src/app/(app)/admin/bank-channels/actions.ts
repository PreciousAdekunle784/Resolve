"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { BANKS } from "@/lib/banks";
import { isValidEmailAddress } from "@/lib/email/mime";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/types";
import { fieldErrors, formDataToObject, uuidSchema } from "@/lib/validation";

const channelSchema = z
  .object({
    id: z.preprocess((v) => (v === "" ? undefined : v), uuidSchema.optional()),
    bank_id: z.string().refine((id) => BANKS.some((b) => b.id === id), "Choose a bank"),
    channel_type: z.enum(["email", "web_portal", "phone"]),
    value: z.string().trim().min(3, "Enter the address, link or number").max(500),
    label: z.string().trim().min(2, "Enter a short label, e.g. Customer complaints").max(160),
    purpose: z.enum(["complaints", "customer_care", "escalation"]),
    source_url: z.string().trim().url("Enter the official page where this is published").refine((u) => u.startsWith("https://"), "Use an https:// URL"),
    status: z.enum(["verified", "unverified", "outdated", "archived"]),
    notes: z.string().trim().max(1000).optional(),
    confirm_verified: z.string().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.channel_type === "email" && !isValidEmailAddress(v.value)) ctx.addIssue({ code: "custom", path: ["value"], message: "Enter a valid email address" });
    if (v.channel_type === "web_portal" && !v.value.startsWith("https://")) ctx.addIssue({ code: "custom", path: ["value"], message: "Use an https:// link" });
    if (v.status === "verified" && v.confirm_verified !== "on") {
      ctx.addIssue({ code: "custom", path: ["confirm_verified"], message: "Confirm you checked the official source today" });
    }
  });

/** Creates or updates a bank contact channel. Admin-only (also enforced by RLS). */
export async function saveBankChannelAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user?.isAdmin) return { ok: false, error: "Only administrators can edit bank contacts." };
  const parsed = channelSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return { ok: false, error: "Please check the highlighted fields.", fieldErrors: fieldErrors(parsed.error) };
  const { id, confirm_verified, ...v } = parsed.data;
  void confirm_verified;
  const bank = BANKS.find((b) => b.id === v.bank_id)!;
  const record: Record<string, unknown> = {
    ...v,
    value: v.channel_type === "email" ? v.value.toLowerCase() : v.value,
    bank_name: bank.name,
    notes: v.notes || null,
  };
  if (v.status === "verified") record.verified_at = new Date().toISOString();

  const supabase = await createClient();
  const { error } = id ? await supabase.from("bank_contact_channels").update(record).eq("id", id) : await supabase.from("bank_contact_channels").insert(record);
  if (error) return { ok: false, error: error.code === "23505" ? "That channel already exists for this bank." : "Could not save the contact channel." };
  revalidatePath("/admin/bank-channels");
  return { ok: true, message: id ? "Contact channel updated." : "Contact channel added." };
}
