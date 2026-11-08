import { clsx } from "clsx";
import type { ReactNode } from "react";
import { CASE_STATUS_INFO, type CaseStatus, type StatusTone } from "@/lib/constants";

const tones: Record<StatusTone, string> = {
  neutral: "bg-ink-100 text-ink-700 ring-ink-200",
  info: "bg-brand-50 text-brand-700 ring-brand-100",
  warning: "bg-warning-50 text-warning-800 ring-warning-100",
  success: "bg-success-50 text-success-700 ring-success-100",
  danger: "bg-danger-50 text-danger-700 ring-danger-100",
  muted: "bg-ink-50 text-ink-500 ring-ink-200",
};

const dots: Record<StatusTone, string> = {
  neutral: "bg-ink-400",
  info: "bg-brand-500",
  warning: "bg-warning-500",
  success: "bg-success-600",
  danger: "bg-danger-600",
  muted: "bg-ink-300",
};

export function Badge({
  tone = "neutral",
  dot = false,
  className,
  children,
}: {
  tone?: StatusTone;
  dot?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset",
        tones[tone],
        className,
      )}
    >
      {dot ? <span className={clsx("size-1.5 rounded-full", dots[tone])} aria-hidden="true" /> : null}
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: CaseStatus }) {
  const info = CASE_STATUS_INFO[status];
  return (
    <Badge tone={info.tone} dot>
      {info.label}
    </Badge>
  );
}
