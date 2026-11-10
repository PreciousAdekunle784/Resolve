import type { Metadata } from "next";
import { ProsePage } from "@/components/marketing/prose-page";
import { Alert } from "@/components/ui/alert";

export const metadata: Metadata = { title: "Terms of use" };

export default function TermsPage() {
  return (
    <ProsePage title="Terms of use" intro={<p>The key things to know before you use Resolve.</p>}>
      <Alert tone="warning" title="Draft terms — pending legal review">
        These terms summarise how Resolve works. They have not yet been reviewed by a lawyer.
      </Alert>

      <h2>What Resolve is</h2>
      <p>
        Resolve is an independent assistance tool. It helps you understand transaction problems, organise evidence and
        prepare complaints. It is not a bank, financial institution, regulator or law firm, and it is not an official
        service of the Central Bank of Nigeria or any other authority.
      </p>

      <h2>What Resolve does not do</h2>
      <ul>
        <li>It does not reverse transactions or move money.</li>
        <li>
          It does not submit complaints without your explicit authorisation. If you choose, Resolve sends a complaint you
          have approved from your own connected email account; otherwise you submit it yourself.
        </li>
        <li>It does not guarantee that a complaint will succeed or that money will be recovered.</li>
        <li>It does not provide legal or financial advice.</li>
      </ul>

      <h2>AI-generated content</h2>
      <p>
        AI analyses and drafts can contain mistakes. Always check the details, correct anything that is wrong, and
        approve a complaint only when you are satisfied it is accurate. You are responsible for what you send.
      </p>

      <h2>Your responsibilities</h2>
      <ul>
        <li>Provide information that is true to the best of your knowledge.</li>
        <li>Do not upload other people&apos;s personal data unless it is necessary for your complaint.</li>
        <li>Never upload PINs, OTPs, passwords, BVN, NIN or full card details.</li>
      </ul>

      <h2>Official guidance</h2>
      <p>
        Resolve links to official sources and shows when each was last verified. Official rules can change; always
        confirm the current process with the official source before relying on it.
      </p>
    </ProsePage>
  );
}
