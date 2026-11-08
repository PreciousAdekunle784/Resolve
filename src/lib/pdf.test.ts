import { describe, expect, it } from "vitest";
import { renderComplaintPdf, toPdfSafeText } from "./pdf";

describe("PDF export", () => {
  it("converts characters the standard PDF fonts can't draw", () => {
    expect(toPdfSafeText("₦25,000 – “refund”…")).toBe('NGN 25,000 - "refund"...');
  });

  it("renders a multi-page PDF, including very long unbroken references", async () => {
    const body = ["Subject: Complaint", "", `Reference: ${"X".repeat(300)}`, ...Array.from({ length: 120 }, (_, i) => `Line ${i} of the complaint ₦`)].join("\n");
    const bytes = await renderComplaintPdf({ subject: "Complaint", body, caseNumber: "RSV-AAAA-BBBB", version: 2, approved: false });
    expect(Buffer.from(bytes.subarray(0, 5)).toString()).toBe("%PDF-");
    expect(bytes.byteLength).toBeGreaterThan(1000);
  });
});
