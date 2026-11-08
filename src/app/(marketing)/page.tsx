import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { ISSUE_CATEGORY_INFO, ISSUE_CATEGORIES } from "@/lib/constants";

const steps = [
  {
    title: "Describe what happened",
    body: "Answer a few guided questions about the transaction: your bank, the amount, when it happened and how you paid. Save and come back any time.",
  },
  {
    title: "Add your evidence",
    body: "Upload receipts, screenshots, statements or debit alerts. Files are stored privately and only you can open them.",
  },
  {
    title: "Get a clear analysis",
    body: "Resolve's AI summarises your case, points out missing or conflicting details, asks follow-up questions and suggests next steps.",
  },
  {
    title: "Prepare and track your complaint",
    body: "Generate an editable complaint from facts you have confirmed, export it, send it yourself, and track every response in one timeline.",
  },
];

const icons: Record<string, string> = {
  failed_or_pending_transfer: "M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5",
  unauthorised_debit:
    "M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z",
  duplicate_transaction:
    "M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75",
  erroneous_transfer:
    "M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3",
};

const faqs = [
  {
    q: "Can Resolve get my money back?",
    a: "No one can honestly promise that. Resolve helps you understand what happened, organise your evidence and prepare a clear, complete complaint for your financial institution. Whether money is returned depends on your institution, the facts of the case and the official complaint process.",
  },
  {
    q: "Is Resolve a bank or part of the CBN?",
    a: "No. Resolve is an independent assistance service. It is not a bank, financial institution, regulator, law firm or an official Central Bank of Nigeria service. We point you to official channels, and you stay in control of what you send and to whom.",
  },
  {
    q: "Does Resolve send complaints to my bank for me?",
    a: "No. Resolve prepares a draft that you review, edit and approve. You then send it yourself through your institution's official channels and record the details in Resolve so you can track progress.",
  },
  {
    q: "What information will you ask me for?",
    a: "Details about the transaction — institution, amount, date and time, reference (if you have it), payment channel and what happened — plus any evidence you choose to upload. We never ask for your PIN, OTP, internet banking password, BVN, NIN or full card number.",
  },
  {
    q: "How does the AI use my information?",
    a: "Only if you give permission. When you request an analysis, your case details and evidence are sent to our AI provider to produce the analysis. Resolve does not use your data to train AI models. You can withdraw permission at any time in Settings, and the rest of Resolve keeps working without AI.",
  },
  {
    q: "What if the AI gets something wrong?",
    a: "Every AI finding is labelled by where it came from — something you told us, something read from a document, or the AI's own interpretation — and anything unconfirmed is marked unverified. You review and correct the details, and the complaint is only built from facts you have confirmed.",
  },
  {
    q: "Can I delete my data?",
    a: "Yes. You can download a copy of your data or permanently delete your account, cases and uploaded files from Settings at any time.",
  },
];

