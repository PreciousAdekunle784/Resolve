import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Logo } from "@/components/logo";
import { Alert } from "@/components/ui/alert";
import { getProfile, requireUser } from "@/lib/auth";
import { SENSITIVE_DATA_WARNING } from "@/lib/constants";
import { OnboardingForm } from "./onboarding-form";

export const metadata: Metadata = { title: "Set up your account" };

export default async function OnboardingPage({ searchParams }: PageProps<"/onboarding">) {
  const user = await requireUser("/onboarding");
  const profile = await getProfile(user.id);
  const sp = await searchParams;
  if (!profile) {
    return (
      <div className="container-page max-w-2xl py-16">
        <Alert tone="error" title="We couldn't find your profile">
          Your account was created, but its profile record is missing. Please sign out and sign in again, or contact
          support if this continues.
        </Alert>
      </div>
    );
  }
  if (profile.onboarding_completed_at) redirect("/dashboard");

  return (
    <div className="min-h-screen bg-ink-50">
      <header className="border-b border-ink-200 bg-white">
        <div className="container-page flex h-16 items-center">
          <Logo href="/onboarding" />
        </div>
      </header>
      <main id="main" className="container-page max-w-2xl py-10 sm:py-14">
        <p className="font-mono text-xs text-brand-700">Step 1 of 1 · About you</p>
        <h1 className="mt-2 text-2xl font-semibold text-ink-950 sm:text-3xl">Welcome to Resolve</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-600">
          We only ask for what&apos;s needed to prepare your complaints. {SENSITIVE_DATA_WARNING}
        </p>
        <div className="mt-8 rounded-[var(--radius-card)] border border-ink-200 bg-white p-5 shadow-[var(--shadow-card)] sm:p-8">
          <OnboardingForm profile={profile} next={typeof sp.next === "string" ? sp.next : undefined} />
        </div>
      </main>
    </div>
  );
}
