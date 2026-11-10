import { findUnsupportedDetails } from "@/lib/ai/grounding";
import { formatDate } from "@/lib/format";
import type { BankResponseAnalysis, RecoveryPlan, StoredBankResponseAnalysis, StoredRecoveryPlan } from "./schemas";

/**
 * Deterministic checks used by the orchestration tools. They don't depend on
 * AI, so they always run — and they are the only checks that can block a
 * submission.
 */

function passesLuhn(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = Number(digits[i]);
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

/** Card brands used in Nigeria: Visa, Mastercard, Verve and American Express. */
function hasCardPrefix(d: string): boolean {
  const n4 = Number(d.slice(0, 4));
  const n2 = Number(d.slice(0, 2));
  if (d.startsWith("4")) return [13, 16, 19].includes(d.length);
  if ((n2 >= 51 && n2 <= 55) || (n4 >= 2221 && n4 <= 2720)) return d.length === 16;
  if (n2 === 34 || n2 === 37) return d.length === 15;
  if (/^(506[01]|507[89]|6500)/.test(d)) return d.length >= 16 && d.length <= 19;
  return false;
}

/**
 * A full card number: a known card prefix and length, a valid checksum, and
 * either written in groups of four or mentioned next to the word "card".
 * Digits inside email addresses, phone numbers (+234…) and long references
 * are ignored, so ordinary letters are never blocked by mistake.
 */
function looksLikeCardNumber(text: string, match: string, index: number): boolean {
  const raw = match.replace(/[ -]+$/, "");
  const before = text.slice(Math.max(0, index - 1), index);
  const after = text.slice(index + raw.length, index + raw.length + 1);
  if (/[A-Za-z0-9._%+@-]/.test(before) || /[A-Za-z0-9@]/.test(after)) return false;
  const digits = raw.replace(/\D/g, "");
  if (!hasCardPrefix(digits) || !passesLuhn(digits)) return false;
  const grouped = /^\d{4}([ -])\d{4}\1\d{4}\1\d{1,7}$/.test(raw);
  const mentionsCard = /\b(card|debit card|credit card|pan|visa|mastercard|verve)\b/i.test(text.slice(Math.max(0, index - 40), index));
  return grouped || mentionsCard;
}

/** Finds credentials that must never be sent to anyone (PINs, OTPs, BVN, card numbers…). */
export function findSensitiveData(text: string): string[] {
  const found = new Set<string>();
  if (/\b(pin|otp|one[- ]time password|password|passcode|cvv|cvc)\b[^\n.]{0,25}?\b\d{3,}\b/i.test(text)) {
    found.add("It looks like a PIN, OTP, password or card security code is included. Remove it — your bank will never need it in a complaint.");
  }
  if (/\b(bvn|nin|bank verification number|national identification number)\b[^\n.]{0,25}?\b\d{11}\b/i.test(text)) {
    found.add("It looks like a BVN or NIN is included. Remove it — Resolve never sends these.");
  }
  for (const m of text.matchAll(/(?:\d[ -]?){14,22}\d/g)) {
    if (looksLikeCardNumber(text, m[0], m.index ?? 0)) {
      found.add("It looks like a full card number is included. Use only the last 4 digits.");
    }
  }
  return Array.from(found);
}

export interface ComplaintCheckInput {
  subject: string;
  content: string;
  approved: boolean;
  facts: {
    amount: string | number | null;
    transaction_date: string | null;
    transaction_reference: string | null;
  };
  /** Facts the user confirmed (case details, profile, evidence names). */
  confirmedFacts: string[];
}

export interface ComplaintCheckResult {
  ready: boolean;
  blocking: string[];
  warnings: string[];
}

export function checkComplaintBeforeSending(input: ComplaintCheckInput): ComplaintCheckResult {
  const blocking: string[] = [];
  const warnings: string[] = [];
  const text = `${input.subject}\n${input.content}`;

  if (!input.approved) blocking.push("Approve the complaint before sending it.");
  if (/\[ADD:/i.test(text)) blocking.push("Replace every [ADD: …] placeholder with the real information, or remove it.");
  if (input.subject.trim().length < 5) blocking.push("Add a clear subject line.");
  blocking.push(...findSensitiveData(text));

  const compact = text.replace(/[,\s]/g, "");
  if (input.facts.amount !== null) {
    const n = Number(input.facts.amount);
    const variants = [String(n), n.toFixed(2), String(Math.trunc(n))];
    if (!variants.some((v) => compact.includes(v))) warnings.push("The letter doesn't mention the amount involved.");
  }
  if (input.facts.transaction_reference && !text.includes(input.facts.transaction_reference)) {
    warnings.push("The letter doesn't include your transaction reference.");
  }
  if (input.facts.transaction_date) {
    const d = formatDate(input.facts.transaction_date);
    const parts = d.split(" "); // e.g. "1 Oct 2026"
    if (!text.includes(d) && !(parts.length === 3 && text.includes(parts[0]) && text.includes(parts[2]))) {
      warnings.push("The letter doesn't mention the transaction date.");
    }
  }
  if (input.content.trim().length < 200) warnings.push("The letter is very short. Make sure it explains what happened and what you want.");
  for (const detail of findUnsupportedDetails(text, input.confirmedFacts)) {
    warnings.push(`“${detail}” isn't in your case details. Check it's correct.`);
  }
  return { ready: blocking.length === 0, blocking, warnings };
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/** Removes anything the model "quoted" that isn't actually in the bank's reply. */
export function groundResponseAnalysis(analysis: BankResponseAnalysis, replyText: string): StoredBankResponseAnalysis {
  const haystack = norm(replyText);
  const compactHaystack = haystack.replace(/[\s,]/g, "");
  const removed: string[] = [];
  const inReply = (quote: string, value?: string) => {
    const q = norm(quote);
    if (q.length === 0 || !haystack.includes(q)) return false;
    if (value === undefined) return true;
    const v = norm(value).replace(/[\s,]/g, "");
    return v.length > 0 && compactHaystack.includes(v);
  };
  const reference_numbers = analysis.reference_numbers.filter((r) => inReply(r.quote, r.value) || (removed.push(`reference ${r.value}`), false));
  const amounts = analysis.amounts.filter((a) => inReply(a.quote, a.value) || (removed.push(`amount ${a.value}`), false));
  const timeframes = analysis.timeframes.filter((t) => inReply(t.quote) || (removed.push(`timeframe "${t.quote}"`), false));
  return {
    ...analysis,
    reference_numbers,
    amounts,
    timeframes,
    information_requested: analysis.information_requested.slice(0, 10),
    reply_points: analysis.reply_points.slice(0, 8),
    grounding: { checked_at: new Date().toISOString(), removed },
  };
}

/** Keeps only guidance IDs Resolve actually provided. */
export function groundRecoveryPlan(plan: RecoveryPlan, guidanceIds: string[]): StoredRecoveryPlan {
  const allowed = new Set(guidanceIds);
  const removed = plan.escalation.guidance_ids.filter((id) => !allowed.has(id));
  return {
    ...plan,
    next_actions: plan.next_actions.slice(0, 5),
    escalation: { ...plan.escalation, guidance_ids: plan.escalation.guidance_ids.filter((id) => allowed.has(id)) },
    grounding: { checked_at: new Date().toISOString(), removed_guidance_ids: removed },
  };
}