export default function LandingPage() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-ink-100">
        <div
          className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,var(--color-ink-100)_1px,transparent_1px),linear-gradient(to_bottom,var(--color-ink-100)_1px,transparent_1px)] [mask-image:radial-gradient(ellipse_60%_60%_at_70%_30%,black,transparent)] bg-[size:48px_48px] opacity-70"
          aria-hidden="true"
        />
        <div className="container-page relative grid items-center gap-12 py-16 sm:py-20 lg:grid-cols-[1.1fr_0.9fr] lg:py-24">
          <div className="space-y-7">
            <p className="inline-flex items-center gap-2 rounded-full border border-ink-200 bg-white px-3 py-1 text-xs font-medium text-ink-700">
              <span className="size-1.5 rounded-full bg-brand-500" aria-hidden="true" />
              For bank customers and small businesses in Nigeria
            </p>
            <h1 className="text-4xl leading-[1.08] font-semibold text-ink-950 sm:text-5xl lg:text-[3.4rem]">
              Money gone wrong?
              <br />
              <span className="text-brand-700">Understand what happened.</span>
              <br />
              Know what to do next.
            </h1>
            <p className="max-w-xl text-lg leading-relaxed text-ink-600">
              Resolve helps you make sense of failed transfers, unexpected debits and other transaction problems —
              then organise your evidence and prepare a clear complaint for your bank or payment provider.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <ButtonLink href="/register?next=/cases/new" size="lg">
                Report a Problem
              </ButtonLink>
              <ButtonLink href="/#how-it-works" size="lg" variant="secondary">
                See how it works
              </ButtonLink>
            </div>
            <ul className="flex flex-col gap-2 text-sm text-ink-600 sm:flex-row sm:flex-wrap sm:gap-x-6">
              <li className="flex items-center gap-2"><Check /> Save and continue any time</li>
              <li className="flex items-center gap-2"><Check /> Your evidence stays private</li>
              <li className="flex items-center gap-2"><Check /> Never asks for your PIN or OTP</li>
            </ul>
          </div>

          <HeroPreview />
        </div>
      </section>

      {/* Problems */}
      <section id="problems" className="scroll-mt-20 py-20">
        <div className="container-page space-y-10">
          <SectionHeading
            eyebrow="Problems we cover"
            title="Built for the transaction problems people actually face"
            body="Resolve currently supports four common types of problem. More will be added over time."
          />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {ISSUE_CATEGORIES.map((c) => (
              <div key={c} className="rounded-[var(--radius-card)] border border-ink-200 bg-white p-5 shadow-[var(--shadow-card)]">
                <span className="inline-flex size-10 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
                  <svg className="size-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.6} stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d={icons[c]} />
                  </svg>
                </span>
                <h3 className="mt-4 font-semibold text-ink-950">{ISSUE_CATEGORY_INFO[c].label}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-600">{ISSUE_CATEGORY_INFO[c].description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="scroll-mt-20 border-y border-ink-100 bg-ink-50 py-20">
        <div className="container-page space-y-10">
          <SectionHeading
            eyebrow="How it works"
            title="From confusion to a complete, well-organised complaint"
            body="Resolve guides you through the same steps a careful adviser would — and keeps a record of everything along the way."
          />
          <ol className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {steps.map((s, i) => (
              <li key={s.title} className="relative rounded-[var(--radius-card)] border border-ink-200 bg-white p-5">
                <span className="font-mono text-xs font-medium text-brand-700">Step {String(i + 1).padStart(2, "0")}</span>
                <h3 className="mt-2 font-semibold text-ink-950">{s.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-600">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* AI */}
      <section className="py-20">
        <div className="container-page grid items-start gap-12 lg:grid-cols-2">
          <div className="space-y-5">
            <SectionHeading
              align="left"
              eyebrow="How AI helps"
              title="An assistant that shows its working — and never guesses"
              body="Resolve's AI reads your description and evidence to help you see the whole picture. It is designed to be careful, not clever."
            />
            <ul className="space-y-3 text-sm leading-relaxed text-ink-700">
              {[
                "Identifies the likely type of problem and the key transaction details.",
                "Spots missing information and details that don't match, and asks you about them.",
                "Explains practical next steps and links to official complaint guidance.",
                "Never invents references, dates, amounts or bank responses — if something is missing, it asks you.",
                "Never treats a screenshot as proof that money has settled, and never promises a refund.",
              ].map((t) => (
                <li key={t} className="flex gap-3">
                  <Check />
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-[var(--radius-card)] border border-ink-200 bg-white p-6 shadow-[var(--shadow-card)]">
            <p className="text-sm font-semibold text-ink-950">Every finding is labelled by its source</p>
            <p className="mt-1 text-sm text-ink-600">So you always know what to trust and what to check.</p>
            <dl className="mt-5 divide-y divide-ink-100">
              {[
                ["You told us", "Information you entered yourself.", "bg-brand-50 text-brand-700 ring-brand-100"],
                ["From a document", "Read from evidence you uploaded.", "bg-ink-100 text-ink-700 ring-ink-200"],
                ["AI interpretation", "The assistant's reading of the situation.", "bg-warning-50 text-warning-800 ring-warning-100"],
                ["Unverified", "Not confirmed — check before relying on it.", "bg-danger-50 text-danger-700 ring-danger-100"],
              ].map(([label, desc, cls]) => (
                <div key={label} className="flex items-center justify-between gap-4 py-3">
                  <dt>
                    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${cls}`}>{label}</span>
                  </dt>
                  <dd className="text-right text-sm text-ink-600">{desc}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="border-y border-ink-100 bg-ink-50 py-20">
        <div className="container-page space-y-10">
          <SectionHeading eyebrow="Why Resolve" title="Less stress. A stronger, clearer complaint." />
          <div className="grid gap-6 md:grid-cols-3">
            {[
              ["Clarity first", "A plain-language summary of what happened and what usually needs to happen next."],
              ["Nothing gets lost", "Evidence, references, responses and follow-up dates live in one case timeline."],
              ["Complaints that are complete", "Drafts include the facts institutions typically need, built only from details you confirmed."],
            ].map(([t, b]) => (
              <div key={t} className="space-y-2">
                <h3 className="font-semibold text-ink-950">{t}</h3>
                <p className="text-sm leading-relaxed text-ink-600">{b}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Privacy */}
      <section id="privacy" className="scroll-mt-20 bg-ink-950 py-20 text-white">
        <div className="container-page grid gap-12 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="space-y-4">
            <p className="text-xs font-semibold tracking-wider text-brand-300 uppercase">Privacy & security</p>
            <h2 className="text-3xl font-semibold">Your financial information deserves serious protection</h2>
            <p className="leading-relaxed text-ink-300">
              Resolve is designed with the Nigeria Data Protection Act 2023 in mind. We collect only what is needed to
              help with your case, and you stay in control of it.
            </p>
            <Link href="/privacy" className="inline-flex text-sm font-medium text-brand-300 underline-offset-4 hover:underline">
              Read the privacy notice →
            </Link>
          </div>
          <ul className="grid gap-4 sm:grid-cols-2">
            {[
              ["Private evidence storage", "Files are stored in a private bucket and opened only through short-lived, signed links."],
              ["Strict data isolation", "Database rules ensure each account can only ever access its own cases and files."],
              ["AI only with permission", "Case details are sent to the AI provider only after you opt in. Withdraw any time."],
              ["No sensitive credentials", "We never ask for PINs, OTPs, passwords, BVN, NIN or full card numbers."],
              ["Export your data", "Download a copy of everything you have stored in Resolve."],
              ["Delete everything", "Permanently remove your account, cases and files whenever you choose."],
            ].map(([t, b]) => (
              <li key={t} className="rounded-[var(--radius-card)] border border-white/10 bg-white/[0.03] p-5">
                <p className="font-semibold">{t}</p>
                <p className="mt-1 text-sm leading-relaxed text-ink-400">{b}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Official guidance */}
      <section className="py-20">
        <div className="container-page grid items-center gap-8 lg:grid-cols-[1fr_auto]">
          <div className="space-y-3">
            <h2 className="text-2xl font-semibold text-ink-950">We complement official channels — we don&apos;t replace them</h2>
            <p className="max-w-3xl leading-relaxed text-ink-600">
              Resolve links every recommendation to official complaint guidance from sources such as the Central Bank of
              Nigeria, and clearly shows when each source was last verified. Where guidance hasn&apos;t been verified,
              we tell you, so you can check the official source directly.
            </p>
          </div>
          <ButtonLink href="/guidance" variant="secondary">
            View official guidance
          </ButtonLink>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="scroll-mt-20 border-t border-ink-100 bg-ink-50 py-20">
        <div className="container-page grid gap-10 lg:grid-cols-[0.8fr_1.2fr]">
          <SectionHeading align="left" eyebrow="FAQ" title="Questions people ask before they start" />
          <div className="divide-y divide-ink-200 rounded-[var(--radius-card)] border border-ink-200 bg-white">
            {faqs.map((f) => (
              <details key={f.q} className="group px-5 py-4 [&_summary::-webkit-details-marker]:hidden">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium text-ink-950">
                  {f.q}
                  <svg className="size-5 shrink-0 text-ink-400 transition-transform group-open:rotate-45" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
                  </svg>
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-ink-600">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20">
        <div className="container-page">
          <div className="flex flex-col items-start justify-between gap-6 rounded-[var(--radius-card)] bg-brand-700 px-6 py-10 text-white sm:px-10 md:flex-row md:items-center">
            <div className="space-y-2">
              <h2 className="text-2xl font-semibold">Had a transaction go wrong?</h2>
              <p className="max-w-xl text-brand-100">
                Start a case in a few minutes. Save your progress and come back whenever you&apos;re ready.
              </p>
            </div>
            <ButtonLink href="/register?next=/cases/new" variant="dark" size="lg">
              Report a Problem
            </ButtonLink>
          </div>
        </div>
      </section>
    </>
  );
}

function SectionHeading({
  eyebrow,
  title,
  body,
  align = "center",
}: {
  eyebrow?: string;
  title: string;
  body?: string;
  align?: "center" | "left";
}) {
  return (
    <div className={align === "center" ? "mx-auto max-w-2xl space-y-3 text-center" : "space-y-3"}>
      {eyebrow ? <p className="text-xs font-semibold tracking-wider text-brand-700 uppercase">{eyebrow}</p> : null}
      <h2 className="text-3xl font-semibold text-ink-950">{title}</h2>
      {body ? <p className="leading-relaxed text-ink-600">{body}</p> : null}
    </div>
  );
}

function Check() {
  return (
    <svg className="mt-0.5 size-4 shrink-0 text-brand-600" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M16.7 5.3a1 1 0 010 1.4l-8 8a1 1 0 01-1.4 0l-4-4a1 1 0 011.4-1.4L8 12.58l7.3-7.3a1 1 0 011.4 0z"
        clipRule="evenodd"
      />
    </svg>
  );
}

/** Illustrative product preview. Clearly labelled as an example — not real data. */
function HeroPreview() {
  return (
    <div className="relative" aria-label="Example of a Resolve case summary" role="img">
      <div className="rounded-[var(--radius-card)] border border-ink-200 bg-white shadow-[var(--shadow-raised)]">
        <div className="flex items-center justify-between border-b border-ink-100 px-5 py-3">
          <span className="font-mono text-xs text-ink-500">Example case</span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-warning-50 px-2.5 py-0.5 text-xs font-medium text-warning-800 ring-1 ring-warning-100 ring-inset">
            <span className="size-1.5 rounded-full bg-warning-500" />
            Awaiting institution response
          </span>
        </div>
        <div className="space-y-4 px-5 py-5">
          <div>
            <p className="text-xs font-medium text-ink-500">Summary</p>
            <p className="mt-1 text-sm leading-relaxed text-ink-800">
              A transfer from a mobile banking app was debited, but the recipient reports it was not received. The
              transfer reference has not been provided yet.
            </p>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-medium text-ink-500">Needs your attention</p>
            <div className="flex items-start gap-2 rounded-md bg-warning-50 px-3 py-2 text-sm text-ink-800">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-warning-500" />
              Add the transaction reference from your debit alert or receipt.
            </div>
            <div className="flex items-start gap-2 rounded-md bg-ink-50 px-3 py-2 text-sm text-ink-800">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-ink-400" />
              The time on your screenshot differs from the time you entered.
            </div>
          </div>
          <div>
            <p className="text-xs font-medium text-ink-500">Timeline</p>
            <ol className="mt-2 space-y-2 border-l border-ink-200 pl-4 text-sm text-ink-700">
              <li>Report completed</li>
              <li>Evidence uploaded</li>
              <li>Complaint approved and sent by you</li>
            </ol>
          </div>
        </div>
      </div>
      <p className="mt-3 text-center text-xs text-ink-500">Illustration only — not a real case.</p>
    </div>
  );
}
