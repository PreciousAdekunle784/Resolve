"use client";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";

export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <EmptyState
      title="Something went wrong"
      description="We couldn't load this page. Your information is safe. Please try again, and if the problem continues, come back in a few minutes."
      action={<Button onClick={reset}>Try again</Button>}
    />
  );
}
