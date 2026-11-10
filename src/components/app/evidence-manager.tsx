"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { clsx } from "clsx";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { EVIDENCE_MAX_FILE_BYTES, EVIDENCE_MAX_FILES_PER_CASE } from "@/lib/constants";
import { getSupabasePublishableKey } from "@/lib/env";
import { checkDeclaredFile } from "@/lib/files";
import { formatDate, formatFileSize } from "@/lib/format";
import type { EvidenceRow } from "@/lib/types";

type UploadItem = {
  key: string;
  file: File;
  previewUrl: string | null;
  description: string;
  status: "queued" | "uploading" | "verifying" | "error";
  progress: number;
  error?: string;
};

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error ?? "Something went wrong. Please try again.");
  return body as T;
}

/** Uploads the file straight to Supabase Storage using a one-time signed URL, reporting progress. */
function putWithProgress(signedUrl: string, file: File, onProgress: (pct: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", signedUrl);
    xhr.setRequestHeader("x-upsert", "false");
    const key = getSupabasePublishableKey();
    if (key) xhr.setRequestHeader("apikey", key);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error("The upload was rejected. Please try again.")));
    xhr.onerror = () => reject(new Error("The upload failed. Check your connection and try again."));
    xhr.ontimeout = () => reject(new Error("The upload timed out. Please try again."));
    xhr.timeout = 120_000;
    const body = new FormData();
    body.append("cacheControl", "3600");
    body.append("", file);
    xhr.send(body);
  });
}

