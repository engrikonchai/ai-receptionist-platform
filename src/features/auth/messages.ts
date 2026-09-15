/**
 * Shared, exact copy for the password recovery flow — used by both the
 * components that show these messages and the tests that assert on
 * them, so nothing is ever matched by a loose substring.
 */

/** Always shown after a forgot-password submission, whether or not the account exists. */
export const PASSWORD_RESET_EMAIL_SENT_MESSAGE =
  "If an account exists for this email, we've sent a password reset link.";

/** Shown on /login after a successful password reset. Never treated as an error. */
export const PASSWORD_RESET_SUCCESS_MESSAGE = 'Password updated successfully. You can now sign in.';

/** Shown when /reset-password is reached without a valid recovery session, or the session expires mid-form. */
export const RESET_LINK_INVALID_MESSAGE =
  'This password reset link is invalid or has expired. Request a new one to continue.';

/** Callback error copy specific to a failed/missing password-recovery code exchange. */
export const RECOVERY_CALLBACK_ERROR_MESSAGE =
  'That password reset link is invalid or has expired. Please request a new one.';
