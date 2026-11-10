import { z } from "zod";
import {
  ACCOUNT_TYPES,
  CASE_STATUSES,
  CONTACT_METHODS,
  CURRENCIES,
  ISSUE_CATEGORIES,
  PAYMENT_CHANNELS,
  SUBMISSION_CHANNELS,
} from "@/lib/constants";

/**
 * Server-side validation schemas. Every server action and API route validates
 * its input with these — client-side checks are only a convenience.
 */

const emptyToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const trimmed = (max: number) => z.string().trim().max(max, `Must be ${max} characters or fewer`);
const optionalText = (max: number) => z.preprocess(emptyToUndefined, trimmed(max).optional());

function passesLuhn(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

/** Looks for something shaped like a full payment card number (13-19 digits, valid checksum). */
export function containsCardNumber(text: string): boolean {
  const candidates = text.match(/(?<![\d])(?:\d[ -]?){12,18}\d(?![\d])/g) ?? [];
  return candidates.some((c) => {
    const digits = c.replace(/[ -]/g, "");
    return digits.length >= 13 && digits.length <= 19 && passesLuhn(digits);
  });
}

/**
 * Detects text that looks like secrets Resolve must never store.
 * `checkCards` is off for reference fields, which can legitimately contain long numbers.
 */
export function findSensitiveData(text: string | undefined | null, opts: { checkCards?: boolean } = {}): string | null {
  if (!text) return null;
  const { checkCards = true } = opts;
  if (checkCards && containsCardNumber(text)) {
    return "This looks like a full card number. Please remove it — Resolve never needs your full card details (the last 4 digits are enough).";
  }
  if (/\b(pin|otp|one[- ]time password|password|passcode)\s*(is|:|=|-)\s*\S+/i.test(text)) {
    return "Please don't include PINs, OTPs or passwords. Resolve never needs them.";
  }
  if (/\b(bvn|nin)\b\D{0,15}\d{11}\b/i.test(text)) {
    return "Please don't include your BVN or NIN. Resolve doesn't need them.";
  }
  return null;
}

const safeText = (max: number, opts: { checkCards?: boolean } = {}) =>
  z.preprocess(
    emptyToUndefined,
    trimmed(max)
      .superRefine((v, ctx) => {
        const msg = findSensitiveData(v, opts);
        if (msg) ctx.addIssue({ code: "custom", message: msg });
      })
      .optional(),
  );

export const emailSchema = z.string().trim().toLowerCase().email("Enter a valid email address").max(320);

export const passwordSchema = z
  .string()
  .min(10, "Use at least 10 characters")
  .max(72, "Use 72 characters or fewer")
  .refine((v) => /[A-Za-z]/.test(v) && /\d/.test(v), "Include at least one letter and one number");

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password"),
});

export const registerSchema = z.object({
  fullName: z.string().trim().min(2, "Enter your full name").max(120),
  email: emailSchema,
  password: passwordSchema,
  acceptTerms: z.literal("on", { message: "You need to accept the terms to continue" }),
});

export const forgotPasswordSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z
  .object({ password: passwordSchema, confirmPassword: z.string() })
  .refine((v) => v.password === v.confirmPassword, { message: "Passwords do not match", path: ["confirmPassword"] });

export const phoneSchema = z.preprocess(
  emptyToUndefined,
  z
    .string()
    .trim()
    .regex(/^\+?[0-9 ()-]{7,20}$/, "Enter a valid phone number, e.g. +234 803 000 0000")
    .optional(),
);

export const profileSchema = z
  .object({
    fullName: z.string().trim().min(2, "Enter your full name").max(120),
    phone: phoneSchema,
    country: z.string().regex(/^[A-Z]{2}$/, "Choose a country"),
    accountType: z.enum(ACCOUNT_TYPES, { message: "Choose an account type" }),
    businessName: optionalText(160),
    preferredContactMethod: z.enum(CONTACT_METHODS, { message: "Choose a contact method" }),
  })
  .superRefine((v, ctx) => {
    if (v.preferredContactMethod !== "email" && !v.phone) {
      ctx.addIssue({ code: "custom", path: ["phone"], message: "Add a phone number to be contacted this way" });
    }
  });

export const onboardingSchema = profileSchema.and(
  z.object({
    aiConsent: z.preprocess((v) => v === "on", z.boolean()),
    acceptTerms: z.literal("on", { message: "Please confirm you understand what Resolve does" }),
  }),
);

