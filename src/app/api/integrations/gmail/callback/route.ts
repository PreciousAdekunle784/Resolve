import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { saveGmailConnection } from "@/lib/email/connections";
import { EmailProviderError, exchangeAuthorizationCode, getGmailProfile, GMAIL_SEND_SCOPE, revokeToken } from "@/lib/email/google";
import { OAUTH_COOKIE, OAUTH_COOKIE_PATH, readOAuthState } from "@/lib/email/oauth-state";

/** Google redirects here after the user approves (or declines) access. */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const saved = readOAuthState(request.cookies.get(OAUTH_COOKIE)?.value);
  const back = (outcome: Record<string, string>) => {
    const url = new URL(saved?.returnTo ?? "/settings#email", request.url);
    for (const [k, v] of Object.entries(outcome)) url.searchParams.set(k, v);
    const res = NextResponse.redirect(url);
    res.cookies.set(OAUTH_COOKIE, "", { path: OAUTH_COOKIE_PATH, maxAge: 0 });
    return res;
  };

  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url));
  if (!saved || saved.state !== params.get("state") || saved.userId !== user.id) {
    return back({ gmail: "error", reason: "expired" });
  }
  if (params.get("error")) return back({ gmail: "error", reason: params.get("error") === "access_denied" ? "denied" : "google_error" });
  const code = params.get("code");
  if (!code) return back({ gmail: "error", reason: "google_error" });

  try {
    const tokens = await exchangeAuthorizationCode(code, saved.verifier);
    const scopes = (tokens.scope ?? "").split(/\s+/).filter(Boolean);
    if (!scopes.includes(GMAIL_SEND_SCOPE)) {
      await revokeToken(tokens.access_token);
      return back({ gmail: "error", reason: "send_permission_missing" });
    }
    if (!tokens.refresh_token) return back({ gmail: "error", reason: "no_refresh_token" });
    const profile = await getGmailProfile(tokens.access_token);
    await saveGmailConnection({
      userId: user.id,
      emailAddress: profile.emailAddress,
      scopes,
      refreshToken: tokens.refresh_token,
      accessToken: tokens.access_token,
      expiresIn: tokens.expires_in,
    });
    return back({ gmail: "connected" });
  } catch (error) {
    console.error("[gmail callback]", error instanceof EmailProviderError ? error.code : error instanceof Error ? error.name : typeof error);
    return back({ gmail: "error", reason: "google_error" });
  }
}
