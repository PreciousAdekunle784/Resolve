import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";

/**
 * Test helpers for running Resolve's migrations against a plain PostgreSQL
 * server and executing queries as specific Supabase roles/users.
 *
 * Set TEST_DATABASE_URL to a PostgreSQL connection string for a superuser,
 * e.g. postgres://postgres:postgres@localhost:5432/postgres
 */

export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

const root = process.cwd();

export async function createTestDatabase(): Promise<{ url: string; drop: () => Promise<void> }> {
  if (!TEST_DATABASE_URL) throw new Error("TEST_DATABASE_URL is not set");
  const dbName = `resolve_test_${process.pid}_${Date.now()}`;
  const admin = new Client({ connectionString: TEST_DATABASE_URL });
  await admin.connect();
  await admin.query(`create database ${dbName}`);
  await admin.end();

  const url = new URL(TEST_DATABASE_URL);
  url.pathname = `/${dbName}`;
  const client = new Client({ connectionString: url.toString() });
  await client.connect();
  const files = [
    path.join(root, "supabase/tests/supabase_shim.sql"),
    ...readdirSync(path.join(root, "supabase/migrations"))
      .filter((f) => f.endsWith(".sql"))
      .sort()
      .map((f) => path.join(root, "supabase/migrations", f)),
  ];
  for (const file of files) {
    await client.query(readFileSync(file, "utf8"));
  }
  await client.end();

  return {
    url: url.toString(),
    drop: async () => {
      const a = new Client({ connectionString: TEST_DATABASE_URL });
      await a.connect();
      await a.query(`drop database if exists ${dbName} with (force)`);
      await a.end();
    },
  };
}

export type Claims = { sub?: string; role: string; app_metadata?: Record<string, unknown> };

/**
 * Runs `fn` inside a transaction as the given Supabase role with the given JWT
 * claims, exactly like PostgREST does. The transaction is rolled back unless
 * `commit` is true.
 */
export async function asRole<T>(
  client: Client,
  claims: Claims,
  fn: (c: Client) => Promise<T>,
  commit = true,
): Promise<T> {
  await client.query("begin");
  try {
    await client.query(`set local role ${claims.role === "anon" ? "anon" : claims.role}`);
    await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)]);
    const result = await fn(client);
    await client.query(commit ? "commit" : "rollback");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}

export const asUser = <T>(client: Client, userId: string, fn: (c: Client) => Promise<T>, appMetadata = {}) =>
  asRole(client, { sub: userId, role: "authenticated", app_metadata: appMetadata }, fn);

export const asAnon = <T>(client: Client, fn: (c: Client) => Promise<T>) =>
  asRole(client, { role: "anon" }, fn);
