import {
  EVIDENCE_ALLOWED_MIME_TYPES,
  EVIDENCE_MAX_FILE_BYTES,
  type EvidenceMimeType,
} from "@/lib/constants";

/** File validation used on the server (and mirrored in the browser for fast feedback). */

const EXTENSIONS: Record<EvidenceMimeType, string[]> = {
  "image/png": ["png"],
  "image/jpeg": ["jpg", "jpeg"],
  "application/pdf": ["pdf"],
};

export function isAllowedMimeType(mime: string): mime is EvidenceMimeType {
  return (EVIDENCE_ALLOWED_MIME_TYPES as readonly string[]).includes(mime);
}

export function extensionFor(mime: EvidenceMimeType): string {
  return EXTENSIONS[mime][0];
}

export function fileExtension(filename: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(filename);
  return m ? m[1].toLowerCase() : "";
}

export type FileCheck = { ok: true } | { ok: false; error: string };

/** Validates what the browser *claims* about a file before issuing an upload URL. */
export function checkDeclaredFile(input: { filename: string; mimeType: string; size: number }): FileCheck {
  if (!isAllowedMimeType(input.mimeType)) return { ok: false, error: "Only PNG, JPG/JPEG and PDF files are supported." };
  if (!EXTENSIONS[input.mimeType].includes(fileExtension(input.filename))) {
    return { ok: false, error: "The file extension doesn't match its type. Use .png, .jpg, .jpeg or .pdf files." };
  }
  if (!Number.isFinite(input.size) || input.size <= 0) return { ok: false, error: "This file is empty." };
  if (input.size > EVIDENCE_MAX_FILE_BYTES) return { ok: false, error: "Files must be 10 MB or smaller." };
  return { ok: true };
}

/** Detects the real file type from its first bytes ("magic numbers"). */
export function detectMimeType(bytes: Uint8Array): EvidenceMimeType | null {
  if (bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => bytes[i] === b)) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 5 && [0x25, 0x50, 0x44, 0x46, 0x2d].every((b, i) => bytes[i] === b)) return "application/pdf";
  return null;
}

/** Makes a user-supplied filename safe to store and display. */
export function sanitizeFilename(name: string): string {
  const cleaned = name
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]+/g, "_")
    .replace(/\s+/g, " ")
    .trim();
  return (cleaned || "file").slice(0, 200);
}
