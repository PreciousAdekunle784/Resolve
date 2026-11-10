import { expect, type Browser, type Page } from "@playwright/test";
import path from "node:path";

/** Shared helpers for the end-to-end tests. */
export const BACKEND = "http://localhost:54321";
export const PASSWORD = "Resolve-test-2026";
export const FIXTURES = path.join(process.cwd(), "tests/e2e/fixtures");

export async function register(page: Page, user: { name: string; email: string }, from = "/register") {
  await page.goto(from);
  await page.getByLabel("Full name").fill(user.name);
  await page.getByLabel("Email address").fill(user.email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("checkbox", { name: /I agree to the terms/ }).check();
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/onboarding/);
}

export async function completeOnboarding(page: Page, opts: { aiConsent: boolean }) {
  await expect(page.getByRole("heading", { name: "Welcome to Resolve" })).toBeVisible();
  if (opts.aiConsent) await page.getByRole("checkbox", { name: /Allow AI analysis/ }).check();
  await page.getByRole("checkbox", { name: /I understand that Resolve is an independent assistant/ }).check();
  await page.getByRole("button", { name: "Continue to Resolve" }).click();
}

export async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

export async function newPage(browser: Browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on("dialog", (d) => d.accept());
  return page;
}
