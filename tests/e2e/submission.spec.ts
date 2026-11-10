import { expect, test, type Page } from "@playwright/test";
import path from "node:path";
import { BACKEND, completeOnboarding, FIXTURES, login, newPage, register } from "./helpers";

/**
 * Bank submission workflow: verified channels, Gmail OAuth, authorised
 * sending, duplicate prevention, failure handling, reply monitoring, AI reply
 * analysis, recovery planning, guided portal submission and access control.
 * Runs against the local Google OAuth + Gmail emulator (tests/e2e/mock-google.mjs).
 */

test.describe.configure({ mode: "serial" });

const stamp = Date.now();
const admin = { name: "Ireti Admin", email: `ireti.${stamp}@example.com` };
const sam = { name: "Sam Eze", email: `sam.${stamp}@example.com` };
const tola = { name: "Tola Bello", email: `tola.${stamp}@example.com` };
const VERIFIED = "complaints@zenithbank.example";
const PORTAL = "https://portal.zenithbank.example/complaints";
let caseUrl = "";
let caseId = "";
let draftId = "";
let submissionId = "";
let responseId = "";

const sentMessages = async (page: Page) => (await (await page.request.get(`${BACKEND}/__test/google/sent`)).json()) as {
  to: string;
  from: string;
  subject: string;
  text: string;
  attachments: { filename: string; head: string }[];
}[];
const failNext = (page: Page, mode: "reject" | "server_error" | "drop") => page.request.post(`${BACKEND}/__test/google/fail-next`, { data: { mode } });
const submitApi = (page: Page, data: Record<string, unknown>) =>
  page.request.post(`/api/cases/${caseId}/submissions`, { data: { method: "email", draftId, evidenceIds: [], authorized: true, recipientConfirmed: true, ...data } });

test("an administrator publishes Zenith Bank's complaint channels", async ({ browser }) => {
  const page = await newPage(browser);
  await register(page, admin);
  await completeOnboarding(page, { aiConsent: false });
  await expect(page).toHaveURL(/\/dashboard/);
  await page.request.post(`${BACKEND}/__test/make-admin`, { data: { email: admin.email } });
  // Sign in again so the session carries the admin role.
  await page.context().clearCookies();
  await login(page, admin.email);
  await page.goto("/admin/bank-channels");
  await expect(page.getByRole("heading", { name: "Bank contact channels" })).toBeVisible();

  const form = page.locator("main form").first();
  await form.getByLabel("Bank or provider").selectOption("zenith");
  await form.getByLabel("Email address").fill("not-an-email");
  await form.getByLabel("Official page where this is published").fill("https://www.zenithbank.example/contact");
  await form.getByRole("button", { name: "Add contact channel" }).click();
  await expect(form.getByText("Enter a valid email address")).toBeVisible();
  await form.getByLabel("Email address").fill(VERIFIED);
  await form.getByLabel("Status").selectOption("verified");
  await form.getByRole("button", { name: "Add contact channel" }).click();
  await expect(form.getByText("Confirm you checked the official source today")).toBeVisible();
  await form.getByRole("checkbox", { name: /I checked this contact/ }).check();
  await form.getByRole("button", { name: "Add contact channel" }).click();
  await expect(page.getByText("Contact channel added.")).toBeVisible();

  const form2 = page.locator("main form").first();
  await form2.getByLabel("Bank or provider").selectOption("zenith");
  await form2.getByLabel("Channel type").selectOption("web_portal");
  await form2.getByLabel("Page link (https://…)").fill(PORTAL);
  await form2.getByLabel("Label").fill("Online complaint form");
  await form2.getByLabel("Official page where this is published").fill("https://www.zenithbank.example/contact");
  await expect(form2.getByLabel("Status")).toHaveValue("unverified");
  await form2.getByRole("button", { name: "Add contact channel" }).click();
  await expect(page.getByText(`Web page · ${PORTAL}`)).toBeVisible();
  await expect(page.getByText(`Email · ${VERIFIED}`)).toBeVisible();
});

