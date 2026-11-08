import type { CaseAnalysis, EvidenceExtraction, StoredCaseAnalysis } from "./schemas";

/**
 * Deterministic checks that run on every AI result before it is saved.
 * They do not trust the model's own labels: a fact the model says came from
 * the user or a document must actually be found there, otherwise it is
 * downgraded to "unverified".
 */

export function normaliseText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[₦,\s]/g, "")
    .replace(/^ngn/, "")
    .replace(/\.00$/, "");
}

function numericValue(value: string): number | null {
  const cleaned = value.replace(/[^0-9.]/g, "");
  if (!cleaned || !/\d/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** True if `value` can be found in `corpus` (text match, or numeric match for amounts). */
export function isSupportedBy(value: string, corpus: string[], opts: { numeric?: boolean } = {}): boolean {
  const needle = normaliseText(value);
  if (needle.length === 0) return false;
  const haystack = corpus.map(normaliseText);
  if (haystack.some((h) => h.includes(needle))) return true;
  if (opts.numeric) {
    const n = numericValue(value);
    if (n !== null) {
      return corpus.some((c) => {
        const matches = c.match(/[\d,]+(?:\.\d+)?/g) ?? [];
        return matches.some((m) => numericValue(m) === n);
      });
    }
  }
  return false;
}

export interface GroundingSources {
  /** Everything the user entered: case fields, description, answers. */
  userTexts: string[];
  /** Verbatim text read from documents. */
  documentTexts: string[];
  /** IDs of guidance records that were offered to the model. */
  guidanceIds: string[];
}

const IDENTIFYING_FIELDS = new Set(["transaction_reference", "amount", "transaction_date"]);

export function groundCaseAnalysis(analysis: CaseAnalysis, sources: GroundingSources): StoredCaseAnalysis {
  const downgraded: string[] = [];

  const key_facts = analysis.key_facts.map((fact) => {
    const numeric = fact.case_field === "amount";
    const candidates = [fact.value, fact.normalized_value].filter((v): v is string => Boolean(v));
    let supported = true;
    if (fact.source === "user_provided") {
      supported = candidates.some((c) => isSupportedBy(c, sources.userTexts, { numeric }));
    } else if (fact.source === "document_extracted") {
      supported = candidates.some((c) => isSupportedBy(c, sources.documentTexts, { numeric }));
    } else if (fact.source === "ai_inferred" && IDENTIFYING_FIELDS.has(fact.case_field)) {
      // The AI must never "infer" references, amounts or dates.
      supported = false;
    }
    // Dates are often reformatted (e.g. "12 March" vs "2026-03-12"), so a date the
    // model attributes to the user/document is kept but cannot be auto-applied unless matched.
    if (!supported) {
      downgraded.push(fact.label);
      return { ...fact, source: "unverified" as const, source_detail: `${fact.source_detail} (Resolve could not confirm this — please check it)` };
    }
    return fact;
  });

  const allowed = new Set(sources.guidanceIds);
  const removed = analysis.guidance_references.filter((g) => !allowed.has(g.guidance_id)).map((g) => g.guidance_id);

  return {
    ...analysis,
    key_facts,
    follow_up_questions: analysis.follow_up_questions.slice(0, 5),
    guidance_references: analysis.guidance_references.filter((g) => allowed.has(g.guidance_id)),
    grounding: { checked_at: new Date().toISOString(), downgraded_facts: downgraded, removed_guidance_ids: removed },
  };
}

/** Collects verbatim document text from extraction results for grounding. */
export function documentTextsFromExtractions(extractions: EvidenceExtraction[]): string[] {
  return extractions.flatMap((e) => [
    ...e.extracted_fields.map((f) => f.exact_text),
    ...(e.status_shown ? [e.status_shown] : []),
  ]);
}

/**
 * Finds reference-like tokens and amounts in a complaint that do not appear in
 * the confirmed case facts — a safety net against fabricated details.
 */
export function findUnsupportedDetails(text: string, facts: string[]): string[] {
  const corpus = facts.filter(Boolean);
  const issues = new Set<string>();
  const withoutPlaceholders = text.replace(/\[ADD:[^\]]*\]/gi, " ");

  // Long alphanumeric tokens with digits (references, session IDs, account numbers).
  const tokens = withoutPlaceholders.match(/\b(?=[A-Z0-9-]*\d)[A-Z0-9][A-Z0-9-]{7,}\b/gi) ?? [];
  for (const token of tokens) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(token)) continue; // ISO date
    if (!isSupportedBy(token, corpus)) issues.add(token);
  }

  // Money amounts written with a currency marker.
  const amounts = withoutPlaceholders.match(/(?:₦|NGN|N|USD|\$|GBP|£|EUR|€)\s?\d[\d,]*(?:\.\d{1,2})?/g) ?? [];
  for (const amount of amounts) {
    if (!isSupportedBy(amount, corpus, { numeric: true })) issues.add(amount.trim());
  }
  return Array.from(issues);
}
