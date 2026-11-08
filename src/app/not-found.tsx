import { ButtonLink } from "@/components/ui/button";
import { Logo } from "@/components/logo";

export default function NotFound() {
  return (
    <main id="main" className="flex min-h-screen flex-col items-center justify-center gap-6 bg-ink-50 px-4 text-center">
      <Logo />
      <div className="space-y-2">
        <p className="font-mono text-sm text-ink-500">404</p>
        <h1 className="text-2xl font-semibold text-ink-950">We couldn&apos;t find that page</h1>
        <p className="max-w-md text-sm text-ink-600">
          The page may have moved, or the case may not exist or belong to a different account.
        </p>
      </div>
      <div className="flex gap-2">
        <ButtonLink href="/dashboard">Go to dashboard</ButtonLink>
        <ButtonLink href="/" variant="secondary">Home</ButtonLink>
      </div>
    </main>
  );
}
