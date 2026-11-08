import {
  CASE_STATUSES,
  ISSUE_CATEGORIES,
  PAYMENT_CHANNELS,
  type CaseStatus,
  type IssueCategory,
  type PaymentChannel,
} from "@/lib/constants";

/** Filters for the case list, read from (and written to) the URL. */

export const CASE_VIEWS = [
  { key: "all", label: "All cases" },
  { key: "action", label: "Needs your action" },
  { key: "awaiting", label: "Awaiting institution" },
  { key: "followup", label: "Follow-up due" },
  { key: "resolved", label: "Resolved" },
  { key: "closed", label: "Closed" },
  { key: "unfinished", label: "Unfinished reports" },
] as const;
export type CaseView = (typeof CASE_VIEWS)[number]["key"];

export const CASE_PERIODS = [
  { key: "any", label: "Any time", days: null },
  { key: "7d", label: "Last 7 days", days: 7 },
  { key: "30d", label: "Last 30 days", days: 30 },
  { key: "90d", label: "Last 90 days", days: 90 },
  { key: "365d", label: "Last 12 months", days: 365 },
] as const;
export type CasePeriod = (typeof CASE_PERIODS)[number]["key"];

export interface CaseFilters {
  view: CaseView;
  period: CasePeriod;
  statuses: CaseStatus[];
  categories: IssueCategory[];
  channels: PaymentChannel[];
  min: number | null;
  max: number | null;
  q: string;
}

type Params = Record<string, string | string[] | undefined>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const list = <T extends string>(v: string | string[] | undefined, allowed: readonly T[]): T[] =>
  Array.from(new Set(first(v).split(","))).filter((x): x is T => (allowed as readonly string[]).includes(x));
const amount = (v: string | string[] | undefined) => {
  const n = Number(first(v).replace(/[,\s₦]/g, ""));
  return first(v) !== "" && Number.isFinite(n) && n >= 0 ? n : null;
};

/** Removes characters that have meaning in PostgREST filter syntax. */
export function sanitizeSearch(q: string): string {
  return q.replace(/[^\p{L}\p{N}\s\-_/.]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 60);
}

export function parseCaseFilters(params: Params): CaseFilters {
  return {
    view: CASE_VIEWS.find((v) => v.key === first(params.filter))?.key ?? "all",
    period: CASE_PERIODS.find((p) => p.key === first(params.period))?.key ?? "any",
    statuses: list(params.status, CASE_STATUSES),
    categories: list(params.category, ISSUE_CATEGORIES),
    channels: list(params.channel, PAYMENT_CHANNELS),
    min: amount(params.min),
    max: amount(params.max),
    q: sanitizeSearch(first(params.q)),
  };
}

/** Number of detailed filters applied through the Filter panel. */
export function countAdvancedFilters(f: Pick<CaseFilters, "statuses" | "categories" | "channels" | "min" | "max">): number {
  return f.statuses.length + f.categories.length + f.channels.length + (f.min !== null ? 1 : 0) + (f.max !== null ? 1 : 0);
}

export function filtersToSearchParams(f: CaseFilters): URLSearchParams {
  const sp = new URLSearchParams();
  if (f.view !== "all") sp.set("filter", f.view);
  if (f.period !== "any") sp.set("period", f.period);
  if (f.statuses.length) sp.set("status", f.statuses.join(","));
  if (f.categories.length) sp.set("category", f.categories.join(","));
  if (f.channels.length) sp.set("channel", f.channels.join(","));
  if (f.min !== null) sp.set("min", String(f.min));
  if (f.max !== null) sp.set("max", String(f.max));
  if (f.q) sp.set("q", f.q);
  return sp;
}

/** ISO timestamp for the start of a "last N days" period. */
export function periodStart(days: number, now: Date = new Date()): string {
  return new Date(now.getTime() - days * 86_400_000).toISOString();
}
