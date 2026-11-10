import { randomBytes } from "node:crypto";

/**
 * Minimal, dependency-free RFC 5322 / MIME message builder for sending a
 * complaint (plain-text body + attachments) through the Gmail API.
 */

export interface MimeAttachment {
  filename: string;
  contentType: string;
  content: Buffer;
}

export interface MimeMessageInput {
  from: { name: string | null; address: string };
  to: string;
  subject: string;
  text: string;
  messageId: string;
  date?: Date;
  attachments?: MimeAttachment[];
}

const EMAIL_RE = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[a-z]{2,}$/i;

export function isValidEmailAddress(value: string): boolean {
  return value.length <= 254 && EMAIL_RE.test(value);
}

/** Header values must never contain line breaks (prevents header injection). */
function safeHeader(value: string, name: string): string {
  if (/[\r\n]/.test(value)) throw new Error(`Invalid ${name}: line breaks are not allowed.`);
  return value;
}

/** RFC 2047 encoded-words for non-ASCII header text, split so each word stays short. */
export function encodeHeaderText(value: string): string {
  if (/^[\x20-\x7e]*$/.test(value)) return value;
  const words: string[] = [];
  let chunk = "";
  for (const ch of value) {
    if (Buffer.byteLength(chunk + ch, "utf8") > 42) {
      words.push(chunk);
      chunk = "";
    }
    chunk += ch;
  }
  if (chunk) words.push(chunk);
  return words.map((w) => `=?UTF-8?B?${Buffer.from(w, "utf8").toString("base64")}?=`).join("\r\n ");
}

function formatAddress(name: string | null, address: string): string {
  if (!isValidEmailAddress(address)) throw new Error("Invalid email address.");
  if (!name) return address;
  const clean = safeHeader(name, "name").replace(/["\\]/g, "");
  return /^[\x20-\x7e]*$/.test(clean) ? `"${clean}" <${address}>` : `${encodeHeaderText(clean)} <${address}>`;
}

const wrap76 = (b64: string) => b64.replace(/.{1,76}/g, "$&\r\n");

function filenameParams(filename: string): string {
  const safe = safeHeader(filename, "filename");
  const ascii = safe.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  const encoded = encodeURIComponent(safe).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

function rfc2822Date(d: Date): string {
  return d.toUTCString().replace("GMT", "+0000");
}

export function buildMimeMessage(input: MimeMessageInput): Buffer {
  if (!isValidEmailAddress(input.to)) throw new Error("Invalid recipient address.");
  if (!/^<[^<>\s@]+@[^<>\s@]+>$/.test(input.messageId)) throw new Error("Invalid Message-ID.");
  const boundary = `resolve-${randomBytes(12).toString("hex")}`;
  const headers = [
    `From: ${formatAddress(input.from.name, input.from.address)}`,
    `To: ${input.to}`,
    `Subject: ${encodeHeaderText(safeHeader(input.subject, "subject"))}`,
    `Date: ${rfc2822Date(input.date ?? new Date())}`,
    `Message-ID: ${input.messageId}`,
    "MIME-Version: 1.0",
  ];
  const textPart = [
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    wrap76(Buffer.from(input.text.replace(/\r?\n/g, "\r\n"), "utf8").toString("base64")),
  ].join("\r\n");

  const attachments = input.attachments ?? [];
  if (attachments.length === 0) {
    return Buffer.from([...headers, textPart].join("\r\n"), "utf8");
  }
  const parts = [
    `--${boundary}\r\n${textPart}`,
    ...attachments.map((a) =>
      [
        `--${boundary}`,
        `Content-Type: ${safeHeader(a.contentType, "content type")}; name="${filenameParams(a.filename).split('"')[1]}"`,
        `Content-Disposition: attachment; ${filenameParams(a.filename)}`,
        "Content-Transfer-Encoding: base64",
        "",
        wrap76(a.content.toString("base64")),
      ].join("\r\n"),
    ),
    `--${boundary}--`,
  ];
  return Buffer.from(
    [...headers, `Content-Type: multipart/mixed; boundary="${boundary}"`, "", "This is a multi-part message in MIME format.", ...parts, ""].join("\r\n"),
    "utf8",
  );
}

/** Pulls the bare address out of a header like `"Bank" <care@bank.ng>`. */
export function parseAddress(header: string | null | undefined): string | null {
  if (!header) return null;
  const m = header.match(/<([^>]+)>/);
  const candidate = (m ? m[1] : header).trim().toLowerCase();
  return isValidEmailAddress(candidate) ? candidate : null;
}

/** Removes quoted earlier messages from an email reply so only the new text remains. */
export function stripQuotedReply(text: string): string {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const t = line.trim();
    if (/^On .{5,200}wrote:$/.test(t)) break;
    if (/^-{2,}\s*Original Message\s*-{2,}/i.test(t)) break;
    // Outlook-style quoted header block: "From: …" followed by "Sent:"/"Date:".
    if (i > 0 && /^From: .+/.test(t) && /^(Sent|Date): /m.test(lines.slice(i + 1, i + 4).join("\n"))) break;
    if (line.startsWith(">")) continue;
    out.push(line);
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
