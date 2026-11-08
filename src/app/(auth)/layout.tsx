import Link from "next/link";
import { Logo } from "@/components/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <aside className="relative isolate hidden flex-col justify-between overflow-hidden bg-night-950 p-10 text-white lg:flex">
        <div className="star-field absolute inset-0 -z-10 bg-[length:420px_360px]" aria-hidden="true" />
        <div className="light-beam -left-[30%] -z-10 w-[90%]! origin-top-left -rotate-[24deg] [clip-path:polygon(18%_0,46%_0,100%_100%,28%_100%)]" aria-hidden="true" />
        <div className="horizon -z-10 top-[72%] h-[1100px]! w-[1100px]!" aria-hidden="true" />
        <Logo tone="light" />
        <div className="relative max-w-md space-y-6">
          <p className="text-4xl leading-tight font-light tracking-tight">Understand what happened. Know what to do next.</p>
          <ul className="space-y-3 text-sm text-ink-300">
            <li className="flex gap-3"><Dot /> Organise your evidence in one private place</li>
            <li className="flex gap-3"><Dot /> Get a clear, careful analysis of your case</li>
            <li className="flex gap-3"><Dot /> Prepare a complete complaint and track every response</li>
          </ul>
        </div>
        <p className="relative max-w-md text-xs leading-relaxed text-ink-400">
          Resolve is independent. It is not a bank, regulator or official CBN service, and it will never ask for your
          PIN, OTP, password, BVN or NIN.
        </p>
      </aside>
      <main id="main" className="flex flex-col bg-white">
        <div className="flex h-16 items-center px-6 lg:hidden">
          <Logo />
        </div>
        <div className="flex flex-1 items-center justify-center px-4 py-10 sm:px-6">
          <div className="w-full max-w-sm animate-fade-in">{children}</div>
        </div>
        <footer className="px-6 py-4 text-center text-xs text-ink-500">
          <Link href="/privacy" className="hover:text-ink-800">Privacy</Link>
          <span className="mx-2">·</span>
          <Link href="/terms" className="hover:text-ink-800">Terms</Link>
        </footer>
      </main>
    </div>
  );
}

function Dot() {
  return <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand-300" aria-hidden="true" />;
}
