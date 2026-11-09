import { defineConfig, devices } from "@playwright/test";
import { ANON_KEY, SERVICE_KEY } from "./tests/e2e/keys.mjs";

/**
 * End-to-end tests run the real Resolve app against a local TEST backend
 * (tests/e2e/mock-backend.mjs) that emulates Supabase on top of a real
 * PostgreSQL database with Resolve's migrations and RLS policies.
 *
 * Requires TEST_DATABASE_URL (a PostgreSQL superuser connection string).
 */
const APP_PORT = 3100;
const BACKEND = "http://localhost:54321";
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/postgres";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 180_000,
  expect: { timeout: 15_000 },
  workers: 1,
  fullyParallel: false,
  reporter: [["list"]],
  outputDir: "test-results/playwright",
  use: {
    baseURL: `http://localhost:${APP_PORT}`,
    trace: "off",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "node tests/e2e/mock-backend.mjs",
      url: `${BACKEND}/health`,
      reuseExistingServer: Boolean(process.env.E2E_REUSE),
      env: { TEST_DATABASE_URL },
      stdout: "pipe",
    },
    {
      command: `npx next build && npx next start -p ${APP_PORT}`,
      url: `http://localhost:${APP_PORT}`,
      reuseExistingServer: Boolean(process.env.E2E_REUSE),
      timeout: 300_000,
      env: {
        NEXT_DIST_DIR: ".next-e2e",
        NEXT_PUBLIC_SITE_URL: `http://localhost:${APP_PORT}`,
        NEXT_PUBLIC_SUPABASE_URL: BACKEND,
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: ANON_KEY,
        SUPABASE_SECRET_KEY: SERVICE_KEY,
        // Run the suite against either provider: E2E_AI_PROVIDER=gemini npm run e2e
        ...(process.env.E2E_AI_PROVIDER === "gemini"
          ? { AI_PROVIDER: "gemini", GEMINI_API_KEY: "test-key-for-local-mock", GEMINI_BASE_URL: BACKEND, AI_MODEL: "gemini-test-flash" }
          : { AI_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "test-key-for-local-mock", ANTHROPIC_BASE_URL: BACKEND, AI_MODEL: "claude-opus-5-5" }),
        AI_RATE_LIMIT_PER_HOUR: "50",
        NEXT_TELEMETRY_DISABLED: "1",
      },
    },
  ],
});
