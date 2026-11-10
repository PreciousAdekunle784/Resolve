import "server-only";
import { getSiteUrl } from "@/lib/env";
import { isAdminClientConfigured } from "@/lib/supabase/admin";
import { getEncryptionKey } from "./crypto";

/**
 * Google OAuth 2.0 + Gmail API client (plain fetch, no extra dependencies).
 *
 * Required environment variables (server-side only):
 *   GOOGLE_OAUTH_CLIENT_ID       OAuth client ID ("Web application") from Google Cloud
 *   GOOGLE_OAUTH_CLIENT_SECRET   Its client secret
 *   EMAIL_TOKEN_ENCRYPTION_KEY   32-byte key used to encrypt stored tokens
 *   SUPABASE_SECRET_KEY          Needed to store tokens where users can't read them
 * Optional:
 *   GOOGLE_OAUTH_REDIRECT_URI    Defaults to <SITE_URL>/api/integrations/gmail/callback
 *
 * The *_URL overrides below exist only so automated tests can point the
 * client at a local emulator; production uses Google's real endpoints.
 */

export const GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";
export const GMAIL_READ_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

const endpoints = () => ({
  auth: process.env.GOOGLE_OAUTH_AUTH_URL || "https://accounts.google.com/o/oauth2/v2/auth",
  token: process.env.GOOGLE_OAUTH_TOKEN_URL || "https://oauth2.googleapis.com/token",
  revoke: process.env.GOOGLE_OAUTH_REVOKE_URL || "https://oauth2.googleapis.com/revoke",
  gmail: (process.env.GMAIL_API_BASE_URL || "https://gmail.googleapis.com").replace(/\/$/, ""),
});

export function getGoogleOAuthConfig() {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI?.trim() || `${getSiteUrl()}/api/integrations/gmail/callback`;
  return { clientId, clientSecret, redirectUri, ...endpoints() };
}

/** Names of missing settings (never values). Empty when email submission can work. */
export function emailSubmissionConfigProblems(): string[] {
  const problems: string[] = [];
  if (!process.env.GOOGLE_OAUTH_CLIENT_ID?.trim()) problems.push("GOOGLE_OAUTH_CLIENT_ID");
  if (!process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim()) problems.push("GOOGLE_OAUTH_CLIENT_SECRET");
  if (!getEncryptionKey()) problems.push("EMAIL_TOKEN_ENCRYPTION_KEY");
  if (!isAdminClientConfigured()) problems.push("SUPABASE_SECRET_KEY");
  return problems;
}

export const isEmailSubmissionConfigured = () => emailSubmissionConfigProblems().length === 0;

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export type EmailErrorCode =
  | "not_configured"
  | "not_connected"
  | "reauthorization_required"
  | "rejected" // the provider refused; nothing was sent
  | "rate_limited" // nothing was sent
  | "uncertain"; // we can't tell whether the message was sent

export class EmailProviderError extends Error {
  constructor(
    readonly code: EmailErrorCode,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "EmailProviderError";
  }
}

const TIMEOUT_MS = 30_000;

async function call(url: string, init: RequestInit): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
}

