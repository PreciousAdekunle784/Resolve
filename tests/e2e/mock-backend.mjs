// =============================================================================
// TEST-ONLY local backend for end-to-end tests. NEVER used in production.
//
// Emulates the subset of the Supabase HTTP APIs (Auth, PostgREST, Storage)
// that Resolve uses, on top of a REAL PostgreSQL database with Resolve's real
// migrations and Row Level Security policies. Every data request runs as the
// `authenticated`/`anon` role with the caller's JWT claims, exactly as
// PostgREST does, so RLS is genuinely enforced during the E2E tests.
//
// It also emulates the Anthropic Messages API with deterministic, schema-valid
// responses so the AI pipeline (structured output parsing, validation,
// grounding, storage and UI) can be exercised without a real API key.
//
// Usage: TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres \
//        node tests/e2e/mock-backend.mjs
// =============================================================================

import { createHmac, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import pg from "pg";
import { JWT_SECRET, signJwt } from "./keys.mjs";
import { handleGoogle } from "./mock-google.mjs";

const PORT = Number(process.env.MOCK_BACKEND_PORT ?? 54321);
const ADMIN_URL = process.env.TEST_DATABASE_URL;
if (!ADMIN_URL) {
  console.error("TEST_DATABASE_URL is required");
  process.exit(1);
}
const DB_NAME = process.env.MOCK_DB_NAME ?? "resolve_e2e";
const ROOT = process.cwd();
const FILES_DIR = path.join(ROOT, "test-results", "mock-storage");

// ---------------------------------------------------------------------------
// JWT (HS256)
// ---------------------------------------------------------------------------
function verifyJwt(token) {
  if (!token) return null;
  const [h, b, s] = token.split(".");
  if (!h || !b || !s) return null;
  const expected = createHmac("sha256", JWT_SECRET).update(`${h}.${b}`).digest("base64url");
  if (expected.length !== s.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(s))) return null;
  const claims = JSON.parse(Buffer.from(b, "base64url").toString());
  if (claims.exp && claims.exp < Math.floor(Date.now() / 1000)) return null;
  return claims;
}

// ---------------------------------------------------------------------------
// Database setup
// ---------------------------------------------------------------------------
async function setupDatabase() {
  const admin = new pg.Client({ connectionString: ADMIN_URL });
  await admin.connect();
  await admin.query(`drop database if exists ${DB_NAME} with (force)`);
  await admin.query(`create database ${DB_NAME}`);
  await admin.end();
  const url = new URL(ADMIN_URL);
  url.pathname = `/${DB_NAME}`;
  const client = new pg.Client({ connectionString: url.toString() });
  await client.connect();
  const files = [
    path.join(ROOT, "supabase/tests/supabase_shim.sql"),
    ...readdirSync(path.join(ROOT, "supabase/migrations")).filter((f) => f.endsWith(".sql")).sort().map((f) => path.join(ROOT, "supabase/migrations", f)),
  ];
  for (const f of files) await client.query(readFileSync(f, "utf8"));
  await client.query(`
    create schema if not exists mock_auth;
    create table mock_auth.credentials (
      user_id uuid primary key references auth.users(id) on delete cascade,
      password_hash text not null
    );`);
  await client.end();
  return new pg.Pool({ connectionString: url.toString(), max: 10 });
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,HEAD,OPTIONS",
  "Access-Control-Expose-Headers": "Content-Range, Content-Type",
};
function send(res, status, body, headers = {}) {
  const isBuffer = Buffer.isBuffer(body);
  const payload = body === undefined || body === null ? "" : isBuffer ? body : typeof body === "string" ? body : JSON.stringify(body);
  res.writeHead(status, { ...CORS, ...(isBuffer ? {} : { "Content-Type": "application/json" }), ...headers });
  res.end(payload);
}
async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks);
}
const bearer = (req) => (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "") || null;

