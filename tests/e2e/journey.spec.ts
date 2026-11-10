import { expect, test, type APIResponse } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { BACKEND, completeOnboarding, FIXTURES, login, newPage, PASSWORD, register } from "./helpers";

/**
 * Full user journey through Resolve, running against the local test backend
 * (real PostgreSQL + RLS, emulated Supabase APIs, deterministic fake AI).
 */

const userA = { name: "Ada Okafor", email: `ada.${Date.now()}@example.com` };
const userB = { name: "Bayo Adeyemi", email: `bayo.${Date.now()}@example.com` };

let caseUrl = "";
let caseId = "";
let evidenceId = "";

/** Checks a statement response is a PDF and returns its text (when pdftotext is installed). */
async function statementText(res: APIResponse): Promise<string | null> {
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("application/pdf");
  expect(res.headers()["content-disposition"]).toMatch(/attachment; filename="Resolve-statement-\d{4}-\d{2}-\d{2}\.pdf"/);
  const bytes = await res.body();
  expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
  try {
    const file = path.join(mkdtempSync(path.join(tmpdir(), "statement-")), "s.pdf");
    writeFileSync(file, bytes);
    return execFileSync("pdftotext", ["-layout", file, "-"]).toString();
  } catch {
    return null;
  }
}

test.describe.configure({ mode: "serial" });

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

  // Protected pages redirect to sign in, and account data needs a session.
  expect((await page.request.get("/api/account/statement")).status()).toBe(401);
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
  // The bank picker suggests banks (with their logos) as you type.
  const bank = page.getByRole("combobox", { name: "Bank or payment provider" });
  await bank.fill("zeni");
  await page.getByRole("option", { name: "Zenith Bank" }).click();
  await expect(bank).toHaveValue("Zenith Bank");
  await expect(page.locator('img[src="/banks/zenith.png"]').first()).toBeVisible();
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
  await page.getByRole("row", { name: /Unfinished report/ }).getByRole("link").click();
  // Resumes at the first unfinished step (evidence).
  await expect(page.getByRole("heading", { name: "Add supporting evidence" })).toBeVisible();

  // Step 4: evidence — one valid file, one disguised file the server must reject
  const input = page.locator(`#evidence-input-${caseId}`);
  const saved = page.waitForResponse((r) => r.url().endsWith(`/api/cases/${caseId}/evidence`) && r.request().method() === "POST");
  await input.setInputFiles(path.join(FIXTURES, "receipt.png"));
  evidenceId = ((await (await saved).json()) as { evidence: { id: string } }).evidence.id;
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
  await expect(page.locator('img[src="/banks/zenith.png"]').first()).toBeVisible();
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
  // After saving, the editor must not think there are still unsaved changes.
  await expect(page.getByText("You have unsaved changes")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Save changes" })).toBeDisabled();

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
  await expect(page.getByText("Approved — ready to submit")).toBeVisible();

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

  // Search from the top bar, then narrow with the filter popover.
  await page.getByRole("searchbox", { name: "Search your cases" }).fill("Zenith");
  await page.getByRole("searchbox", { name: "Search your cases" }).press("Enter");
  await expect(page).toHaveURL(/\/cases\?q=Zenith/);
  await expect(page.getByText(/Results for “Zenith” · 1 case/)).toBeVisible();
  await page.getByRole("searchbox", { name: "Search cases" }).fill("no-such-bank");
  await page.getByRole("searchbox", { name: "Search cases" }).press("Enter");
  await expect(page.getByText("No cases match these filters")).toBeVisible();
  await page.getByRole("button", { name: "Reset" }).click();
  await expect(page).toHaveURL(/\/cases$/);

  await page.getByRole("button", { name: /^Filter/ }).click();
  const dialog = page.getByRole("dialog", { name: "Filter cases" });
  await dialog.getByRole("checkbox", { name: "Closed" }).check();
  await dialog.getByRole("button", { name: "Apply" }).click();
  await expect(page).toHaveURL(/status=closed/);
  await expect(page.getByText("No cases match these filters")).toBeVisible();

  await page.getByRole("button", { name: /^Filter/ }).click();
  await dialog.getByRole("button", { name: /Clear/ }).click();
  await dialog.getByRole("checkbox", { name: "Resolved" }).check();
  await dialog.getByRole("tab", { name: "Category" }).click();
  await dialog.getByRole("checkbox", { name: "Failed or pending transfer" }).check();
  await dialog.getByRole("button", { name: "Apply" }).click();
  await expect(page).toHaveURL(/status=resolved/);
  await expect(page.getByRole("row", { name: /Zenith Bank/ })).toBeVisible();
  await expect(page.getByRole("row", { name: /Zenith Bank/ }).locator('img[src="/banks/zenith.png"]')).toBeVisible();

  await page.getByRole("button", { name: "Show" }).click();
  await page.getByRole("option", { name: "Unfinished reports" }).click();
  await expect(page).toHaveURL(/filter=unfinished/);
  await expect(page.getByText("No cases match these filters")).toBeVisible();
});

test("data isolation between users", async ({ browser }) => {
  // User A's statement covers their case; they can open their own evidence.
  const pageA = await newPage(browser);
  await login(pageA, userA.email);
  const textA = await statementText(await pageA.request.get("/api/account/statement"));
  await pageA.goto(caseUrl);
  const caseNumber = (await pageA.getByText(/RSV-[0-9A-F]{4}-[0-9A-F]{4}/).first().textContent())?.match(/RSV-[0-9A-F]{4}-[0-9A-F]{4}/)?.[0] ?? "";
  expect(caseNumber).not.toBe("");
  if (textA !== null) {
    expect(textA).toContain(caseNumber);
    expect(textA).toContain("Ada Okafor");
    expect(textA).toContain("NGN 25,000.00");
  }
  expect(evidenceId).not.toBe("");
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
  const textB = await statementText(await pageB.request.get("/api/account/statement"));
  if (textB !== null) {
    expect(textB).toContain("No transactions reported yet");
    expect(textB).not.toContain(caseNumber);
    expect(textB).not.toContain("Ada Okafor");
  }

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

  // Download the PDF statement.
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PDF Statement" }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toMatch(/^Resolve-statement-\d{4}-\d{2}-\d{2}\.pdf$/);
  await expect(page.getByText("Statement downloaded")).toBeVisible();

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
