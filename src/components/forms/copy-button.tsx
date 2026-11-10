"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

/** Copies text to the clipboard, with a short confirmation. */
export function CopyButton({ text, label, size = "sm" }: { text: string; label: string; size?: "sm" | "md" }) {
  const [copied, setCopied] = useState<"ok" | "fail" | null>(null);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(null), 2500);
    return () => clearTimeout(t);
  }, [copied]);
  return (
    <Button
      variant="secondary"
      size={size}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied("ok");
        } catch {
          setCopied("fail");
        }
      }}
    >
      {copied === "ok" ? "Copied" : copied === "fail" ? "Copy failed — select the text manually" : label}
    </Button>
  );
}
