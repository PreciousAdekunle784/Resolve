import { clsx } from "clsx";
import { formatDate } from "@/lib/format";
import type { CaseEventRow } from "@/lib/types";

const TONE: Record<string, string> = {
  status_changed: "bg-brand-500",
  resolution_recorded: "bg-success-600",
  institution_submission_recorded: "bg-brand-600",
  institution_response_recorded: "bg-warning-500",
  complaint_approved: "bg-success-600",
  evidence_removed: "bg-ink-400",
};

const LABEL: Record<string, string> = {
  case_created: "Case started",
  report_submitted: "Report completed",
  case_updated: "Details updated",
  status_changed: "Status changed",
  evidence_uploaded: "Evidence added",
  evidence_removed: "Evidence removed",
  evidence_extracted: "Document read",
  analysis_generated: "Analysis",
  analysis_reviewed: "Analysis reviewed",
  ai_suggestion_accepted: "Suggestion confirmed",
  follow_up_answered: "Question answered",
  complaint_generated: "Complaint drafted",
  complaint_edited: "Complaint edited",
  complaint_approved: "Complaint approved",
  complaint_exported: "Complaint exported",
  institution_submission_recorded: "Submitted to institution",
  institution_response_recorded: "Institution response",
  follow_up_scheduled: "Follow-up",
  resolution_recorded: "Outcome",
  note_added: "Note",
};

/** Chronological case history (oldest first). */
export function Timeline({ events }: { events: CaseEventRow[] }) {
  if (events.length === 0) return <p className="text-sm text-ink-500">No activity yet.</p>;
  return (
    <ol className="relative space-y-5 border-l border-ink-200 pl-6">
      {events.map((e) => (
        <li key={e.id} className="relative">
          <span
            className={clsx("absolute top-1.5 -left-[1.95rem] size-3 rounded-full border-2 border-white ring-1 ring-ink-200", TONE[e.event_type] ?? "bg-ink-300")}
            aria-hidden="true"
          />
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
            <p className="text-xs font-semibold tracking-wide text-ink-500 uppercase">{LABEL[e.event_type] ?? e.event_type}</p>
            <time dateTime={e.created_at} className="text-xs text-ink-500">{formatDate(e.created_at, { withTime: true })}</time>
          </div>
          <p className="mt-0.5 text-sm break-words whitespace-pre-line text-ink-800">{e.description}</p>
        </li>
      ))}
    </ol>
  );
}
