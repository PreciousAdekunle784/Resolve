import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * AES-256-GCM encryption for OAuth tokens and the OAuth state cookie.
 *
 * EMAIL_TOKEN_ENCRYPTION_KEY must be 32 random bytes, written as base64 (44
 * characters) or hex (64 characters). Generate one with:
 *   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 * Changing the key makes existing connections unreadable (users reconnect).
 */

export function getEncryptionKey(): Buffer | null {
  const raw = process.env.EMAIL_TOKEN_ENCRYPTION_KEY?.trim();
  if (!raw) return null;
  const key = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  return key.length === 32 ? key : null;
}

function requireKey(key?: Buffer | null): Buffer {
  const k = key ?? getEncryptionKey();
  if (!k) throw new Error("EMAIL_TOKEN_ENCRYPTION_KEY is missing or not 32 bytes.");
  return k;
}

/** Returns "v1.<iv>.<tag>.<ciphertext>" (base64url parts). */
export function encryptSecret(plain: string, key?: Buffer | null): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", requireKey(key), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ct.toString("base64url")].join(".");
}

/** Decrypts a value from encryptSecret. Throws if it was tampered with or the key is wrong. */
export function decryptSecret(token: string, key?: Buffer | null): string {
  const [version, iv, tag, ct] = token.split(".");
  if (version !== "v1" || !iv || !tag || ct === undefined) throw new Error("Unrecognised secret format.");
  const decipher = createDecipheriv("aes-256-gcm", requireKey(key), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ct, "base64url")), decipher.final()]).toString("utf8");
}
