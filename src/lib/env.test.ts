import { afterEach, describe, expect, it, vi } from "vitest";
import { getSupabaseConfigProblems, getSupabasePublishableKey, getSupabaseUrl, supabaseConfigHelp } from "./env";

const fakeJwt = (role: string) => `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role })).toString("base64url")}.sig`;

afterEach(() => vi.unstubAllEnvs());

function setEnv(url?: string, key?: string) {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", url ?? "");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", key ?? "");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
}

describe("Supabase settings check", () => {
  it("accepts correct settings", () => {
    setEnv("https://abcd1234.supabase.co", "sb_publishable_abc");
    expect(getSupabaseConfigProblems()).toEqual([]);
  });

  it("names each missing setting (never its value)", () => {
    setEnv(undefined, undefined);
    expect(getSupabaseConfigProblems()).toEqual([
      "NEXT_PUBLIC_SUPABASE_URL is missing.",
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is missing.",
    ]);
  });

  it("cleans quotes, spaces and extra paths from pasted values", () => {
    setEnv('  "https://abcd1234.supabase.co/rest/v1/"  ', " 'sb_publishable_abc' ");
    expect(getSupabaseUrl()).toBe("https://abcd1234.supabase.co");
    expect(getSupabasePublishableKey()).toBe("sb_publishable_abc");
    expect(getSupabaseConfigProblems()).toEqual([]);
  });

  it("spots the dashboard address used instead of the Project URL", () => {
    setEnv("https://supabase.com/dashboard/project/abcd1234", "sb_publishable_abc");
    expect(getSupabaseConfigProblems()[0]).toMatch(/dashboard address/);
  });

  it("spots a value that isn't a web address", () => {
    setEnv("abcd1234", "sb_publishable_abc");
    expect(getSupabaseConfigProblems()[0]).toMatch(/isn't a web address/);
  });

  it("refuses the secret key in the public variable", () => {
    setEnv("https://abcd1234.supabase.co", "sb_secret_abc");
    expect(getSupabaseConfigProblems()[0]).toMatch(/SECRET key/);
    setEnv("https://abcd1234.supabase.co", fakeJwt("service_role"));
    expect(getSupabaseConfigProblems()[0]).toMatch(/SECRET key/);
    setEnv("https://abcd1234.supabase.co", fakeJwt("anon"));
    expect(getSupabaseConfigProblems()).toEqual([]);
  });

  it("accepts the legacy anon key variable", () => {
    setEnv("https://abcd1234.supabase.co", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", fakeJwt("anon"));
    expect(getSupabaseConfigProblems()).toEqual([]);
  });

  it("gives Vercel-specific help when running on Vercel", () => {
    vi.stubEnv("VERCEL", "1");
    expect(supabaseConfigHelp()).toMatch(/Redeploy/);
    vi.stubEnv("VERCEL", "");
    expect(supabaseConfigHelp()).toMatch(/\.env\.local/);
  });
});
