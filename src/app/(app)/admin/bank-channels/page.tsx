import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BankLogo } from "@/components/bank-logo";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { requireOnboardedUser } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { BankChannelRow } from "@/lib/types";
import { ChannelForm } from "./channel-form";

export const metadata: Metadata = { title: "Bank contact channels" };

const TYPE_LABEL = { email: "Email", web_portal: "Web page", api: "API", phone: "Phone" } as const;

export default async function AdminBankChannelsPage() {
  const { user } = await requireOnboardedUser("/admin/bank-channels");
  if (!user.isAdmin) notFound();
  const supabase = await createClient();
  const { data, error } = await supabase.from("bank_contact_channels").select("*").order("bank_name").order("channel_type");
  if (error) throw new Error("Could not load bank contacts.");
  const rows = (data ?? []) as BankChannelRow[];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        eyebrow="Administrator"
        title="Bank contact channels"
        description="Official complaint channels users can submit to. Only mark one verified after checking it on the bank's own website — complaints are sent to these addresses."
      />
      <Card>
        <CardHeader title="Add a contact channel" />
        <CardBody><ChannelForm /></CardBody>
      </Card>
      {rows.length === 0 ? <p className="text-sm text-ink-600">No contact channels yet. Users can still enter their bank&apos;s address themselves.</p> : null}
      <div className="space-y-3">
        {rows.map((ch) => (
          <details key={ch.id} className="group rounded-[var(--radius-card)] border border-ink-200 bg-white">
            <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 px-5 py-4">
              <span className="flex min-w-0 items-center gap-3">
                <BankLogo name={ch.bank_name} size="sm" />
                <span className="min-w-0">
                  <span className="block font-medium text-ink-900">{ch.bank_name} · {ch.label}</span>
                  <span className="block font-mono text-xs break-all text-ink-500">{TYPE_LABEL[ch.channel_type]} · {ch.value}</span>
                </span>
              </span>
              <Badge tone={ch.status === "verified" ? "success" : ch.status === "archived" ? "muted" : "warning"}>
                {ch.status}{ch.verified_at && ch.status === "verified" ? ` · ${formatDate(ch.verified_at)}` : ""}
              </Badge>
            </summary>
            <div className="border-t border-ink-100 px-5 py-4"><ChannelForm ch={ch} /></div>
          </details>
        ))}
      </div>
    </div>
  );
}
