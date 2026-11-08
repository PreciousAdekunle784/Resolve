import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

/**
 * Data Access Layer for authentication. Every protected page, server action
 * and API route calls one of these helpers, so authorisation never relies on
 * the proxy alone.
 */

export type SessionUser = { id: string; email: string | null; isAdmin: boolean };

/** Returns the verified current user, or null. Cached per request. */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  await cookies(); // per-request: never pre-render signed-in content
  if (!isSupabaseConfigured()) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) return null;
  const claims = data.claims as { sub: string; email?: string; app_metadata?: { role?: string } };
  return {
    id: claims.sub,
    email: claims.email ?? null,
    isAdmin: claims.app_metadata?.role === "admin",
  };
});

/** For pages: redirects to /login when signed out. */
export async function requireUser(nextPath?: string): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) {
    redirect(nextPath ? `/login?next=${encodeURIComponent(nextPath)}` : "/login");
  }
  return user;
}

export const getProfile = cache(async (userId: string): Promise<Profile | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
  if (error) throw new Error("Could not load your profile.");
  return (data as Profile | null) ?? null;
});

/** For app pages: requires sign-in AND completed onboarding. */
export async function requireOnboardedUser(nextPath?: string): Promise<{ user: SessionUser; profile: Profile }> {
  const user = await requireUser(nextPath);
  const profile = await getProfile(user.id);
  if (!profile || !profile.onboarding_completed_at) {
    redirect("/onboarding");
  }
  return { user, profile };
}
