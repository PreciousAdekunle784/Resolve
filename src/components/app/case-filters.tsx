"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { clsx } from "clsx";
import { Button } from "@/components/ui/button";
import {
  CASE_PERIODS,
  CASE_VIEWS,
  countAdvancedFilters,
  filtersToSearchParams,
  type CaseFilters,
} from "@/lib/case-filters";
import {
  CASE_STATUS_INFO,
  CASE_STATUSES,
  ISSUE_CATEGORIES,
  ISSUE_CATEGORY_INFO,
  PAYMENT_CHANNEL_LABELS,
  PAYMENT_CHANNELS,
} from "@/lib/constants";

function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);
  return ref;
}

const Chevron = () => (
  <svg className="size-4 text-ink-500" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
    <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
  </svg>
);

const pill =
  "inline-flex h-9 items-center gap-1.5 rounded-full border border-ink-200 bg-white px-3.5 text-sm text-ink-800 transition-colors hover:border-ink-300 hover:bg-ink-50 aria-expanded:border-ink-300 aria-expanded:bg-ink-50";

/** A small single-choice dropdown (used for the view and date menus). */
function Dropdown<T extends string>({
  label,
  value,
  options,
  onChange,
  name,
}: {
  label: string;
  value: T;
  options: readonly { key: T; label: string }[];
  onChange: (v: T) => void;
  name: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  return (
    <div ref={ref} className="relative">
      <button type="button" className={pill} aria-haspopup="listbox" aria-expanded={open} aria-label={name} onClick={() => setOpen((o) => !o)}>
        {label} <Chevron />
      </button>
      {open ? (
        <ul role="listbox" aria-label={name} className="absolute left-0 z-30 mt-2 w-56 rounded-2xl border border-ink-200 bg-white p-1.5 shadow-[var(--shadow-raised)]">
          {options.map((o) => (
            <li key={o.key} role="option" aria-selected={o.key === value}>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onChange(o.key);
                }}
                className={clsx(
                  "flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm",
                  o.key === value ? "bg-ink-100 font-medium text-ink-950" : "text-ink-700 hover:bg-ink-50",
                )}
              >
                {o.label}
                {o.key === value ? (
                  <svg className="size-4 text-brand-600" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path fillRule="evenodd" d="M16.7 5.3a1 1 0 010 1.4l-8 8a1 1 0 01-1.4 0l-4-4a1 1 0 011.4-1.4L8 12.58l7.3-7.3a1 1 0 011.4 0z" clipRule="evenodd" />
                  </svg>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

type Group = "status" | "category" | "channel" | "amount";
const GROUPS: { key: Group; label: string }[] = [
  { key: "status", label: "Status" },
  { key: "category", label: "Category" },
  { key: "channel", label: "Payment channel" },
  { key: "amount", label: "Amount" },
];

function CheckRow({ checked, onChange, children }: { checked: boolean; onChange: () => void; children: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 text-sm text-ink-800 hover:bg-ink-50">
      <input type="checkbox" checked={checked} onChange={onChange} className="size-4 rounded accent-brand-600" />
      {children}
    </label>
  );
}

/** Multi-filter popover: categories on the left, choices on the right, Clear / Cancel / Apply. */
function FilterPopover({ filters, onApply }: { filters: CaseFilters; onApply: (f: CaseFilters) => void }) {
  const [open, setOpen] = useState(false);
  const [group, setGroup] = useState<Group>("status");
  const [draft, setDraft] = useState(filters);
  const ref = useDismiss(open, () => setOpen(false));
  const applied = countAdvancedFilters(filters);
  const pending = countAdvancedFilters(draft);

  const toggleIn = <K extends "statuses" | "categories" | "channels">(key: K, value: CaseFilters[K][number]) =>
    setDraft((d) => {
      const current = d[key] as string[];
      const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
      return { ...d, [key]: next };
    });

  const options =
    group === "status"
      ? { key: "statuses" as const, items: CASE_STATUSES.map((s) => ({ value: s, label: CASE_STATUS_INFO[s].label })) }
      : group === "category"
        ? { key: "categories" as const, items: ISSUE_CATEGORIES.map((c) => ({ value: c, label: ISSUE_CATEGORY_INFO[c].label })) }
        : group === "channel"
          ? { key: "channels" as const, items: PAYMENT_CHANNELS.map((c) => ({ value: c, label: PAYMENT_CHANNEL_LABELS[c] })) }
          : null;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        className={pill}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          setDraft(filters);
          setOpen((o) => !o);
        }}
      >
        Filter
        {applied > 0 ? <span className="rounded-full bg-brand-600 px-1.5 text-xs font-medium text-white">{applied}</span> : null}
        <svg className="size-4 text-ink-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
        </svg>
      </button>
      {open ? (
        <div
          role="dialog"
          aria-label="Filter cases"
          className="absolute left-0 z-30 mt-2 w-[min(34rem,calc(100vw-2rem))] rounded-3xl border border-ink-200 bg-white p-3 shadow-[var(--shadow-raised)] max-sm:-left-24"
        >
          <div className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)] gap-3">
            <ul className="space-y-0.5 rounded-2xl bg-ink-50 p-1.5" role="tablist" aria-label="Filter by">
              {GROUPS.map((g) => (
                <li key={g.key}>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={group === g.key}
                    onClick={() => setGroup(g.key)}
                    className={clsx(
                      "flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm",
                      group === g.key ? "bg-white font-medium text-ink-950 shadow-[var(--shadow-card)]" : "text-ink-600 hover:text-ink-900",
                    )}
                  >
                    {g.label}
                    {group === g.key ? <span aria-hidden="true">›</span> : null}
                  </button>
                </li>
              ))}
            </ul>
            <div role="tabpanel" className="min-w-0">
              <p className="px-2 pt-1 pb-2 text-base font-medium text-ink-950">{GROUPS.find((g) => g.key === group)?.label}</p>
              {options ? (
                <div className="max-h-64 space-y-0.5 overflow-y-auto">
                  <CheckRow
                    checked={(draft[options.key] as string[]).length === options.items.length}
                    onChange={() =>
                      setDraft((d) => ({
                        ...d,
                        [options.key]: (d[options.key] as string[]).length === options.items.length ? [] : options.items.map((i) => i.value),
                      }))
                    }
                  >
                    Select all
                  </CheckRow>
                  {options.items.map((item) => (
                    <CheckRow
                      key={item.value}
                      checked={(draft[options.key] as string[]).includes(item.value)}
                      onChange={() => toggleIn(options.key, item.value as never)}
                    >
                      {item.label}
                    </CheckRow>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 px-2">
                  <label className="space-y-1 text-sm text-ink-700">
                    <span>Minimum (₦)</span>
                    <input
                      inputMode="decimal"
                      value={draft.min ?? ""}
                      onChange={(e) => setDraft((d) => ({ ...d, min: e.target.value === "" || Number.isNaN(Number(e.target.value)) ? null : Number(e.target.value) }))}
                      className="h-9 w-full rounded-xl border border-ink-200 px-3 text-sm focus:border-brand-600 focus:outline-none"
                    />
                  </label>
                  <label className="space-y-1 text-sm text-ink-700">
                    <span>Maximum (₦)</span>
                    <input
                      inputMode="decimal"
                      value={draft.max ?? ""}
                      onChange={(e) => setDraft((d) => ({ ...d, max: e.target.value === "" || Number.isNaN(Number(e.target.value)) ? null : Number(e.target.value) }))}
                      className="h-9 w-full rounded-xl border border-ink-200 px-3 text-sm focus:border-brand-600 focus:outline-none"
                    />
                  </label>
                </div>
              )}
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-ink-100 px-2 pt-3">
            <button
              type="button"
              className="text-sm font-medium text-ink-700 hover:text-ink-950 disabled:text-ink-400"
              disabled={pending === 0}
              onClick={() => setDraft((d) => ({ ...d, statuses: [], categories: [], channels: [], min: null, max: null }))}
            >
              ({pending}) Clear
            </button>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  setOpen(false);
                  onApply(draft);
                }}
              >
                Apply
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Toolbar above the case table: view, date range, filters and search. */
export function CaseFilterBar({ filters }: { filters: CaseFilters }) {
  const router = useRouter();
  const go = (next: CaseFilters) => {
    const qs = filtersToSearchParams(next).toString();
    router.push(qs ? `/cases?${qs}` : "/cases");
  };
  const view = CASE_VIEWS.find((v) => v.key === filters.view)!;
  const period = CASE_PERIODS.find((p) => p.key === filters.period)!;
  const hasAny = filters.view !== "all" || filters.period !== "any" || countAdvancedFilters(filters) > 0 || filters.q;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Dropdown name="Show" label={view.label} value={filters.view} options={CASE_VIEWS} onChange={(v) => go({ ...filters, view: v })} />
      <Dropdown name="Date" label={filters.period === "any" ? "Date" : period.label} value={filters.period} options={CASE_PERIODS} onChange={(p) => go({ ...filters, period: p })} />
      <FilterPopover filters={filters} onApply={go} />
      <form
        role="search"
        className="relative ml-auto w-full sm:w-64"
        onSubmit={(e) => {
          e.preventDefault();
          const q = String(new FormData(e.currentTarget).get("q") ?? "");
          go({ ...filters, q });
        }}
      >
        <label htmlFor="case-search" className="sr-only">Search cases</label>
        <svg className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
        </svg>
        <input
          id="case-search"
          name="q"
          type="search"
          defaultValue={filters.q}
          key={filters.q}
          placeholder="Search this list…"
          className="h-9 w-full rounded-full border border-ink-200 bg-white pr-3 pl-9 text-sm placeholder:text-ink-500 focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20 focus:outline-none"
        />
      </form>
      {hasAny ? (
        <button type="button" onClick={() => router.push("/cases")} className="text-sm font-medium text-brand-700 hover:underline">
          Reset
        </button>
      ) : null}
    </div>
  );
}
