// =============================================================================
// TEST-ONLY emulator of Google OAuth 2.0 and the Gmail API subset Resolve uses.
// Enforces the same rules the real services do for Resolve's flow: client
// credentials, redirect URI, PKCE (S256), granted scopes, bearer tokens and
// refresh tokens. Test hooks under /__test/google/* simulate failures and
// incoming replies. NEVER used in production.
// =============================================================================
import { createHash, randomBytes } from "node:crypto";

export const TEST_GOOGLE_CLIENT_ID = "test-google-client-id.apps.googleusercontent.com";
export const TEST_GOOGLE_CLIENT_SECRET = "test-google-client-secret";
const SEND = "https://www.googleapis.com/auth/gmail.send";
const READ = "https://www.googleapis.com/auth/gmail.readonly";

const codes = new Map(); // code -> { challenge, scope, redirectUri, email }
const accessTokens = new Map(); // token -> { email, scope, refresh }
const refreshTokens = new Map(); // token -> { email, scope }
const messages = []; // { id, threadId, owner, from, to, subject, messageId, text, attachments, internalDate, raw }
const flags = { failNext: null, denyNext: false, accountEmail: null };

const id = () => randomBytes(8).toString("hex");
const json = (send, res, status, body) => send(res, status, body);

function unfoldHeaders(block) {
  const out = {};
  for (const line of block.replace(/\r\n[ \t]+/g, " ").split("\r\n")) {
    const i = line.indexOf(":");
    if (i > 0) out[line.slice(0, i).toLowerCase()] = line.slice(i + 1).trim();
  }
  return out;
}
const decodeWords = (v) => (v ?? "").replace(/=\?UTF-8\?B\?([^?]+)\?=\s*/gi, (_, b) => Buffer.from(b, "base64").toString("utf8"));

function parseMime(raw) {
  const text = raw.toString("utf8");
  const split = text.indexOf("\r\n\r\n");
  const headers = unfoldHeaders(text.slice(0, split));
  const body = text.slice(split + 4);
  const boundary = (headers["content-type"] ?? "").match(/boundary="([^"]+)"/)?.[1];
  let plain = "";
  const attachments = [];
  const parts = boundary ? body.split(`--${boundary}`).slice(1, -1) : [`${["Content-Type: " + headers["content-type"], "Content-Transfer-Encoding: " + headers["content-transfer-encoding"]].join("\r\n")}\r\n\r\n${body}`];
  for (const part of parts) {
    const p = part.replace(/^\r\n/, "");
    const i = p.indexOf("\r\n\r\n");
    const h = unfoldHeaders(p.slice(0, i));
    const content = Buffer.from(p.slice(i + 4).replace(/\r\n/g, ""), "base64");
    const filename = (h["content-disposition"] ?? "").match(/filename="([^"]+)"/)?.[1];
    if (filename) attachments.push({ filename, contentType: (h["content-type"] ?? "").split(";")[0], size: content.length, head: content.subarray(0, 8).toString("latin1") });
    else if ((h["content-type"] ?? "").startsWith("text/plain")) plain = content.toString("utf8");
  }
  return {
    from: decodeWords(headers.from),
    to: headers.to,
    subject: decodeWords(headers.subject),
    messageId: headers["message-id"],
    text: plain,
    attachments,
  };
}

function bearer(req) {
  const token = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
  return accessTokens.get(token) ?? null;
}

function gmailPayload(m) {
  return {
    mimeType: "multipart/mixed",
    headers: [
      { name: "From", value: m.from },
      { name: "To", value: m.to },
      { name: "Subject", value: m.subject },
      { name: "Message-ID", value: m.messageId },
    ],
    parts: [{ mimeType: "text/plain", body: { data: Buffer.from(m.text, "utf8").toString("base64url") } }],
  };
}

