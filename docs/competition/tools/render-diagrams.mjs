// Renders the HTML diagrams in tools/diagrams to PNG (2x) in evidence-assets/.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const here = path.dirname(fileURLToPath(import.meta.url));
const names = ["architecture", "er", "ai-workflow", "proposed-inclusion"];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1200 }, deviceScaleFactor: 2 });
for (const n of names) {
  await page.goto(`file://${path.join(here, "diagrams", `${n}.html`)}`);
  await page.evaluate(() => document.fonts.ready);
  const out = path.join(here, "..", "evidence-assets", `diagram-${n}.png`);
  await page.locator("#d").screenshot({ path: out });
  console.log(out);
}
await browser.close();
