# Resolve

**Understand what happened. Know what to do next.**

Resolve is an AI-powered financial recovery assistant for people and small businesses in Nigeria. It helps users understand failed transfers, unexpected debits, duplicate charges and transfers sent to the wrong person. It also helps them organise evidence, prepare a clear complaint and track it through their institution's official complaint process.

> Resolve is an independent assistance tool. It is **not** a bank, financial institution, regulator, law firm or an official Central Bank of Nigeria (CBN) service. It never moves money, never submits complaints on the user's behalf, and never promises that money will be recovered.

---

## What's in this MVP

| Area | What works |
| --- | --- |
| Public website | Landing page, how it works, supported problems, AI explanation, privacy & security, FAQ, footer disclaimers, privacy notice, terms, official guidance list |
| Accounts | Register, sign in, sign out, password reset by email, protected pages, session refresh, clear error messages |
| Onboarding | Name, email, optional phone, country (default Nigeria), individual/business, preferred contact method, explicit AI consent. Never asks for BVN, NIN, PIN, OTP, passwords or card details |
| Dashboard | Real counts from the database (total, needs your action, awaiting institution, resolved), follow-ups due, unfinished reports, recent activity, case list, empty states |
| Report a problem | 5-step wizard (problem type → transaction → what happened → evidence → review), saved after every step, "save and finish later", warnings if sensitive data is typed |
| Evidence | PNG/JPG/PDF up to 10 MB, drag & drop, upload progress, previews, descriptions, remove, download. Private storage, server-side file-type checks, 5-minute signed links |
| AI analysis | Reads evidence, identifies the likely category, extracts facts, finds missing and conflicting details, asks follow-up questions, suggests next steps and evidence, and links official guidance. Every fact is labelled by source. Resolve's own checks downgrade anything it can't confirm to "Unverified" |
| Review & correct | Confirm or reject facts read from documents, answer follow-up questions, edit any case detail, mark the analysis reviewed |
| Complaint builder | AI draft or no-AI template built only from confirmed facts, `[ADD: …]` placeholders for missing details, warnings for unconfirmed details, editing, versions, copy, PDF export, explicit user approval |
| Tracking | Record submission (date, channel, reference), institution responses, status changes, follow-up dates, notes and outcome. Every status change is logged automatically. Append-only timeline |
| Guidance engine | Guidance records with country, category, source URL, dates and verification status. Admin screen to add and verify records |
| Settings | Profile, AI consent on/off, notification preferences (saved; email sending not built yet), JSON data export, permanent account deletion |

### Not yet available (shown clearly in the app)

