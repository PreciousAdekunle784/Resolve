// Runs the demo scenario on the LIVE Resolve site with a temporary account so the video can
// show genuine Gemini output. Saves the stored AI results (read back through Supabase with the
// demo account's own session, under RLS) to capture/gemini-outputs.json, then deletes the account.
//
//   node video/capture/live-gemini.mjs https://resolve-finance.vercel.app https://<project>.supabase.co
import { writeFileSync } from "node:fs";
import { chromium } from "playwright";
import { SCENARIO as S } from "../composition/scenario.js";

const [BASE, SUPABASE] = process.argv.slice(2);
const OUT = new URL("./gemini-outputs.json", import.meta.url).pathname;
const EVIDENCE = new URL("../assets/evidence-transfer-receipt.png", import.meta.url).pathname;
const email = `amara.demo.${Date.now()}@example.com`;
const password = "Resolve-demo-video-2026";

const browser = await chromium.launch({ proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
page.on("dialog", (d) => d.accept());
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

/** Calls an AI endpoint, retrying when the AI service is briefly busy. */
async function ai(label, url, options = {}) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = await page.request.post(url, { timeout: 300000, ...options });
    log(label, res.status(), attempt > 1 ? `(attempt ${attempt})` : "");
    if (res.ok()) return res;
    const body = await res.json().catch(() => ({}));
    if (!body.retryable || attempt === 4) throw new Error(`${label} failed: ${JSON.stringify(body)}`);
    await new Promise((r) => setTimeout(r, 30000));
  }
}

async function rest(path) {
  const cookies = await ctx.cookies();
  const parts = cookies.filter((c) => /^sb-.*-auth-token(\.\d+)?$/.test(c.name)).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  let raw = parts.map((c) => decodeURIComponent(c.value)).join("");
  if (raw.startsWith("base64-")) raw = Buffer.from(raw.slice(7), "base64url").toString("utf8");
  const token = JSON.parse(raw).access_token;
  const html = await page.content();
  const apikey = (html.match(/sb_publishable_[A-Za-z0-9_-]+/) ?? html.match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/))?.[0];
  const res = await page.request.get(`${SUPABASE}/rest/v1/${path}`, { headers: { apikey, Authorization: `Bearer ${token}` } });
  if (!res.ok()) throw new Error(`REST ${path}: ${res.status()} ${await res.text()}`);
  return res.json();
}

