import type { Metadata } from "next";
import { GuidanceCard } from "@/components/guidance-card";
import { Alert } from "@/components/ui/alert";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { requireOnboardedUser } from "@/lib/auth";
import { COUNTRIES } from "@/lib/constants";
import { getRelevantGuidance } from "@/lib/guidance";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Official guidance" };

export default async function InAppGuidancePage() {
  const { profile } = await requireOnboardedUser("/help/guidance");
  const supabase = await createClient();
  const rows = await getRelevantGuidance(supabase, { country: profile.country });
  const countryName = COUNTRIES.find((c) => c.code === profile.country)?.name ?? profile.country;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Official complaint guidance"
        description={`Official sources for ${countryName}. Each shows whether Resolve has verified it. Processes and timelines vary and can change — always confirm with the official source.`}
      />
      <Alert tone="info" title="Start with your financial institution">
        Your bank or payment provider holds the records of your transaction and is usually best placed to investigate it
        first. Keep any complaint reference number they give you.
      </Alert>
      {rows.length === 0 ? (
        <EmptyState
          title="No guidance for your country yet"
          description={profile.country === "NG" ? "Guidance records will appear here once they are added." : "Resolve currently covers official guidance for Nigeria. You can change your country in Settings."}
        />
      ) : (
        <div className="space-y-4">
          {rows.map((g) => (
            <GuidanceCard key={g.id} g={g} />
          ))}
        </div>
      )}
    </div>
  );
}
