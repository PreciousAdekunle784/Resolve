import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { decryptSecret, encryptSecret } from "./crypto";

/**
 * OAuth "state" + PKCE verifier kept in a short-lived, encrypted, httpOnly
 * cookie between the redirect to Google and the callback. The cookie is bound
 * to the signed-in user, so a callback can't attach a mailbox to someone else.
 */

export const OAUTH_COOKIE = "resolve_gmail_oauth";
export const OAUTH_COOKIE_PATH = "/api/integrations/gmail";
const TTL_MS = 10 * 60 * 1000;

export interface OAuthState {
  state: string;
  verifier: string;
  userId: string;
  returnTo: string;
  readReplies: boolean;
  exp: number;
}

export function safeReturnTo(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/settings#email";
  return value.slice(0, 300);
}

export function createOAuthState(userId: string, returnTo: string, readReplies: boolean) {
  const verifier = randomBytes(48).toString("base64url");
  const data: OAuthState = {
    state: randomBytes(24).toString("base64url"),
    verifier,
    userId,
    returnTo: safeReturnTo(returnTo),
    readReplies,
    exp: Date.now() + TTL_MS,
  };
  return {
    data,
    cookie: encryptSecret(JSON.stringify(data)),
    codeChallenge: createHash("sha256").update(verifier).digest("base64url"),
  };
}

export function readOAuthState(cookie: string | undefined): OAuthState | null {
  if (!cookie) return null;
  try {
    const data = JSON.parse(decryptSecret(cookie)) as OAuthState;
    return data.exp > Date.now() ? data : null;
  } catch {
    return null;
  }
}
