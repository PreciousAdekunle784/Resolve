import { describe, expect, it } from "vitest";
import { checkComplaintBeforeSending, findSensitiveData, groundRecoveryPlan, groundResponseAnalysis } from "./checks";
import type { BankResponseAnalysis, RecoveryPlan } from "./schemas";

const letter = `1 Oct 2026

To: Customer Complaints Unit
Zenith Bank

Dear Sir/Madam,

I am writing to report a failed transfer of NGN 25,000.00 made on 1 Oct 2026 at 10:30 through the mobile app.
The transaction reference is NIP-E2E-REF-0001. My account was debited but the recipient was not credited.

Please reverse the debit, acknowledge this complaint and provide a complaint reference number.

Yours faithfully,
Ada Okafor`;

const base = {
  subject: "Complaint: failed transfer of NGN 25,000.00",
  content: letter,
  approved: true,
  facts: { amount: "25000", transaction_date: "2026-10-01T09:30:00Z", transaction_reference: "NIP-E2E-REF-0001" },
  confirmedFacts: ["Zenith Bank", "25000", "NIP-E2E-REF-0001", "Ada Okafor"],
};

describe("complaint checks before sending", () => {
  it("passes a complete, approved letter", () => {
    const r = checkComplaintBeforeSending(base);
    expect(r.blocking).toEqual([]);
    expect(r.ready).toBe(true);
    expect(r.warnings).toEqual([]);
  });

  it("blocks unapproved letters and placeholders", () => {
    const r = checkComplaintBeforeSending({ ...base, approved: false, content: `${letter}\n[ADD: account number]` });
    expect(r.ready).toBe(false);
    expect(r.blocking.join(" ")).toMatch(/Approve the complaint/);
    expect(r.blocking.join(" ")).toMatch(/placeholder/);
  });

  it("warns about missing key facts and details that aren't in the case", () => {
    const r = checkComplaintBeforeSending({
      ...base,
      subject: "Complaint about a failed transfer",
      content: letter.replace("NIP-E2E-REF-0001", "the reference").replace("NGN 25,000.00", "some money") + "\nMy account number is 0123456789.",
    });
    expect(r.ready).toBe(true);
    expect(r.warnings.join(" ")).toMatch(/amount/);
    expect(r.warnings.join(" ")).toMatch(/transaction reference/);
    expect(r.warnings.join(" ")).toMatch(/0123456789/);
  });
});

describe("sensitive data detection", () => {
  it("finds PINs, OTPs, BVNs and card numbers", () => {
    expect(findSensitiveData("My PIN is 1234")).toHaveLength(1);
    expect(findSensitiveData("the OTP: 482910 was sent")).toHaveLength(1);
    expect(findSensitiveData("BVN 22212345678")).toHaveLength(1);
    expect(findSensitiveData("card 4111 1111 1111 1111")).toHaveLength(1);
  });

  it("never mistakes emails, phone numbers or references for card numbers", () => {
    // 4111111111111111 passes the card checksum; these contexts must still be ignored.
    expect(findSensitiveData("Email: sam.4111111111111111@example.com")).toEqual([]);
    expect(findSensitiveData("Email: sam.1794308323298@example.com")).toEqual([]);
    expect(findSensitiveData("Phone: +234 803 000 0000 and +2348030000000")).toEqual([]);
    expect(findSensitiveData("Transaction reference 4111111111111111")).toEqual([]);
    expect(findSensitiveData("Session ID 000013251010103045123456789012")).toEqual([]);
    expect(findSensitiveData("My card number is 4111111111111111")).toHaveLength(1);
    expect(findSensitiveData("Verve card 5061 0000 0000 0000 004")).toHaveLength(0); // fails the checksum
  });

  it("ignores ordinary numbers", () => {
    expect(findSensitiveData("Reference 000012345678901234 for NGN 25,000 on 1 Oct 2026, account 0123456789")).toEqual([]);
    expect(findSensitiveData("I never shared my PIN or OTP with anyone.")).toEqual([]);
  });

  it("blocks a letter containing a credential", () => {
    expect(checkComplaintBeforeSending({ ...base, content: `${letter}\nMy PIN is 1234.` }).ready).toBe(false);
  });
});

describe("response analysis grounding", () => {
  const reply = "Dear Ada, your complaint has been logged with reference ZB/CMP/77821. Please send a copy of your statement. We will respond within 5 working days.";
  const analysis: BankResponseAnalysis = {
    classification: "information_requested",
    summary: "They logged the complaint and asked for a statement.",
    reference_numbers: [
      { value: "ZB/CMP/77821", quote: "reference ZB/CMP/77821" },
      { value: "ZB/CMP/99999", quote: "reference ZB/CMP/99999" },
    ],
    information_requested: ["A copy of your statement"],
    timeframes: [{ quote: "within 5 working days" }, { quote: "within 24 hours" }],
    amounts: [{ value: "NGN 25,000", quote: "NGN 25,000 will be reversed" }],
    suggested_case_status: "additional_information_required",
    status_reason: "They asked for a statement.",
    reply_points: ["Attach your statement"],
    confidence: "high",
  };

  it("keeps only values that are really in the reply", () => {
    const g = groundResponseAnalysis(analysis, reply);
    expect(g.reference_numbers.map((r) => r.value)).toEqual(["ZB/CMP/77821"]);
    expect(g.timeframes.map((t) => t.quote)).toEqual(["within 5 working days"]);
    expect(g.amounts).toEqual([]);
    expect(g.grounding.removed).toHaveLength(3);
  });
});

describe("recovery plan grounding", () => {
  it("drops guidance IDs Resolve didn't provide", () => {
    const plan: RecoveryPlan = {
      situation: "Waiting for a reply.",
      next_actions: [{ title: "Wait", detail: "Give them time.", timing: "now" }],
      escalation: { consider_now: false, explanation: "Not yet.", guidance_ids: ["known", "made-up"] },
      evidence_to_gather: [],
      cautions: [],
    };
    const g = groundRecoveryPlan(plan, ["known"]);
    expect(g.escalation.guidance_ids).toEqual(["known"]);
    expect(g.grounding.removed_guidance_ids).toEqual(["made-up"]);
  });
});
