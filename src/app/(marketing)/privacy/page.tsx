import type { Metadata } from "next";
import { ProsePage } from "@/components/marketing/prose-page";
import { Alert } from "@/components/ui/alert";
import { aiDataUseNotice, getAIProviderInfo } from "@/lib/ai/provider-info";

export const metadata: Metadata = { title: "Privacy notice" };

export default function PrivacyPage() {
  const ai = getAIProviderInfo();
  return (
    <ProsePage
      title="Privacy notice"
      intro={<p>How Resolve collects, uses and protects your information, in plain language.</p>}
    >
      <Alert tone="warning" title="Draft notice — pending legal review">
        This notice describes how the Resolve software is built to handle data. It has not yet been reviewed by a
        lawyer, and Resolve does not claim to be certified as compliant with the Nigeria Data Protection Act 2023
        (NDPA). The operator of this service must complete that review before public launch.
      </Alert>

      <h2>What we collect</h2>
      <ul>
        <li>Account details: your name, email address, optional phone number, country and account type.</li>
        <li>Case details you enter: institution, amount, date and time, references, payment channel and your description.</li>
        <li>Evidence files you choose to upload (PNG, JPG or PDF).</li>
        <li>Records of your case activity, AI analyses and complaint drafts.</li>
      </ul>

      <h2>What we never ask for</h2>
      <p>
        Resolve never asks for your banking PIN, one-time passwords (OTPs), internet banking password, Bank
        Verification Number (BVN), National Identification Number (NIN) or full card details. If you see these in a
        document you plan to upload, cover them first.
      </p>

      <h2>Why we use your information</h2>
      <ul>
        <li>To provide the service you asked for: organising your case and preparing complaint drafts.</li>
        <li>To run AI analysis — only if you have given explicit permission, which you can withdraw at any time.</li>
        <li>To keep your account secure and prevent abuse (for example, rate limits on AI features).</li>
      </ul>

      <h2>AI processing</h2>
      <p>
        When you request an AI analysis or AI-generated complaint draft, the relevant case details and evidence are
        sent to our AI provider ({ai.company}) for processing, which may happen outside Nigeria. We only do this after
        you opt in, and you can still use Resolve manually without AI, including a template-based complaint draft.
      </p>
      <p>{aiDataUseNotice(ai)}</p>

      <h2>How your data is protected</h2>
      <ul>
        <li>Database rules (Row Level Security) ensure each account can access only its own records.</li>
        <li>Evidence is stored in a private storage bucket and opened only through links that expire after a few minutes.</li>
        <li>Uploaded files are checked on the server for type and size.</li>
        <li>Connections are encrypted in transit.</li>
      </ul>

      <h2>Your rights and choices</h2>
      <ul>
        <li>Access and download a copy of your data from Settings.</li>
        <li>Correct your profile and case details at any time.</li>
        <li>Withdraw AI processing permission at any time.</li>
        <li>Permanently delete your account, cases and evidence from Settings.</li>
      </ul>

      <h2>Retention</h2>
      <p>
        Your information is kept while your account is active so you can track your cases. When you delete a case or
        your account, the related records and files are deleted from Resolve&apos;s database and storage.
      </p>
    </ProsePage>
  );
}
