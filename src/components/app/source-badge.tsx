import { Badge } from "@/components/ui/badge";
import type { FactSource } from "@/lib/ai/schemas";

const LABELS: Record<FactSource, { label: string; tone: "info" | "neutral" | "warning" | "danger" }> = {
  user_provided: { label: "You told us", tone: "info" },
  document_extracted: { label: "From a document", tone: "neutral" },
  ai_inferred: { label: "AI interpretation", tone: "warning" },
  unverified: { label: "Unverified", tone: "danger" },
};

export function SourceBadge({ source }: { source: FactSource }) {
  const s = LABELS[source];
  return <Badge tone={s.tone}>{s.label}</Badge>;
}
