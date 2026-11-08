import type { ReactNode } from "react";

export function ProsePage({ title, intro, children }: { title: string; intro?: ReactNode; children: ReactNode }) {
  return (
    <div className="container-page max-w-3xl py-14">
      <h1 className="text-3xl font-semibold text-ink-950">{title}</h1>
      {intro ? <div className="mt-3 text-ink-600">{intro}</div> : null}
      <div className="mt-8 space-y-6 text-[0.9375rem] leading-relaxed text-ink-700 [&_h2]:mt-10 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-ink-950 [&_li]:ml-5 [&_li]:list-disc [&_li]:pl-1 [&_ul]:space-y-1.5">
        {children}
      </div>
    </div>
  );
}
