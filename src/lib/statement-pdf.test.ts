import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { buildStatementPdf, computeTotals, pdfText, type StatementCase, type StatementData } from "./statement-pdf";

const hasPdftotext = (() => {
  try {
    execFileSync("pdftotext", ["-v"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

function textOf(bytes: Uint8Array): string {
  const dir = mkdtempSync(path.join(tmpdir(), "statement-"));
  const file = path.join(dir, "s.pdf");
  writeFileSync(file, bytes);
  return execFileSync("pdftotext", ["-layout", file, "-"]).toString();
}

const profile: StatementData["profile"] = {
  id: "8880e48f-42d8-464c-80af-ab33f633747b",
  full_name: "Adébáyọ̀ Okafor",
  email: "ada@example.com",
  phone: "+234 803 000 0000",
  country: "NG",
  account_type: "individual",
  business_name: null,
  preferred_contact_method: "email",
  created_at: "2026-09-01T10:00:00Z",
};

function makeCase(i: number, overrides: Partial<StatementCase> = {}): StatementCase {
  return {
    id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    case_number: `RSV-${String(i).padStart(4, "0")}-TEST`,
    intake_status: "complete",
    issue_category: "failed_or_pending_transfer",
    institution_name: "Zenith Bank",
    amount: "25000",
    currency: "NGN",
    transaction_date: new Date(Date.UTC(2026, 0, 1) + i * 86_400_000).toISOString(),
    transaction_reference: `NIP${String(i).padStart(10, "0")}`,
    payment_channel: "mobile_app",
    recipient_details: "Ada Supplies Ltd, GTBank",
    status: "draft",
    created_at: "2026-10-01T10:00:00Z",
    evidence_count: 1,
    ...overrides,
  };
}

const logo = readFileSync(path.join(process.cwd(), "public/banks/zenith.png"));

describe("statement totals", () => {
  it("totals reported, outstanding and resolved amounts per currency", () => {
    const totals = computeTotals([
      makeCase(1, { amount: "25000", status: "draft" }),
      makeCase(2, { amount: "10000.50", status: "resolved" }),
      makeCase(3, { amount: "5000", status: "closed" }),
      makeCase(4, { amount: null, status: "draft", intake_status: "in_progress" }),
      makeCase(5, { amount: "100", currency: "USD", status: "awaiting_institution_response" }),
    ]);
    expect(totals.transactions).toBe(5);
    expect(totals.byCurrency[0]).toEqual({ currency: "NGN", reported: 40000.5, outstanding: 25000, resolved: 10000.5, count: 4 });
    expect(totals.byCurrency[1]).toEqual({ currency: "USD", reported: 100, outstanding: 100, resolved: 0, count: 1 });
    expect(totals.byStatus.find((s) => s.status === "unfinished")?.count).toBe(1);
  });

  it("makes text safe for standard PDF fonts", () => {
    expect(pdfText("₦25,000 – Adébáyọ̀")).toBe("NGN 25,000 - Adébáyo");
  });
});

describe("statement PDF", () => {
  it("handles an account with no transactions", async () => {
    const bytes = await buildStatementPdf({ generatedAt: new Date("2026-11-10T09:00:00Z"), profile, cases: [], events: [] });
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(1);
    if (hasPdftotext) {
      const text = textOf(bytes);
      expect(text).toContain("ACCOUNT STATEMENT");
      expect(text).toContain("No transactions reported yet");
      expect(text).toContain("Page 1 of 1");
    }
  });

  it("lays out large histories over many pages with numbered pages and repeated headers", async () => {
    const cases = Array.from({ length: 300 }, (_, i) =>
      makeCase(i + 1, { status: i % 3 === 0 ? "resolved" : "awaiting_institution_response", institution_name: i % 2 ? "Zenith Bank" : "Jaiz Bank" }),
    );
    const events = cases.flatMap((c) => [
      { case_id: c.id, event_type: "case_created", description: `Case ${c.case_number} was started`, created_at: c.created_at },
      { case_id: c.id, event_type: "report_submitted", description: "Report completed and reviewed", created_at: c.created_at },
    ]);
    const bytes = await buildStatementPdf(
      { generatedAt: new Date("2026-11-10T09:00:00Z"), profile, cases, events },
      { loadLogo: (p) => (p.endsWith("zenith.png") ? logo : null) },
    );
    const pdf = await PDFDocument.load(bytes);
    const pages = pdf.getPageCount();
    expect(pages).toBeGreaterThan(10);
    if (hasPdftotext) {
      const text = textOf(bytes);
      expect(text).toContain(`Page ${pages} of ${pages}`);
      // The transaction table header repeats on continuation pages.
      expect((text.match(/OUTSTANDING/g) ?? []).length).toBeGreaterThan(3);
      // Accurate totals: 300 x 25,000 reported; 100 resolved; 200 outstanding.
      expect(text).toContain("NGN 7,500,000.00");
      expect(text).toContain("NGN 5,000,000.00");
      expect(text).toContain("NGN 2,500,000.00");
      expect(text).toContain("RSV-0300-TEST");
      expect(text).toContain("Adébáyo Okafor");
    }
  });
});
