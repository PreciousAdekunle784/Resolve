import { clsx } from "clsx";
import type { ComponentProps, ReactNode } from "react";

export function Card({ className, children, ...props }: ComponentProps<"section">) {
  return (
    <section
      className={clsx(
        "rounded-[var(--radius-card)] border border-ink-200 bg-white shadow-[var(--shadow-card)]",
        className,
      )}
      {...props}
    >
      {children}
    </section>
  );
}

export function CardHeader({
  title,
  description,
  action,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx("flex flex-wrap items-start justify-between gap-3 border-b border-ink-100 px-5 py-4", className)}>
      <div className="min-w-0 space-y-0.5">
        <h2 className="text-base font-semibold text-ink-900">{title}</h2>
        {description ? <p className="text-sm text-ink-600">{description}</p> : null}
      </div>
      {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
    </div>
  );
}

export function CardBody({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={clsx("px-5 py-4", className)}>{children}</div>;
}
