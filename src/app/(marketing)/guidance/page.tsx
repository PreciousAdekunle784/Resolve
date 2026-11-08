import type { Metadata } from "next";
import { GuidanceCard } from "@/components/guidance-card";
import { MarketingPageShell } from "@/components/marketing/prose-page";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/misc";
import { isSupabaseConfigured } from "@/lib/env";
import { getRelevantGuidance } from "@/lib/guidance";
import { createClient } from "@/lib/supabase/server";
import type { GuidanceRow } from "@/lib/types";

// Always render per request (reads the database / session).
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Official complaint guidance" };

export default async function GuidancePage() {
  let rows: GuidanceRow[] = [];
  let error: string | null = null;
  if (!isSupabaseConfigured()) {
    error = "Resolve is not connected to its database yet, so guidance cannot be shown.";
  } else {
    try {
      rows = await getRelevantGuidance(await createClient(), { country: "NG" });
    } catch {
      error = "We couldn't load official guidance right now. Please try again shortly.";
    }
  }

  return (
    <MarketingPageShell
      wide
      eyebrow="Nigeria"
      title="Official complaint guidance"
      intro="Links to official sources about complaining to financial institutions and escalating complaints. Each entry shows whether Resolve has verified it and when. Official processes and timelines vary and can change, so always confirm with the official source."
    >
      <Alert tone="info" title="Start with your financial institution">
        Your bank or payment provider holds the records of your transaction and is usually best placed to investigate
        it first. Keep any complaint reference number they give you.
      </Alert>

      <div className="mt-6 space-y-4">
        {error ? (
          <Alert tone="error">{error}</Alert>
        ) : rows.length === 0 ? (
          <EmptyState title="No guidance published yet" description="Official guidance records will appear here once they are added." />
        ) : (
          rows.map((g) => <GuidanceCard key={g.id} g={g} />)
        )}
      </div>
    </MarketingPageShell>
  );
}
