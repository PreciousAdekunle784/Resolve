import { expect, test, type Browser, type Page } from "@playwright/test";
import path from "node:path";

/**
 * Full user journey through Resolve, running against the local test backend
 * (real PostgreSQL + RLS, emulated Supabase APIs, deterministic fake AI).
 */

const BACKEND = "http://localhost:54321";
const PASSWORD = "Resolve-test-2026";
const FIXTURES = path.join(process.cwd(), "tests/e2e/fixtures");
const userA = { name: "Ada Okafor", email: `ada.${Date.now()}@example.com` };
const userB = { name: "Bayo Adeyemi", email: `bayo.${Date.now()}@example.com` };

let caseUrl = "";
let caseId = "";

test.describe.configure({ mode: "serial" });

async function register(page: Page, user: { name: string; email: string }, from = "/register") {
  await page.goto(from);
  await page.getByLabel("Full name").fill(user.name);
  await page.getByLabel("Email address").fill(user.email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("checkbox", { name: /I agree to the terms/ }).check();
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/onboarding/);
}

async function completeOnboarding(page: Page, opts: { aiConsent: boolean }) {
  await expect(page.getByRole("heading", { name: "Welcome to Resolve" })).toBeVisible();
  if (opts.aiConsent) await page.getByRole("checkbox", { name: /Allow AI analysis/ }).check();
  await page.getByRole("checkbox", { name: /I understand that Resolve is an independent assistant/ }).check();
  await page.getByRole("button", { name: "Continue to Resolve" }).click();
}

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

async function newPage(browser: Browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on("dialog", (d) => d.accept());
  return page;
}

test("public site, navigation and protected routes", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Understand what happened");
  await expect(page.getByRole("contentinfo").getByText(/Resolve is an independent assistance service/)).toBeVisible();
  for (const path of ["/privacy", "/terms", "/guidance"]) {
    const res = await page.goto(path);
    expect(res?.status()).toBe(200);
  }
  await expect(page.getByText("CBN Consumer Complaints Portal")).toBeVisible();
  await expect(page.getByText("Not yet verified by Resolve").first()).toBeVisible();

  // Protected pages redirect to sign in.
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login\?next=%2Fdashboard/);

  // Wrong password shows a clear message.
  await page.getByLabel("Email address").fill("nobody@example.com");
  await page.getByLabel("Password", { exact: true }).fill("wrong-password-1");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("The email or password is incorrect.")).toBeVisible();
  // The email the user typed is kept after an error.
  await expect(page.getByLabel("Email address")).toHaveValue("nobody@example.com");

  // Registration validation.
  await page.goto("/register");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("Enter your full name")).toBeVisible();

  // Forgot password gives a neutral message.
  await page.goto("/forgot-password");
  await page.getByLabel("Email address").fill("someone@example.com");
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByText(/If an account exists for someone@example.com/)).toBeVisible();
});

