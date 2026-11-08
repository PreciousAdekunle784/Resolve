import type { Metadata } from "next";
import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { safeNextPath } from "@/lib/auth-errors";
import { NotConfigured } from "@/components/not-configured";
import { isSupabaseConfigured } from "@/lib/env";
import { LoginForm } from "../auth-forms";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const next = safeNextPath(typeof sp.next === "string" ? sp.next : undefined);
  return (
    <div className="space-y-7">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-semibold text-ink-950">Sign in to Resolve</h1>
        <p className="text-sm text-ink-600">
          New here?{" "}
          <Link href={`/register?next=${encodeURIComponent(next)}`} className="font-medium text-brand-700 hover:underline">
            Create an account
          </Link>
        </p>
      </div>
      {!isSupabaseConfigured() ? <NotConfigured /> : null}
      {sp.signedOut ? <Alert tone="success">You have been signed out.</Alert> : null}
      {sp.deleted ? <Alert tone="success">Your account and all of its data have been permanently deleted.</Alert> : null}
      {sp.error === "link_invalid" ? (
        <Alert tone="error">That link is invalid or has expired. Please sign in, or request a new link.</Alert>
      ) : null}
      <LoginForm next={next} />
    </div>
  );
}
