// Captures screenshots of the real Resolve app for the competition evidence document.
//
// Runs the production build against the local demo environment (video/capture/demo-env.mjs):
// real PostgreSQL + Row Level Security, Supabase emulation, a Google OAuth/Gmail emulator, and a
// replay of genuine Gemini outputs captured for this fictional scenario. All data is synthetic.
//
// Usage (repository root, after `NEXT_DIST_DIR=.next-e2e npx next build`):
//   node docs/competition/tools/capture-screens.mjs
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { SCENARIO as S } from "../../../video/composition/scenario.js";
import { SERVICE_KEY } from "../../../tests/e2e/keys.mjs";
import { APP, BACKEND, startDemoEnv } from "../../../video/capture/demo-env.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(here, "..", "evidence-assets", "screens");
const EVIDENCE = path.join(here, "../../../video/assets/evidence-transfer-receipt.png");
mkdirSync(OUT, { recursive: true });
const PASSWORD = "Resolve-demo-evidence-2026";

const env = await startDemoEnv();
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
await context.addInitScript(() => {
  document.addEventListener("DOMContentLoaded", () => {
    const s = document.createElement("style");
    s.textContent = "::-webkit-scrollbar{display:none} html{scrollbar-width:none} *{caret-color:transparent!important}";
    document.head.appendChild(s);
  });
});
const page = await context.newPage();
page.on("dialog", (d) => d.accept());
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function shot(name, opts = {}) {
  await page.mouse.move(1430, 890);
  await sleep(opts.wait ?? 600);
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file, fullPage: opts.fullPage ?? false });
  console.log("captured", name);
}
async function scrollTo(locator, offset = 90) {
  await locator.evaluate((el, off) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - off), offset);
  await sleep(300);
}
async function service(pathAndQuery, method = "GET", body) {
  const res = await fetch(`${BACKEND}/rest/v1/${pathAndQuery}`, {
    method,
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json", Prefer: "return=representation" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${pathAndQuery}: ${res.status} ${await res.text()}`);
  return res.json();
}

try {
  await fetch(`${BACKEND}/__test/google/account`, { method: "POST", body: JSON.stringify({ email: S.user.email }) });

  // Public pages
  await page.goto(APP, { waitUntil: "networkidle" });
  await shot("01-landing", { wait: 2500 });
  await page.goto(`${APP}/guidance`, { waitUntil: "networkidle" });
  await shot("02-official-guidance");
  await page.goto(`${APP}/login`, { waitUntil: "networkidle" });
  await shot("03-sign-in");

  // Registration + onboarding
  await page.goto(`${APP}/register`, { waitUntil: "networkidle" });
  await page.getByLabel("Full name").fill(S.user.name);
  await page.getByLabel("Email address").fill(S.user.email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("checkbox", { name: /I agree to the terms/ }).check();
  await shot("04-register");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL(/onboarding/);
  await page.getByLabel(/Phone number/).fill("+234 800 000 0000");
  await page.getByRole("checkbox", { name: /Allow AI analysis/ }).check();
  await page.getByRole("checkbox", { name: /I understand that Resolve is an independent assistant/ }).check();
  await scrollTo(page.getByRole("checkbox", { name: /Allow AI analysis/ }), 420);
  await shot("05-onboarding-consent");
  await page.getByRole("button", { name: "Continue to Resolve" }).click();
  await page.waitForURL(/dashboard/);

  // Two earlier, synthetic cases so the dashboard and case list show real states.
  const [{ id: userId }] = await service(`profiles?email=eq.${encodeURIComponent(S.user.email)}&select=id`);
  const base = { user_id: userId, intake_status: "complete", intake_step: 5, currency: "NGN" };
  await service("cases", "POST", [
    { ...base, issue_category: "duplicate_transaction", institution_name: "Example Pay", amount: 12500, transaction_date: "2026-10-14T09:20:00Z", payment_channel: "fintech_wallet", incident_description: "I was charged twice for the same payment to a supplier in the Example Pay app.", status: "awaiting_institution_response", institution_submission_channel: "mobile_app", institution_submission_date: "2026-10-15" },
    { ...base, issue_category: "unauthorised_debit", institution_name: S.bank, amount: 4200, transaction_date: "2026-09-29T18:05:00Z", payment_channel: "card_online", incident_description: "A card debit I don't recognise appeared on my account statement.", status: "submitted_to_institution", institution_submission_channel: "email", institution_submission_date: "2026-10-01" },
  ]);

  // Report wizard
  await page.goto(`${APP}/cases/new`, { waitUntil: "networkidle" });
  await page.getByRole("radio", { name: /Failed or pending transfer/ }).check();
  await shot("06-report-problem-type");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL(/step=2/);
  const caseUrl = page.url().replace(/\/report.*$/, "");
  const caseId = caseUrl.split("/").pop();
  const bank = page.getByRole("combobox", { name: "Bank or payment provider" });
  await bank.fill(S.bank);
  await bank.press("Escape");
  await page.getByLabel("Amount").fill(S.amount);
  await page.getByLabel("Date and time of the transaction").fill(S.date);
  await page.getByLabel("How did you pay?").selectOption("mobile_app");
  await page.getByLabel(/Transaction reference/).fill(S.reference);
  await page.getByLabel(/Recipient details/).fill(S.recipient);
  await scrollTo(page.getByText("Bank or payment provider").first(), 200);
  await shot("07-report-transaction");
  await page.getByRole("button", { name: "Save and continue" }).click();
  await page.waitForURL(/step=3/);
  await page.getByLabel("What happened?").fill(S.description);
  await page.getByLabel(/What have you already tried/).fill(S.previous);
  await page.getByLabel(/What outcome are you asking for/).fill(S.outcome);
  await page.getByRole("button", { name: "Save and continue" }).click();
  await page.waitForURL(/step=4/);
  await page.locator(`#evidence-input-${caseId}`).setInputFiles(EVIDENCE);
  await page.getByRole("list", { name: "Uploaded evidence" }).getByText("evidence-transfer-receipt.png").waitFor();
  await page.getByRole("button", { name: "Add description" }).click();
  await page.getByLabel("File description").fill("Transfer receipt from my banking app");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByText("Transfer receipt from my banking app").first().waitFor();
  await shot("08-evidence-upload");
  await page.getByRole("link", { name: /Continue to review/ }).click();
  await page.waitForURL(/step=5/);
  await shot("09-report-review");
  await page.getByRole("button", { name: "Confirm and create case" }).click();
  await page.getByText("Your case has been created").waitFor();
  await shot("10-case-created");

  // AI analysis (genuine Gemini output for this scenario, replayed)
  await page.goto(`${caseUrl}?tab=analysis`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Analyse my case" }).click();
  await page.getByText("Run a new analysis").waitFor({ timeout: 60000 });
  await page.reload({ waitUntil: "networkidle" });
  await shot("11-ai-analysis-summary");
  await scrollTo(page.getByRole("heading", { name: "Key facts" }), 100);
  await shot("12-ai-analysis-key-facts");
  await scrollTo(page.getByRole("heading", { name: /Next steps|What to do next/ }).first(), 100).catch(() => {});
  await shot("13-ai-analysis-next-steps");

  // Complaint
  await page.goto(`${caseUrl}?tab=complaint`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Write my complaint with AI" }).click();
  await page.getByLabel("Complaint letter").waitFor({ timeout: 60000 });
  await sleep(800);
  await shot("14-complaint-draft");
  const letter = page.getByLabel("Complaint letter");
  await letter.fill((await letter.inputValue()).replace("[ADD: account number]", "0045712290").replace("[ADD: phone number]", "+234 800 000 0000"));
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.getByText("Draft saved.").waitFor();
  await page.getByRole("checkbox", { name: /I have read this complaint and confirm it is accurate/ }).check();
  await page.getByRole("button", { name: "Approve final draft" }).click();
  await page.getByText("Approved — ready to submit").waitFor();
  await scrollTo(page.getByText("Approved — ready to submit"), 380);
  await shot("15-complaint-approved");

  // Submit to bank
  await page.goto(`${caseUrl}?tab=submit`, { waitUntil: "networkidle" });
  await page.getByText(/No problems found/).waitFor();
  await page.getByRole("link", { name: "Connect Gmail" }).click();
  await page.getByText(`Gmail connected as ${S.user.email}`).waitFor();
  await page.getByText("Use a different email address").click();
  await page.getByLabel("Institution's complaints email").fill(S.bankEmail);
  await page.getByRole("checkbox", { name: /I got this address from my institution's official website/ }).check();
  await page.mouse.move(1430, 890);
  await shot("16-submit-to-bank");
  await scrollTo(page.getByRole("heading", { name: "Send from your Gmail" }), 120);
  await page.getByText("Preview the email").click();
  await shot("17-email-preview");
  await page.getByRole("checkbox", { name: /I authorise Resolve to send my approved complaint/ }).check();
  await page.getByRole("button", { name: "Send complaint" }).click();
  await page.getByText(/Gmail confirmed your complaint was sent/).waitFor();
  await scrollTo(page.getByText(/Gmail confirmed your complaint was sent/), 260);
  await shot("18-sent-and-history");

  // Bank reply (illustrative), AI explanation, recovery plan
  await fetch(`${BACKEND}/__test/google/reply`, { method: "POST", body: JSON.stringify({ to: S.bankEmail, from: `Northbridge Bank Complaints <${S.bankEmail}>`, text: S.bankReply }) });
  await page.getByRole("button", { name: "Check for replies" }).click();
  await page.getByText("Found 1 new reply.").waitFor();
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Explain this reply" }).click();
  await page.getByText("AI interpretation").first().waitFor({ timeout: 60000 });
  await page.getByRole("button", { name: /Set status to/ }).click();
  await page.getByText(/Case status set to/).waitFor();
  await page.reload({ waitUntil: "networkidle" });
  await scrollTo(page.locator("#responses"), 90);
  await page.locator("#responses summary", { hasText: "Original reply" }).first().click().catch(() => {});
  await shot("19-bank-reply-explained");
  await page.evaluate(() => window.scrollTo(0, 0));
  // Resolve allows 3 AI requests per minute per user; wait like a real user would.
  await sleep(65000);
  await page.getByRole("button", { name: "Get a recovery plan" }).click();
  await page.getByText("Update the plan").waitFor({ timeout: 60000 });
  await page.reload({ waitUntil: "networkidle" });
  await scrollTo(page.getByText("Next required action"), 90);
  await shot("20-next-action-recovery-plan");

  // Tracking, case list, dashboard, settings
  await page.goto(`${caseUrl}?tab=tracking`, { waitUntil: "networkidle" });
  await scrollTo(page.getByRole("heading", { name: "Case history" }), 90);
  await page.evaluate(() => window.scrollBy(0, 520));
  await shot("21-case-timeline");
  await page.goto(`${APP}/cases`, { waitUntil: "networkidle" });
  await shot("22-case-list");
  await page.goto(`${APP}/dashboard`, { waitUntil: "networkidle" });
  await shot("23-dashboard");
  await page.goto(`${APP}/settings`, { waitUntil: "networkidle" });
  await scrollTo(page.locator("#privacy"), 90);
  await shot("24-settings-privacy-email-data");

  // Mobile
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, storageState: await context.storageState() });
  const m = await mobile.newPage();
  await m.goto(`${caseUrl}`, { waitUntil: "networkidle" });
  await m.screenshot({ path: path.join(OUT, "25-mobile-case.png") });
  await m.goto(`${APP}/dashboard`, { waitUntil: "networkidle" });
  await m.screenshot({ path: path.join(OUT, "26-mobile-dashboard.png") });
  console.log("captured mobile");
  await mobile.close();
} catch (e) {
  console.error("CAPTURE FAILED:", e.message);
  await page.screenshot({ path: path.join(OUT, "_failure.png") }).catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close();
  env.stop();
}
