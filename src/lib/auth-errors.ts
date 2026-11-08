/** Maps Supabase auth errors to clear, non-technical messages. */
export function authErrorMessage(error: { code?: string; message?: string; status?: number } | null | undefined): string {
  if (!error) return "Something went wrong. Please try again.";
  switch (error.code) {
    case "invalid_credentials":
      return "The email or password is incorrect.";
    case "email_not_confirmed":
      return "Please confirm your email address first. Check your inbox for the confirmation link.";
    case "user_already_exists":
    case "email_exists":
      return "An account with this email already exists. Try signing in instead.";
    case "weak_password":
      return "That password is too weak. Use at least 10 characters with letters and numbers.";
    case "same_password":
      return "Your new password must be different from your current password.";
    case "over_email_send_rate_limit":
      return "Too many emails have been sent. Please wait a few minutes and try again.";
    case "over_request_rate_limit":
      return "Too many attempts. Please wait a few minutes and try again.";
    case "signup_disabled":
      return "New sign-ups are currently disabled.";
    case "otp_expired":
    case "flow_state_expired":
      return "This link has expired. Please request a new one.";
    case "session_not_found":
    case "refresh_token_not_found":
      return "Your session has ended. Please sign in again.";
  }
  if (error.status === 429) return "Too many attempts. Please wait a few minutes and try again.";
  if (error.status && error.status >= 500) return "The sign-in service is temporarily unavailable. Please try again shortly.";
  return "We couldn't complete that request. Please check your details and try again.";
}

/** Only allow same-site relative redirects (prevents open redirects). */
export function safeNextPath(next: string | null | undefined, fallback = "/dashboard"): string {
  if (!next || typeof next !== "string") return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}
