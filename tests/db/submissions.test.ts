import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TEST_DATABASE_URL, asRole, asUser, createTestDatabase } from "./helpers";

/** Security and integrity tests for bank submissions, mailbox connections and responses. */
const run = TEST_DATABASE_URL ? describe : describe.skip;

run("database security: bank submissions", () => {
  let db: { url: string; drop: () => Promise<void> };
  let client: Client;
  const userA = randomUUID();
  const userB = randomUUID();
  const admin = randomUUID();
  let caseA: string;
  let caseB: string;
  let draftA: string;
  let connectionA: string;

  const asService = <T>(fn: (c: Client) => Promise<T>) => asRole(client, { role: "service_role" }, fn);
  const submission = (overrides: Record<string, unknown> = {}) => ({
    case_id: caseA,
    user_id: userA,
    draft_id: draftA,
    draft_version: 1,
    method: "email",
    recipient: "complaints@bank.example",
    recipient_source: "verified_directory",
    subject: "Complaint",
    body: "Dear Sir/Madam, ...",
    idempotency_key: randomUUID(),
    status: "queued",
    authorized_at: new Date().toISOString(),
    authorization_statement: "I authorise Resolve to send this complaint from my email account.",
    ...overrides,
  });
  const insertSubmission = (c: Client, values: Record<string, unknown>) => {
    const cols = Object.keys(values);
    return c.query(
      `insert into public.complaint_submissions (${cols.join(", ")}) values (${cols.map((_, i) => `$${i + 1}`).join(", ")}) returning id`,
      Object.values(values),
    );
  };

  beforeAll(async () => {
    db = await createTestDatabase();
    client = new Client({ connectionString: db.url });
    await client.connect();
    await client.query(
      `insert into auth.users (id, email) values ($1, 'a@example.com'), ($2, 'b@example.com'), ($3, 'admin@example.com')`,
      [userA, userB, admin],
    );
    caseA = (await client.query("insert into public.cases (user_id) values ($1) returning id", [userA])).rows[0].id;
    caseB = (await client.query("insert into public.cases (user_id) values ($1) returning id", [userB])).rows[0].id;
    draftA = (
      await client.query(
        "insert into public.complaint_drafts (case_id, user_id, content, version, status, approved_at) values ($1, $2, 'Letter', 1, 'approved', now()) returning id",
        [caseA, userA],
      )
    ).rows[0].id;
    connectionA = (
      await client.query("insert into public.email_connections (user_id, provider, email_address) values ($1, 'gmail', 'a@gmail.com') returning id", [userA])
    ).rows[0].id;
    await client.query("insert into public.email_connection_secrets (connection_id, refresh_token_encrypted) values ($1, 'v1.cipher')", [connectionA]);
  }, 60_000);

  afterAll(async () => {
    await client?.end();
    await db?.drop();
  });

  describe("bank contact channels", () => {
    it("can only be managed by admins", async () => {
      const values = ["zenith", "Zenith Bank", "email", "complaints@zenith.example", "Complaints", "https://zenith.example/contact"];
      const sql = "insert into public.bank_contact_channels (bank_id, bank_name, channel_type, value, label, source_url) values ($1, $2, $3, $4, $5, $6)";
      await expect(asUser(client, userA, (c) => c.query(sql, values))).rejects.toThrow(/row-level security/);
      await asUser(client, admin, (c) => c.query(sql, values), { role: "admin" });
      const rows = await asUser(client, userA, async (c) => (await c.query("select value from public.bank_contact_channels")).rows);
      expect(rows).toEqual([{ value: "complaints@zenith.example" }]);
    });

    it("rejects malformed channels and verification without a date", async () => {
      const sql = "insert into public.bank_contact_channels (bank_id, bank_name, channel_type, value, label, source_url, status) values ($1, $2, $3, $4, $5, $6, $7)";
      await expect(client.query(sql, ["gtbank", "GTBank", "email", "not-an-email", "Complaints", "https://gt.example", "unverified"])).rejects.toThrow(/email_format/);
      await expect(client.query(sql, ["gtbank", "GTBank", "web_portal", "http://insecure.example", "Portal", "https://gt.example", "unverified"])).rejects.toThrow(/url_format/);
      await expect(client.query(sql, ["gtbank", "GTBank", "email", "c@gt.example", "Complaints", "http://gt.example", "unverified"])).rejects.toThrow(/source_url/);
      await expect(client.query(sql, ["gtbank", "GTBank", "email", "c@gt.example", "Complaints", "https://gt.example", "verified"])).rejects.toThrow(/verified_requires_date/);
    });
  });

  describe("email connections", () => {
    it("never exposes OAuth tokens to users", async () => {
      await expect(asUser(client, userA, (c) => c.query("select * from public.email_connection_secrets"))).rejects.toThrow(/permission denied/);
      const own = await asUser(client, userA, async (c) => (await c.query("select email_address from public.email_connections")).rows);
      expect(own).toEqual([{ email_address: "a@gmail.com" }]);
      const other = await asUser(client, userB, async (c) => (await c.query("select id from public.email_connections")).rows);
      expect(other).toEqual([]);
    });

    it("lets users disconnect but not create or alter connections", async () => {
      await expect(
        asUser(client, userB, (c) => c.query("insert into public.email_connections (user_id, provider, email_address) values ($1, 'gmail', 'x@gmail.com')", [userB])),
      ).rejects.toThrow(/permission denied/);
      await expect(
        asUser(client, userA, (c) => c.query("update public.email_connections set email_address = 'evil@gmail.com'")),
      ).rejects.toThrow(/permission denied/);
      const deletedByOther = await asUser(client, userB, async (c) => (await c.query("delete from public.email_connections where id = $1", [connectionA])).rowCount);
      expect(deletedByOther).toBe(0);
    });

    it("lets the server read tokens", async () => {
      const rows = await asService(async (c) => (await c.query("select refresh_token_encrypted from public.email_connection_secrets")).rows);
      expect(rows).toHaveLength(1);
    });
  });

  describe("complaint submissions", () => {
    it("cannot be created or marked sent by users", async () => {
      await expect(asUser(client, userA, (c) => insertSubmission(c, submission()))).rejects.toThrow(/permission denied/);
      const id = (await asService((c) => insertSubmission(c, submission()))).rows[0].id;
      await expect(
        asUser(client, userA, (c) => c.query("update public.complaint_submissions set status = 'sent' where id = $1", [id])),
      ).rejects.toThrow(/permission denied/);
      await asService((c) => c.query("update public.complaint_submissions set status = 'cancelled' where id = $1", [id]));
    });

    it("requires provider proof before a submission can be 'sent'", async () => {
      const id = (await asService((c) => insertSubmission(c, submission()))).rows[0].id;
      await expect(
        asService((c) => c.query("update public.complaint_submissions set status = 'sent', sender_address = 'a@gmail.com' where id = $1", [id])),
      ).rejects.toThrow(/sent_has_provider_proof/);
      await asService((c) =>
        c.query(
          "update public.complaint_submissions set status = 'sent', sender_address = 'a@gmail.com', provider_message_id = 'm1', sent_at = now() where id = $1",
          [id],
        ),
      );
    });

    it("prevents sending the same complaint to the same recipient twice", async () => {
      await expect(
        asService((c) => insertSubmission(c, submission({ recipient: "COMPLAINTS@bank.example" }))),
      ).rejects.toThrow(/complaint_submissions_no_duplicates/);
      // A different recipient is fine.
      await asService((c) => insertSubmission(c, submission({ recipient: "care@bank.example" })));
    });

    it("rejects a reused idempotency key", async () => {
      const key = randomUUID();
      await asService((c) => insertSubmission(c, submission({ recipient: "one@bank.example", idempotency_key: key })));
      await expect(asService((c) => insertSubmission(c, submission({ recipient: "two@bank.example", idempotency_key: key })))).rejects.toThrow(/duplicate key/);
    });

    it("must belong to the same user as the case and complaint", async () => {
      await expect(asService((c) => insertSubmission(c, submission({ user_id: userB, recipient: "x@bank.example" })))).rejects.toThrow(/does not belong/);
      await expect(
        asService((c) => insertSubmission(c, submission({ user_id: userB, case_id: caseB, recipient: "y@bank.example" }))),
      ).rejects.toThrow(/does not belong to this case/);
    });

    it("are visible only to their owner", async () => {
      const own = await asUser(client, userA, async (c) => (await c.query("select id from public.complaint_submissions")).rows);
      expect(own.length).toBeGreaterThan(0);
      const other = await asUser(client, userB, async (c) => (await c.query("select id from public.complaint_submissions")).rows);
      expect(other).toEqual([]);
    });

    it("keeps an audit log users can read but not write", async () => {
      const id = (await client.query("select id from public.complaint_submissions where user_id = $1 limit 1", [userA])).rows[0].id;
      await asService((c) => c.query("insert into public.submission_audit_log (submission_id, user_id, action) values ($1, $2, 'created')", [id, userA]));
      const rows = await asUser(client, userA, async (c) => (await c.query("select action from public.submission_audit_log")).rows);
      expect(rows).toEqual([{ action: "created" }]);
      await expect(
        asUser(client, userA, (c) => c.query("insert into public.submission_audit_log (submission_id, user_id, action) values ($1, $2, 'provider_accepted')", [id, userA])),
      ).rejects.toThrow(/permission denied/);
      expect((await asUser(client, userB, async (c) => (await c.query("select id from public.submission_audit_log")).rows))).toEqual([]);
    });
  });

  describe("bank responses", () => {
    it("lets users add responses they received, but not forge mailbox replies", async () => {
      const ok = await asUser(client, userA, (c) =>
        c.query(
          "insert into public.bank_responses (case_id, user_id, source, received_at, body_text) values ($1, $2, 'user_entered', now(), 'We are looking into it.') returning id",
          [caseA, userA],
        ),
      );
      expect(ok.rowCount).toBe(1);
      await expect(
        asUser(client, userA, (c) =>
          c.query("insert into public.bank_responses (case_id, user_id, source, received_at, body_text) values ($1, $2, 'email_reply', now(), 'Fake')", [caseA, userA]),
        ),
      ).rejects.toThrow(/row-level security/);
      await expect(
        asUser(client, userB, (c) =>
          c.query("insert into public.bank_responses (case_id, user_id, source, received_at, body_text) values ($1, $2, 'user_entered', now(), 'x')", [caseA, userB]),
        ),
      ).rejects.toThrow(/row-level security/);
    });

    it("are private to their owner and only analysis fields can change", async () => {
      expect(await asUser(client, userB, async (c) => (await c.query("select id from public.bank_responses")).rows)).toEqual([]);
      await expect(asUser(client, userA, (c) => c.query("update public.bank_responses set body_text = 'edited'"))).rejects.toThrow(/permission denied/);
      const n = await asUser(client, userA, async (c) => (await c.query("update public.bank_responses set user_reviewed_at = now()")).rowCount);
      expect(n).toBe(1);
    });
  });

  describe("AI tool runs", () => {
    it("are recorded per user and case", async () => {
      await asUser(client, userA, (c) =>
        c.query("insert into public.ai_tool_runs (user_id, case_id, tool, status) values ($1, $2, 'identify_bank', 'succeeded')", [userA, caseA]),
      );
      await expect(
        asUser(client, userB, (c) => c.query("insert into public.ai_tool_runs (user_id, case_id, tool, status) values ($1, $2, 'identify_bank', 'succeeded')", [userB, caseA])),
      ).rejects.toThrow(/row-level security/);
      expect(await asUser(client, userB, async (c) => (await c.query("select id from public.ai_tool_runs")).rows)).toEqual([]);
    });
  });

  describe("timeline and quota", () => {
    it("accepts the new timeline events and AI usage kinds", async () => {
      await asUser(client, userA, (c) =>
        c.query("insert into public.case_events (case_id, user_id, event_type, description) values ($1, $2, 'submission_sent', 'Sent')", [caseA, userA]),
      );
      const allowed = await asUser(client, userA, async (c) => (await c.query("select public.consume_ai_quota('response_analysis', 10, 5) as ok")).rows[0].ok);
      expect(allowed).toBe(true);
    });
  });
});
