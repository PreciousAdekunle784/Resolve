"use client";

import Link from "next/link";
import { errorsFor, FormMessage } from "@/components/forms/form-message";
import { PasswordInput } from "@/components/forms/password-input";
import { useFormAction } from "@/components/forms/use-form-action";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, FieldError, Input } from "@/components/ui/field";
import { forgotPasswordAction, loginAction, registerAction, resetPasswordAction } from "./actions";

export function LoginForm({ next }: { next?: string }) {
  const { state, pending, onSubmit } = useFormAction(loginAction);
  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <input type="hidden" name="next" value={next ?? ""} />
      <FormMessage state={state} />
      <Field label="Email address" htmlFor="email" error={errorsFor(state, "email")}>
        <Input id="email" name="email" type="email" autoComplete="email" required invalid={!!errorsFor(state, "email")} />
      </Field>
      <Field label="Password" htmlFor="password" error={errorsFor(state, "password")}>
        <PasswordInput id="password" name="password" autoComplete="current-password" required invalid={!!errorsFor(state, "password")} />
      </Field>
      <div className="flex justify-end">
        <Link href="/forgot-password" className="text-sm font-medium text-brand-700 hover:underline">
          Forgot your password?
        </Link>
      </div>
      <Button type="submit" className="w-full" size="lg" loading={pending} loadingText="Signing in…">
        Sign in
      </Button>
    </form>
  );
}

export function RegisterForm({ next }: { next?: string }) {
  const { state, pending, onSubmit } = useFormAction(registerAction);
  if (state?.ok) {
    return (
      <div className="space-y-4">
        <FormMessage state={state} />
        <p className="text-sm text-ink-600">
          Didn&apos;t get the email? Check your spam folder, or{" "}
          <Link href="/register" className="font-medium text-brand-700 hover:underline">try again</Link>.
        </p>
      </div>
    );
  }
  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <input type="hidden" name="next" value={next ?? ""} />
      <FormMessage state={state} />
      <Field label="Full name" htmlFor="fullName" error={errorsFor(state, "fullName")}>
        <Input id="fullName" name="fullName" autoComplete="name" required invalid={!!errorsFor(state, "fullName")} />
      </Field>
      <Field label="Email address" htmlFor="email" error={errorsFor(state, "email")}>
        <Input id="email" name="email" type="email" autoComplete="email" required invalid={!!errorsFor(state, "email")} />
      </Field>
      <Field
        label="Password"
        htmlFor="password"
        hint="At least 10 characters, including a letter and a number."
        error={errorsFor(state, "password")}
      >
        <PasswordInput id="password" name="password" autoComplete="new-password" required invalid={!!errorsFor(state, "password")} />
      </Field>
      <div className="space-y-1.5">
        <label className="flex gap-3 text-sm leading-relaxed text-ink-700">
          <Checkbox name="acceptTerms" required />
          <span>
            I agree to the <Link href="/terms" target="_blank" className="font-medium text-brand-700 hover:underline">terms of use</Link> and
            have read the <Link href="/privacy" target="_blank" className="font-medium text-brand-700 hover:underline">privacy notice</Link>.
          </span>
        </label>
        <FieldError messages={errorsFor(state, "acceptTerms")} />
      </div>
      <Button type="submit" className="w-full" size="lg" loading={pending} loadingText="Creating account…">
        Create account
      </Button>
    </form>
  );
}

export function ForgotPasswordForm() {
  const { state, pending, onSubmit } = useFormAction(forgotPasswordAction);
  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <FormMessage state={state} />
      {state?.ok ? null : (
        <>
          <Field label="Email address" htmlFor="email" error={errorsFor(state, "email")}>
            <Input id="email" name="email" type="email" autoComplete="email" required invalid={!!errorsFor(state, "email")} />
          </Field>
          <Button type="submit" className="w-full" size="lg" loading={pending} loadingText="Sending…">
            Send reset link
          </Button>
        </>
      )}
    </form>
  );
}

export function ResetPasswordForm() {
  const { state, pending, onSubmit } = useFormAction(resetPasswordAction);
  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <FormMessage state={state} />
      <Field label="New password" htmlFor="password" hint="At least 10 characters, including a letter and a number." error={errorsFor(state, "password")}>
        <PasswordInput id="password" name="password" autoComplete="new-password" required invalid={!!errorsFor(state, "password")} />
      </Field>
      <Field label="Confirm new password" htmlFor="confirmPassword" error={errorsFor(state, "confirmPassword")}>
        <PasswordInput id="confirmPassword" name="confirmPassword" autoComplete="new-password" required invalid={!!errorsFor(state, "confirmPassword")} />
      </Field>
      <Button type="submit" className="w-full" size="lg" loading={pending} loadingText="Saving…">
        Update password
      </Button>
    </form>
  );
}
