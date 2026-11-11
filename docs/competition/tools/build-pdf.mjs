// Builds Resolve_Supporting_Evidence.pdf from Resolve_Supporting_Evidence_Source.md.
//   node docs/competition/tools/build-pdf.mjs
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { marked } from "marked";
import { chromium } from "playwright";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
// pdf-lib comes from the main project's dependencies.
const require = createRequire(path.join(root, "../../package.json"));
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");

const md = readFileSync(path.join(root, "Resolve_Supporting_Evidence_Source.md"), "utf8");
const body = marked.parse(md, { gfm: true });
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Resolve: Supporting Evidence</title>
<link rel="stylesheet" href="tools/document.css"></head><body>${body}</body></html>`;
const htmlPath = path.join(root, ".build.html");
writeFileSync(htmlPath, html);

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(`file://${htmlPath}`, { waitUntil: "load" });
await page.evaluate(async () => {
  await document.fonts.ready;
  await Promise.all([...document.images].map((i) => (i.complete ? null : new Promise((r) => (i.onload = i.onerror = r)))));
});
const pdfBytes = await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true });
await browser.close();

// Footer with page numbers on every page except the cover.
const pdf = await PDFDocument.load(pdfBytes);
pdf.setTitle("Resolve: Supporting Evidence");
pdf.setAuthor("Resolve");
pdf.setSubject("Competition supporting evidence: product, architecture, security, progress and testing");
pdf.setCreator("Resolve evidence builder");
const font = await pdf.embedFont(StandardFonts.Helvetica);
const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
const pages = pdf.getPages();
pages.forEach((p, i) => {
  if (i === 0) return;
  const { width } = p.getSize();
  const m = 18 * 2.8346;
  p.drawLine({ start: { x: m, y: 36 }, end: { x: width - m, y: 36 }, thickness: 0.5, color: rgb(0.86, 0.89, 0.94) });
  p.drawText("Resolve  |  Competition supporting evidence", { x: m, y: 22, size: 7.5, font, color: rgb(0.36, 0.41, 0.5) });
  const label = `${i + 1} / ${pages.length}`;
  p.drawText(label, { x: width - m - bold.widthOfTextAtSize(label, 8), y: 22, size: 8, font: bold, color: rgb(0.04, 0.08, 0.19) });
});
const out = path.join(root, "Resolve_Supporting_Evidence.pdf");
writeFileSync(out, await pdf.save());
console.log(`${out} (${pages.length} pages)`);