/** Returns true if the request was handled. */
export async function handleGoogle(req, res, url, body, send) {
  const p = url.pathname;

  // ---------------------------------------------------------------- test hooks
  if (p === "/__test/google/fail-next" && req.method === "POST") {
    flags.failNext = JSON.parse(body.toString()).mode;
    return json(send, res, 200, { ok: true }), true;
  }
  if (p === "/__test/google/deny-next" && req.method === "POST") {
    flags.denyNext = true;
    return json(send, res, 200, { ok: true }), true;
  }
  if (p === "/__test/google/account" && req.method === "POST") {
    flags.accountEmail = JSON.parse(body.toString()).email;
    return json(send, res, 200, { ok: true }), true;
  }
  if (p === "/__test/google/sent" && req.method === "GET") {
    return json(send, res, 200, messages.filter((m) => m.sent).map(({ raw, ...m }) => ({ ...m, rawSize: raw?.length ?? 0 }))), true;
  }
  if (p === "/__test/google/reply" && req.method === "POST") {
    const { to, from, subject, text } = JSON.parse(body.toString());
    const original = [...messages].reverse().find((m) => m.sent && m.to === to);
    if (!original) return json(send, res, 404, { error: "no sent message to that address" }), true;
    const reply = {
      id: id(), threadId: original.threadId, owner: original.owner, from, to: original.owner,
      subject: subject ?? `Re: ${original.subject}`, messageId: `<${id()}@bank.example>`,
      text, attachments: [], internalDate: String(Date.now()), sent: false,
    };
    messages.push(reply);
    return json(send, res, 200, { id: reply.id, threadId: reply.threadId }), true;
  }

  // -------------------------------------------------------------------- OAuth
  if (p === "/o/oauth2/v2/auth" && req.method === "GET") {
    const q = url.searchParams;
    const redirect = q.get("redirect_uri");
    if (q.get("client_id") !== TEST_GOOGLE_CLIENT_ID || !redirect) return send(res, 400, "invalid_client"), true;
    if (q.get("code_challenge_method") !== "S256" || !q.get("code_challenge")) return send(res, 400, "PKCE required"), true;
    const back = new URL(redirect);
    back.searchParams.set("state", q.get("state") ?? "");
    if (flags.denyNext) {
      flags.denyNext = false;
      back.searchParams.set("error", "access_denied");
    } else {
      const code = id();
      const email = flags.accountEmail ?? q.get("login_hint") ?? "e2e.user@gmail.com";
      codes.set(code, { challenge: q.get("code_challenge"), scope: q.get("scope"), redirectUri: redirect, email });
      back.searchParams.set("code", code);
      back.searchParams.set("scope", q.get("scope"));
    }
    res.writeHead(302, { Location: back.toString() });
    res.end();
    return true;
  }
  if (p === "/token" && req.method === "POST") {
    const f = new URLSearchParams(body.toString());
    if (f.get("client_id") !== TEST_GOOGLE_CLIENT_ID || f.get("client_secret") !== TEST_GOOGLE_CLIENT_SECRET) {
      return json(send, res, 401, { error: "invalid_client" }), true;
    }
    if (f.get("grant_type") === "authorization_code") {
      const c = codes.get(f.get("code"));
      codes.delete(f.get("code"));
      const challenge = createHash("sha256").update(f.get("code_verifier") ?? "").digest("base64url");
      if (!c || c.redirectUri !== f.get("redirect_uri") || c.challenge !== challenge) return json(send, res, 400, { error: "invalid_grant" }), true;
      const access = `ya29.${id()}`;
      const refresh = `1//${id()}`;
      refreshTokens.set(refresh, { email: c.email, scope: c.scope });
      accessTokens.set(access, { email: c.email, scope: c.scope, refresh });
      return json(send, res, 200, { access_token: access, expires_in: 3599, refresh_token: refresh, scope: c.scope, token_type: "Bearer" }), true;
    }
    if (f.get("grant_type") === "refresh_token") {
      const r = refreshTokens.get(f.get("refresh_token"));
      if (!r) return json(send, res, 400, { error: "invalid_grant", error_description: "Token has been expired or revoked." }), true;
      const access = `ya29.${id()}`;
      accessTokens.set(access, { ...r, refresh: f.get("refresh_token") });
      return json(send, res, 200, { access_token: access, expires_in: 3599, scope: r.scope, token_type: "Bearer" }), true;
    }
    return json(send, res, 400, { error: "unsupported_grant_type" }), true;
  }
  if (p === "/revoke" && req.method === "POST") {
    const token = new URLSearchParams(body.toString()).get("token");
    refreshTokens.delete(token);
    for (const [k, v] of accessTokens) if (k === token || v.refresh === token) accessTokens.delete(k);
    return json(send, res, 200, {}), true;
  }

  // -------------------------------------------------------------------- Gmail
  if (!p.startsWith("/gmail/v1/") && !p.startsWith("/upload/gmail/v1/")) return false;
  const who = bearer(req);
  if (!who) return json(send, res, 401, { error: { code: 401, message: "Invalid Credentials" } }), true;
  const scopes = who.scope.split(" ");
  const insufficient = () => json(send, res, 403, { error: { code: 403, message: "Request had insufficient authentication scopes." } });

  if (p === "/gmail/v1/users/me/profile") return json(send, res, 200, { emailAddress: who.email }), true;

  if (p === "/upload/gmail/v1/users/me/messages/send" && req.method === "POST") {
    if (!scopes.includes(SEND)) return insufficient(), true;
    if (!String(req.headers["content-type"]).startsWith("message/rfc822")) return json(send, res, 400, { error: { message: "Bad content type" } }), true;
    const parsed = parseMime(body);
    const mode = flags.failNext;
    flags.failNext = null;
    if (mode === "reject") return json(send, res, 400, { error: { code: 400, message: "Invalid To header" } }), true;
    if (mode === "server_error") return json(send, res, 503, { error: { code: 503, message: "Backend Error" } }), true;
    const message = { id: id(), threadId: id(), owner: who.email, ...parsed, internalDate: String(Date.now()), sent: true, raw: body };
    if (parsed.from && !parsed.from.includes(`<${who.email}>`) && parsed.from !== who.email) {
      return json(send, res, 400, { error: { code: 400, message: "From address does not match the account" } }), true;
    }
    messages.push(message);
    if (mode === "drop") {
      // Accepted and sent, but the connection drops before the client hears back.
      res.destroy();
      return true;
    }
    return json(send, res, 200, { id: message.id, threadId: message.threadId, labelIds: ["SENT"] }), true;
  }
  if (p === "/gmail/v1/users/me/messages" && req.method === "GET") {
    if (!scopes.includes(READ)) return insufficient(), true;
    const q = url.searchParams.get("q") ?? "";
    const wanted = q.match(/^rfc822msgid:(.+)$/)?.[1];
    const found = messages.filter((m) => m.owner === who.email && wanted && m.messageId === `<${wanted}>`);
    return json(send, res, 200, found.length ? { messages: found.map((m) => ({ id: m.id, threadId: m.threadId })) } : { resultSizeEstimate: 0 }), true;
  }
  const thread = p.match(/^\/gmail\/v1\/users\/me\/threads\/([^/]+)$/);
  if (thread && req.method === "GET") {
    if (!scopes.includes(READ)) return insufficient(), true;
    const list = messages.filter((m) => m.owner === who.email && m.threadId === decodeURIComponent(thread[1]));
    if (list.length === 0) return json(send, res, 404, { error: { code: 404, message: "Not Found" } }), true;
    return json(send, res, 200, { id: thread[1], messages: list.map((m) => ({ id: m.id, threadId: m.threadId, internalDate: m.internalDate, payload: gmailPayload(m) })) }), true;
  }
  return json(send, res, 404, { error: { code: 404, message: "Not Found" } }), true;
}
