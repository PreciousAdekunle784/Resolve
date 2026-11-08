"use client";

import Link from "next/link";
import { useState } from "react";
import { Logo } from "@/components/logo";
import { ButtonLink } from "@/components/ui/button";

const links = [
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#problems", label: "Problems" },
  { href: "/#ai", label: "AI" },
  { href: "/#privacy", label: "Security" },
  { href: "/guidance", label: "Guidance" },
  { href: "/#faq", label: "FAQ" },
];

function Arrow() {
  return (
    <svg className="size-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path fillRule="evenodd" d="M3 10a.75.75 0 01.75-.75h10.64l-4.22-4.22a.75.75 0 111.06-1.06l5.5 5.5a.75.75 0 010 1.06l-5.5 5.5a.75.75 0 11-1.06-1.06l4.22-4.22H3.75A.75.75 0 013 10z" clipRule="evenodd" />
    </svg>
  );
}

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  return (
    <header className="absolute inset-x-0 top-0 z-40">
      <div className="mx-auto flex h-20 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Logo tone="light" />
        <nav
          aria-label="Main"
          className="hidden items-center gap-0.5 rounded-full border border-white/10 bg-white/[0.04] p-1 backdrop-blur-md lg:flex"
        >
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="rounded-full px-3.5 py-1.5 text-[0.8125rem] text-ink-300 transition-colors hover:bg-white/10 hover:text-white"
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="hidden items-center gap-2 lg:flex">
          <Link href="/login" className="rounded-full px-3 py-2 text-sm font-medium text-ink-200 hover:text-white">
            Sign in
          </Link>
          <ButtonLink href="/register?next=/cases/new" variant="glass">
            Report a problem <Arrow />
          </ButtonLink>
        </div>
        <button
          type="button"
          className="inline-flex size-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white lg:hidden"
          aria-expanded={open}
          aria-controls="mobile-nav"
          onClick={() => setOpen((v) => !v)}
        >
          <span className="sr-only">{open ? "Close menu" : "Open menu"}</span>
          <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden="true">
            {open ? (
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
            )}
          </svg>
        </button>
      </div>
      {open ? (
        <nav id="mobile-nav" aria-label="Mobile" className="mx-4 rounded-2xl border border-white/10 bg-night-900/95 p-3 backdrop-blur-md lg:hidden">
          <div className="flex flex-col gap-1">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="rounded-xl px-3 py-2.5 text-sm font-medium text-ink-200 hover:bg-white/10 hover:text-white"
              >
                {l.label}
              </Link>
            ))}
            <div className="mt-2 grid grid-cols-2 gap-2 border-t border-white/10 pt-3">
              <ButtonLink href="/login" variant="glass">
                Sign in
              </ButtonLink>
              <ButtonLink href="/register?next=/cases/new" variant="glow">
                Report a problem
              </ButtonLink>
            </div>
          </div>
        </nav>
      ) : null}
    </header>
  );
}
