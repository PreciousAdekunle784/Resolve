/**
 * Environment helpers. Public values (NEXT_PUBLIC_*) are safe for the browser.
 * Anything else must only be read in server code.
 *
 * Note: NEXT_PUBLIC_* values are built into the app when it is built, so after
 * adding or changing them on Vercel the project must be redeployed.
 */

/** Removes accidental whitespace and surrounding quotes from pasted values. */
function clean(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const v = value.trim().replace(/^["'`]+|["'`]+$/g, "").trim();
  return v || undefined;
}

/** The Supabase Project URL, normalised to its origin (e.g. https://abcd.supabase.co). */
export function getSupabaseUrl(): string | undefined {
  const raw = clean(process.env.NEXT_PUBLIC_SUPABASE_URL);
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    // People often paste ".../rest/v1/" — only the origin is needed.
    return url.origin;
  } catch {
    return raw;
  }
}

/** The publishable (anon) key. Safe to expose: access is controlled by RLS. */
export function getSupabasePublishableKey(): string | undefined {
  return clean(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) ?? clean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

function jwtRole(token: string): string | null {
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    const json = JSON.parse(
      typeof atob === "function"
        ? atob(part.replace(/-/g, "+").replace(/_/g, "/"))
        : Buffer.from(part, "base64url").toString(),
    );
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
  const rawUrl = clean(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const key = getSupabasePublishableKey();

  if (!rawUrl) {
    problems.push("NEXT_PUBLIC_SUPABASE_URL is missing.");
  } else {
    let url: URL | null = null;
    try {
      url = new URL(rawUrl);
    } catch {
      url = null;
    }
    if (!url || !/^https?:$/.test(url.protocol)) {
      problems.push("NEXT_PUBLIC_SUPABASE_URL isn't a web address. It should look like https://abcd1234.supabase.co");
    } else if (/(^|\.)supabase\.com$/.test(url.hostname)) {
      problems.push(
        "NEXT_PUBLIC_SUPABASE_URL is the Supabase dashboard address. Use the Project URL instead (Project Settings → API), which looks like https://abcd1234.supabase.co",
      );
    }
  }

  if (!key) {
    problems.push("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is missing.");
  } else if (key.startsWith("sb_secret_") || jwtRole(key) === "service_role") {
    problems.push(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY contains the SECRET key. Replace it with the publishable (anon) key — and keep the secret key only in SUPABASE_SECRET_KEY.",
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
    ? "Fix this in Vercel → your project → Settings → Environment Variables, then go to Deployments → ⋯ → Redeploy (settings only take effect after a redeploy)."
    : "Fix this in the .env.local file in the project folder, then stop the app (Ctrl+C) and run npm run dev again.";
}

export function getSiteUrl(): string {
  const explicit = clean(process.env.NEXT_PUBLIC_SITE_URL);
  if (explicit) return explicit.replace(/\/+$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}
