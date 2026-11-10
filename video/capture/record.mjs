// Records the real Resolve app (local demo environment) for the product video.
//
// Each "clip" is a Chrome DevTools screencast of the actual UI at 2x resolution, plus a log of
// cursor positions and clicks so the video can draw a realistic cursor. Output:
//   capture/frames/<clip>/<n>.jpg   and   capture/frames/<clip>/index.json
//
// Usage (from the repository root, after `NEXT_DIST_DIR=.next-e2e npx next build`):
//   node video/capture/record.mjs
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { SCENARIO as S } from "../composition/scenario.js";
import { SERVICE_KEY } from "../../tests/e2e/keys.mjs";
import { APP, BACKEND, startDemoEnv } from "./demo-env.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const FRAMES = path.join(here, "frames");
const ASSETS = path.join(here, "../assets");
const EVIDENCE = path.join(ASSETS, "evidence-transfer-receipt.png");
const VIEW = { width: 1440, height: 900 };
const PASSWORD = "Resolve-demo-video-2026";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

const env = await startDemoEnv();
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 2 });
// Hide scrollbars so the recording looks like a clean app window.
await context.addInitScript(() => {
  const css = "::-webkit-scrollbar{display:none} html{scrollbar-width:none}";
  document.addEventListener("DOMContentLoaded", () => {
    const s = document.createElement("style");
    s.textContent = css;
    document.head.appendChild(s);
  });
});
const page = await context.newPage();
page.on("dialog", (d) => d.accept());
const cdp = await context.newCDPSession(page);

let clip = null;
const cursor = { x: 1100, y: 620 };

cdp.on("Page.screencastFrame", async ({ data, metadata, sessionId }) => {
  cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
  if (!clip) return;
  const n = clip.frames.length;
  const file = `${String(n).padStart(5, "0")}.jpg`;
  writeFileSync(path.join(clip.dir, file), Buffer.from(data, "base64"));
  clip.frames.push({ t: +(metadata.timestamp - clip.t0).toFixed(4), f: file, url: new URL(page.url()).pathname + new URL(page.url()).search });
});

async function startClip(name) {
  const dir = path.join(FRAMES, name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  clip = { name, dir, t0: Date.now() / 1000, frames: [], events: [] };
  log({ type: "move", x: cursor.x, y: cursor.y });
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 90, maxWidth: VIEW.width * 2, maxHeight: VIEW.height * 2, everyNthFrame: 1 });
  await sleep(400);
}

async function endClip() {
  await sleep(400);
  await cdp.send("Page.stopScreencast");
  writeFileSync(path.join(clip.dir, "index.json"), JSON.stringify({ name: clip.name, viewport: VIEW, scale: 2, duration: Date.now() / 1000 - clip.t0, frames: clip.frames, events: clip.events }));
  console.log(`clip ${clip.name}: ${clip.frames.length} frames, ${(Date.now() / 1000 - clip.t0).toFixed(1)}s`);
  clip = null;
}

function log(e) {
  if (clip) clip.events.push({ t: +(Date.now() / 1000 - clip.t0).toFixed(4), ...e });
}
const mark = (label) => log({ type: "mark", label });

/** Moves the mouse along a gentle curve with easing, like a person would. */
async function moveTo(target, ms = 650) {
  let x, y;
  if (typeof target === "object" && "x" in target) ({ x, y } = target);
  else {
    await target.scrollIntoViewIfNeeded();
    const box = await target.boundingBox();
    x = box.x + Math.min(box.width / 2, 40 + box.width * 0.15);
    y = box.y + box.height / 2;
  }
  const sx = cursor.x;
  const sy = cursor.y;
  const bend = Math.min(60, Math.hypot(x - sx, y - sy) * 0.12);
  const steps = Math.max(12, Math.round(ms / 16));
  for (let i = 1; i <= steps; i++) {
    const t = ease(i / steps);
    const curve = Math.sin(Math.PI * t) * bend;
    const nx = sx + (x - sx) * t + curve * 0.35;
    const ny = sy + (y - sy) * t - curve * 0.25;
    cursor.x = nx;
    cursor.y = ny;
    await page.mouse.move(nx, ny);
    log({ type: "move", x: +nx.toFixed(1), y: +ny.toFixed(1) });
    await sleep(ms / steps);
  }
}

async function click(target, ms) {
  await moveTo(target, ms);
  await sleep(120);
  log({ type: "click", x: cursor.x, y: cursor.y });
  await page.mouse.down();
  await sleep(70);
  await page.mouse.up();
  await sleep(150);
}

async function typeInto(locator, text, delay = 45) {
  await click(locator);
  await page.keyboard.type(text, { delay });
}

