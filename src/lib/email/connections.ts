import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { EmailConnectionRow } from "@/lib/types";
import { decryptSecret, encryptSecret } from "./crypto";
import { EmailProviderError, GMAIL_READ_SCOPE, refreshAccessToken, revokeToken } from "./google";

/**
 * Stores and uses a user's Gmail connection. Tokens live (encrypted) in
 * email_connection_secrets, which only the server's service-role client can
 * read; users can only see the connection's email address and status.
 */

export async function getEmailConnection(userId: string): Promise<EmailConnectionRow | null> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("email_connections").select("*").eq("user_id", userId).eq("provider", "gmail").maybeSingle();
  if (error) throw new Error("Could not load your email connection.");
  return (data as EmailConnectionRow | null) ?? null;
}

export async function saveGmailConnection(input: {
  userId: string;
  emailAddress: string;
  scopes: string[];
  refreshToken: string;
  accessToken: string;
  expiresIn: number;
}): Promise<EmailConnectionRow> {
  const admin = createAdminClient();
  const fields = {
    email_address: input.emailAddress.toLowerCase(),
    scopes: input.scopes,
    can_read_replies: input.scopes.includes(GMAIL_READ_SCOPE),
    status: "active" as const,
    last_error: null,
    connected_at: new Date().toISOString(),
  };
  const secrets = {
    refresh_token_encrypted: encryptSecret(input.refreshToken),
    access_token_encrypted: encryptSecret(input.accessToken),
    access_token_expires_at: new Date(Date.now() + input.expiresIn * 1000).toISOString(),
  };

  const existing = await getEmailConnection(input.userId);
  if (existing) {
    const { data, error } = await admin.from("email_connections").update(fields).eq("id", existing.id).select("*").single();
    if (error || !data) throw new Error("Could not save your Gmail connection.");
    const { error: secretError } = await admin.from("email_connection_secrets").update(secrets).eq("connection_id", existing.id);
    if (secretError) throw new Error("Could not save your Gmail connection.");
    return data as EmailConnectionRow;
  }
  const { data, error } = await admin
    .from("email_connections")
    .insert({ user_id: input.userId, provider: "gmail", ...fields })
    .select("*")
    .single();
  if (error || !data) throw new Error("Could not save your Gmail connection.");
  const { error: secretError } = await admin.from("email_connection_secrets").insert({ connection_id: data.id, ...secrets });
  if (secretError) {
    await admin.from("email_connections").delete().eq("id", data.id);
    throw new Error("Could not save your Gmail connection.");
  }
  return data as EmailConnectionRow;
}

async function markNeedsReauthorization(connectionId: string, message: string) {
  await createAdminClient().from("email_connections").update({ status: "reauthorization_required", last_error: message.slice(0, 500) }).eq("id", connectionId);
}

/** Returns a valid Gmail access token for the user, refreshing it when needed. */
export async function getGmailAccess(userId: string): Promise<{ accessToken: string; connection: EmailConnectionRow }> {
  const connection = await getEmailConnection(userId);
  if (!connection) throw new EmailProviderError("not_connected", "Connect your Gmail account first.");
  if (connection.status !== "active") {
    throw new EmailProviderError("reauthorization_required", "Your Gmail permission needs to be renewed. Please reconnect Gmail.");
  }
  const admin = createAdminClient();
  const { data: secret, error } = await admin.from("email_connection_secrets").select("*").eq("connection_id", connection.id).maybeSingle();
  if (error || !secret) throw new EmailProviderError("not_connected", "Connect your Gmail account first.");

  const expiresAt = secret.access_token_expires_at ? new Date(secret.access_token_expires_at as string).getTime() : 0;
  if (secret.access_token_encrypted && expiresAt - Date.now() > 60_000) {
    try {
      return { accessToken: decryptSecret(secret.access_token_encrypted as string), connection };
    } catch {
      // Fall through to a refresh.
    }
  }

  let refreshToken: string;
  try {
    refreshToken = decryptSecret(secret.refresh_token_encrypted as string);
  } catch {
    await markNeedsReauthorization(connection.id, "Stored token could not be decrypted (encryption key changed?).");
    throw new EmailProviderError("reauthorization_required", "Please reconnect Gmail.");
  }
  try {
    const t = await refreshAccessToken(refreshToken);
    await admin
      .from("email_connection_secrets")
      .update({
        access_token_encrypted: encryptSecret(t.access_token),
        access_token_expires_at: new Date(Date.now() + t.expires_in * 1000).toISOString(),
        ...(t.refresh_token ? { refresh_token_encrypted: encryptSecret(t.refresh_token) } : {}),
      })
      .eq("connection_id", connection.id);
    return { accessToken: t.access_token, connection };
  } catch (error) {
    if (error instanceof EmailProviderError && error.code === "reauthorization_required") {
      await markNeedsReauthorization(connection.id, error.message);
    }
    throw error;
  }
}

export async function touchConnection(connectionId: string) {
  await createAdminClient().from("email_connections").update({ last_used_at: new Date().toISOString() }).eq("id", connectionId);
}

/** Revokes Resolve's access at Google (best effort) and deletes the stored connection. */
export async function disconnectGmail(userId: string): Promise<void> {
  const connection = await getEmailConnection(userId);
  if (!connection) return;
  const admin = createAdminClient();
  const { data: secret } = await admin.from("email_connection_secrets").select("refresh_token_encrypted").eq("connection_id", connection.id).maybeSingle();
  if (secret?.refresh_token_encrypted) {
    try {
      await revokeToken(decryptSecret(secret.refresh_token_encrypted as string));
    } catch {
      // The token is deleted below either way.
    }
  }
  const { error } = await admin.from("email_connections").delete().eq("id", connection.id).eq("user_id", userId);
  if (error) throw new Error("Could not disconnect Gmail. Please try again.");
}
