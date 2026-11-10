"use client";

import { createBrowserClient } from "@supabase/ssr";
import { getSupabasePublishableKey, getSupabaseUrl } from "@/lib/env";

/**
 * Supabase client for Client Components. Uses only the public URL and
 * publishable key; all data access is restricted by Row Level Security.
 */
export function createClient() {
  const url = getSupabaseUrl();
  const key = getSupabasePublishableKey();
  if (!url || !key) {
    throw new Error("Supabase is not configured.");
  }
  return createBrowserClient(url, key);
}
