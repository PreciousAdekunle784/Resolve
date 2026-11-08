import { describe, expect, it } from "vitest";
import {
  caseCompleteSchema,
  caseDraftSchema,
  containsCardNumber,
  findSensitiveData,
  onboardingSchema,
  passwordSchema,
  registerSchema,
} from "./validation";

describe("sensitive data detection", () => {
  it("detects card numbers using the Luhn checksum", () => {
    expect(containsCardNumber("my card 4111 1111 1111 1111 was charged")).toBe(true);
    expect(containsCardNumber("4111-1111-1111-1112")).toBe(false); // fails Luhn
  });
  it("does not flag long transaction references or account numbers", () => {
    expect(containsCardNumber("Session ID 000013261001123456789012345678")).toBe(false);
    expect(containsCardNumber("Account 0123456789")).toBe(false);
  });
  it("detects PINs, OTPs, passwords, BVN and NIN", () => {
    expect(findSensitiveData("my PIN is 1234")).toMatch(/PINs, OTPs or passwords/);
    expect(findSensitiveData("OTP: 556677")).toMatch(/PINs/);
    expect(findSensitiveData("BVN 22212345678")).toMatch(/BVN or NIN/);
    expect(findSensitiveData("I was debited twice for my DSTV subscription")).toBeNull();
  });
  it("blocks sensitive data in case descriptions but allows references", () => {
    expect(caseDraftSchema.safeParse({ incident_description: "my password is hunter2" }).success).toBe(false);
    expect(caseDraftSchema.safeParse({ transaction_reference: "000013261001123456789012345678" }).success).toBe(true);
  });
});

describe("case validation", () => {
  it("parses amounts written with commas and the naira sign", () => {
    expect(caseDraftSchema.parse({ amount: "₦25,000.50" }).amount).toBe(25000.5);
    expect(caseDraftSchema.safeParse({ amount: "-5" }).success).toBe(false);
    expect(caseDraftSchema.safeParse({ amount: "abc" }).success).toBe(false);
  });
  it("treats empty fields as not provided", () => {
    expect(caseDraftSchema.parse({ transaction_reference: "  " }).transaction_reference).toBeUndefined();
  });
  it("requires core facts before a report can be submitted", () => {
    const complete = {
      issue_category: "duplicate_transaction",
      institution_name: "Access Bank",
      amount: 1000,
      currency: "NGN",
      transaction_date: "2026-01-01T10:00:00.000Z",
      payment_channel: "pos",
      incident_description: "I was charged twice at the same POS terminal.",
    };
    expect(caseCompleteSchema.safeParse(complete).success).toBe(true);
    expect(caseCompleteSchema.safeParse({ ...complete, incident_description: "short" }).success).toBe(false);
    expect(caseCompleteSchema.safeParse({ ...complete, transaction_date: "2999-01-01T00:00:00.000Z" }).success).toBe(false);
  });
});

describe("account validation", () => {
  it("enforces password strength", () => {
    expect(passwordSchema.safeParse("short1").success).toBe(false);
    expect(passwordSchema.safeParse("longpassword").success).toBe(false);
    expect(passwordSchema.safeParse("longpassword1").success).toBe(true);
  });
  it("requires accepting the terms", () => {
    expect(registerSchema.safeParse({ fullName: "Ada", email: "a@b.co", password: "password123" }).success).toBe(false);
  });
  it("requires a phone number for phone-based contact methods", () => {
    const base = { fullName: "Ada Obi", country: "NG", accountType: "individual", acceptTerms: "on" };
    expect(onboardingSchema.safeParse({ ...base, preferredContactMethod: "whatsapp" }).success).toBe(false);
    expect(onboardingSchema.safeParse({ ...base, preferredContactMethod: "whatsapp", phone: "+234 803 000 0000" }).success).toBe(true);
    const parsed = onboardingSchema.parse({ ...base, preferredContactMethod: "email" });
    expect(parsed.aiConsent).toBe(false);
  });
});
