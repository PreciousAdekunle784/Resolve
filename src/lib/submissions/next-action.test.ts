import { describe, expect, it } from "vitest";
import { nextRequiredAction } from "./next-action";

const c = (status: string) => ({ id: "case-1", status }) as never;
const sub = (status: string, created_at = "2026-11-01T10:00:00Z") => ({ status, created_at }) as never;

describe("next required action", () => {
  it("walks the user from draft to submission", () => {
    expect(nextRequiredAction({ c: c("draft"), hasApprovedDraft: false, submissions: [], responses: [] }).cta).toBe("Open complaint builder");
    expect(nextRequiredAction({ c: c("draft"), hasApprovedDraft: true, submissions: [], responses: [] }).cta).toBe("Submit to your bank");
    expect(nextRequiredAction({ c: c("draft"), hasApprovedDraft: true, submissions: [sub("failed")], responses: [] }).title).toMatch(/wasn't sent/);
  });

  it("prioritises uncertain sends and unfinished portal submissions", () => {
    expect(nextRequiredAction({ c: c("draft"), hasApprovedDraft: true, submissions: [sub("unknown")], responses: [] }).title).toMatch(/was sent/);
    expect(nextRequiredAction({ c: c("draft"), hasApprovedDraft: true, submissions: [sub("awaiting_user_confirmation")], responses: [] }).cta).toBe("Continue");
  });

  it("asks the user to review new replies first", () => {
    const r = nextRequiredAction({
      c: c("awaiting_institution_response"),
      hasApprovedDraft: true,
      submissions: [sub("sent")],
      responses: [{ analyzed_at: null, user_reviewed_at: null }] as never,
    });
    expect(r.href).toContain("#responses");
  });

  it("follows the case status after submission", () => {
    expect(nextRequiredAction({ c: c("additional_information_required"), hasApprovedDraft: true, submissions: [sub("sent")], responses: [] }).cta).toBe("Add evidence");
    expect(nextRequiredAction({ c: c("resolved"), hasApprovedDraft: true, submissions: [], responses: [{ analyzed_at: null, user_reviewed_at: null }] as never }).title).toMatch(/finished/);
  });
});
