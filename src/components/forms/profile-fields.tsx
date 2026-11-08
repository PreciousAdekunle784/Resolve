"use client";

import { useState } from "react";
import { Field, Input, Select } from "@/components/ui/field";
import { CONTACT_METHOD_LABELS, CONTACT_METHODS, COUNTRIES } from "@/lib/constants";
import type { ActionResult, Profile } from "@/lib/types";
import { errorsFor } from "./form-message";

/** Profile fields shared by onboarding and settings. */
export function ProfileFields({
  profile,
  state,
}: {
  profile: Pick<Profile, "full_name" | "email" | "phone" | "country" | "account_type" | "business_name" | "preferred_contact_method">;
  state: ActionResult | null;
}) {
  const [accountType, setAccountType] = useState(profile.account_type ?? "individual");
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <Field label="Full name" htmlFor="fullName" error={errorsFor(state, "fullName")} className="sm:col-span-2">
        <Input id="fullName" name="fullName" autoComplete="name" defaultValue={profile.full_name ?? ""} required invalid={!!errorsFor(state, "fullName")} />
      </Field>
      <Field label="Email address" htmlFor="email" hint="This is your sign-in email.">
        <Input id="email" value={profile.email} disabled readOnly />
      </Field>
      <Field label="Phone number" htmlFor="phone" optional error={errorsFor(state, "phone")} hint="Include your country code, e.g. +234.">
        <Input id="phone" name="phone" type="tel" autoComplete="tel" defaultValue={profile.phone ?? ""} invalid={!!errorsFor(state, "phone")} />
      </Field>
      <Field label="Country" htmlFor="country" error={errorsFor(state, "country")} hint="Official guidance in Resolve currently covers Nigeria.">
        <Select id="country" name="country" defaultValue={profile.country || "NG"}>
          {COUNTRIES.map((c) => (
            <option key={c.code} value={c.code}>{c.name}</option>
          ))}
        </Select>
      </Field>
      <Field label="Preferred contact method" htmlFor="preferredContactMethod" error={errorsFor(state, "preferredContactMethod")} hint="Included in your complaint so your institution knows how to reach you.">
        <Select id="preferredContactMethod" name="preferredContactMethod" defaultValue={profile.preferred_contact_method || "email"}>
          {CONTACT_METHODS.map((m) => (
            <option key={m} value={m}>{CONTACT_METHOD_LABELS[m]}</option>
          ))}
        </Select>
      </Field>
      <fieldset className="space-y-2 sm:col-span-2">
        <legend className="text-sm font-medium text-ink-800">Account type</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {(
            [
              ["individual", "Individual", "A personal bank or wallet account."],
              ["business", "Business", "A business or company account."],
            ] as const
          ).map(([value, label, desc]) => (
            <label
              key={value}
              className="flex cursor-pointer gap-3 rounded-[var(--radius-control)] border border-ink-200 bg-white p-3.5 transition-colors has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50 hover:border-ink-300"
            >
              <input
                type="radio"
                name="accountType"
                value={value}
                checked={accountType === value}
                onChange={() => setAccountType(value)}
                className="mt-0.5 accent-brand-600"
              />
              <span>
                <span className="block text-sm font-medium text-ink-900">{label}</span>
                <span className="block text-xs text-ink-600">{desc}</span>
              </span>
            </label>
          ))}
        </div>
        {errorsFor(state, "accountType") ? <p className="text-xs font-medium text-danger-700">{errorsFor(state, "accountType")![0]}</p> : null}
      </fieldset>
      {accountType === "business" ? (
        <Field label="Business name" htmlFor="businessName" optional error={errorsFor(state, "businessName")} className="sm:col-span-2">
          <Input id="businessName" name="businessName" autoComplete="organization" defaultValue={profile.business_name ?? ""} />
        </Field>
      ) : null}
    </div>
  );
}
