import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";

/**
 * Renders a complaint letter as a simple, printable A4 PDF.
 * Standard PDF fonts only support basic Latin characters, so text is
 * normalised first (e.g. "₦" becomes "NGN").
 */

export function toPdfSafeText(text: string): string {
  return text
    .replace(/₦\s?/g, "NGN ")
    .replace(/[‘’‚′]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/ /g, " ")
    .replace(/\t/g, "    ")
    .replace(/[^\x0a\x0d\x20-\x7e\xa0-\xff]/g, "?");
}

function wrapLine(line: string, font: PDFFont, size: number, maxWidth: number): string[] {
  if (line.trim() === "") return [""];
  const words = line.split(/(\s+)/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current + word;
    if (font.widthOfTextAtSize(candidate.trimEnd(), size) <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current.trim()) lines.push(current.trimEnd());
    current = word.trimStart();
    // Break very long tokens (e.g. references) that don't fit on one line.
    while (font.widthOfTextAtSize(current, size) > maxWidth) {
      let cut = current.length - 1;
      while (cut > 1 && font.widthOfTextAtSize(current.slice(0, cut), size) > maxWidth) cut--;
      lines.push(current.slice(0, cut));
      current = current.slice(cut);
    }
  }
  if (current.trim() || lines.length === 0) lines.push(current.trimEnd());
  return lines;
}

export async function renderComplaintPdf(opts: {
  subject: string;
  body: string;
  caseNumber: string;
  version: number;
  approved: boolean;
}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(toPdfSafeText(opts.subject || `Complaint ${opts.caseNumber}`));
  doc.setCreator("Resolve");
  doc.setProducer("Resolve");

  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const pageSize: [number, number] = [595.28, 841.89]; // A4
  const margin = 64;
  const size = 10.5;
  const lineHeight = 15.5;
  const maxWidth = pageSize[0] - margin * 2;
  const ink = rgb(0.06, 0.11, 0.19);
  const muted = rgb(0.4, 0.46, 0.55);

  let page = doc.addPage(pageSize);
  let y = pageSize[1] - margin;
  const footer = () => {
    const label = `Prepared with Resolve - case ${opts.caseNumber} - draft version ${opts.version}${opts.approved ? "" : " (NOT YET APPROVED)"}`;
    page.drawText(toPdfSafeText(label), { x: margin, y: 36, size: 8, font, color: muted });
  };
  footer();

  if (!opts.approved) {
    page.drawText("DRAFT - review and approve in Resolve before sending", { x: margin, y, size: 9, font: bold, color: rgb(0.6, 0.36, 0.02) });
    y -= lineHeight * 1.5;
  }

  const lines = toPdfSafeText(opts.body).replace(/\r\n/g, "\n").split("\n");
  for (const raw of lines) {
    const isSubject = /^subject:/i.test(raw.trim());
    const f = isSubject ? bold : font;
    for (const line of wrapLine(raw, f, size, maxWidth)) {
      if (y < margin + 20) {
        page = doc.addPage(pageSize);
        footer();
        y = pageSize[1] - margin;
      }
      if (line) page.drawText(line, { x: margin, y, size, font: f, color: ink });
      y -= lineHeight;
    }
  }
  return doc.save();
}
