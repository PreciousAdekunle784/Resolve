import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage, type RGB } from "pdf-lib";
import { findBank } from "@/lib/banks";
import {
  CASE_STATUS_INFO,
  CONTACT_METHOD_LABELS,
  COUNTRIES,
  ISSUE_CATEGORY_INFO,
  PAYMENT_CHANNEL_LABELS,
  type CaseStatus,
} from "@/lib/constants";
import { formatDate, formatMoneyPlain } from "@/lib/format";
import type { CaseRow, Profile } from "@/lib/types";

/**
 * Builds the user's account statement as a professionally laid-out, multi-page
 * A4 PDF: account details, financial summary, a table of every reported
 * transaction, and a full case activity log. Pure function (no I/O) so it can
 * be unit-tested; logos are supplied by the caller.
 */

export type StatementCase = Pick<
  CaseRow,
  | "id"
  | "case_number"
  | "intake_status"
  | "issue_category"
  | "institution_name"
  | "amount"
  | "currency"
  | "transaction_date"
  | "transaction_reference"
  | "payment_channel"
  | "recipient_details"
  | "status"
  | "created_at"
> & { evidence_count: number };

export interface StatementEvent {
  case_id: string;
  event_type: string;
  description: string;
  created_at: string;
}

export interface StatementData {
  generatedAt: Date;
  profile: Pick<
    Profile,
    "id" | "full_name" | "email" | "phone" | "country" | "account_type" | "business_name" | "preferred_contact_method" | "created_at"
  >;
  cases: StatementCase[];
  events: StatementEvent[];
}

export interface StatementTotals {
  transactions: number;
  byCurrency: { currency: string; reported: number; outstanding: number; resolved: number; count: number }[];
  byStatus: { status: string; label: string; count: number }[];
}

const CLOSED: CaseStatus[] = ["resolved", "closed"];

/** True when a case's amount is still in dispute (not resolved or closed). */
export function isOutstanding(c: Pick<StatementCase, "status">): boolean {
  return !CLOSED.includes(c.status);
}

export function computeTotals(cases: StatementCase[]): StatementTotals {
  const currencies = new Map<string, StatementTotals["byCurrency"][number]>();
  for (const c of cases) {
    const amount = c.amount === null ? null : Number(c.amount);
    const cur = c.currency || "NGN";
    const row = currencies.get(cur) ?? { currency: cur, reported: 0, outstanding: 0, resolved: 0, count: 0 };
    row.count += 1;
    if (amount !== null && Number.isFinite(amount)) {
      row.reported += amount;
      if (c.status === "resolved") row.resolved += amount;
      if (isOutstanding(c)) row.outstanding += amount;
    }
    currencies.set(cur, row);
  }
  const statusCounts = new Map<string, number>();
  for (const c of cases) {
    const key = c.intake_status === "in_progress" ? "unfinished" : c.status;
    statusCounts.set(key, (statusCounts.get(key) ?? 0) + 1);
  }
  return {
    transactions: cases.length,
    byCurrency: [...currencies.values()].sort((a, b) => (a.currency === "NGN" ? -1 : b.currency === "NGN" ? 1 : a.currency.localeCompare(b.currency))),
    byStatus: [...statusCounts.entries()].map(([status, count]) => ({
      status,
      label: status === "unfinished" ? "Unfinished report" : CASE_STATUS_INFO[status as CaseStatus].label,
      count,
    })),
  };
}

// ---------------------------------------------------------------------------
// Text helpers (standard PDF fonts only cover Latin-1)
// ---------------------------------------------------------------------------

export function pdfText(input: string | null | undefined): string {
  if (!input) return "";
  return input
    .replace(/₦\s?/g, "NGN ")
    .replace(/[‘’‚′]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/[   ]/g, " ")
    .replace(/[\r\n\t]+/g, " ")
    .normalize("NFC")
    .replace(/[^\x20-\x7e\xa0-\xff]/g, (ch) => {
      // Fall back to the base letter (e.g. "ọ" → "o") before giving up.
      const base = ch.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      // Lone combining marks (e.g. Yoruba tone marks) simply disappear.
      return /^[\x20-\x7e\xa0-\xff]*$/.test(base) ? base : "?";
    });
}

