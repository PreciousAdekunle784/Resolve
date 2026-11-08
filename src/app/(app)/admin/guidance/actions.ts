"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { GUIDANCE_STATUSES, ISSUE_CATEGORIES } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/types";
import { fieldErrors, formDataToObject, uuidSchema } from "@/lib/validation";

const optionalDate = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use the date picker").optional(),
);

const guidanceSchema = z
  .object({
    id: z.preprocess((v) => (v === "" ? undefined : v), uuidSchema.optional()),
    title: z.string().trim().min(3, "Enter a title").max(200),
    institution: z.string().trim().min(2, "Enter the institution or regulator").max(160),
    country: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, "Use a 2-letter country code, e.g. NG"),
    issue_category: z.preprocess((v) => (v === "" ? undefined : v), z.enum(ISSUE_CATEGORIES).optional()),
    source_url: z.string().trim().url("Enter the official URL").refine((u) => u.startsWith("https://"), "Use an https:// URL"),
    content: z.string().trim().min(1, "Enter the guidance summary").max(20000),
    publication_date: optionalDate,
    effective_from: optionalDate,
    effective_until: optionalDate,
    status: z.enum(GUIDANCE_STATUSES),
    confirm_verified: z.string().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.status === "verified" && v.confirm_verified !== "on") {
      ctx.addIssue({ code: "custom", path: ["confirm_verified"], message: "Confirm you checked the official source today" });
    }
    if (v.effective_from && v.effective_until && v.effective_until < v.effective_from) {
      ctx.addIssue({ code: "custom", path: ["effective_until"], message: "Must be after the effective-from date" });
    }
  });

/** Creates or updates a guidance record. Only admins can do this (enforced by RLS too). */
export async function saveGuidanceAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user?.isAdmin) return { ok: false, error: "Only administrators can edit guidance." };
  const parsed = guidanceSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return { ok: false, error: "Please check the highlighted fields.", fieldErrors: fieldErrors(parsed.error) };
  const { id, confirm_verified, ...v } = parsed.data;
  void confirm_verified;

  const supabase = await createClient();
  const record: Record<string, unknown> = {
    ...v,
    issue_category: v.issue_category ?? null,
    publication_date: v.publication_date ?? null,
    effective_from: v.effective_from ?? null,
    effective_until: v.effective_until ?? null,
  };
  if (v.status === "verified") record.verified_at = new Date().toISOString();

  const { error } = id
    ? await supabase.from("guidance_sources").update(record).eq("id", id)
    : await supabase.from("guidance_sources").insert(record);
  if (error) return { ok: false, error: "Could not save the guidance record." };
  revalidatePath("/admin/guidance");
  revalidatePath("/guidance");
  return { ok: true, message: id ? "Guidance updated." : "Guidance added." };
}
