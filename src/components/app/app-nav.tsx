"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { clsx } from "clsx";
import { LogoMark } from "@/components/logo";
import { signOutAction } from "@/app/(auth)/actions";

type NavItem = { href: string; label: string; icon: string; exact?: boolean };
type NavGroup = { title: string; items: NavItem[] };

const ICONS = {
  home: "M2.25 12l8.954-8.955a1.126 1.126 0 011.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25",
  cases: "M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z",
  report: "M12 9v6m3-3H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z",
  guidance: "M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25",
  settings: "M10.343 3.94c.09-.542.56-.94 1.11-.94h1.093c.55 0 1.02.398 1.11.94l.149.894c.07.424.384.764.78.93.398.164.855.142 1.205-.108l.737-.527a1.125 1.125 0 011.45.12l.773.774c.39.389.44 1.002.12 1.45l-.527.737c-.25.35-.272.806-.107 1.204.165.397.505.71.93.78l.893.15c.543.09.94.559.94 1.109v1.094c0 .55-.397 1.02-.94 1.11l-.894.149c-.424.07-.764.383-.929.78-.165.398-.143.854.107 1.204l.527.738c.32.447.269 1.06-.12 1.45l-.774.773a1.125 1.125 0 01-1.449.12l-.738-.527c-.35-.25-.806-.272-1.203-.107-.398.165-.71.505-.781.929l-.149.894c-.09.542-.56.94-1.11.94h-1.094c-.55 0-1.019-.398-1.11-.94l-.148-.894c-.071-.424-.384-.764-.781-.93-.398-.164-.854-.142-1.204.108l-.738.527c-.447.32-1.06.269-1.45-.12l-.773-.774a1.125 1.125 0 01-.12-1.45l.527-.737c.25-.35.272-.806.108-1.204-.165-.397-.506-.71-.93-.78l-.894-.15c-.542-.09-.94-.56-.94-1.109v-1.094c0-.55.398-1.02.94-1.11l.894-.149c.424-.07.765-.383.93-.78.165-.398.143-.854-.108-1.204l-.526-.738a1.125 1.125 0 01.12-1.45l.773-.773a1.125 1.125 0 011.45-.12l.737.527c.35.25.807.272 1.204.107.397-.165.71-.505.78-.929l.15-.894zM15 12a3 3 0 11-6 0 3 3 0 016 0z",
  admin: "M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z",
};

function groups(isAdmin: boolean): NavGroup[] {
  return [
    {
      title: "Cases",
      items: [
        { href: "/dashboard", label: "Home", icon: ICONS.home },
        { href: "/cases", label: "My cases", icon: ICONS.cases, exact: true },
        { href: "/cases/new", label: "Report a problem", icon: ICONS.report },
      ],
    },
    { title: "Help", items: [{ href: "/help/guidance", label: "Official guidance", icon: ICONS.guidance }] },
    {
      title: "Account",
      items: [
        { href: "/settings", label: "Settings", icon: ICONS.settings },
        ...(isAdmin
          ? [
              { href: "/admin/guidance", label: "Admin: guidance", icon: ICONS.admin },
              { href: "/admin/bank-channels", label: "Admin: bank contacts", icon: ICONS.admin },
            ]
          : []),
      ],
    },
  ];
}