test("a user prepares a case and approves their complaint", async ({ page }) => {
  page.on("dialog", (d) => d.accept());
  await register(page, sam);
  await completeOnboarding(page, { aiConsent: true });
  await expect(page).toHaveURL(/\/dashboard/);
  await page.goto("/cases/new");
  await page.getByRole("radio", { name: /Failed or pending transfer/ }).check();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/report\?step=2/);
  caseUrl = page.url().replace(/\/report.*$/, "");
  caseId = caseUrl.split("/").pop()!;
  await page.getByRole("combobox", { name: "Bank or payment provider" }).fill("zeni");
  await page.getByRole("option", { name: "Zenith Bank" }).click();
  await page.getByLabel("Amount").fill("25000");
  await page.getByLabel("Date and time of the transaction").fill("2026-10-01T10:30");
  await page.getByLabel("How did you pay?").selectOption("mobile_app");
  await page.getByLabel(/Transaction reference/).fill("NIP-E2E-REF-0001");
  await page.getByLabel(/Recipient details/).fill("Ada Supplies Ltd, GTBank");
  await page.getByRole("button", { name: "Save and continue" }).click();
  await expect(page).toHaveURL(/step=3/);
  await page.getByLabel("What happened?").fill("I transferred money from my mobile app. I was debited but the recipient says nothing arrived.");
  await page.getByLabel(/What outcome are you asking for/).fill("A refund of the debited amount.");
  await page.getByRole("button", { name: "Save and continue" }).click();
  await page.locator(`#evidence-input-${caseId}`).setInputFiles(path.join(FIXTURES, "receipt.png"));
  await expect(page.getByRole("list", { name: "Uploaded evidence" }).getByText("receipt.png")).toBeVisible();
  await page.getByRole("link", { name: "Continue to review" }).click();
  await page.getByRole("button", { name: "Confirm and create case" }).click();
  await expect(page.getByText("Your case has been created")).toBeVisible();

  // Before approval, the Submit tab sends you back to the complaint builder.
  await page.goto(`${caseUrl}?tab=submit`);
  await expect(page.getByText("Prepare your complaint first")).toBeVisible();

  await page.goto(`${caseUrl}?tab=complaint`);
  await page.getByRole("button", { name: "Start from template" }).click();
  await expect(page.getByText("Built from the template")).toBeVisible();
  await page.getByRole("checkbox", { name: /I have read this complaint and confirm it is accurate/ }).check();
  await page.getByRole("button", { name: "Approve final draft" }).click();
  await expect(page.getByText("Approved — ready to submit")).toBeVisible();
  draftId = (await page.getByRole("link", { name: "Download PDF" }).getAttribute("href"))!.split("/")[3];
  await page.getByRole("link", { name: "Submit to your bank" }).click();
  await expect(page).toHaveURL(/tab=submit/);
});