- **Email notifications.** Preferences are saved, but no emails are sent yet. Due follow-ups appear on the dashboard instead.
- **Verified official guidance.** The four CBN sources are included as links but marked *Not yet verified by Resolve* (see [Official guidance](#official-guidance-important)).

---

## Technology

- **Next.js 16** (App Router) + **TypeScript** + **Tailwind CSS v4**
- **Supabase**: PostgreSQL, Auth, Storage, Row Level Security
- **Google Gemini** (free tier) or **Anthropic Claude** for AI, behind a replaceable provider interface in `src/lib/ai/`
- **Zod** for all input validation and for structured AI outputs
- **pdf-lib** for PDF export
- **Vitest** (unit + database security tests) and **Playwright** (end-to-end tests)
- Designed for deployment on **Vercel**

---

## Run it on your computer

### 1. Install the tools (one time)

- [Node.js](https://nodejs.org) version 20.9 or newer (choose the "LTS" installer)
- [Git](https://git-scm.com/downloads)

### 2. Get the code

```bash
git clone https://github.com/PreciousAdekunle784/Resolve.git
```

```bash
cd Resolve
```

```bash
npm install
```

### 3. Create a Supabase project (free)

1. Sign up at [supabase.com](https://supabase.com) and click **New project**. Choose a region close to your users and save the database password somewhere safe.
2. When the project is ready, open **SQL Editor → New query**. Paste in the whole of `supabase/setup.sql` and click **Run**. Run it once only, on a new project. It contains the three files in `supabase/migrations/`, in order.

   *(If you use the Supabase CLI instead, `supabase link` then `supabase db push` applies the same migration files.)*
3. Open **Authentication → URL Configuration**:
   - **Site URL**: `http://localhost:3000` (change this to your real domain when you deploy)
   - **Redirect URLs**: add `http://localhost:3000/auth/confirm` (and later `https://your-domain/auth/confirm`)
4. Recommended: open **Authentication → Email Templates** so the links in emails work even when opened in a different browser:
   - **Confirm signup**: set the link to
     `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/onboarding`
   - **Reset password**: set the link to
     `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password`
5. Open **Project Settings → API Keys** and copy:
   - the **Project URL**
   - the **publishable key** (`sb_publishable_…`, or the legacy *anon* key)
   - the **secret key** (`sb_secret_…`, or the legacy *service_role* key). Keep this one private.

### 4. Get an AI key (optional, and free with Gemini)

Resolve supports two AI providers. Choose one with `AI_PROVIDER`:

| | Google Gemini (`gemini`) | Anthropic Claude (`anthropic`) |
| --- | --- | --- |
| Cost | **Free tier, no card needed** | Paid |
| Get a key | [aistudio.google.com](https://aistudio.google.com) → *Get API key* | [console.anthropic.com](https://console.anthropic.com) |
| Variable | `GEMINI_API_KEY` | `ANTHROPIC_API_KEY` |
| Data use | On the free tier, Google may use submitted content to improve its products, and people may review it | Not used for training under Anthropic's commercial terms |

**For a competition or demo, the free Gemini key is enough:**

1. Go to [aistudio.google.com](https://aistudio.google.com) and sign in with a Google account.
2. Click **Get API key → Create API key**, and copy it.
3. In `.env.local`, set `AI_PROVIDER=gemini` and `GEMINI_API_KEY=<your key>`.
4. Leave `AI_MODEL` empty to use `gemini-3.5-flash`, which was tested with a free key. If a model is unavailable, has no free quota or is overloaded, Resolve automatically switches to another available Flash model. Signed-in users can check the AI connection at `/api/ai/diagnostics`.

Things to know about the free tier:
- **Use test data, not real people's documents.** Resolve shows users a notice about Google's free-tier data use before they opt in. It appears at onboarding, in Settings and in the privacy notice.
- The free quota is small (a few requests per minute) and shared by all users of your app. If it runs out, users see "The AI service is busy right now. Please try again in a minute."
- Never put the key in code or share it. Never use keys found online. They belong to someone else's account and get revoked.

Without any AI key, Resolve still works: AI buttons explain that AI isn't available, and users can build complaints from the template.

### 5. Add your settings

Copy the example file:

```bash
cp .env.example .env.local
```

Open `.env.local` and fill in the values. Each one is explained in the file. **Never commit `.env.local` or share its contents.** Git ignores it automatically.

### 6. Start the app

```bash
npm run dev
```

Open http://localhost:3000, create an account and report a problem.

### Make yourself an administrator (to manage guidance)

In Supabase **SQL Editor**, run (with your email):

```sql
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"admin"}'
where email = 'you@example.com';
```

Sign out and back in. An **Admin: guidance** link appears in the sidebar.

---

## Deploy to Vercel

1. Push the code to GitHub (already done for this repository).
2. Sign in to [vercel.com](https://vercel.com) with GitHub. Click **Add New → Project** and import the `Resolve` repository.
3. Under **Environment Variables**, add everything from your `.env.local`: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `AI_PROVIDER` and your AI key. You don't need a `NEXT_PUBLIC_` prefix. `SITE_URL` is optional on Vercel, because the production address is detected automatically.
4. Click **Deploy**.
5. In Supabase **Authentication → URL Configuration**, change the **Site URL** to your Vercel URL and add `https://your-vercel-url/auth/confirm` to the redirect URLs.
6. In Supabase, set up a custom SMTP provider (Authentication → Emails). The built-in sender is heavily rate-limited and only for testing.

> AI analysis can take up to a couple of minutes. The AI routes allow up to 300 seconds (`maxDuration`), which needs Vercel's Fluid Compute. It's on by default for new projects.

---

## Tests

| Command | What it checks |
| --- | --- |
| `npm run lint` | Code style and React rules |
| `npm run typecheck` | TypeScript types |
| `npm test` | Unit tests: validation, sensitive-data detection, file checks, AI response validation, grounding, complaint template, PDF export. Also runs the database tests below if `TEST_DATABASE_URL` is set |
| `npm run test:db` | **Database security tests** against a real PostgreSQL with the real migrations: users can only access their own profiles, cases, events, evidence, analyses and drafts; storage folders are private; history can't be edited; guidance is admin-only; rate limits; account deletion removes everything |
| `npm run e2e` | **End-to-end tests** in a real browser: the full journey from landing page to resolved case, data isolation between two users, admin guidance, settings, account deletion and mobile layouts. `E2E_AI_PROVIDER=gemini npm run e2e` runs it with the Gemini provider |

The database and end-to-end tests need a local PostgreSQL superuser connection:

```bash
export TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres
```

```bash
npm run test:db
```

```bash
npm run e2e
```

End-to-end tests run the real app against `tests/e2e/mock-backend.mjs`. This is a **test-only** stand-in for Supabase's web APIs, built on your real PostgreSQL database with Resolve's real RLS policies. It also provides a fake AI endpoint that gives predictable answers. It is never used in production.

---

## Project structure

```
src/
  app/
    (marketing)/       Public pages: landing, privacy, terms, guidance
    (auth)/            Sign in, register, password reset + server actions
    auth/confirm/      Handles links from Supabase emails
    onboarding/        First-time setup
    (app)/             Signed-in app: dashboard, cases, settings, admin
      cases/[id]/      Case page: overview, evidence, AI analysis, complaint, tracking
    api/               Evidence uploads, signed URLs, AI, PDF export, data export
  components/          Design system (ui/) and app components
  lib/
    ai/                Provider interface, Anthropic provider, prompts, schemas, grounding checks
    supabase/          Browser, server, proxy and admin clients
    validation.ts      Zod schemas for every form and API
  proxy.ts             Session refresh + redirect for protected pages
supabase/
  migrations/          Database schema, RLS policies, storage bucket, guidance seed
  tests/               Test-only stand-in for Supabase's auth/storage schemas
tests/
  db/                  Database security tests
  e2e/                 End-to-end tests + test-only mock backend
docs/                  Architecture, security and guidance documentation
```

---

## Official guidance (important)

The CBN websites couldn't be reached from the environment used to build this MVP. Rather than writing requirements or deadlines from memory, the four official CBN sources are stored as **links only**, with status **unverified**. The app tells users to check the official source, and the AI is instructed never to state deadlines or rules that don't appear in a *verified* guidance record.

**Before launch**, someone should read each official page and, in **Admin: guidance**, write an accurate summary, add any dates the source states, and mark the record verified. See [`docs/GUIDANCE.md`](docs/GUIDANCE.md).

---

## Security & privacy

Read [`docs/SECURITY.md`](docs/SECURITY.md). Key points:

- Row Level Security on every table. Every query runs as the signed-in user, and the database refuses access to other users' rows.
- The evidence bucket is private. Files open only through signed links that expire after 5 minutes. File types are checked from the file's bytes on the server.
- Secret keys (`SUPABASE_SECRET_KEY`, `ANTHROPIC_API_KEY`) are only used on the server.
- AI runs only with the user's explicit, revocable consent. It is rate-limited per user, and every response is schema-validated and grounding-checked before it is saved.
- Users can export or permanently delete their data.

The design keeps the Nigeria Data Protection Act 2023 in mind. **The service has not had a legal review**, and the privacy notice and terms are marked as drafts.
