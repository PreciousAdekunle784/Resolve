import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseUrl } from "@/lib/env";

/**
 * PRIVILEGED Supabase client using the service-role (secret) key.
 * It BYPASSES Row Level Security, so it is only used for operations that
 * cannot be done as the user — currently only permanent account deletion.
 * Never import this file into client code.
 */
export function getServiceRoleKey(): string | undefined {
  return process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || undefined;
}

export function isAdminClientConfigured(): boolean {
  return Boolean(getSupabaseUrl() && getServiceRoleKey());
}

export function createAdminClient() {
  const url = getSupabaseUrl();
  const key = getServiceRoleKey();
  if (!url || !key) {
    throw new Error("SUPABASE_SECRET_KEY (service role key) is not configured.");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