/** The largest size (down to 70% of `size`) at which `text` fits in `width`. */
function fitSize(font: PDFFont, text: string, size: number, width: number): number {
  const actual = font.widthOfTextAtSize(text, size);
  return actual <= width ? size : Math.max(size * 0.7, (size * width) / actual);
}

function wrap(text: string, font: PDFFont, size: number, width: number, maxLines = Infinity): string[] {
  const words = pdfText(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  const push = (l: string) => lines.push(l);
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= width) {
      line = candidate;
      continue;
    }
    if (line) push(line);
    // Break long unbroken words (references) across lines.
    let rest = word;
    while (font.widthOfTextAtSize(rest, size) > width) {
      let cut = rest.length - 1;
      while (cut > 1 && font.widthOfTextAtSize(rest.slice(0, cut), size) > width) cut--;
      push(rest.slice(0, cut));
      rest = rest.slice(cut);
    }
    line = rest;
  }
  if (line || lines.length === 0) push(line);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    let last = kept[maxLines - 1];
    while (last.length > 1 && font.widthOfTextAtSize(`${last}...`, size) > width) last = last.slice(0, -1);
    kept[maxLines - 1] = `${last}...`;
    return kept;
  }
  return lines;
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

const A4: [number, number] = [595.28, 841.89];
const M = 40; // page margin
const W = A4[0] - M * 2;
const FOOTER_H = 46;

const C = {
  ink: rgb(0.09, 0.1, 0.12),
  body: rgb(0.23, 0.24, 0.27),
  muted: rgb(0.42, 0.44, 0.47),
  line: rgb(0.89, 0.9, 0.91),
  zebra: rgb(0.973, 0.973, 0.969),
  brand: rgb(0.145, 0.388, 0.922),
  brandDark: rgb(0.114, 0.306, 0.847),
  brandSoft: rgb(0.937, 0.965, 1),
  night: rgb(0.043, 0.051, 0.071),
  success: rgb(0.082, 0.412, 0.227),
  warning: rgb(0.604, 0.357, 0.02),
};

interface Column {
  key: string;
  title: string;
  width: number;
  align?: "left" | "right";
}

class Writer {
  page!: PDFPage;
  y = 0;
  pages: PDFPage[] = [];
  constructor(
    public doc: PDFDocument,
    public font: PDFFont,
    public bold: PDFFont,
    private onNewPage: (w: Writer) => void,
  ) {}

  addPage() {
    this.page = this.doc.addPage(A4);
    this.pages.push(this.page);
    this.y = A4[1] - M;
    this.onNewPage(this);
  }

  /** Starts a new page if fewer than `h` points remain above the footer. */
  ensure(h: number): boolean {
    if (this.y - h < M + FOOTER_H) {
      this.addPage();
      return true;
    }
    return false;
  }

  text(t: string, x: number, y: number, size: number, opts: { font?: PDFFont; color?: RGB; align?: "left" | "right" | "center"; width?: number } = {}) {
    const font = opts.font ?? this.font;
    const s = pdfText(t);
    let dx = x;
    if (opts.align && opts.width) {
      const tw = font.widthOfTextAtSize(s, size);
      if (opts.align === "right") dx = x + opts.width - tw;
      if (opts.align === "center") dx = x + (opts.width - tw) / 2;
    }
    this.page.drawText(s, { x: dx, y, size, font, color: opts.color ?? C.body });
  }

  rect(x: number, y: number, w: number, h: number, color: RGB, border?: RGB) {
    this.page.drawRectangle({ x, y, width: w, height: h, color, ...(border ? { borderColor: border, borderWidth: 0.6 } : {}) });
  }

  line(x1: number, y1: number, x2: number, y2: number, color = C.line, thickness = 0.6) {
    this.page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, color, thickness });
  }

  sectionTitle(title: string, subtitle?: string) {
    this.ensure(subtitle ? 56 : 42);
    this.y -= 22;
    this.text(title, M, this.y, 12, { font: this.bold, color: C.ink });
    if (subtitle) {
      this.y -= 14;
      this.text(subtitle, M, this.y, 8, { color: C.muted });
    }
    this.y -= 10;
  }
}

