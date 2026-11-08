import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { requireOnboardedUser } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { GuidanceRow } from "@/lib/types";
import { GuidanceForm } from "./guidance-form";

export const metadata: Metadata = { title: "Manage guidance" };

export default async function AdminGuidancePage() {
  const { user } = await requireOnboardedUser("/admin/guidance");
  if (!user.isAdmin) notFound();
  const supabase = await createClient();
  const { data, error } = await supabase.from("guidance_sources").select("*").order("country").order("title");
  if (error) throw new Error("Could not load guidance.");
  const rows = (data ?? []) as GuidanceRow[];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        eyebrow="Administrator"
        title="Official guidance"
        description="Add and verify official complaint guidance. Only mark a record verified after checking it against the official source."
      />
      <Card>
        <CardHeader title="Add a guidance record" />
        <CardBody><GuidanceForm /></CardBody>
      </Card>
      <div className="space-y-3">
        {rows.map((g) => (
          <details key={g.id} className="group rounded-[var(--radius-card)] border border-ink-200 bg-white">
            <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 px-5 py-4">
              <span className="min-w-0">
                <span className="block font-medium text-ink-900">{g.title}</span>
                <span className="block text-xs text-ink-500">{g.country} · {g.institution} · updated {formatDate(g.updated_at)}</span>
              </span>
              <Badge tone={g.status === "verified" ? "success" : g.status === "archived" ? "muted" : "warning"}>
                {g.status}{g.verified_at ? ` · ${formatDate(g.verified_at)}` : ""}
              </Badge>
            </summary>
            <div className="border-t border-ink-100 px-5 py-4">
              <GuidanceForm g={g} />
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}
