import { describe, expect, it } from "vitest";
import { findUnsupportedDetails, groundCaseAnalysis, isSupportedBy } from "./grounding";
import type { CaseAnalysis } from "./schemas";

const base: CaseAnalysis = {
  summary: "s",
  category_assessment: { likely_category: "failed_or_pending_transfer", matches_selected_category: true, confidence: "high", explanation: "e" },
  key_facts: [],
  missing_information: [],
  conflicts: [],
  follow_up_questions: [],
  next_steps: [],
  evidence_suggestions: [],
  guidance_references: [],
  important_cautions: [],
};

describe("isSupportedBy", () => {
  it("matches text regardless of spacing, case and currency formatting", () => {
    expect(isSupportedBy("NGN 25,000.00", ["Amount: 25000"], { numeric: true })).toBe(true);
    expect(isSupportedBy("₦25,000", ["I sent 25,000 naira"], { numeric: true })).toBe(true);
    expect(isSupportedBy("zenith bank", ["Zenith Bank"])).toBe(true);
  });
  it("does not match invented values", () => {
    expect(isSupportedBy("NIP-123", ["my reference is NIP-999"])).toBe(false);
    expect(isSupportedBy("NGN 30,000", ["Amount: 25000"], { numeric: true })).toBe(false);
  });
});

describe("groundCaseAnalysis", () => {
  const sources = { userTexts: ["Zenith Bank", "25000", "Sent to Ada"], documentTexts: ["REF-ABC-123"], guidanceIds: ["g1"] };

  it("keeps facts that are found in their claimed source", () => {
    const r = groundCaseAnalysis(
      {
        ...base,
        key_facts: [
          { label: "Amount", value: "NGN 25,000.00", normalized_value: "25000.00", source: "user_provided", source_detail: "Your report", case_field: "amount" },
          { label: "Reference", value: "REF-ABC-123", normalized_value: null, source: "document_extracted", source_detail: "receipt.png", case_field: "transaction_reference" },
        ],
      },
      sources,
    );
    expect(r.key_facts.map((f) => f.source)).toEqual(["user_provided", "document_extracted"]);
    expect(r.grounding.downgraded_facts).toEqual([]);
  });

  it("downgrades facts the model mis-attributes, and never trusts AI-inferred references", () => {
    const r = groundCaseAnalysis(
      {
        ...base,
        key_facts: [
          { label: "Account", value: "0123456789", normalized_value: null, source: "user_provided", source_detail: "Your report", case_field: "recipient_details" },
          { label: "Reference", value: "XYZ-999", normalized_value: null, source: "document_extracted", source_detail: "receipt.png", case_field: "transaction_reference" },
          { label: "Guessed ref", value: "REF-ABC-123", normalized_value: null, source: "ai_inferred", source_detail: "AI", case_field: "transaction_reference" },
          { label: "Interpretation", value: "Likely a network delay", normalized_value: null, source: "ai_inferred", source_detail: "AI", case_field: "none" },
        ],
      },
      sources,
    );
    expect(r.key_facts.map((f) => f.source)).toEqual(["unverified", "unverified", "unverified", "ai_inferred"]);
    expect(r.grounding.downgraded_facts).toEqual(["Account", "Reference", "Guessed ref"]);
  });

  it("removes guidance references that weren't provided and caps follow-up questions", () => {
    const r = groundCaseAnalysis(
      {
        ...base,
        guidance_references: [
          { guidance_id: "g1", relevance: "ok" },
          { guidance_id: "made-up", relevance: "invented" },
        ],
        follow_up_questions: Array.from({ length: 8 }, (_, i) => ({ question: `q${i}`, reason: "r" })),
      },
      sources,
    );
    expect(r.guidance_references.map((g) => g.guidance_id)).toEqual(["g1"]);
    expect(r.grounding.removed_guidance_ids).toEqual(["made-up"]);
    expect(r.follow_up_questions).toHaveLength(5);
  });
});

describe("findUnsupportedDetails", () => {
  const facts = ["Zenith Bank", "25000", "NIP-REF-0001", "Ada Okafor"];
  it("flags references and amounts that are not in the confirmed facts", () => {
    const text = "I sent NGN 25,000.00 (reference NIP-REF-0001). Your agent promised NGN 40,000 under ticket TCK99887766.";
    expect(findUnsupportedDetails(text, facts)).toEqual(["TCK99887766", "NGN 40,000"]);
  });
  it("ignores placeholders and ISO dates", () => {
    expect(findUnsupportedDetails("Reference: [ADD: ABC12345678] on 2026-10-01", facts)).toEqual([]);
  });
});
