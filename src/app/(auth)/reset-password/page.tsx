import type { Metadata } from "next";
import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { getCurrentUser } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/env";
import { ResetPasswordForm } from "../auth-forms";

// Always render per request (reads the database / session).
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage() {
  const user = isSupabaseConfigured() ? await getCurrentUser() : null;
  return (
    <div className="space-y-7">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-semibold text-ink-950">Choose a new password</h1>
        <p className="text-sm text-ink-600">Use a password you don&apos;t use anywhere else.</p>
      </div>
      {user ? (
        <ResetPasswordForm />
      ) : (
        <Alert
          tone="error"
          title="Reset link needed"
          action={
            <Link href="/forgot-password" className="text-sm font-medium text-brand-700 hover:underline">
              Request a new reset link
            </Link>
          }
        >
          Open the password reset link from your email to continue. Links expire after a short time.
        </Alert>
      )}
    </div>
  );
}
