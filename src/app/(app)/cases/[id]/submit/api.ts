/** Small fetch helper for the submission screens (client-side). */
export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string; code?: string; data?: Record<string, unknown> };

export async function postJson<T>(url: string, body: unknown, method: "POST" | "DELETE" = "POST"): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: method === "POST" ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data.error ?? "Something went wrong. Please try again.", code: data.code, data };
    return { ok: true, data: data as T };
  } catch {
    return { ok: false, error: "We couldn't reach Resolve. Check your connection — then check the submission history before trying again.", code: "network" };
  }
}

export const newIdempotencyKey = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export const todayLagos = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" }).format(new Date());

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