export function EvidenceManager({
  caseId,
  initialEvidence,
  readOnly = false,
}: {
  caseId: string;
  initialEvidence: EvidenceRow[];
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [evidence, setEvidence] = useState(initialEvidence);
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const [seenInitial, setSeenInitial] = useState(initialEvidence);
  if (initialEvidence !== seenInitial) {
    // The server sent fresh data (after router.refresh()); adopt it.
    setSeenInitial(initialEvidence);
    setEvidence(initialEvidence);
  }
  useEffect(() => () => uploads.forEach((u) => u.previewUrl && URL.revokeObjectURL(u.previewUrl)), [uploads]);

  const remaining = EVIDENCE_MAX_FILES_PER_CASE - evidence.length - uploads.filter((u) => u.status !== "error").length;

  const updateUpload = (key: string, patch: Partial<UploadItem>) =>
    setUploads((list) => list.map((u) => (u.key === key ? { ...u, ...patch } : u)));

  const startUpload = useCallback(
    async (item: UploadItem) => {
      updateUpload(item.key, { status: "uploading", progress: 0, error: undefined });
      try {
        const prep = await api<{ path: string; signedUrl: string }>(`/api/cases/${caseId}/evidence/upload-url`, {
          method: "POST",
          body: JSON.stringify({ filename: item.file.name, mimeType: item.file.type, size: item.file.size }),
        });
        await putWithProgress(prep.signedUrl, item.file, (pct) => updateUpload(item.key, { progress: pct }));
        updateUpload(item.key, { status: "verifying", progress: 100 });
        const done = await api<{ evidence: EvidenceRow }>(`/api/cases/${caseId}/evidence`, {
          method: "POST",
          body: JSON.stringify({ path: prep.path, originalFilename: item.file.name, description: item.description || undefined }),
        });
        setEvidence((list) => [...list, done.evidence]);
        setUploads((list) => list.filter((u) => u.key !== item.key));
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
        router.refresh();
      } catch (e) {
        updateUpload(item.key, { status: "error", error: e instanceof Error ? e.message : "Upload failed." });
      }
    },
    [caseId, router],
  );

  const addFiles = (files: FileList | File[]) => {
    setMessage(null);
    const list = Array.from(files);
    let slots = remaining;
    const items: UploadItem[] = [];
    for (const file of list) {
      if (slots <= 0) {
        setMessage({ tone: "error", text: `A case can have up to ${EVIDENCE_MAX_FILES_PER_CASE} files.` });
        break;
      }
      const check = checkDeclaredFile({ filename: file.name, mimeType: file.type, size: file.size });
      const item: UploadItem = {
        key: `${file.name}-${file.size}-${Math.random().toString(36).slice(2)}`,
        file,
        previewUrl: file.type.startsWith("image/") && check.ok ? URL.createObjectURL(file) : null,
        description: "",
        status: check.ok ? "queued" : "error",
        progress: 0,
        error: check.ok ? undefined : check.error,
      };
      items.push(item);
      if (check.ok) slots--;
    }
    setUploads((u) => [...u, ...items]);
    items.filter((i) => i.status === "queued").forEach((i) => void startUpload(i));
  };

  const remove = async (row: EvidenceRow) => {
    if (!window.confirm(`Remove "${row.original_filename}"? This permanently deletes the file.`)) return;
    try {
      await api(`/api/evidence/${row.id}`, { method: "DELETE" });
      setEvidence((list) => list.filter((e) => e.id !== row.id));
      setMessage({ tone: "success", text: "File removed." });
      router.refresh();
    } catch (e) {
      setMessage({ tone: "error", text: e instanceof Error ? e.message : "Could not remove the file." });
    }
  };

  return (
    <div className="space-y-5">
      {message ? <Alert tone={message.tone}>{message.text}</Alert> : null}

      {!readOnly ? (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
          }}
          className={clsx(
            "flex flex-col items-center justify-center gap-3 rounded-[var(--radius-card)] border-2 border-dashed px-6 py-8 text-center transition-colors",
            dragging ? "border-brand-500 bg-brand-50" : "border-ink-300 bg-ink-50",
          )}
        >
          <svg className="size-8 text-ink-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
          </svg>
          <div className="space-y-1">
            <p className="text-sm font-medium text-ink-900">Drag files here, or choose from your device</p>
            <p className="text-xs text-ink-500">
              PNG, JPG or PDF · up to {formatFileSize(EVIDENCE_MAX_FILE_BYTES)} each · {Math.max(remaining, 0)} of{" "}
              {EVIDENCE_MAX_FILES_PER_CASE} slots left
            </p>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,application/pdf,.png,.jpg,.jpeg,.pdf"
            multiple
            className="sr-only"
            id={`evidence-input-${caseId}`}
            onChange={(e) => {
              if (e.target.files?.length) addFiles(e.target.files);
              e.target.value = "";
            }}
            disabled={remaining <= 0}
          />
          <Button variant="secondary" onClick={() => inputRef.current?.click()} disabled={remaining <= 0}>
            Choose files
          </Button>
          <p className="max-w-md text-xs leading-relaxed text-ink-500">
            Useful evidence: debit alerts, receipts, account statements, screenshots of the transaction and any messages
            from your bank. Cover any PIN, OTP, password, BVN, NIN or full card number before uploading.
          </p>
        </div>
      ) : null}

      {uploads.length > 0 ? (
        <ul className="space-y-2" aria-label="Uploads in progress">
          {uploads.map((u) => (
            <li key={u.key} className="flex items-center gap-3 rounded-[var(--radius-control)] border border-ink-200 bg-white p-3">
              <Thumb mime={u.file.type} src={u.previewUrl} />
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-medium text-ink-900">{u.file.name}</p>
                  <span className="shrink-0 text-xs text-ink-500">{formatFileSize(u.file.size)}</span>
                </div>
                {u.status === "error" ? (
                  <p className="text-xs font-medium text-danger-700" role="alert">{u.error}</p>
                ) : (
                  <div className="space-y-1">
                    <div className="h-1.5 overflow-hidden rounded-full bg-ink-100" role="progressbar" aria-valuenow={u.progress} aria-valuemin={0} aria-valuemax={100} aria-label={`Uploading ${u.file.name}`}>
                      <div className="h-full rounded-full bg-brand-600 transition-[width]" style={{ width: `${u.progress}%` }} />
                    </div>
                    <p className="text-xs text-ink-500">
                      {u.status === "verifying" ? "Checking file…" : u.status === "queued" ? "Waiting…" : `Uploading… ${u.progress}%`}
                    </p>
                  </div>
                )}
              </div>
              {u.status === "error" ? (
                <div className="flex shrink-0 gap-1">
                  {checkDeclaredFile({ filename: u.file.name, mimeType: u.file.type, size: u.file.size }).ok ? (
                    <Button size="sm" variant="secondary" onClick={() => void startUpload(u)}>Retry</Button>
                  ) : null}
                  <Button size="sm" variant="ghost" onClick={() => setUploads((l) => l.filter((x) => x.key !== u.key))}>Dismiss</Button>
                </div>
              ) : (
                <Spinner className="size-4 text-brand-600" />
              )}
            </li>
          ))}
        </ul>
      ) : null}

      {evidence.length === 0 && uploads.length === 0 ? (
        <p className="text-center text-sm text-ink-500">No evidence uploaded yet.</p>
      ) : (
        <ul className="space-y-2" aria-label="Uploaded evidence">
          {evidence.map((row) => (
            <EvidenceItem key={row.id} row={row} readOnly={readOnly} onRemove={() => void remove(row)} onUpdated={(r) => setEvidence((l) => l.map((e) => (e.id === r.id ? r : e)))} />
          ))}
        </ul>
      )}
    </div>
  );
}

