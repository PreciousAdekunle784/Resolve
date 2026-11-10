/**
 * Environment helpers (read on the server, at runtime).
 *
 * Recommended names (no NEXT_PUBLIC_ prefix needed):
 *   SUPABASE_URL                 Project URL, e.g. https://abcd1234.supabase.co
 *   SUPABASE_PUBLISHABLE_KEY     publishable key (or SUPABASE_ANON_KEY for the legacy anon key)
 *   SUPABASE_SECRET_KEY          secret key (server only — see lib/supabase/admin.ts)
 *   SITE_URL                     public address of the site
 *
 * The NEXT_PUBLIC_-prefixed versions of these names also work, for
 * compatibility. The browser never reads these variables directly: the server
 * passes the publishable key to the one component that needs it.
 * On Vercel, redeploy after adding or changing any variable.
 */

/** Removes accidental whitespace and surrounding quotes from pasted values. */
function clean(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const v = value.trim().replace(/^["'`]+|["'`]+$/g, "").trim();
  return v || undefined;
}

/** First variable (in order) that has a value, with its name. */
function firstSet(names: string[]): { name: string; value: string } | null {
  for (const name of names) {
    const value = clean(process.env[name]);
    if (value) return { name, value };
  }
  return null;
}

const URL_VARS = ["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"];
const KEY_VARS = [
  "SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
];

/** The Supabase Project URL, normalised to its origin (e.g. https://abcd.supabase.co). */
export function getSupabaseUrl(): string | undefined {
  const found = firstSet(URL_VARS);
  if (!found) return undefined;
  try {
    // People often paste ".../rest/v1/" — only the origin is needed.
    return new URL(found.value).origin;
  } catch {
    return found.value;
  }
}

/** The publishable (anon) key. Safe to expose: access is controlled by RLS. */
export function getSupabasePublishableKey(): string | undefined {
  return firstSet(KEY_VARS)?.value;
}

function jwtRole(token: string): string | null {
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    const json = JSON.parse(Buffer.from(part, "base64url").toString());
    return typeof json.role === "string" ? json.role : null;
  } catch {
    return null;
  }
}

/**
 * Lists what is wrong with the Supabase settings, by variable NAME only
 * (never includes the values themselves). Empty when everything looks right.
 */
export function getSupabaseConfigProblems(): string[] {
  const problems: string[] = [];
  const url = firstSet(URL_VARS);
  const key = firstSet(KEY_VARS);

  if (!url) {
    problems.push("SUPABASE_URL is missing.");
  } else {
    let parsed: URL | null = null;
    try {
      parsed = new URL(url.value);
    } catch {
      parsed = null;
    }
    if (!parsed || !/^https?:$/.test(parsed.protocol)) {
      problems.push(`${url.name} isn't a web address. It should look like https://abcd1234.supabase.co`);
    } else if (/(^|\.)supabase\.com$/.test(parsed.hostname)) {
      problems.push(
        `${url.name} is the Supabase dashboard address. Use the Project URL instead (Project Settings → API), which looks like https://abcd1234.supabase.co`,
      );
    }
  }

  if (!key) {
    problems.push("SUPABASE_PUBLISHABLE_KEY is missing.");
  } else if (key.value.startsWith("sb_secret_") || jwtRole(key.value) === "service_role") {
    problems.push(
      `${key.name} contains the SECRET key. Replace it with the publishable (anon) key — and keep the secret key only in SUPABASE_SECRET_KEY.`,
    );
  }
  return problems;
}

export function isSupabaseConfigured(): boolean {
  return getSupabaseConfigProblems().length === 0;
}

/** Where to fix settings, depending on where the app is running. */
export function supabaseConfigHelp(): string {
  return process.env.VERCEL
    ? "Fix this in Vercel → your project → Settings → Environment Variables, then go to Deployments → ⋯ → Redeploy (changes only take effect after a redeploy)."
    : "Fix this in the .env.local file in the project folder, then stop the app (Ctrl+C) and run npm run dev again.";
}

export function getSiteUrl(): string {
  const explicit = firstSet(["SITE_URL", "NEXT_PUBLIC_SITE_URL"])?.value;
  if (explicit) return explicit.replace(/\/+$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}
