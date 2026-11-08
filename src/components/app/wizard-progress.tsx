import Link from "next/link";
import { clsx } from "clsx";

export const WIZARD_STEPS = ["Problem type", "Transaction", "What happened", "Evidence", "Review"] as const;

export function WizardProgress({ current, maxReached, caseId }: { current: number; maxReached: number; caseId?: string }) {
  return (
    <nav aria-label="Report progress">
      <p className="mb-3 text-sm font-medium text-ink-700 sm:hidden">
        Step {current} of {WIZARD_STEPS.length}: {WIZARD_STEPS[current - 1]}
      </p>
      <ol className="flex gap-1.5 sm:gap-2">
        {WIZARD_STEPS.map((label, i) => {
          const step = i + 1;
          const done = step < current;
          const active = step === current;
          const reachable = caseId && step <= maxReached && !active;
          const content = (
            <>
              <span
                className={clsx(
                  "block h-1.5 rounded-full transition-colors",
                  active ? "bg-brand-600" : done || step <= maxReached ? "bg-brand-300" : "bg-ink-200",
                )}
              />
              <span className={clsx("mt-2 hidden text-xs sm:block", active ? "font-semibold text-ink-950" : "text-ink-500")}>
                <span className="font-mono">{String(step).padStart(2, "0")}</span> {label}
              </span>
            </>
          );
          return (
            <li key={label} className="flex-1" aria-current={active ? "step" : undefined}>
              {reachable ? (
                <Link href={`/cases/${caseId}/report?step=${step}`} className="block hover:opacity-80">
                  {content}
                </Link>
              ) : (
                content
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
