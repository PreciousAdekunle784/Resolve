import { clsx } from "clsx";
import type { ComponentProps, ReactNode } from "react";

const control =
  "block w-full rounded-[var(--radius-control)] border bg-white px-3 text-sm text-ink-900 placeholder:text-ink-400 shadow-[var(--shadow-card)] transition-colors focus:outline-none focus:ring-2 focus:ring-brand-600/25 focus:border-brand-600 disabled:bg-ink-50 disabled:text-ink-500";

function controlClass(invalid?: boolean, extra?: string) {
  return clsx(control, invalid ? "border-danger-700" : "border-ink-200 hover:border-ink-300", extra);
}

export function Label({ className, children, ...props }: ComponentProps<"label">) {
  return (
    <label className={clsx("block text-sm font-medium text-ink-800", className)} {...props}>
      {children}
    </label>
  );
}

export function Input({ invalid, className, ...props }: ComponentProps<"input"> & { invalid?: boolean }) {
  return <input aria-invalid={invalid || undefined} className={controlClass(invalid, clsx("h-10", className))} {...props} />;
}

export function Textarea({ invalid, className, ...props }: ComponentProps<"textarea"> & { invalid?: boolean }) {
  return (
    <textarea
      aria-invalid={invalid || undefined}
      className={controlClass(invalid, clsx("min-h-28 py-2.5 leading-relaxed", className))}
      {...props}
    />
  );
}

export function Select({ invalid, className, children, ...props }: ComponentProps<"select"> & { invalid?: boolean }) {
  return (
    <select
      aria-invalid={invalid || undefined}
      className={controlClass(
        invalid,
        clsx(
          "h-10 appearance-none bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 20 20%22 fill=%22%2366758c%22><path fill-rule=%22evenodd%22 d=%22M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z%22 clip-rule=%22evenodd%22/></svg>')] bg-[length:1.25rem] bg-[right_0.6rem_center] bg-no-repeat pr-9",
          className,
        ),
      )}
      {...props}
    >
      {children}
    </select>
  );
}

export function FieldHint({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <p id={id} className="text-xs leading-relaxed text-ink-500">
      {children}
    </p>
  );
}

export function FieldError({ id, messages }: { id?: string; messages?: string[] | string }) {
  const list = typeof messages === "string" ? [messages] : messages;
  if (!list || list.length === 0) return null;
  return (
    <p id={id} className="text-xs font-medium text-danger-700" role="alert">
      {list[0]}
    </p>
  );
}

/** Label + control + hint + error, with correct aria wiring. */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  optional,
  children,
  className,
}: {
  label: ReactNode;
  htmlFor: string;
  hint?: ReactNode;
  error?: string[] | string;
  optional?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx("space-y-1.5", className)}>
      <Label htmlFor={htmlFor}>
        {label}
        {optional ? <span className="ml-1 font-normal text-ink-500">(optional)</span> : null}
      </Label>
      {children}
      {hint ? <FieldHint id={`${htmlFor}-hint`}>{hint}</FieldHint> : null}
      <FieldError id={`${htmlFor}-error`} messages={error} />
    </div>
  );
}

export function Checkbox({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      type="checkbox"
      className={clsx(
        "mt-0.5 size-4 shrink-0 rounded border-ink-300 text-brand-600 accent-brand-600 focus-visible:outline-2 focus-visible:outline-brand-600",
        className,
      )}
      {...props}
    />
  );
}