/** Errors raised before the request could have reached Google (so nothing happened). */
function failedBeforeSending(error: unknown): boolean {
  const cause = (error as { cause?: { code?: string } })?.cause?.code;
  return ["ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "CERT_HAS_EXPIRED", "UNABLE_TO_VERIFY_LEAF_SIGNATURE"].includes(cause ?? "");
}

async function googleErrorText(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: { message?: string } | string; error_description?: string };
    if (typeof body.error === "string") return `${body.error}${body.error_description ? `: ${body.error_description}` : ""}`;
    return body.error?.message ?? `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

// ---------------------------------------------------------------------------
// OAuth
// ---------------------------------------------------------------------------

export function buildAuthorizationUrl(opts: { state: string; codeChallenge: string; readReplies: boolean; loginHint?: string }): string {
  const cfg = getGoogleOAuthConfig();
  if (!cfg) throw new EmailProviderError("not_configured", "Gmail isn't set up on this site.");
  const url = new URL(cfg.auth);
  url.search = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: "code",
    scope: [GMAIL_SEND_SCOPE, ...(opts.readReplies ? [GMAIL_READ_SCOPE] : [])].join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state: opts.state,
    code_challenge: opts.codeChallenge,
    code_challenge_method: "S256",
    ...(opts.loginHint ? { login_hint: opts.loginHint } : {}),
  }).toString();
  return url.toString();
}

export interface TokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
}

async function tokenRequest(params: Record<string, string>): Promise<TokenResponse> {
  const cfg = getGoogleOAuthConfig();
  if (!cfg) throw new EmailProviderError("not_configured", "Gmail isn't set up on this site.");
  let res: Response;
  try {
    res = await call(cfg.token, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: cfg.clientId, client_secret: cfg.clientSecret, ...params }).toString(),
    });
  } catch {
    throw new EmailProviderError("rejected", "Couldn't reach Google. Please try again.");
  }
  if (!res.ok) {
    const text = await googleErrorText(res);
    if (text.startsWith("invalid_grant")) throw new EmailProviderError("reauthorization_required", "Your Gmail permission has expired or was removed. Please reconnect Gmail.", res.status);
    throw new EmailProviderError("rejected", `Google rejected the request (${text}).`, res.status);
  }
  return (await res.json()) as TokenResponse;
}

export const exchangeAuthorizationCode = (code: string, codeVerifier: string) => {
  const cfg = getGoogleOAuthConfig();
  return tokenRequest({ grant_type: "authorization_code", code, code_verifier: codeVerifier, redirect_uri: cfg?.redirectUri ?? "" });
};

export const refreshAccessToken = (refreshToken: string) => tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken });

export async function revokeToken(token: string): Promise<void> {
  const cfg = getGoogleOAuthConfig();
  if (!cfg) return;
  await call(cfg.revoke, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token }).toString(),
  }).catch(() => undefined);
}

// ---------------------------------------------------------------------------
// Gmail API
// ---------------------------------------------------------------------------

async function gmailGet<T>(accessToken: string, path: string): Promise<T> {
  let res: Response;
  try {
    res = await call(`${endpoints().gmail}${path}`, { headers: { Authorization: `Bearer ${accessToken}` } });
  } catch {
    throw new EmailProviderError("rejected", "Couldn't reach Gmail. Please try again.");
  }
  if (res.status === 401) throw new EmailProviderError("reauthorization_required", "Gmail access has expired. Please reconnect Gmail.", 401);
  if (res.status === 429) throw new EmailProviderError("rate_limited", "Gmail is limiting requests right now. Please try again later.", 429);
  if (!res.ok) throw new EmailProviderError("rejected", `Gmail returned an error (${await googleErrorText(res)}).`, res.status);
  return (await res.json()) as T;
}

export const getGmailProfile = (accessToken: string) =>
  gmailGet<{ emailAddress: string }>(accessToken, "/gmail/v1/users/me/profile");

/**
 * Sends a complete MIME message. Resolves only when Gmail confirms it accepted
 * the message (returning its id). Distinguishes definite failures (nothing was
 * sent) from uncertain ones (it may have been sent), so callers never resend a
 * message that might already have gone out.
 */
export async function sendGmailMessage(accessToken: string, raw: Buffer): Promise<{ id: string; threadId: string }> {
  let res: Response;
  try {
    res = await call(`${endpoints().gmail}/upload/gmail/v1/users/me/messages/send?uploadType=media`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "message/rfc822" },
      body: new Uint8Array(raw),
    });
  } catch (error) {
    if (failedBeforeSending(error)) throw new EmailProviderError("rejected", "Couldn't reach Gmail, so nothing was sent. Please try again.");
    throw new EmailProviderError("uncertain", "The connection to Gmail was interrupted, so we can't tell whether your email was sent.");
  }
  if (res.ok) {
    const json = (await res.json().catch(() => null)) as { id?: string; threadId?: string } | null;
    if (json?.id) return { id: json.id, threadId: json.threadId ?? json.id };
    throw new EmailProviderError("uncertain", "Gmail's reply was incomplete, so we can't confirm your email was sent.");
  }
  const detail = await googleErrorText(res);
  if (res.status === 401) throw new EmailProviderError("reauthorization_required", "Gmail access has expired. Please reconnect Gmail. Nothing was sent.", 401);
  if (res.status === 429) throw new EmailProviderError("rate_limited", "Gmail's sending limit was reached. Nothing was sent — try again later.", 429);
  if (res.status >= 500) throw new EmailProviderError("uncertain", `Gmail had a temporary problem (${detail}), so we can't tell whether your email was sent.`, res.status);
  throw new EmailProviderError("rejected", `Gmail didn't send the email (${detail}).`, res.status);
}

/** Finds a sent message by its Message-ID header (needs the read scope). */
export async function findMessageByMessageId(accessToken: string, messageIdHeader: string): Promise<{ id: string; threadId: string } | null> {
  const q = encodeURIComponent(`rfc822msgid:${messageIdHeader.replace(/[<>]/g, "")}`);
  const result = await gmailGet<{ messages?: { id: string; threadId: string }[] }>(accessToken, `/gmail/v1/users/me/messages?q=${q}&maxResults=1`);
  return result.messages?.[0] ?? null;
}

interface GmailPart {
  mimeType?: string;
  body?: { data?: string };
  parts?: GmailPart[];
  headers?: { name: string; value: string }[];
}
export interface GmailThreadMessage {
  id: string;
  internalDate: string;
  payload?: GmailPart;
}

function findPart(part: GmailPart | undefined, mime: string): string | null {
  if (!part) return null;
  if (part.mimeType === mime && part.body?.data) return Buffer.from(part.body.data, "base64url").toString("utf8");
  for (const p of part.parts ?? []) {
    const found = findPart(p, mime);
    if (found) return found;
  }
  return null;
}

export function messageText(m: GmailThreadMessage): string {
  const plain = findPart(m.payload, "text/plain");
  if (plain) return plain;
  const html = findPart(m.payload, "text/html");
  if (!html) return "";
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>|<\/p>|<\/div>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"');
}

export function messageHeader(m: GmailThreadMessage, name: string): string | null {
  return m.payload?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? null;
}

export const getGmailThread = (accessToken: string, threadId: string) =>
  gmailGet<{ id: string; messages?: GmailThreadMessage[] }>(accessToken, `/gmail/v1/users/me/threads/${encodeURIComponent(threadId)}?format=full`);
