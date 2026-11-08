import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TEST_DATABASE_URL, asAnon, asUser, createTestDatabase } from "./helpers";

/**
 * Row Level Security and data-integrity tests.
 * These run real SQL against PostgreSQL with Resolve's migrations applied.
 */
const run = TEST_DATABASE_URL ? describe : describe.skip;

run("database security (RLS)", () => {
  let db: { url: string; drop: () => Promise<void> };
  let client: Client;
  const userA = randomUUID();
  const userB = randomUUID();
  const adminUser = randomUUID();
  let caseA: string;

  const completeCase = {
    issue_category: "failed_or_pending_transfer",
    institution_name: "Example Bank",
    amount: 25000,
    transaction_date: "2026-10-01T10:00:00Z",
    payment_channel: "mobile_app",
    incident_description: "I sent money and it was debited but the recipient never got it.",
  };

  beforeAll(async () => {
    db = await createTestDatabase();
    client = new Client({ connectionString: db.url });
    await client.connect();
    await client.query(
      `insert into auth.users (id, email, raw_user_meta_data) values
        ($1, 'a@example.com', '{"full_name":"Ada A"}'),
        ($2, 'b@example.com', '{}'),
        ($3, 'admin@example.com', '{}')`,
      [userA, userB, adminUser],
    );
    caseA = await asUser(client, userA, async (c) => {
      const r = await c.query("insert into public.cases (user_id) values ($1) returning id", [userA]);
      return r.rows[0].id as string;
    });
  }, 60_000);

  afterAll(async () => {
    await client?.end();
    await db?.drop();
  });

  describe("profiles", () => {
    it("creates a profile automatically on sign-up", async () => {
      const r = await client.query("select full_name, email, country from public.profiles where id = $1", [userA]);
      expect(r.rows[0]).toEqual({ full_name: "Ada A", email: "a@example.com", country: "NG" });
    });

    it("lets a user see only their own profile", async () => {
      const rows = await asUser(client, userA, async (c) => (await c.query("select id from public.profiles")).rows);
      expect(rows.map((r) => r.id)).toEqual([userA]);
    });

    it("does not let a user update someone else's profile", async () => {
      const count = await asUser(client, userB, async (c) =>
        (await c.query("update public.profiles set full_name = 'Hacked' where id = $1", [userA])).rowCount,
      );
      expect(count).toBe(0);
    });

    it("does not let a user change their profile email directly", async () => {
      await expect(
        asUser(client, userA, (c) => c.query("update public.profiles set email = 'x@evil.com' where id = $1", [userA])),
      ).rejects.toThrow(/permission denied/);
    });
  });

  describe("cases", () => {
    it("assigns a random case number and logs a creation event", async () => {
      const r = await client.query("select case_number from public.cases where id = $1", [caseA]);
      expect(r.rows[0].case_number).toMatch(/^RSV-[0-9A-F]{4}-[0-9A-F]{4}$/);
      const ev = await client.query("select event_type from public.case_events where case_id = $1", [caseA]);
      expect(ev.rows.map((e) => e.event_type)).toContain("case_created");
    });

    it("hides a user's cases from other users", async () => {
      const rows = await asUser(client, userB, async (c) => (await c.query("select id from public.cases")).rows);
      expect(rows).toEqual([]);
    });

    it("blocks other users from updating or deleting a case", async () => {
      const updated = await asUser(client, userB, async (c) =>
        (await c.query("update public.cases set institution_name = 'Hacked' where id = $1", [caseA])).rowCount,
      );
      const deleted = await asUser(client, userB, async (c) =>
        (await c.query("delete from public.cases where id = $1", [caseA])).rowCount,
      );
      expect(updated).toBe(0);
      expect(deleted).toBe(0);
    });

    it("blocks creating a case on behalf of another user", async () => {
      await expect(
        asUser(client, userB, (c) => c.query("insert into public.cases (user_id) values ($1)", [userA])),
      ).rejects.toThrow(/row-level security/);
    });

    it("refuses to complete a report with missing core facts", async () => {
      await expect(
        asUser(client, userA, (c) =>
          c.query("update public.cases set intake_status = 'complete' where id = $1", [caseA]),
        ),
      ).rejects.toThrow(/cases_complete_requires_core_fields/);
    });

    it("does not allow changing ownership or case number", async () => {
      await expect(
        asUser(client, userA, (c) => c.query("update public.cases set case_number = 'RSV-0000-0000' where id = $1", [caseA])),
      ).rejects.toThrow(/case_number cannot be changed/);
      await expect(
        asUser(client, userA, (c) => c.query("update public.cases set user_id = $2 where id = $1", [caseA, userB])),
      ).rejects.toThrow();
    });

    it("creates a timeline event for every status change", async () => {
      await asUser(client, userA, async (c) => {
        await c.query(
          `update public.cases set issue_category = $2, institution_name = $3, amount = $4,
             transaction_date = $5, payment_channel = $6, incident_description = $7,
             intake_status = 'complete' where id = $1`,
          [caseA, ...Object.values(completeCase)],
        );
        await c.query("update public.cases set status = 'submitted_to_institution' where id = $1", [caseA]);
      });
      const ev = await client.query(
        "select metadata from public.case_events where case_id = $1 and event_type = 'status_changed'",
        [caseA],
      );
      expect(ev.rows).toHaveLength(1);
      expect(ev.rows[0].metadata).toEqual({ from: "draft", to: "submitted_to_institution" });
    });
  });

  describe("case events", () => {
    it("are hidden from other users", async () => {
      const rows = await asUser(client, userB, async (c) => (await c.query("select id from public.case_events")).rows);
      expect(rows).toEqual([]);
    });

    it("cannot be edited or deleted (append-only history)", async () => {
      await expect(
        asUser(client, userA, (c) => c.query("update public.case_events set description = 'rewritten'")),
      ).rejects.toThrow(/permission denied/);
      await expect(
        asUser(client, userA, (c) => c.query("delete from public.case_events")),
      ).rejects.toThrow(/permission denied/);
    });

    it("cannot be added to another user's case", async () => {
      await expect(
        asUser(client, userB, (c) =>
          c.query(
            "insert into public.case_events (case_id, user_id, event_type, description) values ($1, $2, 'note_added', 'x')",
            [caseA, userB],
          ),
        ),
      ).rejects.toThrow(/row-level security/);
    });
  });

  describe("evidence, analyses and drafts", () => {
    it("blocks attaching evidence to another user's case", async () => {
      await expect(
        asUser(client, userB, (c) =>
          c.query(
            `insert into public.evidence (case_id, user_id, file_path, original_filename, mime_type, file_size)
             values ($1, $2, $3, 'x.png', 'image/png', 100)`,
            [caseA, userB, `${userB}/${caseA}/x.png`],
          ),
        ),
      ).rejects.toThrow(/row-level security/);
    });

    it("requires evidence paths to sit in the owner's folder", async () => {
      await expect(
        asUser(client, userA, (c) =>
          c.query(
            `insert into public.evidence (case_id, user_id, file_path, original_filename, mime_type, file_size)
             values ($1, $2, $3, 'x.png', 'image/png', 100)`,
            [caseA, userA, `${userB}/${caseA}/x.png`],
          ),
        ),
      ).rejects.toThrow(/evidence_path_matches_owner/);
    });

    it("rejects unsupported file types and oversized files", async () => {
      await expect(
        asUser(client, userA, (c) =>
          c.query(
            `insert into public.evidence (case_id, user_id, file_path, original_filename, mime_type, file_size)
             values ($1, $2, $3, 'x.exe', 'application/x-msdownload', 100)`,
            [caseA, userA, `${userA}/${caseA}/x.exe`],
          ),
        ),
      ).rejects.toThrow(/mime_type/);
      await expect(
        asUser(client, userA, (c) =>
          c.query(
            `insert into public.evidence (case_id, user_id, file_path, original_filename, mime_type, file_size)
             values ($1, $2, $3, 'x.pdf', 'application/pdf', 20000000)`,
            [caseA, userA, `${userA}/${caseA}/big.pdf`],
          ),
        ),
      ).rejects.toThrow(/file_size/);
    });

    it("limits a case to 10 evidence files", async () => {
      await asUser(client, userA, async (c) => {
        for (let i = 0; i < 10; i++) {
          await c.query(
            `insert into public.evidence (case_id, user_id, file_path, original_filename, mime_type, file_size)
             values ($1, $2, $3, 'r.png', 'image/png', 100)`,
            [caseA, userA, `${userA}/${caseA}/${i}.png`],
          );
        }
      });
      await expect(
        asUser(client, userA, (c) =>
          c.query(
            `insert into public.evidence (case_id, user_id, file_path, original_filename, mime_type, file_size)
             values ($1, $2, $3, 'r.png', 'image/png', 100)`,
            [caseA, userA, `${userA}/${caseA}/11.png`],
          ),
        ),
      ).rejects.toThrow(/at most 10/);
    });

    it("hides evidence, analyses and drafts from other users", async () => {
      await asUser(client, userA, async (c) => {
        await c.query(
          `insert into public.ai_analyses (case_id, user_id, analysis_type, structured_result, model_identifier)
           values ($1, $2, 'case_analysis', '{"summary":"x"}', 'test-model')`,
          [caseA, userA],
        );
        await c.query(
          "insert into public.complaint_drafts (case_id, user_id, content, version) values ($1, $2, 'Dear Sir', 1)",
          [caseA, userA],
        );
      });
      const counts = await asUser(client, userB, async (c) => ({
        evidence: (await c.query("select 1 from public.evidence")).rowCount,
        analyses: (await c.query("select 1 from public.ai_analyses")).rowCount,
        drafts: (await c.query("select 1 from public.complaint_drafts")).rowCount,
      }));
      expect(counts).toEqual({ evidence: 0, analyses: 0, drafts: 0 });
      const own = await asUser(client, userA, async (c) => (await c.query("select 1 from public.evidence")).rowCount);
      expect(own).toBe(10);
    });

    it("blocks creating drafts or analyses on another user's case", async () => {
      await expect(
        asUser(client, userB, (c) =>
          c.query(
            "insert into public.complaint_drafts (case_id, user_id, content, version) values ($1, $2, 'x', 2)",
            [caseA, userB],
          ),
        ),
      ).rejects.toThrow(/row-level security/);
      await expect(
        asUser(client, userB, (c) =>
          c.query(
            `insert into public.ai_analyses (case_id, user_id, analysis_type, structured_result, model_identifier)
             values ($1, $2, 'case_analysis', '{}', 'm')`,
            [caseA, userB],
          ),
        ),
      ).rejects.toThrow(/row-level security/);
    });
  });

  describe("private evidence storage", () => {
    it("lets a user upload into their own case folder only", async () => {
      await asUser(client, userA, (c) =>
        c.query("insert into storage.objects (bucket_id, name) values ('evidence', $1)", [`${userA}/${caseA}/a.png`]),
      );
      await expect(
        asUser(client, userB, (c) =>
          c.query("insert into storage.objects (bucket_id, name) values ('evidence', $1)", [`${userA}/${caseA}/b.png`]),
        ),
      ).rejects.toThrow(/row-level security/);
      // Own folder, but someone else's case id:
      await expect(
        asUser(client, userB, (c) =>
          c.query("insert into storage.objects (bucket_id, name) values ('evidence', $1)", [`${userB}/${caseA}/c.png`]),
        ),
      ).rejects.toThrow(/row-level security/);
    });

    it("hides stored files from other users and anonymous visitors", async () => {
      const b = await asUser(client, userB, async (c) => (await c.query("select name from storage.objects")).rowCount);
      const anon = await asAnon(client, async (c) => (await c.query("select name from storage.objects")).rowCount);
      expect(b).toBe(0);
      expect(anon).toBe(0);
    });

    it("keeps the evidence bucket private", async () => {
      const r = await client.query("select public, file_size_limit from storage.buckets where id = 'evidence'");
      expect(r.rows[0]).toEqual({ public: false, file_size_limit: "10485760" });
    });
  });

  describe("anonymous visitors", () => {
    it("cannot read private tables", async () => {
      await expect(asAnon(client, (c) => c.query("select * from public.cases"))).rejects.toThrow(/permission denied/);
      await expect(asAnon(client, (c) => c.query("select * from public.profiles"))).rejects.toThrow(/permission denied/);
    });

    it("can read published guidance", async () => {
      const n = await asAnon(client, async (c) => (await c.query("select 1 from public.guidance_sources")).rowCount);
      expect(n).toBeGreaterThanOrEqual(4);
    });
  });

  describe("guidance administration", () => {
    it("blocks non-admin users from editing guidance", async () => {
      await expect(
        asUser(client, userA, (c) =>
          c.query(
            `insert into public.guidance_sources (title, institution, source_url, content)
             values ('Fake rule', 'CBN', 'https://example.com', 'x')`,
          ),
        ),
      ).rejects.toThrow(/row-level security/);
      const updated = await asUser(client, userA, async (c) =>
        (await c.query("update public.guidance_sources set content = 'changed'")).rowCount,
      );
      expect(updated).toBe(0);
    });

    it("lets administrators add and archive guidance", async () => {
      const id = await asUser(
        client,
        adminUser,
        async (c) =>
          (
            await c.query(
              `insert into public.guidance_sources (title, institution, source_url, content)
               values ('Test guidance', 'CBN', 'https://example.com/x', 'content') returning id`,
            )
          ).rows[0].id,
        { role: "admin" },
      );
      await asUser(client, adminUser, (c) => c.query("update public.guidance_sources set status = 'archived' where id = $1", [id]), {
        role: "admin",
      });
      const visible = await asAnon(client, async (c) =>
        (await c.query("select 1 from public.guidance_sources where id = $1", [id])).rowCount,
      );
      expect(visible).toBe(0);
    });

    it("requires a verification date before guidance is marked verified", async () => {
      await expect(
        asUser(
          client,
          adminUser,
          (c) => c.query("update public.guidance_sources set status = 'verified' where verified_at is null"),
          { role: "admin" },
        ),
      ).rejects.toThrow(/guidance_verified_requires_date/);
    });
  });

  describe("AI rate limiting", () => {
    it("allows requests up to the per-minute limit, then refuses", async () => {
      const results = await asUser(client, userB, async (c) => {
        const out: boolean[] = [];
        for (let i = 0; i < 4; i++) {
          const r = await c.query("select public.consume_ai_quota('case_analysis', 20, 3) as ok");
          out.push(r.rows[0].ok);
        }
        return out;
      });
      expect(results).toEqual([true, true, true, false]);
    });

    it("cannot be called anonymously", async () => {
      await expect(
        asAnon(client, (c) => c.query("select public.consume_ai_quota('case_analysis', 20, 3)")),
      ).rejects.toThrow(/permission denied/);
    });
  });

  describe("account deletion", () => {
    it("removes all of a user's data when the account is deleted", async () => {
      await client.query("delete from auth.users where id = $1", [userA]);
      const counts = await client.query(
        `select
          (select count(*) from public.profiles where id = $1) as profiles,
          (select count(*) from public.cases where user_id = $1) as cases,
          (select count(*) from public.case_events where user_id = $1) as events,
          (select count(*) from public.evidence where user_id = $1) as evidence,
          (select count(*) from public.ai_analyses where user_id = $1) as analyses,
          (select count(*) from public.complaint_drafts where user_id = $1) as drafts`,
        [userA],
      );
      expect(Object.values(counts.rows[0]).map(Number)).toEqual([0, 0, 0, 0, 0, 0]);
    });
  });
});
