import "server-only";
import { NextResponse } from "next/server";
import { getCurrentUser, type SessionUser } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/env";

/** Helpers for JSON API route handlers with consistent, safe error responses. */

export function jsonError(status: number, error: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ error, ...extra }, { status, headers: { "Cache-Control": "no-store" } });
}

export function jsonOk<T>(data: T, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export async function requireApiUser(): Promise<{ user: SessionUser } | { response: NextResponse }> {
  if (!isSupabaseConfigured()) return { response: jsonError(503, "Resolve is not connected to its database yet.") };
  const user = await getCurrentUser();
  if (!user) return { response: jsonError(401, "Your session has ended. Please sign in again.") };
  return { user };
}

/** Rejects cross-site requests to state-changing endpoints (defence in depth on top of SameSite cookies). */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true; // Non-browser clients or same-origin navigations without Origin.
  try {
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? new URL(request.url).host;
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