/** Smooth, eased page scroll to an element or a y position. */
async function scrollTo(target, ms = 1200, offset = 120) {
  const y = typeof target === "number" ? target : await target.evaluate((el, off) => el.getBoundingClientRect().top + window.scrollY - off, offset);
  log({ type: "scroll" });
  await page.evaluate(
    ({ y, ms }) =>
      new Promise((resolve) => {
        const start = window.scrollY;
        const end = Math.max(0, Math.min(y, document.documentElement.scrollHeight - window.innerHeight));
        const t0 = performance.now();
        const step = (now) => {
          const p = Math.min(1, (now - t0) / ms);
          const e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
          window.scrollTo(0, start + (end - start) * e);
          if (p < 1) requestAnimationFrame(step);
          else resolve();
        };
        requestAnimationFrame(step);
      }),
    { y, ms },
  );
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
  // ------------------------------------------------------------------ setup (not recorded)
  await fetch(`${BACKEND}/__test/google/account`, { method: "POST", body: JSON.stringify({ email: S.user.email }) });

  // ------------------------------------------------------------------ clip: landing
  await page.goto(APP, { waitUntil: "domcontentloaded" });
  await startClip("landing");
  await page.waitForLoadState("networkidle");
  await sleep(2600);
  await moveTo(page.getByRole("link", { name: "Report a Problem" }).first(), 1100);
  await sleep(1400);
  await endClip();

  // Account + onboarding (not recorded)
  await page.goto(`${APP}/register`);
  await page.getByLabel("Full name").fill(S.user.name);
  await page.getByLabel("Email address").fill(S.user.email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("checkbox", { name: /I agree to the terms/ }).check();
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL(/onboarding/);
  await page.getByLabel(/Phone number/).fill("+234 800 000 0000");
  await page.getByRole("checkbox", { name: /Allow AI analysis/ }).check();
  await page.getByRole("checkbox", { name: /I understand that Resolve is an independent assistant/ }).check();
  await page.getByRole("button", { name: "Continue to Resolve" }).click();
  await page.waitForURL(/dashboard/);

  // Two earlier (illustrative) cases so the dashboard isn't empty.
  const [{ id: userId }] = await service(`profiles?email=eq.${encodeURIComponent(S.user.email)}&select=id`);
  const base = { user_id: userId, intake_status: "complete", intake_step: 5, currency: "NGN" };
  await service("cases", "POST", [
    {
      ...base,
      issue_category: "duplicate_transaction",
      institution_name: "Example Pay",
      amount: 12500,
      transaction_date: "2026-10-14T09:20:00Z",
      payment_channel: "fintech_wallet",
      incident_description: "I was charged twice for the same payment to a supplier in the Example Pay app.",
      status: "awaiting_institution_response",
      institution_submission_channel: "mobile_app",
      institution_submission_date: "2026-10-15",
    },
    {
      ...base,
      issue_category: "unauthorised_debit",
      institution_name: S.bank,
      amount: 4200,
      transaction_date: "2026-09-29T18:05:00Z",
      payment_channel: "card_online",
      incident_description: "A card debit I don't recognise appeared on my account statement.",
      status: "submitted_to_institution",
      institution_submission_channel: "email",
      institution_submission_date: "2026-10-01",
    },
  ]);

  // ------------------------------------------------------------------ clip: dashboard
  await page.goto(`${APP}/dashboard`, { waitUntil: "networkidle" });
  await startClip("dashboard");
  await sleep(1500);
  await moveTo(page.getByRole("link", { name: "Report a problem" }).first(), 1200);
  await sleep(900);
  mark("click-report");
  await click(page.getByRole("link", { name: "Report a problem" }).first(), 300);
  await page.waitForURL(/cases\/new/);
  await sleep(1200);
  await endClip();

  // ------------------------------------------------------------------ clip: report
  await startClip("report");
  await sleep(500);
  await click(page.getByRole("radio", { name: /Failed or pending transfer/ }), 800);
  await sleep(500);
  await click(page.getByRole("button", { name: "Continue" }), 700);
  await page.waitForURL(/step=2/);
  const caseUrl = page.url().replace(/\/report.*$/, "");
  const caseId = caseUrl.split("/").pop();
  await sleep(700);
  mark("step2");
  const bank = page.getByRole("combobox", { name: "Bank or payment provider" });
  await typeInto(bank, S.bank, 55);
  await sleep(400);
  await page.keyboard.press("Escape");
  await typeInto(page.getByLabel("Amount"), "85000", 90);
  await click(page.getByLabel("Date and time of the transaction"), 600);
  await page.getByLabel("Date and time of the transaction").fill(S.date);
  await sleep(300);
  await click(page.getByLabel("How did you pay?"), 600);
  await page.getByLabel("How did you pay?").selectOption("mobile_app");
  await page.keyboard.press("Escape").catch(() => {});
  await sleep(250);
  await typeInto(page.getByLabel(/Transaction reference/), S.reference, 14);
  await typeInto(page.getByLabel(/Recipient details/), S.recipient, 12);
  await sleep(500);
  await click(page.getByRole("button", { name: "Save and continue" }), 800);
  await page.waitForURL(/step=3/);
  await sleep(600);
  mark("step3");
  await typeInto(page.getByLabel("What happened?"), S.description, 7);
  await typeInto(page.getByLabel(/What have you already tried/), S.previous, 6);
  await typeInto(page.getByLabel(/What outcome are you asking for/), S.outcome, 6);
  await sleep(400);
  await click(page.getByRole("button", { name: "Save and continue" }), 800);
  await page.waitForURL(/step=4/);
  await sleep(700);
  mark("step4");
  await moveTo(page.getByRole("button", { name: /Choose files/ }), 800);
  log({ type: "click", x: cursor.x, y: cursor.y });
  await page.locator(`#evidence-input-${caseId}`).setInputFiles(EVIDENCE);
  await page.getByRole("list", { name: "Uploaded evidence" }).getByText("evidence-transfer-receipt.png").waitFor();
  await sleep(900);
  await click(page.getByRole("button", { name: "Add description" }), 700);
  await typeInto(page.getByLabel("File description"), "Transfer receipt from my banking app", 22);
  await click(page.getByRole("button", { name: "Save", exact: true }), 500);
  await page.getByText("Transfer receipt from my banking app").first().waitFor();
  await sleep(800);
  await click(page.getByRole("link", { name: /Continue to review/ }), 800);
  await page.waitForURL(/step=5/);
  await sleep(900);
  mark("review");
  await scrollTo(page.getByRole("button", { name: "Confirm and create case" }), 1800, 500);
  await sleep(600);
  mark("confirm");
  await click(page.getByRole("button", { name: "Confirm and create case" }), 800);
  await page.getByText("Your case has been created").waitFor();
  await sleep(1800);
  await endClip();

  // ------------------------------------------------------------------ clip: analysis
  await startClip("analysis");
  await sleep(400);
  await click(page.getByRole("link", { name: "AI analysis" }), 900);
  await page.waitForURL(/tab=analysis/);
  await sleep(700);
  mark("run");
  await click(page.getByRole("button", { name: "Analyse my case" }), 800);
  await page.getByText("Analysing your case…").waitFor();
  await moveTo({ x: 1240, y: 700 }, 900);
  await page.getByText("Run a new analysis").waitFor({ timeout: 60000 });
  mark("results");
  await sleep(2200);
  await scrollTo(380, 2600);
  await sleep(1800);
  await scrollTo(900, 2600);
  await sleep(1800);
  await scrollTo(1500, 2600);
  await sleep(1600);
  await scrollTo(0, 1500);
  await sleep(600);
  await endClip();

  // ------------------------------------------------------------------ clip: complaint
  await startClip("complaint");
  await sleep(300);
  await click(page.getByRole("link", { name: "Complaint", exact: true }), 900);
  await page.waitForURL(/tab=complaint/);
  await sleep(600);
  mark("write");
  await click(page.getByRole("button", { name: "Write my complaint with AI" }), 800);
  await page.getByLabel("Complaint letter").waitFor({ timeout: 60000 });
  mark("draft");
  await sleep(1400);
  const letter = page.getByLabel("Complaint letter");
  await scrollTo(letter, 1600, 160);
  await sleep(900);
  // Fill in the details the AI couldn't know.
  for (const [placeholder, value] of [["[ADD: account number]", "0045712290"], ["[ADD: phone number]", "+234 800 000 0000"]]) {
    const box = await letter.boundingBox();
    await moveTo({ x: box.x + 260, y: box.y + 190 }, 700);
    log({ type: "click", x: cursor.x, y: cursor.y });
    await letter.evaluate((el, p) => {
      const i = el.value.indexOf(p);
      el.focus();
      el.setSelectionRange(i, i + p.length);
      const line = el.value.slice(0, i).split("\n").length;
      el.scrollTop = Math.max(0, line * 24 - 120);
    }, placeholder);
    await sleep(350);
    await page.keyboard.type(value, { delay: 55 });
    await sleep(400);
  }
  mark("save");
  await click(page.getByRole("button", { name: "Save changes" }), 800);
  await page.getByText("Draft saved.").waitFor();
  await sleep(900);
  await click(page.getByRole("checkbox", { name: /I have read this complaint and confirm it is accurate/ }), 800);
  await sleep(300);
  mark("approve");
  await click(page.getByRole("button", { name: "Approve final draft" }), 700);
  await page.getByText("Approved — ready to submit").waitFor();
  await sleep(1800);
  await endClip();

  // The approved complaint as a PDF (for the "document" reveal in the video).
  const pdfHref = await page.getByRole("link", { name: "Download PDF" }).first().getAttribute("href");
  const pdf = await page.request.get(`${APP}${pdfHref}`);
  writeFileSync(path.join(ASSETS, "complaint.pdf"), await pdf.body());
  execFileSync("pdftoppm", ["-png", "-r", "160", "-f", "1", "-l", "2", path.join(ASSETS, "complaint.pdf"), path.join(ASSETS, "complaint-page")]);

  // ------------------------------------------------------------------ clip: submit
  await startClip("submit");
  await sleep(300);
  await click(page.getByRole("link", { name: "Submit to your bank" }), 900);
  await page.waitForURL(/tab=submit/);
  await page.getByText(/No problems found/).waitFor();
  await sleep(1200);
  mark("method");
  await moveTo(page.getByRole("radio", { name: /Email from my Gmail/ }), 900);
  await sleep(600);
  await moveTo(page.getByRole("radio", { name: /On the institution's website/ }), 700);
  await sleep(600);
  await click(page.getByText("Use a different email address"), 800);
  await typeInto(page.getByLabel("Institution's complaints email"), S.bankEmail, 32);
  await click(page.getByRole("checkbox", { name: /I got this address from my institution's official website/ }), 700);
  await sleep(500);
  mark("check");
  await scrollTo(page.getByRole("heading", { name: "Final check" }), 1300, 200);
  await sleep(1400);
  mark("connect");
  await click(page.getByRole("link", { name: "Connect Gmail" }), 900);
  await page.getByText(`Gmail connected as ${S.user.email}`).waitFor();
  mark("connected");
  await page.getByLabel("Institution's complaints email").waitFor().catch(() => {});
  // The page reloaded after Google's consent: choose the address again.
  await click(page.getByText("Use a different email address"), 700);
  await page.getByLabel("Institution's complaints email").fill(S.bankEmail);
  await click(page.getByRole("checkbox", { name: /I got this address from my institution's official website/ }), 500);
  await sleep(300);
  await scrollTo(page.getByRole("heading", { name: "Send from your Gmail" }), 1500, 160);
  await sleep(1000);
  mark("preview");
  await click(page.getByText("Preview the email"), 800);
  await sleep(2200);
  await scrollTo(page.getByRole("heading", { name: "Authorise and send" }), 1500, 260);
  await sleep(600);
  mark("authorise");
  await click(page.getByRole("checkbox", { name: /I authorise Resolve to send my approved complaint/ }), 900);
  await sleep(900);
  mark("send");
  await click(page.getByRole("button", { name: "Send complaint" }), 800);
  await page.getByText(/Gmail confirmed your complaint was sent/).waitFor();
  mark("sent");
  await sleep(2000);
  await scrollTo(page.getByRole("heading", { name: "Submission history" }), 1600, 140);
  await sleep(2200);
  await endClip();

  // ------------------------------------------------------------------ clip: track
  await fetch(`${BACKEND}/__test/google/reply`, {
    method: "POST",
    body: JSON.stringify({ to: S.bankEmail, from: `Northbridge Bank Complaints <${S.bankEmail}>`, text: S.bankReply }),
  });
  await startClip("track");
  await sleep(500);
  mark("check-replies");
  await click(page.getByRole("button", { name: "Check for replies" }), 900);
  await page.getByText("Found 1 new reply.").waitFor();
  await sleep(1000);
  await page.reload({ waitUntil: "networkidle" });
  await scrollTo(page.locator("#responses"), 1600, 100);
  await sleep(1000);
  mark("explain");
  await click(page.getByRole("button", { name: "Explain this reply" }), 900);
  await page.getByText("AI interpretation").first().waitFor({ timeout: 60000 });
  mark("explained");
  await sleep(1200);
  await scrollTo(page.getByText("Their reference:"), 1400, 260);
  await sleep(1800);
  mark("apply");
  await click(page.getByRole("button", { name: /Set status to/ }), 900);
  await page.getByText(/Case status set to/).waitFor();
  await sleep(1500);
  await scrollTo(0, 1400);
  await sleep(500);
  mark("plan");
  await click(page.getByRole("button", { name: "Get a recovery plan" }), 900);
  await page.getByText("Update the plan").waitFor({ timeout: 60000 });
  mark("planned");
  await sleep(2500);
  await scrollTo(380, 1800);
  await sleep(1500);
  await click(page.getByRole("link", { name: "Tracking & history" }), 900);
  await page.waitForURL(/tab=tracking/);
  mark("timeline");
  await sleep(1200);
  await scrollTo(page.getByRole("heading", { name: "Case history" }), 1600, 120);
  await sleep(1500);
  await scrollTo(99999, 3200);
  await sleep(1800);
  await endClip();
} catch (e) {
  console.error("RECORDING FAILED:", e.message);
  await page.screenshot({ path: path.join(FRAMES, "failure.png") }).catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close();
  env.stop();
}
