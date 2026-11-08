import type { Metadata } from "next";
import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { ForgotPasswordForm } from "../auth-forms";

export const metadata: Metadata = { title: "Reset your password" };

export default async function ForgotPasswordPage({ searchParams }: PageProps<"/forgot-password">) {
  const sp = await searchParams;
  return (
    <div className="space-y-7">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-semibold text-ink-950">Reset your password</h1>
        <p className="text-sm text-ink-600">Enter your email and we&apos;ll send you a link to choose a new password.</p>
      </div>
      {sp.error === "link_invalid" ? (
        <Alert tone="error">That reset link is invalid or has expired. Request a new one below.</Alert>
      ) : null}
      <ForgotPasswordForm />
      <p className="text-sm text-ink-600">
        Remembered it?{" "}
        <Link href="/login" className="font-medium text-brand-700 hover:underline">Back to sign in</Link>
      </p>
    </div>
  );
}