function EvidenceItem({
  row,
  readOnly,
  onRemove,
  onUpdated,
}: {
  row: EvidenceRow;
  readOnly: boolean;
  onRemove: () => void;
  onUpdated: (row: EvidenceRow) => void;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [description, setDescription] = useState(row.description ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isImage = row.mime_type.startsWith("image/");

  useEffect(() => {
    if (!isImage) return;
    let cancelled = false;
    api<{ url: string }>(`/api/evidence/${row.id}/url`)
      .then((r) => !cancelled && setPreview(r.url))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [row.id, isImage]);

  const open = async (download = false) => {
    setError(null);
    try {
      const r = await api<{ url: string }>(`/api/evidence/${row.id}/url${download ? "?download=1" : ""}`);
      window.open(r.url, "_blank", "noopener,noreferrer");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open the file.");
    }
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ evidence: EvidenceRow }>(`/api/evidence/${row.id}`, {
        method: "PATCH",
        body: JSON.stringify({ description }),
      });
      onUpdated(r.evidence);
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="rounded-[var(--radius-control)] border border-ink-200 bg-white p-3">
      <div className="flex items-start gap-3">
        <button type="button" onClick={() => void open()} className="shrink-0 rounded-md focus-visible:outline-2" aria-label={`Open ${row.original_filename}`}>
          <Thumb mime={row.mime_type} src={preview} />
        </button>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-medium text-ink-900">{row.original_filename}</p>
            <ExtractionBadge status={row.extraction_status} />
          </div>
          <p className="text-xs text-ink-500">
            {row.mime_type === "application/pdf" ? "PDF" : row.mime_type === "image/png" ? "PNG" : "JPG"} · {formatFileSize(row.file_size)} · Added {formatDate(row.created_at)}
          </p>
          {editing ? (
            <div className="flex flex-col gap-2 pt-1 sm:flex-row">
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={500}
                placeholder="e.g. Debit alert SMS showing the deduction"
                aria-label="File description"
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={() => void save()} loading={busy}>Save</Button>
                <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setDescription(row.description ?? ""); }}>Cancel</Button>
              </div>
            </div>
          ) : row.description ? (
            <p className="text-sm text-ink-700">{row.description}</p>
          ) : !readOnly ? (
            <p className="text-xs text-ink-400">No description</p>
          ) : null}
          {error ? <p className="text-xs font-medium text-danger-700" role="alert">{error}</p> : null}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-1 border-t border-ink-100 pt-2">
        <Button size="sm" variant="ghost" onClick={() => void open()}>View</Button>
        <Button size="sm" variant="ghost" onClick={() => void open(true)}>Download</Button>
        {!readOnly ? (
          <>
            {!editing ? <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>{row.description ? "Edit description" : "Add description"}</Button> : null}
            <Button size="sm" variant="ghost" className="text-danger-700 hover:bg-danger-50 hover:text-danger-700" onClick={onRemove}>Remove</Button>
          </>
        ) : null}
      </div>
    </li>
  );
}

function ExtractionBadge({ status }: { status: EvidenceRow["extraction_status"] }) {
  switch (status) {
    case "completed":
      return <Badge tone="success">Read by AI</Badge>;
    case "processing":
      return <Badge tone="info">Reading…</Badge>;
    case "failed":
      return <Badge tone="danger">Couldn&apos;t read</Badge>;
    case "unsupported":
      return <Badge tone="muted">Not readable</Badge>;
    default:
      return null;
  }
}

function Thumb({ mime, src }: { mime: string; src: string | null }) {
  if (mime.startsWith("image/") && src) {
    // eslint-disable-next-line @next/next/no-img-element -- short-lived signed/blob URLs; next/image can't optimise them.
    return <img src={src} alt="" className="size-14 rounded-md border border-ink-200 object-cover" />;
  }
  return (
    <span className="flex size-14 items-center justify-center rounded-md border border-ink-200 bg-ink-50 text-xs font-semibold text-ink-500">
      {mime === "application/pdf" ? "PDF" : "IMG"}
    </span>
  );
}
