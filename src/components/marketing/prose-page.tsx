import type { ReactNode } from "react";
import { clsx } from "clsx";

/** Dark title band (matching the landing page) above a light reading panel. */
export function MarketingPageShell({
  eyebrow,
  title,
  intro,
  children,
  wide = false,
}: {
  eyebrow?: string;
  title: string;
  intro?: ReactNode;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="relative isolate overflow-hidden pt-36 pb-20">
      <div className="star-field absolute inset-0 -z-10 bg-[length:520px_420px]" aria-hidden="true" />
      <div className="light-beam -left-[14%] -z-10 h-[60%]! origin-top-left -rotate-[28deg] opacity-60! [clip-path:polygon(18%_0,46%_0,100%_100%,28%_100%)]" aria-hidden="true" />
      <div className="light-beam -right-[14%] -z-10 h-[60%]! origin-top-right rotate-[28deg] opacity-60! [clip-path:polygon(54%_0,82%_0,72%_100%,0_100%)]" aria-hidden="true" />
      <div className={clsx("mx-auto px-4 sm:px-6", wide ? "max-w-4xl" : "max-w-3xl")}>
        {eyebrow ? <p className="text-xs font-medium tracking-wider text-brand-300 uppercase">{eyebrow}</p> : null}
        <h1 className="mt-2 text-4xl font-light tracking-tight text-white sm:text-5xl">{title}</h1>
        {intro ? <div className="mt-4 max-w-2xl leading-relaxed text-ink-400">{intro}</div> : null}
        <div className="mt-10 rounded-3xl bg-white p-6 text-ink-900 shadow-[0_30px_80px_-30px_rgb(37_99_235/0.45)] sm:p-10">{children}</div>
      </div>
    </div>
  );
}

export function ProsePage({ title, intro, children }: { title: string; intro?: ReactNode; children: ReactNode }) {
  return (
    <MarketingPageShell title={title} intro={intro}>
      <div className="space-y-6 text-[0.9375rem] leading-relaxed text-ink-700 [&_h2]:mt-10 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-ink-950 [&_li]:ml-5 [&_li]:list-disc [&_li]:pl-1 [&_ul]:space-y-1.5">
        {children}
      </div>
    </MarketingPageShell>
  );
}
