// Illustrative scenario used throughout the demo video.
// All names are fictional: "Northbridge Bank" and "Example Recipient" are not real institutions or people.
export const SCENARIO = {
  user: { name: "Amara Okeke", email: "amara.demo@example.com" },
  bank: "Northbridge Bank",
  bankEmail: "complaints@northbridge-bank.example",
  amount: "85000",
  amountLabel: "₦85,000.00",
  date: "2026-11-08T14:12",
  dateLabel: "8 Nov 2026, 2:12 PM",
  reference: "000013261108141205184426937051",
  recipient: "Example Recipient, Example Microfinance Bank, account ending 4417",
  recipientName: "Example Recipient",
  recipientBank: "Example Microfinance Bank",
  recipientAccount: "•••• 4417",
  description:
    "I sent ₦85,000 to Example Recipient from my Northbridge Bank mobile app. The app showed the transfer as successful and my account was debited immediately, but the recipient says the money has not arrived after two days.",
  outcome: "Please reverse the debit of ₦85,000 to my account, or confirm that the money was credited to the recipient.",
  previous: "I called customer care on 9 Nov 2026 and was told to wait 24 hours. Nothing has changed.",
  bankReplyRef: "NB/CMP/2026/04571",
  bankReply:
    "Dear Amara Okeke,\n\nThank you for contacting Northbridge Bank. Your complaint about the transfer of NGN 85,000.00 on 8 November 2026 has been logged with reference NB/CMP/2026/04571.\n\nOur payments team is investigating the transaction with the receiving bank. We will update you within 5 working days.\n\nKind regards,\nCustomer Complaints Unit\nNorthbridge Bank",
};

/** The fictional banking app's "transfer successful" screen (scene 1, and the evidence image). */
export function receiptScreen() {
  return `
  <div class="bk">
    <div class="bk-status"><span>14:12</span><span class="bk-icons">●●●● ▮</span></div>
    <div class="bk-head">
      <div class="bk-logo">N</div>
      <div class="bk-brand">Northbridge<br><span>Bank</span></div>
      <div class="bk-close">✕</div>
    </div>
    <div class="bk-check"><svg viewBox="0 0 52 52"><circle cx="26" cy="26" r="24"/><path d="M15 27l7 7 15-16"/></svg></div>
    <div class="bk-title">Transfer successful</div>
    <div class="bk-amount">₦85,000<span>.00</span></div>
    <div class="bk-sub">has been sent</div>
    <div class="bk-card">
      <div class="bk-row"><span>Recipient</span><b>Example Recipient</b></div>
      <div class="bk-row"><span>Bank</span><b>Example Microfinance Bank</b></div>
      <div class="bk-row"><span>Account</span><b>•••• 4417</b></div>
      <div class="bk-row"><span>Date</span><b>8 Nov 2026, 2:12 PM</b></div>
      <div class="bk-row"><span>Session ID</span><b class="mono">000013261108141205184426937051</b></div>
      <div class="bk-row"><span>Status</span><b class="ok">Successful</b></div>
    </div>
    <div class="bk-btns"><div class="bk-btn ghost">Share receipt</div><div class="bk-btn">Done</div></div>
  </div>`;
}

export const RECEIPT_CSS = `
.bk{position:absolute;inset:0;background:linear-gradient(180deg,#0b3b36 0%,#0e2a2b 38%,#f4f6f5 38.1%,#f4f6f5 100%);font-family:Inter,system-ui,sans-serif;color:#0f1d1c;overflow:hidden}
.bk-status{display:flex;justify-content:space-between;padding:22px 34px 0;color:#e6f3f1;font-size:22px;font-weight:600}
.bk-icons{letter-spacing:2px;font-size:16px}
.bk-head{display:flex;align-items:center;gap:16px;padding:34px 34px 0;color:#fff}
.bk-logo{width:52px;height:52px;border-radius:15px;background:linear-gradient(135deg,#2bd4b4,#11806f);display:grid;place-items:center;font-weight:800;font-size:28px;color:#04201c}
.bk-brand{font-weight:700;font-size:22px;line-height:1.05}.bk-brand span{font-weight:500;opacity:.75}
.bk-close{margin-left:auto;font-size:24px;opacity:.8}
.bk-check{margin:48px auto 0;width:118px;height:118px}
.bk-check svg{width:100%;height:100%}.bk-check circle{fill:#22c39f}.bk-check path{fill:none;stroke:#fff;stroke-width:4.5;stroke-linecap:round;stroke-linejoin:round}
.bk-title{text-align:center;color:#fff;font-size:34px;font-weight:700;margin-top:26px}
.bk-amount{text-align:center;color:#fff;font-size:72px;font-weight:800;letter-spacing:-2px;margin-top:8px}.bk-amount span{font-size:40px;opacity:.75}
.bk-sub{text-align:center;color:#cfe9e4;font-size:22px;margin-top:2px}
.bk-card{margin:64px 30px 0;background:#fff;border-radius:26px;padding:10px 28px;box-shadow:0 12px 40px -18px rgba(0,0,0,.25)}
.bk-row{display:flex;justify-content:space-between;gap:18px;padding:19px 0;border-bottom:1px solid #edf0ef;font-size:22px}
.bk-row:last-child{border:0}.bk-row span{color:#6c7a78}.bk-row b{font-weight:600;text-align:right}
.bk-row b.mono{font-family:"IBM Plex Mono",ui-monospace,monospace;font-size:17px;letter-spacing:-.3px;padding-top:3px}
.bk-row b.ok{color:#11806f}
.bk-btns{display:flex;gap:16px;margin:40px 30px 0}
.bk-btn{flex:1;text-align:center;padding:24px 0;border-radius:18px;background:#0e5a50;color:#fff;font-weight:600;font-size:23px}
.bk-btn.ghost{background:#e3ebe9;color:#0e3b35}
`;
