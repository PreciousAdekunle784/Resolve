import { afterEach, describe, expect, it, vi } from "vitest";
import { getSiteUrl, getSupabaseConfigProblems, getSupabasePublishableKey, getSupabaseUrl, supabaseConfigHelp } from "./env";

const fakeJwt = (role: string) => `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role })).toString("base64url")}.sig`;
const NAMES = [
  "SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SITE_URL",
  "NEXT_PUBLIC_SITE_URL",
  "VERCEL",
  "VERCEL_URL",
  "VERCEL_PROJECT_PRODUCTION_URL",
];

function setEnv(values: Record<string, string>) {
  for (const n of NAMES) vi.stubEnv(n, "");
  for (const [k, v] of Object.entries(values)) vi.stubEnv(k, v);
}

afterEach(() => vi.unstubAllEnvs());

describe("Supabase settings", () => {
  it("works with plain names (no NEXT_PUBLIC_ prefix)", () => {
    setEnv({ SUPABASE_URL: "https://abcd1234.supabase.co", SUPABASE_PUBLISHABLE_KEY: "sb_publishable_abc" });
    expect(getSupabaseConfigProblems()).toEqual([]);
    expect(getSupabaseUrl()).toBe("https://abcd1234.supabase.co");
    expect(getSupabasePublishableKey()).toBe("sb_publishable_abc");
  });

  it("also accepts the legacy anon key name and the NEXT_PUBLIC_ names", () => {
    setEnv({ SUPABASE_URL: "https://abcd1234.supabase.co", SUPABASE_ANON_KEY: fakeJwt("anon") });
    expect(getSupabaseConfigProblems()).toEqual([]);
    setEnv({ NEXT_PUBLIC_SUPABASE_URL: "https://abcd1234.supabase.co", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_abc" });
    expect(getSupabaseConfigProblems()).toEqual([]);
  });

  it("names each missing setting (never its value)", () => {
    setEnv({});
    expect(getSupabaseConfigProblems()).toEqual(["SUPABASE_URL is missing.", "SUPABASE_PUBLISHABLE_KEY is missing."]);
  });

  it("cleans quotes, spaces and extra paths from pasted values", () => {
    setEnv({ SUPABASE_URL: '  "https://abcd1234.supabase.co/rest/v1/"  ', SUPABASE_PUBLISHABLE_KEY: " 'sb_publishable_abc' " });
    expect(getSupabaseUrl()).toBe("https://abcd1234.supabase.co");
    expect(getSupabasePublishableKey()).toBe("sb_publishable_abc");
    expect(getSupabaseConfigProblems()).toEqual([]);
  });

  it("spots the dashboard address or a non-address", () => {
    setEnv({ SUPABASE_URL: "https://supabase.com/dashboard/project/abcd1234", SUPABASE_PUBLISHABLE_KEY: "sb_publishable_abc" });
    expect(getSupabaseConfigProblems()[0]).toMatch(/^SUPABASE_URL is the Supabase dashboard address/);
    setEnv({ SUPABASE_URL: "abcd1234", SUPABASE_PUBLISHABLE_KEY: "sb_publishable_abc" });
    expect(getSupabaseConfigProblems()[0]).toMatch(/isn't a web address/);
  });

  it("refuses the secret key in the publishable key setting", () => {
    setEnv({ SUPABASE_URL: "https://abcd1234.supabase.co", SUPABASE_PUBLISHABLE_KEY: "sb_secret_abc" });
    expect(getSupabaseConfigProblems()[0]).toMatch(/^SUPABASE_PUBLISHABLE_KEY contains the SECRET key/);
    setEnv({ SUPABASE_URL: "https://abcd1234.supabase.co", SUPABASE_ANON_KEY: fakeJwt("service_role") });
    expect(getSupabaseConfigProblems()[0]).toMatch(/^SUPABASE_ANON_KEY contains the SECRET key/);
  });

  it("gives Vercel-specific help when running on Vercel", () => {
    setEnv({ VERCEL: "1" });
    expect(supabaseConfigHelp()).toMatch(/Redeploy/);
    setEnv({});
    expect(supabaseConfigHelp()).toMatch(/\.env\.local/);
  });

  it("works out the site address", () => {
    setEnv({ SITE_URL: "https://resolve.example/" });
    expect(getSiteUrl()).toBe("https://resolve.example");
    setEnv({ VERCEL_PROJECT_PRODUCTION_URL: "resolve-xyz.vercel.app", VERCEL_URL: "resolve-abc123.vercel.app" });
    expect(getSiteUrl()).toBe("https://resolve-xyz.vercel.app");
  });
});
