import Link from "next/link";
import { clsx } from "clsx";
import type { ComponentProps, ReactNode } from "react";
import { Spinner } from "./spinner";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "dark" | "glow" | "glass";
type Size = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 rounded-full font-medium whitespace-nowrap transition-[color,background-color,border-color,box-shadow,scale] duration-200 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2";

const variants: Record<Variant, string> = {
  primary:
    "bg-brand-600 text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.18),0_1px_2px_rgb(37_99_235/0.3)] hover:bg-brand-700 active:bg-brand-800 focus-visible:outline-brand-600",
  secondary:
    "bg-white text-ink-900 border border-ink-200 hover:bg-ink-50 hover:border-ink-300 active:bg-ink-100 focus-visible:outline-brand-600",
  ghost: "text-ink-700 hover:bg-ink-100 hover:text-ink-900 focus-visible:outline-brand-600",
  danger: "bg-danger-700 text-white hover:bg-danger-600 focus-visible:outline-danger-700",
  dark: "bg-white text-ink-950 hover:bg-ink-100 focus-visible:outline-white",
  glow: "bg-linear-to-b from-brand-500 to-brand-600 text-white shadow-[0_0_0_1px_rgb(96_165_250/0.5),0_8px_32px_-4px_rgb(59_130_246/0.7)] hover:from-brand-400 hover:to-brand-500 hover:shadow-[0_0_0_1px_rgb(147_197_253/0.7),0_10px_40px_-2px_rgb(59_130_246/0.9)] active:scale-[0.98] focus-visible:outline-white",
  glass: "border border-white/15 bg-white/[0.06] text-white backdrop-blur hover:border-white/25 hover:bg-white/[0.12] active:scale-[0.98] focus-visible:outline-white",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-sm",
  md: "h-10 px-4.5 text-sm",
  lg: "h-12 px-6 text-base",
};

export function buttonClasses({
  variant = "primary",
  size = "md",
  className,
}: { variant?: Variant; size?: Size; className?: string } = {}) {
  return clsx(base, variants[variant], sizes[size], className);
}

type ButtonProps = ComponentProps<"button"> & {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  loadingText?: string;
  icon?: ReactNode;
};

export function Button({
  variant,
  size,
  loading = false,
  loadingText,
  icon,
  className,
  children,
  disabled,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClasses({ variant, size, className })}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Spinner className="size-4" /> : icon}
      {loading && loadingText ? loadingText : children}
    </button>
  );
}

type ButtonLinkProps = ComponentProps<typeof Link> & { variant?: Variant; size?: Size; icon?: ReactNode };

export function ButtonLink({ variant, size, icon, className, children, ...props }: ButtonLinkProps) {
  return (
    <Link className={buttonClasses({ variant, size, className })} {...props}>
      {icon}
      {children}
    </Link>
  );
}