test("the user connects Gmail (and can decline)", async ({ page }) => {
  await login(page, sam.email);
  await page.goto(`${caseUrl}?tab=submit`);
  await expect(page.getByText(VERIFIED).first()).toBeVisible();
  await expect(page.getByText(/Verified \d/)).toBeVisible();
  await expect(page.getByText(/No problems found/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Send complaint" })).toBeDisabled();

  await page.request.post(`${BACKEND}/__test/google/deny-next`);
  await page.getByRole("link", { name: "Connect Gmail" }).click();
  await expect(page.getByText("You didn't give Resolve permission, so Gmail wasn't connected.")).toBeVisible();

  await page.getByRole("link", { name: "Connect Gmail" }).click();
  await expect(page.getByText(`Gmail connected as ${sam.email}`)).toBeVisible();
  await expect(page.getByText("Replies checked")).toBeVisible();
});

test("the user authorises and sends the complaint; Gmail confirms it", async ({ page }) => {
  await login(page, sam.email);
  await page.goto(`${caseUrl}?tab=submit`);
  await page.getByText("Preview the email").click();
  await expect(page.getByText(`From${sam.email}`)).toBeVisible();
  await page.getByRole("checkbox", { name: /I authorise Resolve to send my approved complaint/ }).check();
  await page.getByRole("button", { name: "Send complaint" }).click();
  await expect(page.getByText(`Gmail confirmed your complaint was sent to ${VERIFIED}`)).toBeVisible();
  await expect(page.getByText(/Gmail message ID/)).toBeVisible();

  const sent = await sentMessages(page);
  const msg = sent.find((m) => m.to === VERIFIED)!;
  expect(msg.from).toContain(`<${sam.email}>`);
  expect(msg.from).toContain("Sam Eze");
  expect(msg.subject).toMatch(/^Complaint: Failed or pending transfer of NGN 25,000.00/);
  expect(msg.text).toContain("NIP-E2E-REF-0001");
  expect(msg.attachments.map((a) => a.filename)).toEqual([expect.stringMatching(/^Complaint-RSV-.*\.pdf$/), "receipt.png"]);
  expect(msg.attachments[0].head.startsWith("%PDF-")).toBe(true);

  // The case moved forward and the timeline says exactly what happened.
  await page.reload();
  await expect(page.getByText("Submitted to institution").first()).toBeVisible();
  await expect(page.getByText("Already submitted")).toBeVisible();
  await page.goto(`${caseUrl}?tab=tracking`);
  await expect(page.getByText(new RegExp(`emailed to ${VERIFIED}.*Gmail confirmed it was sent`))).toBeVisible();
});

test("duplicates are refused and replays don't send twice", async ({ page }) => {
  await login(page, sam.email);
  const dup = await submitApi(page, { channelId: null, recipient: VERIFIED, idempotencyKey: `dup-${stamp}` });
  expect(dup.status()).toBe(409);
  expect((await dup.json()).code).toBe("duplicate");

  const before = (await sentMessages(page)).length;
  const key = `replay-${stamp}`;
  const first = await submitApi(page, { recipient: "replay@zenithbank.example", idempotencyKey: key });
  expect(first.status()).toBe(201);
  const second = await submitApi(page, { recipient: "replay@zenithbank.example", idempotencyKey: key });
  expect(second.status()).toBe(200);
  const [a, b] = [await first.json(), await second.json()];
  expect(b.replayed).toBe(true);
  expect(b.submission.id).toBe(a.submission.id);
  submissionId = a.submission.id;
  expect((await sentMessages(page)).length).toBe(before + 1);

  // Unauthorised or unconfirmed requests are refused before anything is sent.
  expect((await submitApi(page, { recipient: "x@zenithbank.example", idempotencyKey: `na-${stamp}`, authorized: false })).status()).toBe(400);
  const unconfirmed = await submitApi(page, { recipient: "y@zenithbank.example", idempotencyKey: `nc-${stamp}`, recipientConfirmed: false });
  expect((await unconfirmed.json()).code).toBe("recipient_confirmation_required");
});

test("failed sends are reported honestly and can be retried", async ({ page }) => {
  page.on("dialog", (d) => d.accept());
  await login(page, sam.email);
  await page.goto(`${caseUrl}?tab=submit`);

  // 1. Gmail rejects the message: nothing sent, user can retry.
  await failNext(page, "reject");
  await page.getByText("Use a different email address").click();
  await page.getByLabel("Institution's complaints email").fill("disputes@zenithbank.example");
  await page.getByRole("checkbox", { name: /I got this address from my institution's official website/ }).check();
  await page.getByRole("checkbox", { name: /I authorise Resolve to send my approved complaint/ }).check();
  await page.getByRole("button", { name: "Send complaint" }).click();
  await expect(page.getByText(/Gmail didn't send the email \(Invalid To header\)/).first()).toBeVisible();
  const failedItem = page.locator("li", { hasText: "disputes@zenithbank.example" }).filter({ hasText: "Not sent" });
  await failedItem.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByText("Sent — Gmail confirmed it.")).toBeVisible();

  // 2. The connection drops after Gmail sent it: Resolve finds it by Message-ID instead of resending.
  await failNext(page, "drop");
  const dropped = await (await submitApi(page, { recipient: "drop@zenithbank.example", idempotencyKey: `drop-${stamp}` })).json();
  expect(dropped.submission.status).toBe("sent");
  expect((await sentMessages(page)).filter((m) => m.to === "drop@zenithbank.example")).toHaveLength(1);

  // 3. A server error: outcome unknown, nothing resent until the user checks.
  await failNext(page, "server_error");
  const unknown = await (await submitApi(page, { recipient: "err@zenithbank.example", idempotencyKey: `err-${stamp}` })).json();
  expect(unknown.submission.status).toBe("unknown");
  await page.reload();
  const item = page.locator("li", { hasText: "err@zenithbank.example" }).filter({ hasText: "Not confirmed" });
  await expect(item.getByText(/Open your Gmail Sent folder/)).toBeVisible();
  await item.getByRole("button", { name: "It's not there" }).click();
  await expect(page.getByText("Marked as not sent. You can try again now.")).toBeVisible();
  await page.locator("li", { hasText: "err@zenithbank.example" }).getByRole("button", { name: "Try again" }).click();
  await expect(page.getByText("Sent — Gmail confirmed it.")).toBeVisible();
  expect((await sentMessages(page)).filter((m) => m.to === "err@zenithbank.example")).toHaveLength(1);

  await page.goto(`${caseUrl}?tab=tracking`);
  await expect(page.getByText(/was not sent: Gmail didn't send the email/)).toBeVisible();
  await expect(page.getByText(/couldn't confirm whether your complaint email to err@zenithbank.example was sent/)).toBeVisible();
});

test("bank replies are found, explained and tracked", async ({ page }) => {
  await login(page, sam.email);
  await page.request.post(`${BACKEND}/__test/google/reply`, {
    data: {
      to: VERIFIED,
      from: `Zenith Complaints <${VERIFIED}>`,
      text: "Dear customer,\n\nYour complaint has been logged with reference ZB/CMP/77821. Please send a copy of your account statement. We will respond within 5 working days.\n\nOn Tue, 10 Nov 2026, Sam Eze wrote:\n> Dear Sir/Madam",
    },
  });
  await page.goto(`${caseUrl}?tab=submit`);
  await expect(page.getByText("Review your institution's reply")).toHaveCount(0);
  await page.locator("li", { hasText: VERIFIED }).filter({ hasText: "Sent" }).first().getByRole("button", { name: "Check for replies" }).click();
  await expect(page.getByText("Found 1 new reply.")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Review your institution's reply")).toBeVisible();
  const replies = page.locator("#responses");
  await expect(replies.getByText("From your Gmail")).toBeVisible();
  await expect(replies.getByText(/logged with reference ZB\/CMP\/77821/)).toBeVisible();
  await expect(replies.getByText("> Dear Sir/Madam")).toHaveCount(0);

  await replies.getByRole("button", { name: "Explain this reply" }).click();
  await expect(replies.getByText("Information requested")).toBeVisible();
  await expect(replies.getByText("ZB/CMP/77821", { exact: true })).toBeVisible();
  await expect(replies.getByText("FAKE/REF/000")).toHaveCount(0);
  await expect(replies.getByText(/Resolve removed 1 detail/)).toBeVisible();
  await expect(replies.getByText("“within 5 working days”", { exact: false })).toBeVisible();
  await replies.getByRole("button", { name: /Set status to “Additional information required”/ }).click();
  await expect(replies.getByText("Case status set to “Additional information required”.")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Send the information requested")).toBeVisible();

  // Replies the user received elsewhere can be added by hand.
  await replies.getByRole("button", { name: "Add a reply you received" }).click();
  await page.getByLabel("Their reply").fill("SMS from Zenith: we are still reviewing your complaint.");
  const saved = page.waitForResponse((r) => r.url().endsWith(`/api/cases/${caseId}/responses`) && r.request().method() === "POST");
  await page.getByRole("button", { name: "Save reply" }).click();
  responseId = ((await (await saved).json()) as { response: { id: string } }).response.id;
  await expect(replies.getByText("Added by you")).toBeVisible();

  // The scheduled job picks up replies to other sent emails.
  expect((await page.request.get("/api/cron/submissions")).status()).toBe(401);
  await page.request.post(`${BACKEND}/__test/google/reply`, { data: { to: "drop@zenithbank.example", from: "care@zenithbank.example", text: "We received your email." } });
  const cron = await page.request.get("/api/cron/submissions", { headers: { Authorization: "Bearer test-cron-secret" } });
  expect(cron.status()).toBe(200);
  expect((await cron.json()).repliesFound).toBe(1);

  await page.goto(`${caseUrl}?tab=tracking`);
  await expect(page.getByText(`Reply received from ${VERIFIED}`)).toBeVisible();
  await expect(page.getByText("Reply received from care@zenithbank.example")).toBeVisible();
});

test("an AI recovery plan is generated from the case history", async ({ page }) => {
  await login(page, sam.email);
  await page.goto(`${caseUrl}?tab=submit`);
  await page.getByRole("button", { name: "Get a recovery plan" }).click();
  await expect(page.getByText("Send the statement")).toBeVisible();
  if (process.env.E2E_SCREENSHOTS) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.screenshot({ path: `${process.env.E2E_SCREENSHOTS}/desktop-submit.png`, fullPage: true });
  }
  await expect(page.getByText("It's too early to escalate; the bank is still investigating.")).toBeVisible();
  await expect(page.getByText("Update the plan")).toBeVisible();
});

test("the submission screens fit on a phone without sideways scrolling", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const page = await context.newPage();
  await login(page, sam.email);
  for (const url of [`${caseUrl}?tab=submit`, "/settings"]) {
    await page.goto(url);
    await page.waitForLoadState("networkidle");
    if (process.env.E2E_SCREENSHOTS) await page.screenshot({ path: `${process.env.E2E_SCREENSHOTS}/mobile-${url.includes("settings") ? "settings" : "submit"}.png`, fullPage: true });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, url).toBeLessThanOrEqual(0);
  }
  await context.close();
});

test("guided portal submission is confirmed by the user", async ({ page }) => {
  await login(page, sam.email);
  await page.goto(`${caseUrl}?tab=submit`);
  await page.getByRole("radio", { name: /On the institution's website/ }).click();
  await expect(page.getByText(PORTAL).first()).toBeVisible();
  await expect(page.getByText("Not yet verified by Resolve")).toBeVisible();
  await page.getByRole("checkbox", { name: /I got this page from my institution's official website/ }).check();
  await page.getByRole("checkbox", { name: /I will submit my approved complaint myself/ }).check();
  await page.getByRole("button", { name: "Start guided submission" }).click();
  await expect(page.getByText("Ready for you to submit")).toBeVisible();
  const item = page.locator("li", { hasText: PORTAL }).filter({ hasText: "Waiting for you" });
  await item.getByLabel("Reference they gave you").fill("ZB-PORTAL-1");
  await item.getByRole("button", { name: "I've submitted it" }).click();
  await expect(page.getByText("Thanks — your submission is recorded.")).toBeVisible();
  await page.reload();
  await expect(page.locator("li", { hasText: PORTAL }).getByText("ZB-PORTAL-1")).toBeVisible();
});

test("other users can't see or act on these submissions", async ({ browser }) => {
  expect(submissionId).not.toBe("");
  expect(responseId).not.toBe("");
  const other = await newPage(browser);
  await register(other, tola);
  await completeOnboarding(other, { aiConsent: true });
  await expect(other).toHaveURL(/\/dashboard/);
  const post = (url: string, data: Record<string, unknown>) => other.request.post(url, { data });
  expect((await post(`/api/cases/${caseId}/submissions`, { method: "email", draftId, recipient: "x@y.example", recipientConfirmed: true, authorized: true, idempotencyKey: `t-${stamp}` })).status()).toBe(404);
  expect((await post(`/api/cases/${caseId}/submission-check`, { draftId })).status()).toBe(404);
  expect((await post(`/api/cases/${caseId}/responses`, { receivedOn: "2026-11-01", text: "Injected reply text" })).status()).toBe(404);
  expect((await post(`/api/cases/${caseId}/recovery-plan`, {})).status()).toBe(404);
  for (const action of ["retry", "cancel", "check_replies", "report_not_sent"]) {
    expect((await post(`/api/submissions/${submissionId}`, { action })).status()).toBe(404);
  }
  expect((await post(`/api/responses/${responseId}`, { action: "analyze" })).status()).toBe(404);
  expect((await other.request.delete(`/api/responses/${responseId}`)).status()).toBe(404);
  await other.goto(`${caseUrl}?tab=submit`);
  await expect(other.getByRole("heading", { name: "We couldn't find that page" })).toBeVisible();
  await other.goto("/settings");
  await expect(other.getByRole("link", { name: "Connect Gmail" })).toBeVisible();
  await expect(other.getByText(sam.email)).toHaveCount(0);
});

test("a new complaint version must be approved again, and Gmail can be disconnected", async ({ page }) => {
  page.on("dialog", (d) => d.accept());
  await login(page, sam.email);
  await page.goto(`${caseUrl}?tab=complaint`);
  await page.getByRole("button", { name: "Rebuild from template" }).click();
  await expect(page.getByText("Built from the template")).toBeVisible();
  const stale = await submitApi(page, { recipient: "new@zenithbank.example", idempotencyKey: `stale-${stamp}` });
  expect((await stale.json()).code).toBe("draft_not_approved");
  await page.goto(`${caseUrl}?tab=submit`);
  await expect(page.getByText("Approve your complaint first")).toBeVisible();

  await page.goto("/settings#email");
  await expect(page.getByText(sam.email).first()).toBeVisible();
  await page.getByRole("button", { name: "Disconnect" }).click();
  await expect(page.getByText("Gmail disconnected and Resolve's access revoked.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Connect Gmail" })).toBeVisible();
});
