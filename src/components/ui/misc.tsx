import { clsx } from "clsx";
import type { ReactNode } from "react";

export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 pb-6 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0 space-y-1">
        {eyebrow ? <div className="text-xs font-medium tracking-wide text-ink-500 uppercase">{eyebrow}</div> : null}
        <h1 className="text-2xl font-semibold text-ink-950 sm:text-[1.75rem]">{title}</h1>
        {description ? <p className="max-w-2xl text-sm leading-relaxed text-ink-600">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={clsx(
        "flex flex-col items-center justify-center rounded-[var(--radius-card)] border border-dashed border-ink-300 bg-white px-6 py-12 text-center",
        className,
      )}
    >
      {icon ? <div className="mb-3 text-ink-400">{icon}</div> : null}
      <h3 className="text-base font-semibold text-ink-900">{title}</h3>
      {description ? <p className="mt-1 max-w-md text-sm leading-relaxed text-ink-600">{description}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx("animate-pulse rounded-md bg-ink-100", className)} aria-hidden="true" />;
}

export function DescriptionList({ items }: { items: { label: ReactNode; value: ReactNode; mono?: boolean }[] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
      {items.map((item, i) => (
        <div key={i} className="min-w-0">
          <dt className="text-xs font-medium text-ink-500">{item.label}</dt>
          <dd className={clsx("mt-0.5 text-sm break-words text-ink-900", item.mono && item.value && "font-mono")}>
            {item.value ?? <span className="text-ink-400">Not provided</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}
