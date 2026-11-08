import type { Metadata } from "next";
import Link from "next/link";
import { safeNextPath } from "@/lib/auth-errors";
import { isSupabaseConfigured } from "@/lib/env";
import { SENSITIVE_DATA_WARNING } from "@/lib/constants";
import { RegisterForm } from "../auth-forms";
import { NotConfigured } from "@/components/not-configured";

export const metadata: Metadata = { title: "Create your account" };

export default async function RegisterPage({ searchParams }: PageProps<"/register">) {
  const sp = await searchParams;
  const next = safeNextPath(typeof sp.next === "string" ? sp.next : undefined, "/onboarding");
  return (
    <div className="space-y-7">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-semibold text-ink-950">Create your Resolve account</h1>
        <p className="text-sm text-ink-600">
          Already have one?{" "}
          <Link href={`/login?next=${encodeURIComponent(next)}`} className="font-medium text-brand-700 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
      {!isSupabaseConfigured() ? <NotConfigured /> : null}
      <RegisterForm next={next} />
      <p className="text-xs leading-relaxed text-ink-500">{SENSITIVE_DATA_WARNING}</p>
    </div>
  );
}
