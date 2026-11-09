import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { ISSUE_CATEGORIES, ISSUE_CATEGORY_INFO } from "@/lib/constants";

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
  erroneous_transfer: "M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3",
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
    a: "Only if you give permission. When you request an analysis, your case details and evidence are sent to our AI provider to produce it. Before you opt in, Resolve tells you which provider is used and whether that provider may use submitted content to improve its own services. Resolve itself does not use your data to train AI models. You can withdraw permission at any time in Settings, and the rest of Resolve keeps working without AI.",
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

function Arrow() {
  return (
    <svg className="size-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path fillRule="evenodd" d="M3 10a.75.75 0 01.75-.75h10.64l-4.22-4.22a.75.75 0 111.06-1.06l5.5 5.5a.75.75 0 010 1.06l-5.5 5.5a.75.75 0 11-1.06-1.06l4.22-4.22H3.75A.75.75 0 013 10z" clipRule="evenodd" />
    </svg>
  );
}

function Check() {
  return (
    <svg className="mt-0.5 size-4 shrink-0 text-brand-400" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path fillRule="evenodd" d="M16.7 5.3a1 1 0 010 1.4l-8 8a1 1 0 01-1.4 0l-4-4a1 1 0 011.4-1.4L8 12.58l7.3-7.3a1 1 0 011.4 0z" clipRule="evenodd" />
    </svg>
  );
}

function SectionHeading({ eyebrow, title, body, align = "center" }: { eyebrow?: string; title: string; body?: string; align?: "center" | "left" }) {
  return (
    <div className={align === "center" ? "mx-auto max-w-2xl space-y-4 text-center" : "space-y-4"}>
      {eyebrow ? (
        <p className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-medium text-brand-300">
          {eyebrow}
        </p>
      ) : null}
      <h2 className="text-3xl font-light tracking-tight text-white sm:text-[2.5rem] sm:leading-[1.15]">{title}</h2>
      {body ? <p className="leading-relaxed text-ink-400">{body}</p> : null}
    </div>
  );
}

