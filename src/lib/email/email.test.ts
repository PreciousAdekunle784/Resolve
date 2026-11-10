import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "./crypto";
import { buildMimeMessage, encodeHeaderText, isValidEmailAddress, parseAddress, stripQuotedReply } from "./mime";

const key = randomBytes(32);

describe("token encryption", () => {
  it("round-trips and uses a fresh IV each time", () => {
    const a = encryptSecret("refresh-token-123", key);
    const b = encryptSecret("refresh-token-123", key);
    expect(a).not.toBe(b);
    expect(a).not.toContain("refresh-token-123");
    expect(decryptSecret(a, key)).toBe("refresh-token-123");
  });

  it("rejects tampered values and the wrong key", () => {
    const token = encryptSecret("secret", key);
    const parts = token.split(".");
    parts[3] = Buffer.from("tampered").toString("base64url");
    expect(() => decryptSecret(parts.join("."), key)).toThrow();
    expect(() => decryptSecret(token, randomBytes(32))).toThrow();
  });
});

describe("MIME message builder", () => {
  const input = {
    from: { name: "Adébáyọ̀ Okafor", address: "ada@gmail.com" },
    to: "complaints@bank.example",
    subject: "Complaint: failed transfer of ₦25,000",
    text: "Dear Sir/Madam,\n\nPlease help.\n\nYours faithfully,\nAda",
    messageId: "<abc-123@resolve.example>",
    date: new Date("2026-11-10T09:00:00Z"),
    attachments: [{ filename: "Complaint RSV-1.pdf", contentType: "application/pdf", content: Buffer.from("%PDF-1.7 test") }],
  };

  it("builds a multipart message with encoded headers and attachments", () => {
    const raw = buildMimeMessage(input).toString("utf8");
    expect(raw).toMatch(/^From: =\?UTF-8\?B\?/);
    expect(raw).toContain("<ada@gmail.com>");
    expect(raw).toContain("To: complaints@bank.example");
    expect(raw).toContain("Message-ID: <abc-123@resolve.example>");
    expect(raw).toContain("Date: Tue, 10 Nov 2026 09:00:00 +0000");
    expect(raw).toMatch(/Content-Type: multipart\/mixed; boundary="resolve-[0-9a-f]+"/);
    expect(raw).toContain(`filename="Complaint RSV-1.pdf"`);
    expect(raw).toContain(Buffer.from("%PDF-1.7 test").toString("base64"));
    // Every line is CRLF-terminated and short.
    expect(raw.split("\r\n").every((l) => l.length <= 998)).toBe(true);
    const bodyB64 = raw.split("Content-Transfer-Encoding: base64\r\n\r\n")[1].split("\r\n--")[0].replace(/\r\n/g, "");
    expect(Buffer.from(bodyB64, "base64").toString("utf8")).toContain("Dear Sir/Madam,\r\n\r\nPlease help.");
  });

  it("decodes the encoded subject back to the original text", () => {
    const encoded = encodeHeaderText(input.subject);
    const decoded = encoded
      .split(/\r\n /)
      .map((w) => Buffer.from(w.replace(/^=\?UTF-8\?B\?|\?=$/g, ""), "base64").toString("utf8"))
      .join("");
    expect(decoded).toBe(input.subject);
  });

  it("refuses header injection and bad addresses", () => {
    expect(() => buildMimeMessage({ ...input, subject: "Hi\r\nBcc: victim@example.com" })).toThrow(/line breaks/);
    expect(() => buildMimeMessage({ ...input, to: "a@b.com, c@d.com" })).toThrow(/recipient/);
    expect(() => buildMimeMessage({ ...input, to: "nobody" })).toThrow(/recipient/);
    expect(() => buildMimeMessage({ ...input, messageId: "no-brackets" })).toThrow(/Message-ID/);
  });

  it("validates and parses addresses", () => {
    expect(isValidEmailAddress("care@bank.ng")).toBe(true);
    expect(isValidEmailAddress("care@bank")).toBe(false);
    expect(parseAddress('"Zenith Care" <Care@Zenith.Example>')).toBe("care@zenith.example");
    expect(parseAddress("not an address")).toBeNull();
  });
});

describe("reply text clean-up", () => {
  it("drops quoted earlier messages", () => {
    const text = "Thank you. Your reference is ZB-1.\n\nOn Tue, 10 Nov 2026 at 10:00, Ada <ada@gmail.com> wrote:\n> Dear Sir/Madam\n> I was debited";
    expect(stripQuotedReply(text)).toBe("Thank you. Your reference is ZB-1.");
    const outlook = "We are reviewing it.\n\nFrom: Ada <ada@gmail.com>\nSent: Tuesday\nSubject: Complaint";
    expect(stripQuotedReply(outlook)).toBe("We are reviewing it.");
  });
});
