import { Alert } from "@/components/ui/alert";

export function NotConfigured() {
  return (
    <Alert tone="warning" title="Setup needed">
      Resolve isn&apos;t connected to Supabase yet. Add your Supabase URL and key to <code>.env.local</code> — see the
      README for step-by-step instructions.
    </Alert>
  );
}
