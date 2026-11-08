import Link from "next/link";
import { clsx } from "clsx";

/** The Resolve mark: a blue tile with an "R" whose leg resolves into a check. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={clsx("size-7", className)} aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="#2563eb" />
      <rect width="32" height="16" rx="8" fill="#3b82f6" opacity="0.55" />
      <rect y="8" width="32" height="8" fill="#3b82f6" opacity="0.55" />
      <path
        d="M11 23V9.5h5.75a4.25 4.25 0 010 8.5H11"
        stroke="white"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path d="M16.5 18.5l2.25 2.5 4.25-5" stroke="#bfdbfe" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

export function Logo({ href = "/", tone = "dark" }: { href?: string; tone?: "dark" | "light" }) {
  return (
    <Link
      href={href}
      className={clsx(
        "inline-flex items-center gap-2.5 rounded-md text-[1.0625rem] font-semibold tracking-tight",
        tone === "dark" ? "text-ink-950" : "text-white",
      )}
      aria-label="Resolve home"
    >
      <LogoMark />
      Resolve
    </Link>
  );
}
