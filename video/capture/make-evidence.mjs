// Renders the fictional banking-app receipt as a PNG "screenshot" used as evidence in the demo.
import { chromium } from "playwright";
import { serve } from "../tools/serve.mjs";

const server = await serve(4173);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 720, height: 1560 } });
await page.goto("http://localhost:4173/composition/evidence.html");
await page.waitForFunction(() => window.ready);
await page.screenshot({ path: new URL("../assets/evidence-transfer-receipt.png", import.meta.url).pathname });
await browser.close();
server.close();
console.log("assets/evidence-transfer-receipt.png");
