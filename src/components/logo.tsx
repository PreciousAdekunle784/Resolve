import Link from "next/link";
import { clsx } from "clsx";

/** The Resolve mark: an open path closing into a checkpoint. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={clsx("size-7", className)} aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="currentColor" />
      <path
        d="M10 22V11.5a1.5 1.5 0 011.5-1.5h5.25a4 4 0 010 8H13"
        stroke="white"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path d="M17 18l5 4" stroke="#7cc3c9" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ href = "/", tone = "dark" }: { href?: string; tone?: "dark" | "light" }) {
  return (
    <Link
      href={href}
      className={clsx(
        "inline-flex items-center gap-2 rounded-md text-[1.0625rem] font-semibold tracking-tight",
        tone === "dark" ? "text-ink-950" : "text-white",
      )}
      aria-label="Resolve home"
    >
      <LogoMark className={tone === "dark" ? "text-ink-950" : "text-brand-600"} />
      Resolve
    </Link>
  );
}
