import { clsx } from "clsx";
import type { ReactNode } from "react";

type Tone = "info" | "success" | "warning" | "error";

const styles: Record<Tone, string> = {
  info: "border-brand-100 bg-brand-50 text-ink-800",
  success: "border-success-100 bg-success-50 text-ink-800",
  warning: "border-warning-100 bg-warning-50 text-ink-800",
  error: "border-danger-100 bg-danger-50 text-ink-800",
};

const iconColor: Record<Tone, string> = {
  info: "text-brand-600",
  success: "text-success-600",
  warning: "text-warning-700",
  error: "text-danger-700",
};

const paths: Record<Tone, string> = {
  info: "M12 16v-4m0-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  success: "M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  warning:
    "M12 9v3.75m0 3.75h.008M10.29 3.86L1.82 18a1.5 1.5 0 001.29 2.25h17.78A1.5 1.5 0 0022.18 18L13.71 3.86a1.5 1.5 0 00-2.42 0z",
  error: "M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008",
};

export function Alert({
  tone = "info",
  title,
  children,
  action,
  className,
}: {
  tone?: Tone;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={clsx("flex gap-3 rounded-[var(--radius-control)] border px-4 py-3 text-sm", styles[tone], className)}
    >
      <svg
        className={clsx("mt-0.5 size-5 shrink-0", iconColor[tone])}
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={1.75}
        stroke="currentColor"
        aria-hidden="true"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d={paths[tone]} />
      </svg>
      <div className="min-w-0 flex-1 space-y-1">
        {title ? <p className="font-semibold text-ink-900">{title}</p> : null}
        {children ? <div className="leading-relaxed text-ink-700">{children}</div> : null}
        {action ? <div className="pt-1">{action}</div> : null}
      </div>
    </div>
  );
}