export default function LandingPage() {
  return (
    <>
      {/* ------------------------------------------------------------ Hero */}
      <section className="relative isolate overflow-hidden pt-28 sm:pt-32">
        <div className="night-grid absolute inset-0 -z-20 [mask-image:radial-gradient(ellipse_70%_60%_at_50%_30%,black,transparent)]" aria-hidden="true" />
        <div className="star-field absolute inset-0 -z-20 bg-[length:520px_420px]" aria-hidden="true" />
        <div className="light-beam -left-[6%] -z-10 origin-top-left -rotate-[38deg] [clip-path:polygon(30%_0,58%_0,100%_100%,10%_100%)]" aria-hidden="true" />
        <div className="light-beam -right-[6%] -z-10 origin-top-right rotate-[38deg] [clip-path:polygon(42%_0,70%_0,90%_100%,0_100%)]" aria-hidden="true" />

        <div className="mx-auto max-w-5xl px-4 text-center sm:px-6">
          <p className="mx-auto inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.05] px-3.5 py-1.5 text-xs text-ink-200 backdrop-blur">
            <svg className="size-3.5 text-brand-300" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path d="M10 1l1.9 5.1L17 8l-5.1 1.9L10 15l-1.9-5.1L3 8l5.1-1.9L10 1zM16 13l.9 2.1L19 16l-2.1.9L16 19l-.9-2.1L13 16l2.1-.9L16 13z" />
            </svg>
            Money gone wrong? Built for bank customers and businesses in Nigeria
          </p>
          <h1 className="mt-6 text-[2.4rem] leading-[1.08] font-light tracking-[-0.03em] text-white sm:text-[3.5rem] lg:text-[4rem]">
            Understand what happened.
            <br />
            <span className="bg-linear-to-r from-brand-300 via-white to-brand-300 bg-clip-text text-transparent">Know what to do next.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-ink-400">
            Make sense of failed transfers, unexpected debits and other transaction problems — then organise your
            evidence and prepare a clear complaint for your bank or payment provider.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <ButtonLink href="/register?next=/cases/new" size="lg" variant="glow">
              Report a Problem <Arrow />
            </ButtonLink>
            <ButtonLink href="/#how-it-works" size="lg" variant="glass">
              See how it works
            </ButtonLink>
          </div>
          <ul className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-ink-400">
            <li className="flex items-center gap-2"><Check /> Save and continue any time</li>
            <li className="flex items-center gap-2"><Check /> Your evidence stays private</li>
            <li className="flex items-center gap-2"><Check /> Never asks for your PIN or OTP</li>
          </ul>
        </div>

        <HeroPreview />
      </section>

      {/* ------------------------------------------------------- Problems */}
      <section id="problems" className="relative scroll-mt-24 py-24">
        <div className="container-page space-y-12">
          <SectionHeading
            eyebrow="Problems we cover"
            title="Built for the transaction problems people actually face"
            body="Resolve currently supports four common types of problem. More will be added over time."
          />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {ISSUE_CATEGORIES.map((c) => (
              <div key={c} className="glass-card rounded-2xl p-6">
                <span className="inline-flex size-11 items-center justify-center rounded-xl border border-brand-400/25 bg-brand-500/10 text-brand-300 shadow-[0_0_24px_-6px_rgb(59_130_246/0.6)]">
                  <svg className="size-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.6} stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d={icons[c]} />
                  </svg>
                </span>
                <h3 className="mt-5 font-medium text-white">{ISSUE_CATEGORY_INFO[c].label}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-400">{ISSUE_CATEGORY_INFO[c].description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* --------------------------------------------------- How it works */}
      <section id="how-it-works" className="relative scroll-mt-24 py-24">
        <div className="pointer-events-none absolute inset-x-0 top-0 mx-auto h-px max-w-4xl bg-linear-to-r from-transparent via-brand-400/40 to-transparent" aria-hidden="true" />
        <div className="container-page space-y-12">
          <SectionHeading
            eyebrow="How it works"
            title="From confusion to a complete, well-organised complaint"
            body="Resolve guides you through the same steps a careful adviser would — and keeps a record of everything along the way."
          />
          <ol className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {steps.map((s, i) => (
              <li key={s.title} className="glass-card relative rounded-2xl p-6">
                <span className="font-mono text-xs text-brand-300">Step {String(i + 1).padStart(2, "0")}</span>
                <h3 className="mt-3 font-medium text-white">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-400">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* -------------------------------------------------------------- AI */}
      <section id="ai" className="relative isolate scroll-mt-24 overflow-hidden py-24">
        <div className="pointer-events-none absolute top-1/2 left-1/2 -z-10 h-[420px] w-[720px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-600/15 blur-3xl" aria-hidden="true" />
        <div className="container-page grid items-center gap-12 lg:grid-cols-2">
          <div className="space-y-6">
            <SectionHeading
              align="left"
              eyebrow="How AI helps"
              title="An assistant that shows its working — and never guesses"
              body="Resolve's AI reads your description and evidence to help you see the whole picture. It is designed to be careful, not clever."
            />
            <ul className="space-y-3 text-sm leading-relaxed text-ink-300">
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
          <div className="glass-card rounded-2xl p-6">
            <p className="text-sm font-medium text-white">Every finding is labelled by its source</p>
            <p className="mt-1 text-sm text-ink-400">So you always know what to trust and what to check.</p>
            <dl className="mt-5 divide-y divide-white/[0.06]">
              {[
                ["You told us", "Information you entered yourself.", "bg-brand-500/15 text-brand-300 ring-brand-400/30"],
                ["From a document", "Read from evidence you uploaded.", "bg-white/10 text-ink-200 ring-white/15"],
                ["AI interpretation", "The assistant's reading of the situation.", "bg-amber-400/10 text-amber-300 ring-amber-300/25"],
                ["Unverified", "Not confirmed — check before relying on it.", "bg-red-400/10 text-red-300 ring-red-300/25"],
              ].map(([label, desc, cls]) => (
                <div key={label} className="flex items-center justify-between gap-4 py-3.5">
                  <dt>
                    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${cls}`}>{label}</span>
                  </dt>
                  <dd className="text-right text-sm text-ink-400">{desc}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      {/* -------------------------------------------------------- Benefits */}
      <section className="py-24">
        <div className="container-page space-y-12">
          <SectionHeading eyebrow="Why Resolve" title="Less stress. A stronger, clearer complaint." />
          <div className="grid gap-px overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.06] md:grid-cols-3">
            {[
              ["Clarity first", "A plain-language summary of what happened and what usually needs to happen next."],
              ["Nothing gets lost", "Evidence, references, responses and follow-up dates live in one case timeline."],
              ["Complaints that are complete", "Drafts include the facts institutions typically need, built only from details you confirmed."],
            ].map(([t, b]) => (
              <div key={t} className="space-y-2 bg-night-950 p-7">
                <h3 className="font-medium text-white">{t}</h3>
                <p className="text-sm leading-relaxed text-ink-400">{b}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* --------------------------------------------------------- Privacy */}
      <section id="privacy" className="relative scroll-mt-24 py-24">
        <div className="container-page grid gap-12 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="space-y-5">
            <SectionHeading
              align="left"
              eyebrow="Privacy & security"
              title="Your financial information deserves serious protection"
              body="Resolve is designed with the Nigeria Data Protection Act 2023 in mind. We collect only what is needed to help with your case, and you stay in control of it."
            />
            <Link href="/privacy" className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-300 hover:text-brand-100">
              Read the privacy notice <Arrow />
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
              <li key={t} className="glass-card rounded-2xl p-5">
                <p className="font-medium text-white">{t}</p>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-400">{b}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ------------------------------------------------ Official guidance */}
      <section className="py-16">
        <div className="container-page">
          <div className="glass-card flex flex-col items-start justify-between gap-6 rounded-2xl p-7 md:flex-row md:items-center">
            <div className="space-y-2">
              <h2 className="text-xl font-medium text-white">We complement official channels — we don&apos;t replace them</h2>
              <p className="max-w-3xl text-sm leading-relaxed text-ink-400">
                Resolve links every recommendation to official complaint guidance from sources such as the Central Bank of
                Nigeria, and clearly shows when each source was last verified. Where guidance hasn&apos;t been verified, we
                tell you, so you can check the official source directly.
              </p>
            </div>
            <ButtonLink href="/guidance" variant="glass">View official guidance</ButtonLink>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------- FAQ */}
      <section id="faq" className="scroll-mt-24 py-24">
        <div className="container-page grid gap-10 lg:grid-cols-[0.8fr_1.2fr]">
          <SectionHeading align="left" eyebrow="FAQ" title="Questions people ask before they start" />
          <div className="divide-y divide-white/[0.07] rounded-2xl border border-white/[0.08] bg-white/[0.02]">
            {faqs.map((f) => (
              <details key={f.q} className="group px-6 py-5 [&_summary::-webkit-details-marker]:hidden">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium text-white">
                  {f.q}
                  <svg className="size-5 shrink-0 text-ink-500 transition-transform group-open:rotate-45" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
                  </svg>
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-ink-400">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------- CTA */}
      <section className="relative isolate overflow-hidden pt-28 pb-44">
        <div className="horizon top-[78%] h-[1400px]! w-[1400px]!" aria-hidden="true" />
        <div className="relative z-10 mx-auto max-w-2xl space-y-6 px-4 text-center">
          <h2 className="text-3xl font-light tracking-tight text-white sm:text-5xl">Had a transaction go wrong?</h2>
          <p className="text-ink-400">Start a case in a few minutes. Save your progress and come back whenever you&apos;re ready.</p>
          <ButtonLink href="/register?next=/cases/new" size="lg" variant="glow">
            Report a Problem <Arrow />
          </ButtonLink>
        </div>
      </section>
    </>
  );
}

/**
 * Illustrative product preview under the hero. Clearly labelled as an
 * example — it is not real data and shows no statistics.
 */
function HeroPreview() {
  return (
    <div className="relative mx-auto mt-12 h-[400px] max-w-6xl px-4 sm:mt-14 sm:h-[430px] sm:px-6" role="img" aria-label="Illustration of a Resolve case: evidence, AI analysis and timeline">
      <div className="grid grid-cols-1 gap-5 md:grid-cols-[1fr_1.15fr_1fr] md:items-start">
        {/* Evidence */}
        <div className="glass-card hidden rounded-2xl p-5 md:mt-16 md:block">
          <div className="flex items-center justify-between">
            <p className="text-sm text-ink-300">Evidence</p>
            <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[11px] text-ink-300">3 files</span>
          </div>
          <ul className="mt-4 space-y-2.5">
            {[
              ["Debit alert.png", "Read by AI", "bg-emerald-400"],
              ["Transfer receipt.pdf", "Read by AI", "bg-emerald-400"],
              ["Bank statement.pdf", "Reading…", "bg-brand-400"],
            ].map(([name, state, dot]) => (
              <li key={name} className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2.5">
                <span className="flex size-8 items-center justify-center rounded-lg bg-white/[0.06] text-[10px] font-semibold text-ink-300">
                  {name.endsWith("pdf") ? "PDF" : "IMG"}
                </span>
                <span className="min-w-0 flex-1 truncate text-left text-sm text-ink-200">{name}</span>
                <span className="flex items-center gap-1.5 text-[11px] text-ink-400">
                  <span className={`size-1.5 rounded-full ${dot}`} />
                  {state}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* Analysis */}
        <div className="glass-card rounded-2xl p-5 ring-1 ring-brand-400/20">
          <div className="flex items-center justify-between">
            <p className="flex items-center gap-2 text-sm text-ink-200">
              <span className="size-2 rounded-full bg-brand-400 shadow-[0_0_10px_rgb(96_165_250)]" />
              Case analysis
            </p>
            <span className="rounded-full border border-white/10 px-2.5 py-0.5 text-[11px] text-ink-300">Example case</span>
          </div>
          <div className="mt-4 rounded-xl border border-white/[0.06] bg-white/[0.03] p-4 text-left">
            <p className="text-[11px] tracking-wide text-ink-500 uppercase">Failed transfer · Mobile app</p>
            <p className="mt-1 text-sm leading-relaxed text-ink-200">
              You were debited, but the recipient says nothing arrived. The receipt shows &ldquo;Successful&rdquo;, which
              doesn&apos;t prove the money was credited.
            </p>
          </div>
          <ul className="mt-3 space-y-2 text-left text-sm">
            {[
              ["Institution", "You told us", "bg-brand-500/15 text-brand-300"],
              ["Transaction reference", "From a document", "bg-white/10 text-ink-200"],
              ["Recipient account", "Unverified", "bg-red-400/10 text-red-300"],
            ].map(([label, src, cls]) => (
              <li key={label} className="flex items-center justify-between border-b border-white/[0.05] pb-2 last:border-0">
                <span className="text-ink-400">{label}</span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] ${cls}`}>{src}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Timeline */}
        <div className="glass-card hidden rounded-2xl p-5 md:mt-16 md:block">
          <p className="text-sm text-ink-300">Case timeline</p>
          <ol className="mt-4 space-y-3.5 border-l border-white/10 pl-4 text-left text-sm">
            {[
              ["Report completed", "bg-emerald-400"],
              ["Complaint approved", "bg-emerald-400"],
              ["Sent to your bank", "bg-brand-400"],
              ["Awaiting response", "bg-amber-400"],
            ].map(([t, dot]) => (
              <li key={t} className="relative text-ink-200">
                <span className={`absolute top-1.5 -left-[1.31rem] size-2 rounded-full ${dot}`} />
                {t}
              </li>
            ))}
          </ol>
        </div>
      </div>
      <div className="horizon top-[170px] sm:top-[190px]" aria-hidden="true" />
      <p className="absolute inset-x-0 bottom-6 z-10 text-center text-xs text-ink-500">Illustration only — not a real case.</p>
    </div>
  );
}