/** Runs fn inside a transaction as the role/claims from the JWT, like PostgREST. */
async function withRole(pool, claims, fn) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const role = claims?.role === "service_role" ? "service_role" : claims?.role === "authenticated" ? "authenticated" : "anon";
    await client.query(`set local role ${role}`);
    await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims ?? { role: "anon" })]);
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (e) {
    await client.query("rollback").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

function pgError(res, e, claims) {
  const map = { "42501": claims?.role === "anon" ? 401 : 403, "23514": 400, "23505": 409, "23503": 409, "22P02": 400, P0001: 400, "23502": 400, "22023": 400 };
  const status = map[e.code] ?? 400;
  send(res, status, { code: e.code, message: e.message, details: e.detail ?? null, hint: null });
}

// ---------------------------------------------------------------------------
// Auth (GoTrue subset)
// ---------------------------------------------------------------------------
const refreshTokens = new Map();
function hashPassword(pw) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(pw, salt, 32).toString("hex")}`;
}
function checkPassword(pw, stored) {
  const [salt, hash] = stored.split(":");
  const candidate = scryptSync(pw, salt, 32);
  return timingSafeEqual(candidate, Buffer.from(hash, "hex"));
}
function userJson(row) {
  const app = { provider: "email", providers: ["email"], ...(row.raw_app_meta_data ?? {}) };
  return {
    id: row.id,
    aud: "authenticated",
    role: "authenticated",
    email: row.email,
    email_confirmed_at: row.created_at,
    confirmed_at: row.created_at,
    phone: "",
    app_metadata: app,
    user_metadata: row.raw_user_meta_data ?? {},
    identities: [],
    created_at: row.created_at,
    updated_at: row.created_at,
    is_anonymous: false,
  };
}
function session(row) {
  const user = userJson(row);
  const now = Math.floor(Date.now() / 1000);
  const access_token = signJwt({
    sub: row.id,
    aud: "authenticated",
    role: "authenticated",
    email: row.email,
    app_metadata: user.app_metadata,
    user_metadata: user.user_metadata,
    iat: now,
    exp: now + 3600,
    session_id: randomUUID(),
    aal: "aal1",
    is_anonymous: false,
  });
  const refresh_token = randomBytes(24).toString("hex");
  refreshTokens.set(refresh_token, row.id);
  return { access_token, token_type: "bearer", expires_in: 3600, expires_at: now + 3600, refresh_token, user };
}
const authErr = (res, status, error_code, msg) => send(res, status, { code: status, error_code, msg });

async function handleAuth(pool, req, res, url, body) {
  const p = url.pathname.replace(/^\/auth\/v1/, "");
  const json = body.length ? JSON.parse(body.toString()) : {};
  const getUserRow = async (id) => (await pool.query("select * from auth.users where id = $1", [id])).rows[0];

  if (p === "/signup" && req.method === "POST") {
    const email = String(json.email ?? "").toLowerCase();
    if ((await pool.query("select 1 from auth.users where email = $1", [email])).rowCount) {
      return authErr(res, 422, "user_already_exists", "User already registered");
    }
    if (String(json.password ?? "").length < 6) return authErr(res, 422, "weak_password", "Password should be at least 6 characters.");
    const row = (await pool.query("insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning *", [email, json.data ?? {}])).rows[0];
    await pool.query("insert into mock_auth.credentials values ($1, $2)", [row.id, hashPassword(json.password)]);
    return send(res, 200, session(row));
  }
  if (p === "/token" && req.method === "POST") {
    const grant = url.searchParams.get("grant_type");
    if (grant === "password") {
      const r = await pool.query("select u.*, c.password_hash from auth.users u join mock_auth.credentials c on c.user_id = u.id where u.email = $1", [String(json.email ?? "").toLowerCase()]);
      if (!r.rowCount || !checkPassword(String(json.password ?? ""), r.rows[0].password_hash)) {
        return authErr(res, 400, "invalid_credentials", "Invalid login credentials");
      }
      return send(res, 200, session(r.rows[0]));
    }
    if (grant === "refresh_token") {
      const uid = refreshTokens.get(json.refresh_token);
      if (!uid) return authErr(res, 400, "refresh_token_not_found", "Invalid Refresh Token: Refresh Token Not Found");
      refreshTokens.delete(json.refresh_token);
      const row = await getUserRow(uid);
      if (!row) return authErr(res, 400, "user_not_found", "User not found");
      return send(res, 200, session(row));
    }
    return authErr(res, 400, "unsupported_grant_type", "Unsupported grant type");
  }
  if (p === "/user") {
    const claims = verifyJwt(bearer(req));
    if (!claims?.sub) return authErr(res, 401, "bad_jwt", "invalid JWT");
    const row = await getUserRow(claims.sub);
    if (!row) return authErr(res, 403, "user_not_found", "User from sub claim in JWT does not exist");
    if (req.method === "PUT") {
      if (json.password) await pool.query("update mock_auth.credentials set password_hash = $2 where user_id = $1", [row.id, hashPassword(json.password)]);
    }
    return send(res, 200, userJson(row));
  }
  if (p === "/logout") return send(res, 204, null);
  if (p === "/recover") return send(res, 200, {});
  if (p === "/settings") return send(res, 200, { external: { email: true }, mailer_autoconfirm: true });
  const adminMatch = p.match(/^\/admin\/users\/([0-9a-f-]+)$/);
  if (adminMatch && req.method === "GET") {
    const claims = verifyJwt(bearer(req));
    if (claims?.role !== "service_role") return authErr(res, 403, "not_admin", "User not allowed");
    const row = await getUserRow(adminMatch[1]);
    return row ? send(res, 200, userJson(row)) : authErr(res, 404, "user_not_found", "User not found");
  }
  if (adminMatch && req.method === "DELETE") {
    const claims = verifyJwt(bearer(req));
    if (claims?.role !== "service_role") return authErr(res, 403, "not_admin", "User not allowed");
    await pool.query("delete from auth.users where id = $1", [adminMatch[1]]);
    return send(res, 200, {});
  }
  return authErr(res, 404, "not_found", `Mock auth: ${req.method} ${p} not implemented`);
}

// ---------------------------------------------------------------------------
// PostgREST subset
// ---------------------------------------------------------------------------
const ident = (s) => {
  if (!/^[a-z_][a-z0-9_]*$/i.test(s)) throw Object.assign(new Error(`Invalid identifier: ${s}`), { code: "22023" });
  return `"${s}"`;
};
function splitTopLevel(s) {
  const parts = [];
  let depth = 0, quote = false, cur = "";
  for (const ch of s) {
    if (ch === '"') quote = !quote;
    if (!quote && ch === "(") depth++;
    if (!quote && ch === ")") depth--;
    if (!quote && depth === 0 && ch === ",") {
      parts.push(cur);
      cur = "";
    } else cur += ch;
  }
  if (cur) parts.push(cur);
  return parts.map((x) => x.trim()).filter(Boolean);
}
const EMBEDS = { cases: { table: "cases", localKey: "case_id" } };
function selectSql(select, alias = "t") {
  const items = splitTopLevel(select || "*");
  return items
    .map((item) => {
      const m = item.match(/^(\w+)\((.*)\)$/);
      if (m) {
        const embed = EMBEDS[m[1]];
        if (!embed) throw Object.assign(new Error(`Unsupported embed ${m[1]}`), { code: "22023" });
        const cols = splitTopLevel(m[2]).map((c) => (c === "*" ? "*" : ident(c))).join(", ");
        return `(select row_to_json(e) from (select ${cols} from public.${ident(embed.table)} where id = ${alias}.${ident(embed.localKey)}) e) as ${ident(m[1])}`;
      }
      return item === "*" ? `${alias}.*` : `${alias}.${ident(item)}`;
    })
    .join(", ");
}
function unquote(v) {
  return v.startsWith('"') && v.endsWith('"') ? v.slice(1, -1) : v;
}
function condition(col, opval, params) {
  const dot = opval.indexOf(".");
  const op = opval.slice(0, dot);
  const val = opval.slice(dot + 1);
  const c = `t.${ident(col)}`;
  const push = (v) => {
    params.push(v);
    return `$${params.length}`;
  };
  switch (op) {
    case "eq": return `${c} = ${push(unquote(val))}`;
    case "neq": return `${c} <> ${push(unquote(val))}`;
    case "gt": return `${c} > ${push(unquote(val))}`;
    case "gte": return `${c} >= ${push(unquote(val))}`;
    case "lt": return `${c} < ${push(unquote(val))}`;
    case "lte": return `${c} <= ${push(unquote(val))}`;
    case "is": return `${c} is ${val === "null" ? "null" : val === "true" ? "true" : "false"}`;
    case "like": return `${c}::text like ${push(unquote(val).replace(/\*/g, "%"))}`;
    case "ilike": return `${c}::text ilike ${push(unquote(val).replace(/\*/g, "%"))}`;
    case "in": {
      const list = splitTopLevel(val.replace(/^\(/, "").replace(/\)$/, "")).map(unquote);
      return `${c}::text = any(${push(list)}::text[])`;
    }
    default: throw Object.assign(new Error(`Unsupported operator ${op}`), { code: "22023" });
  }
}
const RESERVED = new Set(["select", "order", "limit", "offset", "or", "columns", "on_conflict"]);
function whereSql(searchParams, params) {
  const conds = [];
  for (const [key, value] of searchParams) {
    if (RESERVED.has(key)) continue;
    conds.push(condition(key, value, params));
  }
  for (const value of searchParams.getAll("or")) {
    const inner = splitTopLevel(value.replace(/^\(/, "").replace(/\)$/, ""));
    conds.push(`(${inner.map((x) => {
      const firstDot = x.indexOf(".");
      return condition(x.slice(0, firstDot), x.slice(firstDot + 1), params);
    }).join(" or ")})`);
  }
  return conds.length ? `where ${conds.join(" and ")}` : "";
}
function orderSql(order) {
  if (!order) return "";
  return `order by ${order.split(",").map((o) => {
    const [col, dir, nulls] = o.split(".");
    return `t.${ident(col)} ${dir === "desc" ? "desc" : "asc"}${nulls === "nullsfirst" ? " nulls first" : nulls === "nullslast" ? " nulls last" : ""}`;
  }).join(", ")}`;
}

async function handleRest(pool, req, res, url, body) {
  const claims = verifyJwt(bearer(req)) ?? verifyJwt(req.headers.apikey) ?? { role: "anon" };
  const p = url.pathname.replace(/^\/rest\/v1\//, "");
  const prefer = String(req.headers.prefer ?? "");
  const wantsObject = String(req.headers.accept ?? "").includes("application/vnd.pgrst.object+json");
  const sp = url.searchParams;
  try {
    // RPC
    if (p.startsWith("rpc/")) {
      const fn = p.slice(4);
      const args = body.length ? JSON.parse(body.toString()) : {};
      const params = [];
      const argSql = Object.entries(args).map(([k, v]) => {
        params.push(v);
        return `${ident(k)} := $${params.length}`;
      });
      const r = await withRole(pool, claims, (c) => c.query(`select to_json(public.${ident(fn)}(${argSql.join(", ")})) as r`, params));
      return send(res, 200, JSON.stringify(r.rows[0].r));
    }

    const table = `public.${ident(p)}`;
    const params = [];
    if (req.method === "GET" || req.method === "HEAD") {
      const where = whereSql(sp, params);
      const limit = sp.get("limit") ? `limit ${Number(sp.get("limit"))}` : "";
      const result = await withRole(pool, claims, async (c) => {
        const count = /count=exact/.test(prefer) ? (await c.query(`select count(*)::int as n from ${table} t ${where}`, params)).rows[0].n : null;
        if (req.method === "HEAD") return { rows: [], count };
        const r = await c.query(`select coalesce(json_agg(x), '[]'::json) as data from (select ${selectSql(sp.get("select"))} from ${table} t ${where} ${orderSql(sp.get("order"))} ${limit}) x`, params);
        return { rows: r.rows[0].data, count };
      });
      const headers = result.count !== null ? { "Content-Range": `0-${Math.max(result.rows.length - 1, 0)}/${result.count}` } : {};
      if (req.method === "HEAD") return send(res, 200, null, headers);
      return respondRows(res, result.rows, wantsObject, 200, headers);
    }

    const json = body.length ? JSON.parse(body.toString()) : {};
    const returnRep = /return=representation/.test(prefer);
    let sql;
    if (req.method === "POST") {
      const rows = Array.isArray(json) ? json : [json];
      const cols = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
      params.push(JSON.stringify(rows));
      sql = `insert into ${table} (${cols.map(ident).join(", ")}) select ${cols.map(ident).join(", ")} from json_populate_recordset(null::${table}, $1::json) returning *`;
    } else if (req.method === "PATCH") {
      const cols = Object.keys(json);
      params.push(JSON.stringify(json));
      const where = whereSql(sp, params);
      sql = `update ${table} t set (${cols.map(ident).join(", ")}) = (select ${cols.map(ident).join(", ")} from json_populate_record(null::${table}, $1::json)) ${where} returning t.*`;
      if (cols.length === 1) sql = `update ${table} t set ${ident(cols[0])} = (select ${ident(cols[0])} from json_populate_record(null::${table}, $1::json)) ${where} returning t.*`;
    } else if (req.method === "DELETE") {
      const where = whereSql(sp, params);
      sql = `delete from ${table} t ${where} returning t.*`;
    } else {
      return send(res, 405, { message: "Method not allowed" });
    }
    const rows = await withRole(pool, claims, async (c) => {
      const r = await c.query(`with t as (${sql}) select coalesce(json_agg(x), '[]'::json) as data from (select ${selectSql(sp.get("select"))} from t) x`, params);
      return r.rows[0].data;
    });
    if (!returnRep) return send(res, req.method === "POST" ? 201 : 204, null);
    return respondRows(res, rows, wantsObject, req.method === "POST" ? 201 : 200);
  } catch (e) {
    if (e.code) return pgError(res, e, claims);
    console.error("[mock rest]", e);
    return send(res, 500, { message: String(e.message) });
  }
}
function respondRows(res, rows, wantsObject, status, headers = {}) {
  if (wantsObject) {
    if (rows.length !== 1) {
      return send(res, 406, { code: "PGRST116", details: `The result contains ${rows.length} rows`, hint: null, message: "JSON object requested, multiple (or no) rows returned" });
    }
    return send(res, status, rows[0], headers);
  }
  return send(res, status, rows, headers);
}

// ---------------------------------------------------------------------------
// Storage subset
// ---------------------------------------------------------------------------
const storageErr = (res, status, error, message) => send(res, status, { statusCode: String(status), error, message });
const filePathFor = (bucket, name) => path.join(FILES_DIR, bucket, ...name.split("/"));

async function handleStorage(pool, req, res, url, body) {
  const p = decodeURIComponent(url.pathname.replace(/^\/storage\/v1/, ""));
  const claims = verifyJwt(bearer(req)) ?? { role: "anon" };
  try {
    // Create signed upload URL (checks INSERT permission under RLS).
    let m = p.match(/^\/object\/upload\/sign\/([^/]+)\/(.+)$/);
    if (m && req.method === "POST") {
      const [, bucket, name] = m;
      if (!claims.sub) return storageErr(res, 403, "Unauthorized", "Unauthorized");
      const client = await pool.connect();
      try {
        await client.query("begin");
        await client.query("set local role authenticated");
        await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)]);
        await client.query("insert into storage.objects (bucket_id, name, owner) values ($1, $2, $3)", [bucket, name, claims.sub]);
      } catch (e) {
        await client.query("rollback").catch(() => {});
        client.release();
        return storageErr(res, 403, "Unauthorized", e.message);
      }
      await client.query("rollback");
      client.release();
      const token = signJwt({ url: `${bucket}/${name}`, owner: claims.sub, exp: Math.floor(Date.now() / 1000) + 7200 });
      return send(res, 200, { url: `/object/upload/sign/${bucket}/${name}?token=${token}`, token });
    }
    // Upload with signed token.
    if (m && req.method === "PUT") {
      const [, bucket, name] = m;
      const token = verifyJwt(url.searchParams.get("token"));
      if (!token || token.url !== `${bucket}/${name}`) return storageErr(res, 400, "InvalidJWT", "Invalid token");
      const form = await new Response(body, { headers: { "content-type": req.headers["content-type"] } }).formData();
      let file = null;
      for (const [, v] of form) if (typeof v !== "string") file = v;
      if (!file) return storageErr(res, 400, "InvalidRequest", "No file");
      const bucketRow = (await pool.query("select * from storage.buckets where id = $1", [bucket])).rows[0];
      if (!bucketRow) return storageErr(res, 404, "Bucket not found", "Bucket not found");
      if (bucketRow.file_size_limit && file.size > Number(bucketRow.file_size_limit)) return storageErr(res, 413, "Payload too large", "The object exceeded the maximum allowed size");
      if (bucketRow.allowed_mime_types && !bucketRow.allowed_mime_types.includes(file.type)) return storageErr(res, 415, "invalid_mime_type", `mime type ${file.type} is not supported`);
      try {
        await pool.query("insert into storage.objects (bucket_id, name, owner, metadata) values ($1, $2, $3, $4)", [bucket, name, token.owner, { mimetype: file.type, size: file.size }]);
      } catch (e) {
        if (e.code === "23505") return storageErr(res, 409, "Duplicate", "The resource already exists");
        throw e;
      }
      const fp = filePathFor(bucket, name);
      mkdirSync(path.dirname(fp), { recursive: true });
      writeFileSync(fp, Buffer.from(await file.arrayBuffer()));
      return send(res, 200, { Key: `${bucket}/${name}` });
    }
    // Create signed download URL (checks SELECT permission under RLS).
    m = p.match(/^\/object\/sign\/([^/]+)\/(.+)$/);
    if (m && req.method === "POST") {
      const [, bucket, name] = m;
      const r = await withRole(pool, claims, (c) => c.query("select metadata from storage.objects where bucket_id = $1 and name = $2", [bucket, name]));
      if (!r.rowCount) return storageErr(res, 400, "not_found", "Object not found");
      const json = JSON.parse(body.toString() || "{}");
      const token = signJwt({ url: `${bucket}/${name}`, exp: Math.floor(Date.now() / 1000) + Number(json.expiresIn ?? 60) });
      return send(res, 200, { signedURL: `/object/sign/${bucket}/${name}?token=${token}` });
    }
    if (m && req.method === "GET") {
      const [, bucket, name] = m;
      const token = verifyJwt(url.searchParams.get("token"));
      if (!token || token.url !== `${bucket}/${name}`) return storageErr(res, 400, "InvalidJWT", "Invalid or expired token");
      return serveFile(pool, res, bucket, name, url.searchParams.get("download"));
    }
    // List objects.
    m = p.match(/^\/object\/list\/([^/]+)$/);
    if (m && req.method === "POST") {
      const bucket = m[1];
      const json = JSON.parse(body.toString() || "{}");
      const prefix = String(json.prefix ?? "").replace(/\/$/, "");
      const r = await withRole(pool, claims, (c) => c.query("select id, name from storage.objects where bucket_id = $1 and name like $2", [bucket, `${prefix}/%`]));
      const seen = new Map();
      for (const row of r.rows) {
        const rest = row.name.slice(prefix.length + 1);
        const [first, ...more] = rest.split("/");
        if (more.length) seen.set(first, { name: first, id: null });
        else seen.set(first, { name: first, id: row.id });
      }
      return send(res, 200, Array.from(seen.values()));
    }
    // Delete objects.
    m = p.match(/^\/object\/([^/]+)$/);
    if (m && req.method === "DELETE") {
      const bucket = m[1];
      const json = JSON.parse(body.toString() || "{}");
      const names = json.prefixes ?? [];
      const r = await withRole(pool, claims, (c) => c.query("delete from storage.objects where bucket_id = $1 and name = any($2::text[]) returning name, bucket_id", [bucket, names]));
      for (const row of r.rows) rmSync(filePathFor(bucket, row.name), { force: true });
      return send(res, 200, r.rows);
    }
    // Authenticated download.
    m = p.match(/^\/object\/(?:authenticated\/)?([^/]+)\/(.+)$/);
    if (m && req.method === "GET") {
      const [, bucket, name] = m;
      const r = await withRole(pool, claims, (c) => c.query("select 1 from storage.objects where bucket_id = $1 and name = $2", [bucket, name]));
      if (!r.rowCount) return storageErr(res, 400, "not_found", "Object not found");
      return serveFile(pool, res, bucket, name);
    }
    return storageErr(res, 404, "not_found", `Mock storage: ${req.method} ${p} not implemented`);
  } catch (e) {
    console.error("[mock storage]", e);
    return storageErr(res, 500, "internal", String(e.message));
  }
}
async function serveFile(pool, res, bucket, name, download) {
  const fp = filePathFor(bucket, name);
  if (!existsSync(fp)) return storageErr(res, 404, "not_found", "Object not found");
  const meta = (await pool.query("select metadata from storage.objects where bucket_id = $1 and name = $2", [bucket, name])).rows[0]?.metadata ?? {};
  return send(res, 200, readFileSync(fp), {
    "Content-Type": meta.mimetype ?? "application/octet-stream",
    ...(download !== null && download !== undefined ? { "Content-Disposition": `attachment; filename="${download || path.basename(name)}"` } : {}),
  });
}

// ---------------------------------------------------------------------------
// Anthropic Messages API (deterministic fake for tests)
// ---------------------------------------------------------------------------
const MOCK_REFERENCE = "NIP-E2E-REF-0001";
const aiRequests = [];
/** Deterministic, schema-valid result for each AI task (shared by both provider mocks). */
function fakeTaskResult(system, userText) {
  let result;
  if (system.includes("You read one piece of evidence")) {
    result = {
      readable: true,
      document_type: "transfer_receipt",
      summary: "A transfer receipt showing a debit marked successful.",
      extracted_fields: [
        { field: "amount", label: "Amount", exact_text: "NGN 25,000.00", confidence: "high" },
        { field: "transaction_reference", label: "Session ID", exact_text: MOCK_REFERENCE, confidence: "high" },
        { field: "transaction_status", label: "Status", exact_text: "Successful", confidence: "high" },
      ],
      status_shown: "Successful",
      caveats: ["A 'Successful' status on a receipt does not prove the recipient was credited."],
      sensitive_data_visible: false,
    };
  } else if (system.includes("You analyse a user's financial transaction problem")) {
    const guidanceId = (userText.match(/ID: ([0-9a-f-]{36})/) ?? [])[1];
    result = {
      summary: "Your account was debited for a transfer that the recipient says they did not receive. The receipt shows the transfer as successful, which does not by itself prove the money arrived.",
      category_assessment: { likely_category: "failed_or_pending_transfer", matches_selected_category: true, confidence: "high", explanation: "You were debited but the recipient was not credited." },
      key_facts: [
        { label: "Amount", value: "NGN 25,000.00", normalized_value: "25000.00", source: "user_provided", source_detail: "Your report", case_field: "amount" },
        { label: "Transaction reference", value: MOCK_REFERENCE, normalized_value: null, source: "document_extracted", source_detail: "receipt.png", case_field: "transaction_reference" },
        { label: "Recipient account", value: "0987654321", normalized_value: null, source: "user_provided", source_detail: "Your report", case_field: "recipient_details" },
      ],
      missing_information: [{ item: "Recipient's bank statement", why_it_matters: "Shows whether the money arrived.", importance: "helpful" }],
      conflicts: [],
      follow_up_questions: [{ question: "Has the recipient checked their statement for the transfer?", reason: "Confirms non-receipt." }],
      next_steps: [{ title: "Complain to your bank", detail: "Use your bank's official complaint channel and keep the reference number." }],
      evidence_suggestions: [{ item: "Debit alert", reason: "Shows the debit", already_provided: false }],
      guidance_references: [
        ...(guidanceId ? [{ guidance_id: guidanceId, relevance: "Explains how to lodge a complaint." }] : []),
        { guidance_id: "00000000-0000-0000-0000-000000000000", relevance: "Fabricated reference that must be removed." },
      ],
      important_cautions: ["Never pay anyone who promises to recover your money for a fee."],
    };
  } else if (system.includes("You write a formal complaint letter")) {
    result = {
      subject: "Complaint about a failed transfer",
      body: "Dear Sir/Madam,\n\nI am writing to complain about a transfer of NGN 25,000.00 that was debited from my account but not received.\n\nTransaction reference: [ADD: transaction reference]\n\nPlease acknowledge this complaint and provide a complaint reference number.\n\nYours faithfully,\nE2E Tester",
      missing_placeholders: ["transaction reference"],
    };
  } else if (system.includes("You review a complaint letter before it is sent")) {
    result = {
      summary: "The letter clearly identifies the transaction and the resolution requested.",
      issues: [{ problem: "The letter doesn't say when you first noticed the problem.", suggestion: "Add the date you noticed it, if you know it." }],
      tone_ok: true,
    };
  } else if (system.includes("You read a reply from a financial institution")) {
    const ref = (userText.match(/[A-Z]{2}\/CMP\/\d+/) ?? [])[0];
    const timeframe = (userText.match(/within \d+ working days/) ?? [])[0];
    result = {
      classification: "information_requested",
      summary: "The bank logged your complaint and asked for a copy of your account statement.",
      reference_numbers: [
        ...(ref ? [{ value: ref, quote: `reference ${ref}` }] : []),
        { value: "FAKE/REF/000", quote: "reference FAKE/REF/000" },
      ],
      information_requested: ["A copy of your account statement for the day of the transaction"],
      timeframes: timeframe ? [{ quote: timeframe }] : [],
      amounts: [],
      suggested_case_status: "additional_information_required",
      status_reason: "The bank asked you for more information.",
      reply_points: ["Attach your statement and quote their reference."],
      confidence: "high",
    };
  } else if (system.includes("You plan the next steps of a customer's complaint")) {
    const guidanceId = (userText.match(/ID: ([0-9a-f-]{36})/) ?? [])[1];
    result = {
      situation: "Your bank asked for your statement before it can continue.",
      next_actions: [
        { title: "Send the statement", detail: "Reply to the bank with your statement attached and quote their reference.", timing: "now" },
        { title: "Set a follow-up date", detail: "Plan when you'll chase them if you hear nothing.", timing: "if_no_reply" },
      ],
      escalation: {
        consider_now: false,
        explanation: "It's too early to escalate; the bank is still investigating.",
        guidance_ids: [...(guidanceId ? [guidanceId] : []), "00000000-0000-0000-0000-000000000000"],
      },
      evidence_to_gather: ["Account statement"],
      cautions: ["Never share your PIN or OTP with anyone who contacts you about this complaint."],
    };
  } else {
    return null;
  }
  return result;
}

function handleAnthropic(req, res, body) {
  const json = JSON.parse(body.toString() || "{}");
  aiRequests.push({ provider: "anthropic", at: Date.now(), hasFormat: Boolean(json.output_config?.format), model: json.model, apiKey: Boolean(req.headers["x-api-key"]) });
  const system = Array.isArray(json.system) ? json.system.map((s) => s.text).join("\n") : String(json.system ?? "");
  const userText = (json.messages?.[0]?.content ?? []).filter((c) => c.type === "text").map((c) => c.text).join("\n");
  const result = fakeTaskResult(system, userText);
  if (!result) return send(res, 400, { type: "error", error: { type: "invalid_request_error", message: "Unknown task in mock" } });
  return send(res, 200, {
    id: `msg_${randomUUID()}`,
    type: "message",
    role: "assistant",
    model: "mock-claude-e2e",
    content: [{ type: "text", text: JSON.stringify(result) }],
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: { input_tokens: 10, output_tokens: 10 },
  });
}


function handleGemini(req, res, body, url) {
  const json = JSON.parse(body.toString() || "{}");
  aiRequests.push({
    provider: "gemini",
    at: Date.now(),
    hasFormat: Boolean(json.generationConfig?.responseJsonSchema || json.generationConfig?.responseSchema),
    model: decodeURIComponent(url.pathname.split("/models/")[1] ?? "").split(":")[0],
    apiKey: Boolean(req.headers["x-goog-api-key"] || url.searchParams.get("key")),
  });
  const system = (json.systemInstruction?.parts ?? []).map((p) => p.text ?? "").join("\n");
  const userText = (json.contents ?? []).flatMap((c) => c.parts ?? []).filter((p) => typeof p.text === "string").map((p) => p.text).join("\n");
  const result = fakeTaskResult(system, userText);
  if (!result) return send(res, 400, { error: { code: 400, message: "Unknown task in mock", status: "INVALID_ARGUMENT" } });
  return send(res, 200, {
    candidates: [{ content: { role: "model", parts: [{ text: JSON.stringify(result) }] }, finishReason: "STOP", index: 0 }],
    modelVersion: "mock-gemini-e2e",
    usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 10, totalTokenCount: 20 },
  });
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------
const pool = await setupDatabase();
rmSync(FILES_DIR, { recursive: true, force: true });
mkdirSync(FILES_DIR, { recursive: true });

http
  .createServer(async (req, res) => {
    try {
      if (req.method === "OPTIONS") return send(res, 204, null);
      const url = new URL(req.url, `http://localhost:${PORT}`);
      const body = await readBody(req);
      if (url.pathname === "/health") return send(res, 200, { ok: true });
      if (url.pathname === "/__test/ai-requests") return send(res, 200, aiRequests);
      if (url.pathname === "/__test/make-admin" && req.method === "POST") {
        const { email } = JSON.parse(body.toString());
        await pool.query(`update auth.users set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"admin"}' where email = $1`, [email]);
        return send(res, 200, { ok: true });
      }
      if (url.pathname.startsWith("/auth/v1")) return await handleAuth(pool, req, res, url, body);
      if (url.pathname.startsWith("/rest/v1")) return await handleRest(pool, req, res, url, body);
      if (url.pathname.startsWith("/storage/v1")) return await handleStorage(pool, req, res, url, body);
      if (url.pathname.startsWith("/v1/messages")) return handleAnthropic(req, res, body);
      if (/^\/v1(beta|alpha)?\/models\/[^/]+:generateContent$/.test(url.pathname)) return handleGemini(req, res, body, url);
      if (await handleGoogle(req, res, url, body, send)) return;
      return send(res, 404, { message: "not found" });
    } catch (e) {
      console.error("[mock]", e);
      send(res, 500, { message: String(e?.message ?? e) });
    }
  })
  .listen(PORT, () => console.log(`[mock-backend] listening on http://localhost:${PORT}`));