/** Report wizard: every step saves partial data, so all fields are optional here. */
export const caseDraftSchema = z.object({
  issue_category: z.preprocess(emptyToUndefined, z.enum(ISSUE_CATEGORIES).optional()),
  institution_name: z.preprocess(emptyToUndefined, trimmed(160).min(2, "Enter the institution name").optional()),
  amount: z.preprocess(
    (v) => (typeof v === "string" ? (v.trim() === "" ? undefined : Number(v.replace(/[,\s₦]/g, ""))) : v),
    z
      .number({ message: "Enter the amount as a number" })
      .positive("Amount must be more than zero")
      .max(99_999_999_999_999, "Amount is too large")
      .optional(),
  ),
  currency: z.preprocess(emptyToUndefined, z.enum(CURRENCIES).optional()),
  transaction_date: z.preprocess(emptyToUndefined, z.string().datetime({ message: "Enter a valid date and time" }).optional()),
  transaction_reference: safeText(120, { checkCards: false }),
  payment_channel: z.preprocess(emptyToUndefined, z.enum(PAYMENT_CHANNELS).optional()),
  recipient_details: safeText(300),
  incident_description: safeText(5000),
  previous_attempts: safeText(3000),
  requested_resolution: safeText(1000),
});
export type CaseDraftInput = z.infer<typeof caseDraftSchema>;

/** Rules a report must satisfy before it can be submitted. */
export const caseCompleteSchema = z.object({
  issue_category: z.enum(ISSUE_CATEGORIES, { message: "Choose the type of problem" }),
  institution_name: z.string().min(2, "Enter the institution name"),
  amount: z.number({ message: "Enter the amount" }).positive(),
  currency: z.enum(CURRENCIES),
  transaction_date: z
    .string({ message: "Enter the transaction date and time" })
    .refine((v) => new Date(v).getTime() <= Date.now() + 5 * 60_000, "The transaction date can't be in the future"),
  payment_channel: z.enum(PAYMENT_CHANNELS, { message: "Choose how you made the payment" }),
  incident_description: z.string({ message: "Describe what happened" }).min(20, "Please describe what happened in at least 20 characters"),
});

export const statusUpdateSchema = z.object({
  status: z.enum(CASE_STATUSES),
  note: safeText(1000),
});

export const submissionSchema = z.object({
  institution_reference: safeText(120, { checkCards: false }),
  institution_submission_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter the date you submitted the complaint"),
  institution_submission_channel: z.enum(SUBMISSION_CHANNELS, { message: "Choose how you submitted it" }),
});

export const responseSchema = z.object({
  response_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter the date of the response"),
  response_summary: z.string().trim().min(3, "Summarise the response").max(2000),
  new_status: z.preprocess(emptyToUndefined, z.enum(CASE_STATUSES).optional()),
});

export const followUpSchema = z.object({
  next_follow_up_date: z.preprocess(
    emptyToUndefined,
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date").optional(),
  ),
  note: safeText(500),
});

export const resolutionSchema = z.object({
  outcome: z.enum(["resolved", "closed"]),
  resolution_details: z.string().trim().min(3, "Describe the outcome").max(3000),
});

export const noteSchema = z.object({ note: z.string().trim().min(1, "Write a note").max(1000) });

export const followUpAnswerSchema = z.object({
  question: z.string().trim().min(3).max(500),
  answer: z
    .string()
    .trim()
    .min(1, "Write an answer")
    .max(1000)
    .superRefine((v, ctx) => {
      const msg = findSensitiveData(v);
      if (msg) ctx.addIssue({ code: "custom", message: msg });
    }),
});

// Browsers send form text with Windows line breaks (\r\n); store plain \n so the
// saved text matches what the editor shows.
const unixNewlines = (v: unknown) => (typeof v === "string" ? v.replace(/\r\n?/g, "\n") : v);

export const complaintEditSchema = z.object({
  subject: z.preprocess(unixNewlines, z.string().trim().max(300).default("")),
  content: z.preprocess(unixNewlines, z.string().trim().min(20, "The complaint is too short").max(20000)),
});

export function fieldErrors(error: z.ZodError): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_form";
    (out[key] ??= []).push(issue.message);
  }
  return out;
}

export function formDataToObject(fd: FormData): Record<string, string> {
  const obj: Record<string, string> = {};
  fd.forEach((value, key) => {
    if (typeof value === "string" && !key.startsWith("$ACTION")) obj[key] = value;
  });
  return obj;
}

export const uuidSchema = z.string().uuid();
