<!--
  Resolve: Supporting Evidence Document (editable source)
  Build the PDF with:  node docs/competition/tools/build-pdf.mjs
  Raw HTML blocks are used for the cover, figures, status labels and page breaks.
  Evidence status as of 11 November 2026.
-->

<section class="cover">
  <div class="cover-top">
    <div class="brand"><img src="tools/logo.svg" alt=""> Resolve</div>
    <div class="cover-kicker">Competition submission · Supporting evidence</div>
  </div>
  <h1 class="cover-title">Understand what happened.<br><span>Know what to do next.</span></h1>
  <p class="cover-lead">Resolve is an AI-powered financial inclusion platform for people and small businesses in Nigeria. Today it helps users investigate failed or disputed transactions, organise evidence, prepare an accurate complaint, submit it with their authorisation, and track the response. Credit readiness and financial-shock tools are the next two pillars on the roadmap.</p>
  <div class="cover-visual">
    <img class="cv-a" src="evidence-assets/figures/23-dashboard.png" alt="">
    <img class="cv-b" src="evidence-assets/figures/11-ai-analysis-summary.png" alt="">
    <img class="cv-c" src="evidence-assets/figures/25-mobile-case.png" alt="">
  </div>
  <div class="cover-meta">
    <div><b>Live product</b>resolve-finance.vercel.app</div>
    <div><b>Evidence date</b>11 November 2026</div>
    <div><b>Document</b>Version 1.0</div>
  </div>
</section>

<div class="pb"></div>

## Contents

<div class="toc">

1. Problem and solution overview
2. Product design and user experience
3. Technical architecture
4. Database design
5. AI and automation workflow
6. Financial inclusion and credit readiness
7. Security and privacy
8. Development progress
9. Testing and validation
10. Next development steps
11. Conclusion

Appendix: Evidence index

</div>

### How to read this document

<div class="callout">

**Everything here comes from the actual Resolve codebase and deployment.** Screenshots are of the real application. Diagrams were drawn from the implemented code and database migrations. Test results come from test runs on 11 November 2026.

**Status labels:** <span class="st done">Completed</span> <span class="st partial">Partially implemented</span> <span class="st dev">In development</span> <span class="st planned">Planned</span>

**Demonstration data is synthetic.** The screenshots follow a fictional customer, *Amara Okeke*. Her ₦85,000 transfer to *Example Recipient* never arrived, and her bank, *Northbridge Bank*, is fictional too. The AI text shown is genuine Google Gemini output: it was generated for this scenario on the live site with a temporary account, which was deleted afterwards. No real user data, credentials, banking details or private documents appear anywhere.

</div>

<div class="pb"></div>

## 1. Problem and solution overview

### The problem

When a digital payment goes wrong, the customer is often left with a "Successful" receipt, a debit on their statement, and a recipient who has received nothing. Most people do not know:

- what evidence matters
- which details their bank needs
- how to write a complaint that will be taken seriously
- where to send it
- how to follow up

Small business owners lose time and working capital while a dispute drags on. Many give up, or turn to people on social media who promise to "recover" money for a fee. Some of these are scams that ask for PINs and one-time codes.

The same people are often poorly prepared for formal credit, with financial activity scattered across apps, receipts and memory, and little to fall back on when a **financial shock** hits.

### Who Resolve serves

- **Individuals:** bank and mobile-money customers dealing with failed or pending transfers, unrecognised debits, duplicate charges, or money sent to the wrong recipient.
- **Small businesses:** traders and owner-managers who need disputes resolved quickly, and who will benefit from better financial records.

Resolve is an **independent assistant**. It is not a bank, regulator or law firm, and it never asks for PINs, one-time codes (OTPs), passwords, BVN, NIN or full card numbers.

### How Resolve addresses the problem

