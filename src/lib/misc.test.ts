import { describe, expect, it } from "vitest";
import { safeNextPath } from "./auth-errors";
import { buildTemplateComplaint, confirmedFactTexts } from "./complaint-template";
import { checkDeclaredFile, detectMimeType, sanitizeFilename } from "./files";
import { formatMoney, fromLagosDateTimeLocal, toLagosDateTimeLocal } from "./format";
import { isGuidanceInEffect, rankGuidance } from "./guidance";
import { findUnsupportedDetails } from "./ai/grounding";
import type { CaseRow } from "./types";

describe("file validation", () => {
  it("detects real file types from their bytes", () => {
    expect(detectMimeType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe("image/png");
    expect(detectMimeType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(detectMimeType(new TextEncoder().encode("%PDF-1.7"))).toBe("application/pdf");
    expect(detectMimeType(new TextEncoder().encode("<html>"))).toBeNull();
  });
  it("checks declared type, extension and size", () => {
    expect(checkDeclaredFile({ filename: "a.png", mimeType: "image/png", size: 100 }).ok).toBe(true);
    expect(checkDeclaredFile({ filename: "a.exe", mimeType: "application/x-msdownload", size: 100 }).ok).toBe(false);
    expect(checkDeclaredFile({ filename: "a.pdf", mimeType: "image/png", size: 100 }).ok).toBe(false);
    expect(checkDeclaredFile({ filename: "a.pdf", mimeType: "application/pdf", size: 11 * 1024 * 1024 }).ok).toBe(false);
    expect(checkDeclaredFile({ filename: "a.jpg", mimeType: "image/jpeg", size: 0 }).ok).toBe(false);
  });
  it("sanitises file names", () => {
    expect(sanitizeFilename("../../etc/passwd")).toBe(".._.._etc_passwd");
    expect(sanitizeFilename("  receipt <1>.png ")).toBe("receipt _1_.png");
  });
});

describe("redirect safety", () => {
  it("only allows same-site relative paths", () => {
    expect(safeNextPath("/cases/new")).toBe("/cases/new");
    expect(safeNextPath("https://evil.example")).toBe("/dashboard");
    expect(safeNextPath("//evil.example")).toBe("/dashboard");
    expect(safeNextPath("/\\evil.example")).toBe("/dashboard");
  });
});

describe("dates and money", () => {
  it("round-trips Lagos local time", () => {
    const iso = fromLagosDateTimeLocal("2026-10-01T10:30");
    expect(iso).toBe("2026-10-01T09:30:00.000Z");
    expect(toLagosDateTimeLocal(iso)).toBe("2026-10-01T10:30");
    expect(fromLagosDateTimeLocal("not a date")).toBeNull();
  });
  it("formats naira", () => {
    expect(formatMoney("25000", "NGN")).toBe("₦25,000.00");
    expect(formatMoney(null)).toBe("—");
  });
});

describe("guidance effective dates", () => {
  it("excludes records outside their effective period", () => {
    expect(isGuidanceInEffect({ effective_from: null, effective_until: null }, "2026-11-08")).toBe(true);
    expect(isGuidanceInEffect({ effective_from: "2027-01-01", effective_until: null }, "2026-11-08")).toBe(false);
    expect(isGuidanceInEffect({ effective_from: null, effective_until: "2026-01-01" }, "2026-11-08")).toBe(false);
  });
  it("puts verified guidance first", () => {
    const r = rankGuidance([{ status: "outdated" }, { status: "unverified" }, { status: "verified" }] as { status: "verified" | "unverified" | "outdated" | "archived" }[]);
    expect(r.map((g) => g.status)).toEqual(["verified", "unverified", "outdated"]);
  });
});

describe("template complaint (no AI)", () => {
  const c = {
    case_number: "RSV-AAAA-BBBB",
    issue_category: "failed_or_pending_transfer",
    institution_name: "Zenith Bank",
    amount: "25000",
    currency: "NGN",
    transaction_date: "2026-10-01T09:30:00.000Z",
    transaction_reference: null,
    payment_channel: "mobile_app",
    recipient_details: null,
    incident_description: "My account was debited but the recipient was not credited.",
    previous_attempts: null,
    requested_resolution: null,
    supplementary_info: [],
    institution_reference: null,
  } as unknown as CaseRow;
  const profile = {
    full_name: "Ada Okafor",
    email: "ada@example.com",
    phone: null,
    preferred_contact_method: "email" as const,
    account_type: "individual" as const,
    business_name: null,
  };

  it("uses only the user's facts and marks missing ones as placeholders", () => {
    const t = buildTemplateComplaint(c, profile, [], new Date("2026-11-08T10:00:00Z"));
    expect(t.body).toContain("Zenith Bank");
    expect(t.body).toContain("NGN 25,000.00");
    expect(t.body).toContain("Ada Okafor");
    expect(t.placeholders).toContain("transaction reference / session ID");
    expect(t.body).not.toMatch(/guarantee|will be refunded/i);
  });

  it("contains no details outside the confirmed facts", () => {
    const t = buildTemplateComplaint(c, profile, [{ original_filename: "receipt.png", description: "Receipt" }]);
    expect(findUnsupportedDetails(t.body, confirmedFactTexts(c, profile, [{ original_filename: "receipt.png", description: "Receipt" }]))).toEqual([]);
  });
});
