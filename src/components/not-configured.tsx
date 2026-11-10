import { Alert } from "@/components/ui/alert";
import { getSupabaseConfigProblems, supabaseConfigHelp } from "@/lib/env";

/** Explains exactly which Supabase setting is missing or wrong (names only, never values). */
export function NotConfigured() {
  const problems = getSupabaseConfigProblems();
  return (
    <Alert tone="warning" title="Resolve can't connect to its database yet">
      <ul className="list-disc space-y-1 pl-5">
        {problems.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>
      <p className="mt-2">{supabaseConfigHelp()}</p>
    </Alert>
  );
}
