// Starts Resolve's local demo environment for recording the video:
//   - tests/e2e/mock-backend.mjs (real PostgreSQL + RLS, Supabase emulation, Google OAuth/Gmail emulator)
//     replaying the genuine Gemini outputs captured in capture/gemini-outputs.json
//   - the production build of the app (`next start`) on http://localhost:3200
// Prerequisite: NEXT_DIST_DIR=.next-e2e npx next build   (run from the repository root)
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ANON_KEY, SERVICE_KEY } from "../../tests/e2e/keys.mjs";
import { TEST_GOOGLE_CLIENT_ID, TEST_GOOGLE_CLIENT_SECRET } from "../../tests/e2e/mock-google.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const APP = "http://localhost:3200";
export const BACKEND = "http://localhost:54321";

async function waitFor(url, ms = 120000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      const r = await fetch(url);
      if (r.status < 500) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`timed out waiting for ${url}`);
}

export async function startDemoEnv() {
  const env = { ...process.env, TEST_DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/postgres" };
  const backend = spawn("node", ["tests/e2e/mock-backend.mjs"], {
    cwd: root,
    env: { ...env, MOCK_DB_NAME: "resolve_demo", MOCK_AI_FIXTURES: path.join(root, "video/capture/gemini-outputs.json"), MOCK_AI_DELAY_MS: "2500" },
    stdio: ["ignore", "inherit", "inherit"],
    detached: true,
  });
  await waitFor(`${BACKEND}/health`);
  const app = spawn("npx", ["next", "start", "-p", "3200"], {
    cwd: root,
    env: {
      ...env,
      NEXT_DIST_DIR: ".next-e2e",
      SITE_URL: APP,
      SUPABASE_URL: BACKEND,
      SUPABASE_PUBLISHABLE_KEY: ANON_KEY,
      SUPABASE_SECRET_KEY: SERVICE_KEY,
      AI_PROVIDER: "gemini",
      GEMINI_API_KEY: "demo-key-for-local-replay",
      GEMINI_BASE_URL: BACKEND,
      AI_MODEL: "gemini-3.6-flash",
      AI_RATE_LIMIT_PER_HOUR: "50",
      GOOGLE_OAUTH_CLIENT_ID: TEST_GOOGLE_CLIENT_ID,
      GOOGLE_OAUTH_CLIENT_SECRET: TEST_GOOGLE_CLIENT_SECRET,
      GOOGLE_OAUTH_AUTH_URL: `${BACKEND}/o/oauth2/v2/auth`,
      GOOGLE_OAUTH_TOKEN_URL: `${BACKEND}/token`,
      GOOGLE_OAUTH_REVOKE_URL: `${BACKEND}/revoke`,
      GMAIL_API_BASE_URL: BACKEND,
      EMAIL_TOKEN_ENCRYPTION_KEY: "dGVzdC1vbmx5LWtleS1mb3ItZTJlLXRlc3RzLTMyYnk=",
      CRON_SECRET: "demo-cron-secret",
      NEXT_TELEMETRY_DISABLED: "1",
    },
    stdio: ["ignore", "ignore", "inherit"],
    detached: true,
  });
  await waitFor(APP);
  return {
    stop() {
      // Kill the whole process groups (npx starts next-server as a child process).
      for (const p of [app, backend]) {
        try {
          process.kill(-p.pid, "SIGTERM");
        } catch {}
      }
    },
  };
}
