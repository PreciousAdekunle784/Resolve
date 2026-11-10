import Link from "next/link";
import { Logo } from "@/components/logo";

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-white/[0.06] bg-night-950 text-ink-300">
      <div className="container-page grid gap-10 py-12 md:grid-cols-[1.4fr_1fr_1fr]">
        <div className="space-y-4">
          <Logo tone="light" />
          <p className="max-w-sm text-sm leading-relaxed text-ink-400">
            An independent assistant that helps you understand transaction problems, organise evidence and prepare
            complaints for your financial institution.
          </p>
        </div>
        <nav aria-label="Product" className="space-y-3 text-sm">
          <p className="font-semibold text-white">Product</p>
          <ul className="space-y-2">
            <li><Link className="transition-colors hover:text-white" href="/#how-it-works">How it works</Link></li>
            <li><Link className="transition-colors hover:text-white" href="/#problems">Problems we cover</Link></li>
            <li><Link className="transition-colors hover:text-white" href="/guidance">Official guidance</Link></li>
            <li><Link className="transition-colors hover:text-white" href="/register?next=/cases/new">Report a problem</Link></li>
          </ul>
        </nav>
        <nav aria-label="Legal" className="space-y-3 text-sm">
          <p className="font-semibold text-white">Trust</p>
          <ul className="space-y-2">
            <li><Link className="transition-colors hover:text-white" href="/privacy">Privacy notice</Link></li>
            <li><Link className="transition-colors hover:text-white" href="/terms">Terms of use</Link></li>
            <li><Link className="transition-colors hover:text-white" href="/#privacy">Security</Link></li>
            <li><Link className="transition-colors hover:text-white" href="/login">Sign in</Link></li>
          </ul>
        </nav>
      </div>
      <div className="border-t border-white/10">
        <div className="container-page space-y-2 py-6 text-xs leading-relaxed text-ink-400">
          <p>
            <strong className="font-semibold text-ink-300">Important:</strong> Resolve is an independent assistance
            service. It is not a bank, financial institution, regulator, law firm or an official service of the Central
            Bank of Nigeria (CBN). Resolve does not reverse transactions, does not submit complaints on your behalf, and
            cannot guarantee that you will recover any money. Nothing on Resolve is legal or financial advice.
          </p>
          <p>Resolve will never ask for your PIN, OTP, internet banking password, BVN, NIN or full card number.</p>
          <p>© {new Date().getFullYear()} Resolve.</p>
        </div>
      </div>
    </footer>
  );
}
