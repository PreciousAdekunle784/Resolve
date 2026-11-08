import { Skeleton } from "@/components/ui/misc";

export default function Loading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-9 w-72" />
      <Skeleton className="h-[5.5rem] rounded-[var(--radius-card)]" />
      <Skeleton className="h-80 rounded-[var(--radius-card)]" />
    </div>
  );
}