const result = { captured_at: new Date().toISOString(), site: BASE };
let caseUrl = "";
try {
  log("register");
  await page.goto(`${BASE}/register`);
  await page.getByLabel("Full name").fill(S.user.name);
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("checkbox", { name: /I agree to the terms/ }).check();
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL(/onboarding/, { timeout: 30000 });
  await page.getByRole("checkbox", { name: /Allow AI analysis/ }).check();
  await page.getByRole("checkbox", { name: /I understand that Resolve is an independent assistant/ }).check();
  await page.getByRole("button", { name: "Continue to Resolve" }).click();
  await page.waitForURL(/dashboard/, { timeout: 30000 });

  log("create case");
  await page.goto(`${BASE}/cases/new`);
  await page.getByRole("radio", { name: /Failed or pending transfer/ }).check();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL(/step=2/, { timeout: 30000 });
  caseUrl = page.url().replace(/\/report.*$/, "");
  const bank = page.getByRole("combobox", { name: "Bank or payment provider" });
  await bank.fill(S.bank);
  await bank.press("Escape");
  await page.getByLabel("Amount").fill(S.amount);
  await page.getByLabel("Date and time of the transaction").fill(S.date);
  await page.getByLabel("How did you pay?").selectOption("mobile_app");
  await page.getByLabel(/Transaction reference/).fill(S.reference);
  await page.getByLabel(/Recipient details/).fill(S.recipient);
  await page.getByRole("button", { name: "Save and continue" }).click();
  await page.waitForURL(/step=3/, { timeout: 30000 });
  await page.getByLabel("What happened?").fill(S.description);
  await page.getByLabel(/What have you already tried/).fill(S.previous);
  await page.getByLabel(/What outcome are you asking for/).fill(S.outcome);
  await page.getByRole("button", { name: "Save and continue" }).click();
  const caseId = caseUrl.split("/").pop();
  await page.locator(`#evidence-input-${caseId}`).setInputFiles(EVIDENCE);
  await page.getByRole("list", { name: "Uploaded evidence" }).getByText("evidence-transfer-receipt.png").waitFor({ timeout: 60000 });
  await page.getByRole("button", { name: "Add description" }).click();
  await page.getByLabel("File description").fill("Transfer receipt from my banking app");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByText("Transfer receipt from my banking app").waitFor();
  await page.getByRole("link", { name: /Continue to review|Skip for now and review/ }).click();
  await page.getByRole("button", { name: "Confirm and create case" }).click();
  await page.getByText("Your case has been created").waitFor({ timeout: 30000 });

  log("AI analysis (Gemini)…");
  await ai("analysis", `${BASE}/api/cases/${caseId}/analysis`);
  // If Gemini was too busy to read the receipt, run the analysis again (it retries unread files).
  await page.goto(`${caseUrl}?tab=evidence`);
  for (let i = 0; i < 3; i++) {
    const rows = await rest(`ai_analyses?case_id=eq.${caseId}&analysis_type=eq.evidence_extraction&select=id`);
    if (rows.length > 0) break;
    log("receipt not read yet — running the analysis again");
    await new Promise((r) => setTimeout(r, 20000));
    await ai("analysis", `${BASE}/api/cases/${caseId}/analysis`);
  }

  log("AI complaint (Gemini)…");
  await ai("complaint", `${BASE}/api/cases/${caseId}/complaint`, { data: { mode: "ai" } });

  log("bank reply + analysis (Gemini)…");
  const r = await page.request.post(`${BASE}/api/cases/${caseId}/responses`, {
    data: { receivedOn: "2026-11-10", from: "complaints@northbridge-bank.example", subject: "Re: Complaint about a failed transfer of NGN 85,000.00", text: S.bankReply },
  });
  if (!r.ok()) throw new Error(`response failed: ${await r.text()}`);
  const responseId = (await r.json()).response.id;
  await ai("reply analysis", `${BASE}/api/responses/${responseId}`, { data: { action: "analyze" } });

  log("recovery plan (Gemini)…");
  await ai("plan", `${BASE}/api/cases/${caseId}/recovery-plan`);

  await page.goto(`${caseUrl}?tab=evidence`);
  const analyses = await rest(`ai_analyses?case_id=eq.${caseId}&select=analysis_type,structured_result,model_identifier`);
  result.evidence_extraction = analyses.find((x) => x.analysis_type === "evidence_extraction");
  result.case_analysis = analyses.find((x) => x.analysis_type === "case_analysis");
  result.complaint = (await rest(`complaint_drafts?case_id=eq.${caseId}&select=subject,content,model_identifier,version&order=version.desc`))[0];
  result.reply_analysis = (await rest(`bank_responses?case_id=eq.${caseId}&select=analysis,analysis_model`))[0];
  result.recovery_plan = (await rest(`ai_tool_runs?case_id=eq.${caseId}&tool=eq.recommend_recovery&status=eq.succeeded&select=output,model`))[0];
  result.guidance = await rest(`guidance_sources?select=id,title&status=neq.archived`);
  writeFileSync(OUT, JSON.stringify(result, null, 2));
  log("saved", OUT);
} catch (e) {
  console.error("FAILED:", e.message);
  await page.screenshot({ path: "/tmp/claude-0/-home-user-Resolve/41877639-e4c0-5555-a9d7-2ecb5a0e8d4a/scratchpad/gemini-fail.png" }).catch(() => {});
} finally {
  log("deleting demo account");
  try {
    await page.goto(`${BASE}/settings`);
    await page.getByLabel("Type DELETE MY ACCOUNT to confirm").fill("DELETE MY ACCOUNT");
    await page.getByRole("button", { name: "Permanently delete my account" }).click();
    await page.waitForURL(/deleted=1/, { timeout: 60000 });
    log("deleted", email);
  } catch (e) {
    console.error("DELETE FAILED for", email, e.message);
  }
  await browser.close();
}
