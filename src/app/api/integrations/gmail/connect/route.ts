import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { buildAuthorizationUrl, isEmailSubmissionConfigured } from "@/lib/email/google";
import { createOAuthState, OAUTH_COOKIE, OAUTH_COOKIE_PATH, safeReturnTo } from "@/lib/email/oauth-state";

/**
 * Starts "Connect Gmail": redirects the signed-in user to Google's consent
 * screen. ?replies=1 also asks for read access so Resolve can find the bank's
 * replies in the threads it sends.
 */
export async function GET(request: NextRequest) {
  const returnTo = safeReturnTo(request.nextUrl.searchParams.get("returnTo"));
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(returnTo)}`, request.url));
  if (!isEmailSubmissionConfigured()) {
    return NextResponse.redirect(withParams(new URL(returnTo, request.url), { gmail: "error", reason: "not_configured" }));
  }
  const readReplies = request.nextUrl.searchParams.get("replies") === "1";
  const { data, cookie, codeChallenge } = createOAuthState(user.id, returnTo, readReplies);
  const response = NextResponse.redirect(buildAuthorizationUrl({ state: data.state, codeChallenge, readReplies, loginHint: user.email ?? undefined }));
  response.cookies.set(OAUTH_COOKIE, cookie, {
    httpOnly: true,
    secure: request.nextUrl.protocol === "https:",
    sameSite: "lax",
    path: OAUTH_COOKIE_PATH,
    maxAge: 600,
  });
  return response;
}

function withParams(url: URL, params: Record<string, string>) {
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return url;
}