<table class="pillars">
<tr><th>Pillar</th><th>What it does</th><th>Status</th></tr>
<tr><td><b>1. Financial complaint assistance</b></td><td>Guided reporting, private evidence upload, AI case analysis with every fact labelled by its source, an AI- or template-drafted complaint the user approves, authorised submission (the user's own Gmail, or a guided bank website), reply analysis and case tracking.</td><td><span class="st done">Completed</span><br><small>Gmail sending: <span class="st partial">Partially implemented</span></small></td></tr>
<tr><td><b>2. Credit readiness</b></td><td>Income and expense records, cash-flow views, record-keeping consistency and a "lender-ready" summary pack to help small businesses prepare for loan applications. No credit scores, and no approval guarantees.</td><td><span class="st planned">Planned</span></td></tr>
<tr><td><b>3. Financial shock management</b></td><td>Spotting sudden losses in the owner's records, starting a complaint directly from a transaction, short-term buffer planning and links to official help.</td><td><span class="st planned">Planned</span></td></tr>
</table>

Pillar 1 is built, deployed and tested. Pillars 2 and 3 are designed to reuse its foundations: accounts, data protection, evidence storage, audited AI tools, PDF generation and tracking (Section 6).

## 2. Product design and user experience

Resolve follows one guided journey. Each step saves automatically, so users can stop and return later.

<div class="journey">
<div><b>1</b>Report the problem</div><div><b>2</b>Add evidence</div><div><b>3</b>AI analysis</div><div><b>4</b>Review &amp; approve the complaint</div><div><b>5</b>Submit with authorisation</div><div><b>6</b>Track replies &amp; next steps</div>
</div>

<figure class="full"><img src="evidence-assets/figures/01-landing.png"><figcaption><b>Figure 1. Landing page.</b> Plain-language positioning, the four problem types supported, and the promise never to ask for PINs or OTPs. <span class="st done">Completed</span></figcaption></figure>

<div class="two">
<figure><img src="evidence-assets/figures/04-register.png"><figcaption><b>Figure 2. Registration.</b> Email and password accounts, with acceptance of the terms and privacy notice.</figcaption></figure>
<figure><img src="evidence-assets/figures/05-onboarding-consent.png"><figcaption><b>Figure 3. Onboarding and consent.</b> AI analysis is opt-in. The consent text names the AI provider and explains how it may use submitted content.</figcaption></figure>
</div>

<figure class="full"><img src="evidence-assets/figures/23-dashboard.png"><figcaption><b>Figure 4. Dashboard.</b> Live counts from the user's own records (total cases, cases needing action, cases awaiting the institution, resolved cases), the case table and recent activity. Synthetic demo data. <span class="st done">Completed</span></figcaption></figure>

<figure class="full"><img src="evidence-assets/figures/06-report-problem-type.png"><figcaption><b>Figure 5. Reporting, step 1: problem categories.</b> Failed or pending transfer, unrecognised or unauthorised debit, duplicate transaction, or transfer to the wrong recipient. <span class="st done">Completed</span></figcaption></figure>

<figure class="full"><img src="evidence-assets/figures/07-report-transaction.png"><figcaption><b>Figure 6. Reporting, step 2: transaction details.</b> Bank (with a searchable bank picker and logos), amount, date and time, payment channel, reference and recipient. Validated on the server and saved after every step.</figcaption></figure>

<figure class="full"><img src="evidence-assets/figures/08-evidence-upload.png"><figcaption><b>Figure 7. Evidence upload.</b> PNG, JPG or PDF, up to 10 MB each and 10 per case, with upload progress, preview and a description. Files go to private storage, and the server checks each file's real type. <span class="st done">Completed</span></figcaption></figure>

<figure class="full"><img src="evidence-assets/figures/11-ai-analysis-summary.png"><figcaption><b>Figure 8. AI case analysis.</b> A plain-language summary, the likely problem type, missing information and follow-up questions. A notice reminds the user that the AI can make mistakes. The text shown is genuine Gemini output for the scenario. <span class="st done">Completed</span></figcaption></figure>

<figure class="full"><img src="evidence-assets/figures/12-ai-analysis-key-facts.png"><figcaption><b>Figure 9. Key facts, each labelled by its source:</b> <i>You told us</i>, <i>From a document</i> (read from the uploaded receipt) or <i>Unverified</i>. Resolve's own checks downgrade anything they cannot confirm.</figcaption></figure>

<figure class="full"><img src="evidence-assets/figures/14-complaint-draft.png"><figcaption><b>Figure 10. AI-drafted complaint.</b> Written only from confirmed facts. Details the AI does not have become <code>[ADD: …]</code> placeholders, and the draft cannot be approved until they are filled in. A no-AI template is also available. <span class="st done">Completed</span></figcaption></figure>

<figure class="full"><img src="evidence-assets/figures/16-submit-to-bank.png"><figcaption><b>Figure 11. Submit to your bank.</b> Choose email (from the user's own Gmail) or the bank's website, enter the bank's official address and confirm where it came from, then run the final checks: approval, placeholders, sensitive data, and details not in the case. <span class="st partial">Partially implemented</span> (see Section 8)</figcaption></figure>

<div class="two">
<figure><img src="evidence-assets/figures/17-email-preview.png"><figcaption><b>Figure 12. Email preview and authorisation.</b> The exact email and attachments are shown before the user ticks a plain-language authorisation.</figcaption></figure>
<figure><img src="evidence-assets/figures/18-sent-and-history.png"><figcaption><b>Figure 13. Sent, and the submission history.</b> "Sent" appears only when Gmail confirms the message. Recorded in the demo environment against a test mail server.</figcaption></figure>
</div>

<figure class="full"><img src="evidence-assets/figures/19-bank-reply-explained.png"><figcaption><b>Figure 14. Bank reply explained.</b> The reply (illustrative, from the fictional bank) is found in the Gmail thread. The AI classifies it ("Under investigation") and extracts the reference number. Quotes are checked against the reply text, and the user decides whether to apply the suggested status. <span class="st done">Completed</span></figcaption></figure>

<figure class="full"><img src="evidence-assets/figures/20-next-action-recovery-plan.png"><figcaption><b>Figure 15. Next required action and AI recovery plan.</b> A deterministic "what to do next" card (no AI involved), and an optional AI plan with timing for each action and escalation advice. Escalation advice links only to official guidance Resolve holds. <span class="st done">Completed</span></figcaption></figure>

<figure class="full"><img src="evidence-assets/figures/21-case-timeline.png"><figcaption><b>Figure 16. Tracking and case history.</b> Record submissions, responses, follow-ups and outcomes. The append-only timeline logs every step, including each automatic status change. <span class="st done">Completed</span></figcaption></figure>

<div class="two">
<figure><img src="evidence-assets/figures/22-case-list.png"><figcaption><b>Figure 17. Case list</b> with search, status and category filters.</figcaption></figure>
<figure><img src="evidence-assets/figures/24-settings-privacy-email-data.png"><figcaption><b>Figure 18. Settings:</b> AI consent, the connected Gmail account (disconnect at any time) and data controls.</figcaption></figure>
</div>

<div class="mobiles">
<figure><img src="evidence-assets/figures/25-mobile-case.png"><figcaption><b>Figure 19.</b> Case page on a phone.</figcaption></figure>
<figure><img src="evidence-assets/figures/26-mobile-dashboard.png"><figcaption><b>Figure 20.</b> Dashboard on a phone.</figcaption></figure>
<div class="mobile-note">

**Designed for phones first.** Most target users bank on mobile. Every page is responsive, and the automated tests check that key pages do not scroll sideways on a 375-pixel-wide screen.

**Also implemented, not pictured:**

- password reset
- sign-out
- case deletion
- permanent account deletion
- PDF account statement download
- the admin screens for official guidance and bank contacts
- the public official-guidance page

</div>
</div>

<div class="pb"></div>

<div class="land"><h2>3. Technical architecture</h2><figure class="diagram"><img src="evidence-assets/diagram-architecture.png"><figcaption><b>Figure 21. Implemented architecture.</b> Every component shown exists and is deployed.</figcaption></figure></div>

**How the components communicate**

- **Browser to app.** The browser talks to the Next.js app over HTTPS. Pages are rendered on the server, and form submissions and JSON API routes are validated with Zod. State-changing routes reject cross-site requests.
- **App to Supabase.** The app uses the signed-in user's own session, so PostgreSQL Row Level Security applies to every query. The privileged service-role key is used only on the server, for three tasks: account deletion, reading encrypted Gmail tokens, and recording provider-confirmed submission results.
- **Evidence uploads.** Files go directly from the browser to a private storage bucket using a short-lived signed upload URL. The server then downloads each file, checks its real type from its contents, and records it.
- **AI calls.** All AI calls go from the server to the configured provider: Google Gemini on the live deployment, or Anthropic Claude. Prompts mark user content as data, not instructions. Outputs must match a strict schema and then pass Resolve's grounding checks.
- **Gmail.** Gmail uses OAuth 2.0 with PKCE. Messages are sent from the user's own account only after the user authorises that specific submission.

<table class="compact">
<tr><th>Layer</th><th>Technology (from package.json and migrations)</th></tr>
<tr><td>Frontend &amp; server</td><td>Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, Zod 4</td></tr>
<tr><td>Data &amp; auth</td><td>Supabase: Auth, PostgreSQL (15 tables, 4 migrations), Storage. Access libraries @supabase/ssr and supabase-js</td></tr>
<tr><td>AI</td><td>Google Gemini via @google/genai (deployed); Anthropic Claude via @anthropic-ai/sdk (alternative), behind one provider interface</td></tr>
<tr><td>Documents</td><td>pdf-lib (complaint letters, account statements)</td></tr>
<tr><td>Hosting &amp; jobs</td><td>Vercel (serverless functions, daily scheduled job)</td></tr>
<tr><td>Testing</td><td>Vitest (unit and database security), Playwright (end-to-end), GitHub Actions CI</td></tr>
</table>



<div class="land"><h2>4. Database design</h2><figure class="diagram"><img src="evidence-assets/diagram-er.png"><figcaption><b>Figure 22. Entity relationship diagram</b>, drawn from <code>supabase/migrations/</code>.</figcaption></figure></div>

**Main entities**

- **profiles:** one per user, holding contact details, account type, AI consent and notification preferences.
- **cases:** the core record, with a random human-readable case number (`RSV-XXXX-XXXX`), problem category, transaction details, description, eight possible statuses, and an intake state so unfinished reports can be resumed.
- **evidence:** private files. Two kinds of record hang off evidence and cases: per-file AI extractions and per-case analyses (**ai_analyses**), and versioned complaint drafts with an approval state (**complaint_drafts**).
- **case_events:** an append-only timeline with 29 event types.
- **complaint_submissions:** each authorised submission, with its consent record, idempotency key, status and proof of sending. Linked to **submission_audit_log**, **bank_responses** and **bank_contact_channels**.
- **ai_tool_runs** and **ai_usage_events:** an audit trail of AI tool runs, and per-user AI rate limiting.

**How user information is protected in the database**

- **Row Level Security** is enabled on all 15 tables, through 42 policies. Users can only read and write rows where `user_id` matches their own account. Child tables also check that the parent case belongs to the user.
- **History cannot be rewritten.** The case timeline and the submission audit log have no update or delete permissions for users.
- **Users cannot write submission records.** They are written only by the server, so nobody can mark a complaint "Sent" without the email provider's proof. A database rule also requires a message ID before the status can be "sent".
- **Gmail tokens are locked away.** They live in a separate table with no user access at all, encrypted with AES-256-GCM.
- **Triggers guard ownership.** Database triggers block changes to ownership fields, generate case numbers, log every status change, cap evidence at 10 files per case, and check that every submission belongs to the same user as its case.



<div class="land"><h2>5. AI and automation workflow</h2><figure class="diagram"><img src="evidence-assets/diagram-ai-workflow.png"><figcaption><b>Figure 23. The implemented workflow, showing who does what.</b></figcaption></figure></div>

<table class="compact">
<tr><th>Step</th><th>Automated by Resolve or AI</th><th>Requires the user</th><th>Requires the institution</th></tr>
<tr><td>Receive information</td><td>Server validation; detection of PINs, OTPs, BVN and card numbers in text</td><td>Enters the details and uploads evidence</td><td>—</td></tr>
<tr><td>Extract transaction details</td><td>AI reads each receipt or statement and copies exact text</td><td>Confirms or rejects each fact read from a document</td><td>—</td></tr>
<tr><td>Analyse &amp; find missing information</td><td>AI analysis, then grounding checks: facts the checks cannot confirm become "Unverified", and unknown guidance is removed</td><td>Answers follow-up questions and corrects details</td><td>—</td></tr>
<tr><td>Draft the complaint</td><td>AI or template, from confirmed facts only; pre-send checks</td><td><b>Approves</b> the final draft</td><td>—</td></tr>
<tr><td>Submit</td><td>Builds the email and records the provider's confirmation</td><td><b>Authorises</b> each submission. Completes any website form, CAPTCHA or OTP personally</td><td>Receives the complaint</td></tr>
<tr><td>Guidance &amp; tracking</td><td>Next-action logic; reply classification; recovery plan</td><td>Decides on status changes, follow-ups and escalation</td><td><b>Investigates and decides the outcome</b></td></tr>
</table>

**Safeguards in the AI layer**

- **Seven predefined tools, every run audited.** The workflow, not the model, decides which tool runs. The model never chooses or invents a recipient.
- **Structured, checked outputs.** Every AI output is validated against a strict schema. Facts are then checked against the user's input and the document text. In bank replies, any reference number, amount or timeframe the AI "quotes" must actually appear in the reply.
- **No promises.** Prompts forbid inventing references, amounts, dates or deadlines, and forbid promising a refund.
- **Usage limits.** AI use needs the user's consent and is rate-limited per user: 10 requests per hour and 3 per minute by default, enforced in the database.
- **Graceful failure.** If the AI is unavailable, the user can still build a complaint from the template and use every other feature.



## 6. Financial inclusion and credit readiness

<div class="callout warn">

**Status: <span class="st planned">Planned</span>.** No credit-readiness, income and expense, cash-flow or financial-shock features exist in the code or database yet. This section describes the proposed design. It contains no screenshots, because there is nothing built to show.

</div>

<figure class="full diagram"><img src="evidence-assets/diagram-proposed-inclusion.png"><figcaption><b>Figure 24. Proposed workflows</b> for Pillars 2 and 3 (design direction, not implemented).</figcaption></figure>

**How Resolve plans to support small businesses**

- **Income and expense records.** Quick entries and uploaded statements or POS and wallet exports, in naira, with categories.
- **Cash-flow monitoring.** Monthly money in and out, recurring costs, and early warning of negative months.
- **Consistent record-keeping.** Simple indicators of how regularly records are kept and how complete the supporting documents are.
- **Financial activity summaries.** Exportable PDF summaries, built on the account-statement generator Resolve already has.
- **Credit-readiness insights.** A preparation checklist the owner controls, and a "lender-ready" pack they can choose to share.

**What Resolve will not do:**

- Resolve will **not** issue credit scores or guarantee loan approval. Its role is to help users become prepared and organised.
- Any feature connected to lending would need a regulatory review and authorised partners first.

**Why the foundation matters.** These pillars reuse what is already proven in Pillar 1:
- secure accounts and Row Level Security
- private document storage
- AI tools that label every fact by its source
- PDF generation
- tracking and reminders



## 7. Security and privacy

Every measure below has been checked in the code. The evidence column names where to find it.

<table class="compact">
<tr><th>Measure</th><th>Implementation</th><th>Evidence</th></tr>
<tr><td>Authentication</td><td>Supabase Auth (email and password, password reset). The session is refreshed on each request, and app pages and APIs require sign-in.</td><td><code>src/proxy.ts</code>, <code>src/lib/auth.ts</code>, E2E tests</td></tr>
<tr><td>Database access control</td><td>Row Level Security on all 15 tables (42 policies); least-privilege table grants for users; ownership triggers</td><td><code>supabase/migrations/</code>; 47 database security tests</td></tr>
<tr><td>Private file storage</td><td>Private bucket with PNG/JPG/PDF only and a 10 MB limit; owner-only folder policies; 5-minute signed links; the server checks each file's real type from its contents</td><td>Migration 002; <code>src/lib/files.ts</code></td></tr>
<tr><td>API key management</td><td>All secrets (database secret key, AI key, Google client secret, encryption key) are server-only environment variables, never sent to the browser. A secret key placed in a public setting is detected and refused.</td><td><code>src/lib/env.ts</code>, <code>.env.example</code></td></tr>
<tr><td>Data protection</td><td>Gmail tokens encrypted with AES-256-GCM; OAuth with PKCE; protection against email header injection; same-origin checks; security headers (HSTS, frame denial, no-sniff, referrer and permissions policies)</td><td><code>src/lib/email/</code>, <code>next.config.ts</code></td></tr>
<tr><td>Minimal data collection</td><td>Never asks for PINs, OTPs, passwords, BVN, NIN or full card numbers. Free text and complaints are checked for them.</td><td><code>src/lib/validation.ts</code>, <code>src/lib/orchestrator/checks.ts</code></td></tr>
<tr><td>User privacy controls</td><td>Opt-in AI consent with provider disclosure, revocable at any time; Gmail disconnect (revoked at Google); PDF statement of all of the user's data; permanent account deletion, which removes stored files and all records</td><td>Settings page; E2E tests</td></tr>
<tr><td>Abuse limits</td><td>Per-user AI rate limits enforced in the database; at most 10 complaint emails per day; the scheduled job protected by a secret</td><td><code>consume_ai_quota</code>; submission engine</td></tr>
</table>

**Not yet done:**

- **Legal review.** The privacy notice and terms have not had one. They were written with Nigeria's Data Protection Act 2023 in mind, but no compliance claim is made.
- **AI provider tier.** The live deployment uses Gemini's free tier. Under Google's terms, free-tier content may be used to improve Google's products, and users are told this before they opt in. Production use with real customers should move to a paid tier.
- **Content Security Policy.** One has not been added yet.

## 8. Development progress

<table class="status">
<tr><th>Component</th><th>Status</th><th>Evidence</th></tr>
<tr><td>Landing page</td><td><span class="st done">Completed</span></td><td>Fig. 1; live site</td></tr>
<tr><td>Authentication (register, sign-in, password reset, sign-out)</td><td><span class="st done">Completed</span></td><td>Fig. 2; code; E2E</td></tr>
<tr><td>Onboarding &amp; AI consent</td><td><span class="st done">Completed</span></td><td>Fig. 3; E2E</td></tr>
<tr><td>Dashboard</td><td><span class="st done">Completed</span></td><td>Fig. 4</td></tr>
<tr><td>Complaint reporting (5-step wizard, saved drafts)</td><td><span class="st done">Completed</span></td><td>Figs. 5–6; E2E</td></tr>
<tr><td>Evidence uploads (private, type-checked)</td><td><span class="st done">Completed</span></td><td>Fig. 7; E2E; DB tests</td></tr>
<tr><td>AI analysis &amp; document extraction</td><td><span class="st done">Completed</span></td><td>Figs. 8–9; unit tests and E2E (both providers); live Gemini run</td></tr>
<tr><td>Complaint drafting (AI + template), approval, PDF</td><td><span class="st done">Completed</span></td><td>Fig. 10; E2E</td></tr>
<tr><td>Submission by email (user's Gmail)</td><td><span class="st partial">Partially implemented</span></td><td>Figs. 11–13; E2E against a Gmail emulator. Live OAuth configuration verified; sending from a real mailbox has not yet been verified. Google app verification is needed before public use.</td></tr>
<tr><td>Guided website submission</td><td><span class="st done">Completed</span></td><td>E2E</td></tr>
<tr><td>Direct bank API / automated portal submission</td><td><span class="st planned">Planned</span></td><td>Interfaces only; needs bank partnerships</td></tr>
<tr><td>Case tracking, timeline, reply analysis, recovery plan</td><td><span class="st done">Completed</span></td><td>Figs. 14–16; E2E</td></tr>
<tr><td>Official guidance engine</td><td><span class="st partial">Partially implemented</span></td><td>Engine and admin screen built; 4 CBN sources stored as "not yet verified"</td></tr>
<tr><td>Data export (PDF statement) &amp; account deletion</td><td><span class="st done">Completed</span></td><td>E2E</td></tr>
<tr><td>Email notifications</td><td><span class="st planned">Planned</span></td><td>Preferences saved; sending not built</td></tr>
<tr><td>Credit readiness</td><td><span class="st planned">Planned</span></td><td>Proposed design (Fig. 24)</td></tr>
<tr><td>Cash-flow management / financial records</td><td><span class="st planned">Planned</span></td><td>Proposed design (Fig. 24)</td></tr>
<tr><td>Financial shock management</td><td><span class="st planned">Planned</span></td><td>Proposed design (Fig. 24)</td></tr>
</table>



## 9. Testing and validation

All of the automated test suites below were run on **11 November 2026**. All of them passed.

<table class="compact">
<tr><th>Test suite</th><th>Method</th><th>What it covers</th><th>Result</th></tr>
<tr><td>Static checks</td><td>ESLint, TypeScript compiler</td><td>The whole codebase</td><td>No errors</td></tr>
<tr><td>Unit tests</td><td>Vitest, 13 files</td><td>AI providers and error handling; grounding; validation and sensitive-data detection; complaint checks; email message building and encryption; PDF generation; case filters</td><td>92 / 92 passed</td></tr>
<tr><td>Database security tests</td><td>Vitest against real PostgreSQL with the real migrations</td><td>Row Level Security isolation between users; append-only history; private storage paths; token secrecy; submission integrity (no fake "Sent", duplicates, idempotency, ownership)</td><td>47 / 47 passed</td></tr>
<tr><td>End-to-end tests</td><td>Playwright drives the production build like a real user, against a test backend (real PostgreSQL and RLS; emulated Supabase, AI and Gmail)</td><td>21 journeys, from sign-up to case resolution: data isolation, account deletion, Gmail authorisation, sending, duplicates, failures and retries, replies, access control, mobile layout</td><td>21 / 21 passed, with Anthropic and with Gemini settings</td></tr>
<tr><td>Live deployment checks</td><td>Temporary accounts on resolve-finance.vercel.app, deleted afterwards</td><td>Sign-up, onboarding, case creation, AI analysis with real Gemini (including reading a receipt image), complaint drafting, reply analysis, recovery plan, Submit tab, Gmail OAuth configuration</td><td>Worked (10 Nov 2026). Gemini's free tier was sometimes busy and needed retries</td></tr>
</table>

**Problems found, and the improvements made**

- **AI reliability.** On the live site, the default Gemini model was unavailable and some requests timed out. Resolve now discovers available models, switches model when one is busy, limits each attempt's time, explains the problem clearly, and offers a diagnostics endpoint.
- **Complaint editing.** Editing and saving a complaint left it marked "unsaved", which blocked approval. Fixed, with a regression test.
- **Card-number detection.** The detector wrongly flagged numbers inside email addresses and phone numbers. It now uses card-prefix and context rules, with tests.
- **Admin forms** kept the previous "verified" status after adding a new record. Found by end-to-end tests, and fixed.
- **Wording.** Some text still said "Resolve will not send it for me" after submission was added. Updated.
- **Sign-up limits.** Email confirmation caused sign-up rate limits on the hosted database. The configuration was adjusted.

**Known open issue:** the source-labelling check marks the user's own currency and transaction time as "Unverified" (Figure 9). A fix is planned.

**Not yet done:** no interviews, surveys or usability tests with target users have been carried out. No user-feedback or performance statistics are claimed.



## 10. Next development steps

<ol class="roadmap">
<li><b>Improve AI reliability.</b> Fix the source-labelling false positives, add evaluation sets of real-world-style (synthetic) cases, and move to a paid AI tier with no training on user data. Monitor accuracy, and keep the template fallback.</li>
<li><b>Expand complaint guidance.</b> Verify official CBN and bank guidance with dated sources. Build a verified directory of bank complaint channels, and complete Google app verification for Gmail sending.</li>
<li><b>Develop credit-readiness tools.</b> Income and expense records, cash-flow views, readiness checklists and a lender-ready PDF pack (Section 6), with clear statements that Resolve does not score or lend.</li>
<li><b>Improve financial record management.</b> Statement and POS/wallet imports, categorisation the owner confirms, and email or SMS reminders.</li>
<li><b>Test with underserved users and small businesses.</b> Moderated usability sessions in English and other local languages, low-bandwidth testing, and accessibility review, with informed consent and synthetic or anonymised data.</li>
<li><b>Explore authorised integrations.</b> Formal partnerships with banks and payment providers for official complaint APIs, and a supervised assistant for bank complaint websites, with logins, CAPTCHAs and OTPs always kept with the user.</li>
<li><b>Prepare for launch.</b> Legal review of the privacy notice and terms (NDPA 2023), a Content Security Policy, monitoring, and incident response.</li>
</ol>

## 11. Conclusion

Resolve already turns a confusing, stressful moment, "my money left but never arrived", into a clear and documented process. It produces an evidence-backed analysis, a complaint the user has checked and approved, an authorised submission with proof, and a tracked response.

It is built carefully:
- the AI shows where every fact came from
- nothing is sent without the user's consent
- user data is isolated by the database itself
- every claim in this document is backed by code, screenshots or tests

The next steps are credit readiness and financial-shock tools for small businesses, built on the same secure foundation. With them, Resolve can help make digital financial services safer, make complaint resolution accessible to people who are usually left behind, and help small businesses become better prepared for credit and for the unexpected.

## Appendix: Evidence index

<table class="compact">
<tr><th>Evidence</th><th>Location</th></tr>
<tr><td>Live application</td><td>https://resolve-finance.vercel.app</td></tr>
<tr><td>Source code</td><td>GitHub repository <code>preciousadekunle784/Resolve</code>, branch <code>claude/dazzling-darwin-7tu3s9</code></td></tr>
<tr><td>Database schema &amp; security policies</td><td><code>supabase/migrations/</code> (4 files); combined <code>supabase/setup.sql</code></td></tr>
<tr><td>API routes</td><td><code>src/app/api/</code> (19 routes)</td></tr>
<tr><td>AI layer</td><td><code>src/lib/ai/</code> (providers, prompts, schemas, grounding); <code>src/lib/orchestrator/</code> (7 tools)</td></tr>
<tr><td>Submission engine &amp; Gmail</td><td><code>src/lib/submissions/</code>, <code>src/lib/email/</code>; design notes in <code>docs/SUBMISSIONS.md</code></td></tr>
<tr><td>Security design</td><td><code>docs/SECURITY.md</code></td></tr>
<tr><td>Tests</td><td><code>src/lib/**/*.test.ts</code>, <code>tests/db/</code>, <code>tests/e2e/</code>; CI in <code>.github/workflows/ci.yml</code></td></tr>
<tr><td>Screenshots &amp; diagrams in this document</td><td><code>docs/competition/evidence-assets/</code>; reproducible with <code>docs/competition/tools/</code></td></tr>
<tr><td>Product demo video</td><td><code>video/out/resolve-demo-16x9.mp4</code> (85 s)</td></tr>
</table>

**How the screenshots were made:**

- **Environment.** The production build of the app ran in a local demonstration environment: real PostgreSQL with the real migrations and Row Level Security, an emulated Supabase API, and a Google OAuth/Gmail emulator.
- **AI text.** Genuine Gemini output, captured on the live site for the same fictional scenario and replayed so the screenshots are consistent.
- **Data.** All names, banks, amounts, references and replies are synthetic.