test("register, onboard and report a problem with evidence", async ({ page }) => {
  page.on("dialog", (d) => d.accept());
  await page.goto("/");
  await page.getByRole("link", { name: "Report a Problem" }).first().click();
  await expect(page).toHaveURL(/\/register\?next=(%2F|\/)cases(%2F|\/)new/);
  await register(page, userA, page.url());
  await completeOnboarding(page, { aiConsent: true });

  // Step 1: problem type
  await expect(page).toHaveURL(/\/cases\/new/);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Choose the type of problem to continue.")).toBeVisible();
  await page.getByRole("radio", { name: /Failed or pending transfer/ }).check();
  await page.getByRole("button", { name: "Continue" }).click();

  // Step 2: transaction details (with a validation error first)
  await expect(page).toHaveURL(/\/report\?step=2/);
  caseUrl = page.url().replace(/\/report.*$/, "");
  caseId = caseUrl.split("/").pop()!;
  await page.getByLabel("Bank or payment provider").fill("Zenith Bank");
  await page.getByLabel("Amount").fill("-5");
  await page.getByRole("button", { name: "Save and continue" }).click();
  await expect(page.getByText("Amount must be more than zero")).toBeVisible();
  await expect(page.getByLabel("Bank or payment provider")).toHaveValue("Zenith Bank");
  await page.getByLabel("Amount").fill("25,000");
  await page.getByLabel("Date and time of the transaction").fill("2026-10-01T10:30");
  await page.getByLabel("How did you pay?").selectOption("mobile_app");
  await page.getByLabel(/Recipient details/).fill("Ada Supplies Ltd, GTBank");
  await page.getByRole("button", { name: "Save and continue" }).click();

  // Step 3: description — "save and finish later", then resume from the dashboard
  await expect(page).toHaveURL(/step=3/);
  await page.getByLabel("What happened?").fill("PIN is 1234");
  await page.getByRole("button", { name: "Save and continue" }).click();
  await expect(page.getByText(/Please don't include PINs, OTPs or passwords/)).toBeVisible();
  await page
    .getByLabel("What happened?")
    .fill("I transferred money to my supplier from my mobile app. My account was debited but the supplier says the money never arrived.");
  await page.getByLabel(/What outcome are you asking for/).fill("A refund of the debited amount.");
  await page.getByRole("button", { name: "Save and finish later" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByText(/You have 1 unfinished report/)).toBeVisible();
  await page.getByRole("link", { name: "Continue where you left off" }).click();
  await page.getByRole("link", { name: /RSV-.*Unfinished report/ }).click();
  // Resumes at the first unfinished step (evidence).
  await expect(page.getByRole("heading", { name: "Add supporting evidence" })).toBeVisible();

  // Step 4: evidence — one valid file, one disguised file the server must reject
  const input = page.locator(`#evidence-input-${caseId}`);
  await input.setInputFiles(path.join(FIXTURES, "receipt.png"));
  await expect(page.getByRole("list", { name: "Uploaded evidence" }).getByText("receipt.png")).toBeVisible();
  await input.setInputFiles(path.join(FIXTURES, "not-really.png"));
  await expect(page.getByText(/isn't a valid PNG, JPG or PDF/)).toBeVisible();
  await page.getByRole("button", { name: "Add description" }).click();
  await page.getByLabel("File description").fill("Transfer receipt from my banking app");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Transfer receipt from my banking app")).toBeVisible();
  await page.getByRole("link", { name: "Continue to review" }).click();

  // Step 5: review and submit
  await expect(page.getByRole("heading", { name: "Review your report" })).toBeVisible();
  await expect(page.getByText("Zenith Bank")).toBeVisible();
  await expect(page.getByText("₦25,000.00")).toBeVisible();
  await page.getByRole("button", { name: "Confirm and create case" }).click();
  await expect(page.getByText("Your case has been created")).toBeVisible();
  await expect(page.getByText(/RSV-[0-9A-F]{4}-[0-9A-F]{4}/).first()).toBeVisible();
});

test("AI analysis: grounding, review and corrections", async ({ page }) => {
  await login(page, userA.email);
  await page.goto(`${caseUrl}?tab=analysis`);
  await page.getByRole("button", { name: "Analyse my case" }).click();
  await expect(page.getByRole("heading", { name: "Summary" })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(/does not by itself prove the money arrived/)).toBeVisible();

  // The fact the AI wrongly attributed to the user was downgraded by grounding.
  const recipientFact = page.locator("li", { hasText: "Recipient account" });
  await expect(recipientFact.getByText("Unverified")).toBeVisible();
  // The fabricated guidance reference was removed; the real one remains.
  await expect(page.getByText("Fabricated reference")).toHaveCount(0);

  // Confirm the reference read from the receipt.
  const refFact = page.locator("li", { hasText: "Transaction reference" }).filter({ hasText: "From a document" });
  await refFact.getByRole("button", { name: "Use this value" }).click();
  await expect(refFact.getByText("Confirmed by you")).toBeVisible();

  // Answer a follow-up question.
  await page.getByRole("textbox", { name: /Answer: Has the recipient checked/ }).fill("Yes, their statement shows nothing on 1 October.");
  await page.getByRole("button", { name: "Save answer" }).click();
  await expect(page.getByText("Answer saved. Run the analysis again to include it.")).toBeVisible();

  await page.getByRole("button", { name: "I've reviewed this analysis" }).click();
  await expect(page.getByText(/^Reviewed /)).toBeVisible();

  await page.goto(caseUrl);
  await expect(page.getByText("NIP-E2E-REF-0001")).toBeVisible();
  await expect(page.getByText("Yes, their statement shows nothing on 1 October.")).toBeVisible();

  // The fake AI was called with structured output formats.
  const calls = await (await page.request.get(`${BACKEND}/__test/ai-requests`)).json();
  expect(calls.length).toBeGreaterThanOrEqual(2);
  expect(calls.every((c: { hasFormat: boolean }) => c.hasFormat)).toBe(true);
});

test("complaint builder: generate, edit, version, approve, export", async ({ page }) => {
  page.on("dialog", (d) => d.accept());
  await login(page, userA.email);
  await page.goto(`${caseUrl}?tab=complaint`);
  await page.getByRole("button", { name: "Write my complaint with AI" }).click();
  await expect(page.getByText("Fill in the missing details")).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve final draft" })).toBeDisabled();

  const letter = page.getByLabel("Complaint letter");
  const text = await letter.inputValue();
  await letter.fill(text.replace("[ADD: transaction reference]", "NIP-E2E-REF-0001"));
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Draft saved.")).toBeVisible();
  await expect(page.getByText("Fill in the missing details")).toHaveCount(0);

  // Rebuild from the template (no AI) — creates version 2, keeps version 1.
  await page.getByRole("button", { name: "Rebuild from template" }).click();
  await expect(page.getByText("Built from the template")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Version history" })).toBeVisible();
  const v2 = await page.getByLabel("Complaint letter").inputValue();
  expect(v2).toContain("Zenith Bank");
  expect(v2).toContain("NIP-E2E-REF-0001");
  expect(v2).toContain("Ada Okafor");
  expect(v2).not.toContain("[ADD:");

  await page.getByRole("checkbox", { name: /I have read this complaint and confirm it is accurate/ }).check();
  await page.getByRole("button", { name: "Approve final draft" }).click();
  await expect(page.getByText("Approved — now send it yourself")).toBeVisible();

  const href = await page.getByRole("link", { name: "Download PDF" }).getAttribute("href");
  const pdf = await page.request.get(href!);
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()["content-type"]).toBe("application/pdf");
  expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");
});

test("tracking: submission, response, follow-up, resolution and timeline", async ({ page }) => {
  await login(page, userA.email);
  await page.goto(`${caseUrl}?tab=tracking`);
  await page.getByLabel("How you submitted it").selectOption("email");
  await page.getByLabel(/Complaint reference from your institution/).fill("CMP-778899");
  await page.getByRole("button", { name: "Save submission details" }).click();
  await expect(page.getByText("Submission recorded.")).toBeVisible();
  await expect(page.getByText("Submitted to institution").first()).toBeVisible();

  await page.getByText("Record a response from your institution", { exact: true }).click();
  await page.getByLabel("What did they say?").fill("The bank says the transfer is under investigation.");
  await page.getByLabel("Update status (optional)").selectOption("awaiting_institution_response");
  await page.getByRole("button", { name: "Save response" }).click();
  await expect(page.getByText("Response recorded.")).toBeVisible();

  await page.getByText("Plan a follow-up", { exact: true }).click();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" }).format(new Date());
  await page.getByLabel("Follow up on").fill(today);
  await page.getByRole("button", { name: "Save follow-up date" }).click();
  await expect(page.getByText("Follow-up date saved.")).toBeVisible();

  await page.goto("/dashboard");
  await expect(page.getByText("1 follow-up due")).toBeVisible();

  await page.goto(`${caseUrl}?tab=tracking`);
  await page.getByText("Record the outcome", { exact: true }).click();
  await page.getByLabel("How was it resolved?").fill("The bank reversed the debit on 20 October.");
  await page.getByRole("button", { name: "Mark as resolved" }).click();
  await expect(page.getByText("Case marked as resolved.")).toBeVisible();

  const history = page.locator("ol").filter({ hasText: "Case started" });
  for (const label of ["Case started", "Report completed", "Evidence added", "Analysis", "Complaint approved", "Submitted to institution", "Institution response", "Status changed", "Outcome"]) {
    await expect(history.getByText(label, { exact: true }).first()).toBeVisible();
  }

  await page.goto("/dashboard");
  const tile = (label: string) => page.locator("a", { hasText: label }).first();
  await expect(tile("Total cases")).toContainText("1");
  await expect(tile("Resolved")).toContainText("1");
  await expect(tile("Awaiting institution")).toContainText("0");
});

test("data isolation between users", async ({ browser }) => {
  // Get user A's evidence id through their own data export.
  const pageA = await newPage(browser);
  await login(pageA, userA.email);
  const exportRes = await pageA.request.get("/api/account/export");
  expect(exportRes.status()).toBe(200);
  const exported = await exportRes.json();
  expect(exported.cases).toHaveLength(1);
  const evidenceId = exported.evidence_files[0].id as string;
  const ownUrl = await pageA.request.get(`/api/evidence/${evidenceId}/url`);
  expect(ownUrl.status()).toBe(200);

  const pageB = await newPage(browser);
  await register(pageB, userB);
  await completeOnboarding(pageB, { aiConsent: false });
  await expect(pageB).toHaveURL(/\/dashboard/);
  await expect(pageB.getByText("No cases yet")).toBeVisible();

  // User B cannot see A's case, evidence, analysis or drafts.
  // (The HTTP status is 200 because the loading skeleton streams first; the
  // content is the not-found page and none of A's data is present.)
  await pageB.goto(caseUrl);
  await expect(pageB.getByRole("heading", { name: "We couldn't find that page" })).toBeVisible();
  await expect(pageB.getByText("Zenith Bank")).toHaveCount(0);
  await expect(pageB.getByText("NIP-E2E-REF-0001")).toHaveCount(0);
  for (const tab of ["evidence", "analysis", "complaint", "tracking"]) {
    await pageB.goto(`${caseUrl}?tab=${tab}`);
    await expect(pageB.getByRole("heading", { name: "We couldn't find that page" })).toBeVisible();
  }
  await pageB.goto(`${caseUrl}/report?step=2`);
  await expect(pageB.getByRole("heading", { name: "We couldn't find that page" })).toBeVisible();
  expect((await pageB.request.get(`/api/evidence/${evidenceId}/url`)).status()).toBe(404);
  expect((await pageB.request.delete(`/api/evidence/${evidenceId}`)).status()).toBe(404);
  expect((await pageB.request.post(`/api/cases/${caseId}/analysis`)).status()).toBe(404);
  expect((await pageB.request.post(`/api/cases/${caseId}/evidence/upload-url`, { data: { filename: "x.png", mimeType: "image/png", size: 10 } })).status()).toBe(404);
  const exportB = await (await pageB.request.get("/api/account/export")).json();
  expect(exportB.cases).toHaveLength(0);

  // Without consent, AI is not used — but the template still works.
  await pageB.goto("/cases/new");
  await expect(pageB.getByRole("heading", { name: "What kind of problem are you facing?" })).toBeVisible();
});

test("admin guidance management and settings", async ({ page }) => {
  await page.request.post(`${BACKEND}/__test/make-admin`, { data: { email: userB.email } });
  await login(page, userB.email);
  await page.goto("/admin/guidance");
  await expect(page.getByRole("heading", { name: "Official guidance" })).toBeVisible();
  const record = page.locator("details", { hasText: "CBN Consumer Complaints Portal" });
  await record.locator("summary").click();
  await record.getByLabel("Status").selectOption("verified");
  await record.getByRole("button", { name: "Save changes" }).click();
  await expect(record.getByText("Confirm you checked the official source today")).toBeVisible();
  await record.getByRole("checkbox", { name: /I checked this summary/ }).check();
  await record.getByRole("button", { name: "Save changes" }).click();
  await expect(record.getByText("Guidance updated.")).toBeVisible();
  await page.goto("/guidance");
  await expect(page.getByText(/^Verified /).first()).toBeVisible();

  // Non-admins can't reach the admin page.
  const other = await newPage(page.context().browser()!);
  await login(other, userA.email);
  await other.goto("/admin/guidance");
  await expect(other.getByRole("heading", { name: "We couldn't find that page" })).toBeVisible();

  // Settings: profile update and privacy toggle.
  await page.goto("/settings");
  await page.getByLabel("Phone number").fill("+234 803 000 0000");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByText("Profile saved.")).toBeVisible();
  await page.getByRole("checkbox", { name: /Allow AI analysis/ }).check();
  await page.getByRole("button", { name: "Save privacy choice" }).click();
  await expect(page.getByText("AI analysis is turned on.")).toBeVisible();

  // Sign out and back in.
  await page.getByRole("button", { name: "Sign out" }).first().click();
  await expect(page.getByText("You have been signed out.")).toBeVisible();
  await login(page, userB.email);
});

test("account deletion removes the user's data", async ({ page }) => {
  await login(page, userA.email);
  await page.goto("/settings");
  await page.getByLabel("Type DELETE MY ACCOUNT to confirm").fill("DELETE MY ACCOUNT");
  await page.getByRole("button", { name: "Permanently delete my account" }).click();
  await expect(page).toHaveURL(/\/login\?deleted=1/);
  await expect(page.getByText(/permanently deleted/)).toBeVisible();
  await page.getByLabel("Email address").fill(userA.email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("The email or password is incorrect.")).toBeVisible();
});

test("responsive layouts have no horizontal scrolling on mobile", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const page = await context.newPage();
  const noOverflow = async () => {
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  };
  for (const p of ["/", "/login", "/register", "/guidance", "/privacy"]) {
    await page.goto(p);
    await noOverflow();
  }
  await login(page, userB.email);
  for (const p of ["/dashboard", "/cases", "/cases/new", "/settings", "/help/guidance"]) {
    await page.goto(p);
    await noOverflow();
  }
  await page.getByRole("button", { name: "Open menu" }).click();
  await expect(page.getByRole("navigation", { name: "App" }).getByRole("link", { name: "My cases" })).toBeVisible();
  await context.close();
});