function isActive(pathname: string, item: NavItem) {
  if (item.href === "/cases") {
    // "My cases" covers case pages, but not the "Report a problem" page.
    return pathname === "/cases" || (pathname.startsWith("/cases/") && !pathname.startsWith("/cases/new"));
  }
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function Icon({ d, className }: { d: string; className?: string }) {
  return (
    <svg className={clsx("size-[1.15rem] shrink-0", className)} fill="none" viewBox="0 0 24 24" strokeWidth={1.6} stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
  );
}

function NavGroups({ isAdmin, collapsed, onNavigate }: { isAdmin: boolean; collapsed: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <div className="space-y-6">
      {groups(isAdmin).map((g) => (
        <div key={g.title}>
          <p className={clsx("mb-1.5 px-3 text-[0.6875rem] font-medium tracking-wider text-ink-500 uppercase", collapsed && "sr-only")}>{g.title}</p>
          <ul className="space-y-0.5">
            {g.items.map((item) => {
              const active = isActive(pathname, item);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    title={collapsed ? item.label : undefined}
                    className={clsx(
                      "flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors",
                      collapsed && "justify-center px-0",
                      active ? "bg-ink-100 font-medium text-ink-950" : "text-ink-600 hover:bg-ink-50 hover:text-ink-900",
                    )}
                  >
                    <Icon d={item.icon} className={active ? "text-ink-900" : "text-ink-500"} />
                    <span className={clsx(collapsed && "sr-only")}>{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

function UserBlock({ name, email, collapsed }: { name: string; email: string; collapsed: boolean }) {
  return (
    <div className="space-y-1 border-t border-ink-200 pt-4">
      <div className={clsx("flex items-center gap-3 px-2", collapsed && "justify-center px-0")}>
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-ink-900 text-xs font-semibold text-white" aria-hidden="true">
          {initials(name) || "R"}
        </span>
        <div className={clsx("min-w-0", collapsed && "sr-only")}>
          <p className="truncate text-sm font-medium text-ink-900">{name}</p>
          <p className="truncate text-xs text-ink-500">{email}</p>
        </div>
      </div>
      <form action={signOutAction}>
        <button
          type="submit"
          title={collapsed ? "Sign out" : undefined}
          className={clsx(
            "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-ink-600 hover:bg-ink-50 hover:text-ink-900",
            collapsed && "justify-center px-0",
          )}
        >
          <Icon d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" className="text-ink-500" />
          <span className={clsx(collapsed && "sr-only")}>Sign out</span>
        </button>
      </form>
    </div>
  );
}

function SearchBox({ className }: { className?: string }) {
  return (
    <form action="/cases" role="search" className={clsx("relative", className)}>
      <label htmlFor="global-search" className="sr-only">Search your cases</label>
      <svg className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
      </svg>
      <input
        id="global-search"
        name="q"
        type="search"
        placeholder="Search cases, banks or references…"
        maxLength={60}
        className="h-10 w-full rounded-full border border-ink-200 bg-white pr-4 pl-10 text-sm text-ink-900 placeholder:text-ink-500 focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20 focus:outline-none"
      />
    </form>
  );
}

const STORAGE_KEY = "resolve.sidebar.collapsed";

/** Signed-in layout: light sidebar with grouped sections, a collapse toggle, and a top search bar. */
export function AppShell({
  name,
  email,
  isAdmin,
  children,
}: {
  name: string;
  email: string;
  isAdmin: boolean;
  children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Restore the viewer's preference (a per-device convenience only).
  useEffect(() => {
    try {
      if (window.localStorage.getItem(STORAGE_KEY) === "1") {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- reading browser storage after hydration
        setCollapsed(true);
      }
    } catch {
      /* storage unavailable — keep the default */
    }
  }, []);

  const toggle = () => {
    setCollapsed((c) => {
      try {
        window.localStorage.setItem(STORAGE_KEY, c ? "0" : "1");
      } catch {
        /* ignore */
      }
      return !c;
    });
  };

  return (
    <div className="min-h-screen bg-ink-50">
      {/* Desktop sidebar */}
      <aside
        className={clsx(
          "fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-ink-200 bg-white px-3 py-5 transition-[width] duration-200 lg:flex",
          collapsed ? "w-[76px]" : "w-64",
        )}
      >
        <div className={clsx("flex items-center gap-2", collapsed ? "flex-col" : "justify-between px-2")}>
          <Link href="/dashboard" className="inline-flex items-center gap-2.5 text-[1.0625rem] font-semibold tracking-tight text-ink-950" aria-label="Resolve home">
            <LogoMark />
            <span className={clsx(collapsed && "sr-only")}>Resolve</span>
          </Link>
          <button
            type="button"
            onClick={toggle}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-pressed={collapsed}
            className="inline-flex size-8 items-center justify-center rounded-full border border-ink-200 text-ink-600 hover:bg-ink-50 hover:text-ink-900"
          >
            <svg className={clsx("size-4 transition-transform", collapsed && "rotate-180")} fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 4.5v15M19.5 12h-11m0 0l4-4m-4 4l4 4" />
            </svg>
          </button>
        </div>
        <nav aria-label="App" className="mt-8 flex-1 overflow-y-auto">
          <NavGroups isAdmin={isAdmin} collapsed={collapsed} />
        </nav>
        <UserBlock name={name} email={email} collapsed={collapsed} />
      </aside>

      {/* Mobile top bar */}
      <div className="sticky top-0 z-30 border-b border-ink-200 bg-white/95 backdrop-blur lg:hidden">
        <div className="flex h-14 items-center justify-between px-4">
          <Link href="/dashboard" className="inline-flex items-center gap-2 font-semibold text-ink-950" aria-label="Resolve home">
            <LogoMark className="size-6" /> Resolve
          </Link>
          <div className="flex items-center gap-1.5">
            <Link href="/cases/new" className="rounded-full bg-brand-600 px-3.5 py-1.5 text-sm font-medium text-white">
              Report
            </Link>
            <button
              type="button"
              onClick={() => setMobileOpen((v) => !v)}
              aria-expanded={mobileOpen}
              aria-controls="app-mobile-nav"
              className="inline-flex size-10 items-center justify-center rounded-full text-ink-800 hover:bg-ink-100"
            >
              <span className="sr-only">{mobileOpen ? "Close menu" : "Open menu"}</span>
              <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden="true">
                {mobileOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                )}
              </svg>
            </button>
          </div>
        </div>
        {mobileOpen ? (
          <nav id="app-mobile-nav" aria-label="App" className="space-y-5 border-t border-ink-200 px-3 pt-4 pb-4">
            <SearchBox className="px-1" />
            <NavGroups isAdmin={isAdmin} collapsed={false} onNavigate={() => setMobileOpen(false)} />
            <UserBlock name={name} email={email} collapsed={false} />
          </nav>
        ) : null}
      </div>

      <div className={clsx("transition-[padding] duration-200", collapsed ? "lg:pl-[76px]" : "lg:pl-64")}>
        {/* Desktop top bar */}
        <div className="sticky top-0 z-20 hidden h-16 items-center justify-end gap-3 border-b border-ink-200/70 bg-ink-50/85 px-8 backdrop-blur lg:flex">
          <SearchBox className="w-80" />
        </div>
        <main id="main" className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