/** Draws a table with a header that repeats on every page and rows that wrap. */
function drawTable(
  w: Writer,
  columns: Column[],
  rows: Record<string, string>[],
  opts: { size?: number; maxLines?: Record<string, number>; logos?: (row: Record<string, string>) => PDFImage | null; logoColumn?: string; emptyText?: string; totals?: Record<string, string> },
) {
  const size = opts.size ?? 7.6;
  const lh = size + 3;
  const padX = 5;
  const padY = 5;
  const headerH = 20;
  const header = () => {
    w.rect(M, w.y - headerH, W, headerH, C.night);
    let x = M;
    for (const col of columns) {
      w.text(col.title.toUpperCase(), x + padX, w.y - 13, 6.6, { font: w.bold, color: rgb(1, 1, 1), align: col.align, width: col.width - padX * 2 });
      x += col.width;
    }
    w.y -= headerH;
  };

  w.ensure(headerH + 30);
  header();

  if (rows.length === 0) {
    w.rect(M, w.y - 30, W, 30, C.zebra);
    w.text(opts.emptyText ?? "No records.", M + padX, w.y - 19, 8.5, { color: C.muted });
    w.y -= 30;
    return;
  }

  rows.forEach((row, index) => {
    const cells = columns.map((col) => {
      const logoW = opts.logoColumn === col.key && opts.logos?.(row) ? 13 : 0;
      const money = col.key === "amount" || col.key === "outstanding";
      const inner = col.width - padX * 2 - logoW;
      // Amounts stay on one line, shrinking slightly if a very large figure needs it.
      if (money) return { col, lines: [pdfText(row[col.key] ?? "")], logoW, fit: fitSize(w.bold, pdfText(row[col.key] ?? ""), size, inner) };
      // Measured in bold so the bold first line of a description never overflows.
      const lines = wrap(row[col.key] ?? "", col.key === "description" ? w.bold : w.font, size, inner, opts.maxLines?.[col.key] ?? 3);
      return { col, lines, logoW, fit: size };
    });
    const h = Math.max(...cells.map((c) => c.lines.length)) * lh + padY * 2;
    if (w.ensure(h)) header();
    if (index % 2 === 1) w.rect(M, w.y - h, W, h, C.zebra);
    let x = M;
    for (const { col, lines, logoW, fit } of cells) {
      if (logoW) {
        const img = opts.logos?.(row);
        if (img) w.page.drawImage(img, { x: x + padX, y: w.y - padY - 10.5, width: 10, height: 10 });
      }
      lines.forEach((ln, i) => {
        const strong = col.key === "amount" || col.key === "outstanding" || (col.key === "description" && i === 0);
        w.text(ln, x + padX + logoW, w.y - padY - size - i * lh + 1.5, fit, {
          font: strong ? w.bold : w.font,
          color: strong ? C.ink : C.body,
          align: col.align,
          width: col.width - padX * 2 - logoW,
        });
      });
      x += col.width;
    }
    w.y -= h;
    w.line(M, w.y, M + W, w.y);
  });

  if (opts.totals) {
    const h = 22;
    if (w.ensure(h)) header();
    w.rect(M, w.y - h, W, h, C.brandSoft);
    let x = M;
    for (const col of columns) {
      const t = opts.totals[col.key];
      const inner = col.width - padX * 2;
      if (t) w.text(t, x + padX, w.y - 14, fitSize(w.bold, pdfText(t), 8, inner), { font: w.bold, color: C.ink, align: col.align, width: inner });
      x += col.width;
    }
    w.y -= h;
  }
}

