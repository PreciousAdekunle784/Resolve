import { clsx } from "clsx";
import type { ReactNode } from "react";
import { bankInitials, fallbackColour, findBank } from "@/lib/banks";

const SIZES = {
  xs: "size-5 rounded-md text-[0.5rem]",
  sm: "size-7 rounded-lg text-[0.6rem]",
  md: "size-9 rounded-xl text-[0.7rem]",
  lg: "size-11 rounded-xl text-xs",
} as const;

const PX = { xs: 20, sm: 28, md: 36, lg: 44 } as const;

/**
 * The official logo of the bank named `name`, or a fallback badge with its
 * initials (or a neutral bank icon) when no logo is available. Decorative:
 * the bank name is always shown next to it, so the image has empty alt text.
 */
export function BankLogo({
  name,
  size = "md",
  className,
}: {
  name: string | null | undefined;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const bank = findBank(name);
  if (bank?.logo) {
    return (
      <span
        className={clsx(
          "inline-flex shrink-0 items-center justify-center overflow-hidden border border-ink-200 bg-white p-[3px]",
          SIZES[size],
          className,
        )}
        aria-hidden="true"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- tiny pre-optimised static PNGs; next/image adds no benefit here */}
        <img src={bank.logo} alt="" width={PX[size]} height={PX[size]} loading="lazy" decoding="async" className="size-full object-contain" />
      </span>
    );
  }

  const initials = bankInitials(bank?.name ?? name);
  return (
    <span
      className={clsx(
        "inline-flex shrink-0 items-center justify-center font-semibold text-white",
        SIZES[size],
        initials ? fallbackColour(bank?.name ?? name) : "bg-ink-100 text-ink-500",
        className,
      )}
      aria-hidden="true"
    >
      {initials || (
        <svg className="size-1/2" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0012 9.75c-2.551 0-5.056.2-7.5.582V21M3 21h18M12 6.75h.008v.008H12V6.75z" />
        </svg>
      )}
    </span>
  );
}

/** A bank's logo followed by its name, aligned on one line. */
export function BankName({
  name,
  size = "sm",
  className,
  children,
}: {
  name: string | null | undefined;
  size?: keyof typeof SIZES;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <span className={clsx("inline-flex min-w-0 items-center gap-2.5", className)}>
      <BankLogo name={name} size={size} />
      <span className="min-w-0 break-words">{children ?? name}</span>
    </span>
  );
}