export async function buildStatementPdf(
  data: StatementData,
  opts: { loadLogo?: (path: string) => Uint8Array | null } = {},
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const holder = data.profile.full_name || data.profile.email;
  doc.setTitle(pdfText(`Resolve account statement - ${holder}`));
  doc.setAuthor("Resolve");
  doc.setCreator("Resolve");
  doc.setProducer("Resolve");
  doc.setCreationDate(data.generatedAt);

  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const generated = formatDate(data.generatedAt, { withTime: true });
  const statementNo = `RS-${data.profile.id.slice(0, 8).toUpperCase()}-${data.generatedAt.toISOString().slice(0, 10).replace(/-/g, "")}`;

  // Bank logos (embedded once each).
  const logoCache = new Map<string, PDFImage | null>();
  const pending = new Map<string, Promise<PDFImage | null>>();
  for (const c of data.cases) {
    const bank = findBank(c.institution_name);
    if (!bank?.logo || pending.has(bank.logo) || !opts.loadLogo) continue;
    const bytes = opts.loadLogo(bank.logo);
    pending.set(bank.logo, bytes ? doc.embedPng(bytes).catch(() => null) : Promise.resolve(null));
  }
  for (const [path, p] of pending) logoCache.set(path, await p);

  const w = new Writer(doc, font, bold, (wr) => {
    // Compact running header on continuation pages.
    if (wr.pages.length > 1) {
      drawMark(wr, M, A4[1] - M - 14, 14);
      wr.text("Resolve", M + 19, A4[1] - M - 10.5, 9.5, { font: bold, color: C.ink });
      wr.text(`Account statement  |  ${holder}  |  ${statementNo}`, M, A4[1] - M - 10.5, 7.5, { color: C.muted, align: "right", width: W });
      wr.line(M, A4[1] - M - 22, M + W, A4[1] - M - 22);
      wr.y = A4[1] - M - 30;
    }
  });
  w.addPage();

  // ---- Masthead -----------------------------------------------------------
  const mastH = 92;
  w.rect(0, A4[1] - mastH, A4[0], mastH, C.night);
  w.rect(0, A4[1] - mastH, A4[0], 3, C.brand);
  drawMark(w, M, A4[1] - 58, 28);
  w.text("Resolve", M + 36, A4[1] - 46, 17, { font: bold, color: rgb(1, 1, 1) });
  w.text("Understand what happened. Know what to do next.", M + 36, A4[1] - 60, 7.5, { color: rgb(0.66, 0.7, 0.78) });
  w.text("ACCOUNT STATEMENT", M, A4[1] - 40, 13, { font: bold, color: rgb(1, 1, 1), align: "right", width: W });
  w.text(`Generated ${generated} (WAT)`, M, A4[1] - 54, 8, { color: rgb(0.78, 0.81, 0.87), align: "right", width: W });
  w.text(`Statement no. ${statementNo}`, M, A4[1] - 66, 8, { color: rgb(0.78, 0.81, 0.87), align: "right", width: W });
  w.y = A4[1] - mastH - 20;

  // ---- Account holder -----------------------------------------------------
  const country = COUNTRIES.find((c) => c.code === data.profile.country)?.name ?? data.profile.country;
  const firstDate = data.cases.map((c) => c.transaction_date ?? c.created_at).sort()[0];
  const details: [string, string][] = [
    ["Account holder", holder],
    ["Email", data.profile.email],
    ["Phone", data.profile.phone || "Not provided"],
    ["Account type", data.profile.account_type === "business" ? `Business${data.profile.business_name ? ` - ${data.profile.business_name}` : ""}` : "Individual"],
    ["Country", country],
    ["Preferred contact", CONTACT_METHOD_LABELS[data.profile.preferred_contact_method]],
    ["Member since", formatDate(data.profile.created_at)],
    ["Statement period", firstDate ? `${formatDate(firstDate)} - ${formatDate(data.generatedAt)}` : `Up to ${formatDate(data.generatedAt)}`],
  ];
  const boxH = 4 * 26 + 18;
  w.rect(M, w.y - boxH, W, boxH, rgb(1, 1, 1), C.line);
  details.forEach(([label, value], i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = M + 14 + col * (W / 2);
    const y = w.y - 22 - row * 26;
    w.text(label.toUpperCase(), x, y, 6.6, { font: bold, color: C.muted });
    w.text(wrap(value, font, 9.5, W / 2 - 28, 1)[0], x, y - 11, 9.5, { color: C.ink });
  });
  w.y -= boxH;

  // ---- Summary ------------------------------------------------------------
  const totals = computeTotals(data.cases);
  w.sectionTitle("Summary", "Amounts are as you reported them in Resolve and have not been verified with your bank.");
  const primary = totals.byCurrency[0];
  const tiles: [string, string, RGB][] = [
    ["Transactions reported", String(totals.transactions), C.ink],
    ["Total amount reported", primary ? formatMoneyPlain(primary.reported, primary.currency) : formatMoneyPlain(0), C.ink],
    ["Outstanding (in dispute)", primary ? formatMoneyPlain(primary.outstanding, primary.currency) : formatMoneyPlain(0), C.warning],
    ["Resolved", primary ? formatMoneyPlain(primary.resolved, primary.currency) : formatMoneyPlain(0), C.success],
  ];
  const tileW = (W - 3 * 8) / 4;
  w.ensure(62);
  tiles.forEach(([label, value, color], i) => {
    const x = M + i * (tileW + 8);
    w.rect(x, w.y - 56, tileW, 56, C.zebra, C.line);
    w.rect(x, w.y - 56, 2.5, 56, i === 0 ? C.brand : color);
    w.text(label.toUpperCase(), x + 12, w.y - 18, 6.4, { font: bold, color: C.muted });
    const valueSize = bold.widthOfTextAtSize(pdfText(value), 13) > tileW - 20 ? 10.5 : 13;
    w.text(value, x + 12, w.y - 38, valueSize, { font: bold, color });
  });
  w.y -= 66;
  if (totals.byCurrency.length > 1) {
    w.text("Totals by currency:", M, w.y, 8, { font: bold, color: C.ink });
    w.y -= 12;
    for (const t of totals.byCurrency) {
      w.text(
        `${t.currency}: ${t.count} transaction${t.count === 1 ? "" : "s"}, reported ${formatMoneyPlain(t.reported, t.currency)}, outstanding ${formatMoneyPlain(t.outstanding, t.currency)}, resolved ${formatMoneyPlain(t.resolved, t.currency)}`,
        M,
        w.y,
        8,
      );
      w.y -= 11;
    }
  }
  if (totals.byStatus.length) {
    const statusLine = totals.byStatus.map((s) => `${s.label}: ${s.count}`).join("   |   ");
    for (const ln of wrap(`By status:   ${statusLine}`, font, 8, W)) {
      w.text(ln, M, w.y, 8, { color: C.body });
      w.y -= 11;
    }
  }

  // ---- Transactions -------------------------------------------------------
  w.sectionTitle(
    "Transaction history",
    "Every transaction you reported, oldest first. \"Outstanding\" is the amount still in dispute (cases not yet resolved or closed).",
  );
  const sorted = [...data.cases].sort((a, b) => (a.transaction_date ?? a.created_at).localeCompare(b.transaction_date ?? b.created_at));
  const columns: Column[] = [
    { key: "date", title: "Date", width: 54 },
    { key: "ref", title: "Case no.", width: 70 },
    { key: "description", title: "Description", width: 125 },
    { key: "type", title: "Type", width: 54 },
    { key: "status", title: "Status", width: 60 },
    { key: "amount", title: "Amount", width: 76, align: "right" },
    { key: "outstanding", title: "Outstanding", width: 76, align: "right" },
  ];
  const rows = sorted.map((c) => {
    const bank = findBank(c.institution_name);
    const institution = c.institution_name || "Institution not given";
    const detail = [
      c.recipient_details ? `To ${c.recipient_details}` : null,
      c.payment_channel ? PAYMENT_CHANNEL_LABELS[c.payment_channel] : null,
      c.transaction_reference ? `Ref ${c.transaction_reference}` : null,
    ]
      .filter(Boolean)
      .join(" | ");
    const amount = c.amount === null ? null : Number(c.amount);
    return {
      date: c.transaction_date ? formatDate(c.transaction_date) : `${formatDate(c.created_at)}*`,
      ref: c.case_number,
      description: detail ? `${institution} - ${detail}` : institution,
      type: c.issue_category ? ISSUE_CATEGORY_INFO[c.issue_category].short : "Not chosen",
      status: c.intake_status === "in_progress" ? "Unfinished report" : CASE_STATUS_INFO[c.status].label,
      amount: amount === null ? "-" : formatMoneyPlain(amount, c.currency),
      outstanding: amount === null ? "-" : isOutstanding(c) ? formatMoneyPlain(amount, c.currency) : formatMoneyPlain(0, c.currency),
      logo: bank?.logo ?? "",
    };
  });
  const single = totals.byCurrency.length === 1 ? totals.byCurrency[0] : null;
  drawTable(w, columns, rows, {
    maxLines: { description: 4, status: 2, type: 2 },
    logoColumn: "description",
    logos: (row) => (row.logo ? (logoCache.get(row.logo) ?? null) : null),
    emptyText: "No transactions reported yet. When you report a problem in Resolve, it will appear here.",
    totals: rows.length
      ? single
        ? { description: `Totals (${rows.length} transaction${rows.length === 1 ? "" : "s"})`, amount: formatMoneyPlain(single.reported, single.currency), outstanding: formatMoneyPlain(single.outstanding, single.currency) }
        : { description: `${rows.length} transactions - see totals by currency above` }
      : undefined,
  });
  if (rows.some((r) => r.date.endsWith("*"))) {
    w.y -= 12;
    w.text("* Transaction date not yet provided; the date the report was started is shown instead.", M, w.y, 7, { color: C.muted });
  }

  // ---- Activity log -------------------------------------------------------
  w.sectionTitle("Case activity", "Every recorded step on your cases, in date order.");
  const caseNo = new Map(data.cases.map((c) => [c.id, c.case_number]));
  const events = [...data.events].sort((a, b) => a.created_at.localeCompare(b.created_at));
  drawTable(
    w,
    [
      { key: "when", title: "Date & time (WAT)", width: 98 },
      { key: "ref", title: "Case no.", width: 70 },
      { key: "what", title: "Activity", width: W - 168 },
    ],
    events.map((e) => ({ when: formatDate(e.created_at, { withTime: true }), ref: caseNo.get(e.case_id) ?? "-", what: e.description })),
    { maxLines: { what: 6 }, emptyText: "No activity recorded yet." },
  );

  // ---- Notes --------------------------------------------------------------
  const notes = [
    "This statement lists the transactions you reported in Resolve and the activity on each case. Amounts, dates and references are as entered by you and have not been verified with your bank or payment provider.",
    "Resolve is an independent assistance service. It is not a bank, does not hold money and does not have access to your bank balance. \"Outstanding\" shows amounts in cases that are not yet resolved or closed; it is not an account balance.",
    "Evidence files are not included in this statement. You can download them from each case in Resolve.",
  ];
  w.sectionTitle("Important information");
  for (const n of notes) {
    const lines = wrap(n, font, 8, W);
    w.ensure(lines.length * 11 + 6);
    for (const ln of lines) {
      w.text(ln, M, w.y, 8, { color: C.body });
      w.y -= 11;
    }
    w.y -= 5;
  }

  // ---- Footers with page numbers -----------------------------------------
  const total = w.pages.length;
  w.pages.forEach((page, i) => {
    page.drawLine({ start: { x: M, y: M + 16 }, end: { x: M + W, y: M + 16 }, color: C.line, thickness: 0.6 });
    page.drawText(pdfText(`Resolve  |  Account statement for ${holder}  |  Generated ${generated}`), { x: M, y: M + 4, size: 7, font, color: C.muted });
    const label = `Page ${i + 1} of ${total}`;
    page.drawText(label, { x: M + W - bold.widthOfTextAtSize(label, 7.5), y: M + 4, size: 7.5, font: bold, color: C.ink });
  });

  return doc.save();
}

/** The Resolve mark: a blue rounded tile with a white "R". */
function drawMark(w: Writer, x: number, y: number, s: number) {
  w.page.drawRectangle({ x, y, width: s, height: s, color: C.brand });
  w.page.drawRectangle({ x, y: y + s / 2, width: s, height: s / 2, color: rgb(0.231, 0.51, 0.965) });
  const r = "R";
  const size = s * 0.62;
  w.page.drawText(r, { x: x + (s - w.bold.widthOfTextAtSize(r, size)) / 2, y: y + s * 0.26, size, font: w.bold, color: rgb(1, 1, 1) });
}
