/** Normalize a username: trimmed + lowercase. */
export const normalizeUsername = (u: string) => u.trim().toLowerCase();

/** Returns an error message, or null when valid. Mirrors the database rule ^[a-z0-9_]{3,20}$. */
export function usernameError(u: string): string | null {
  const n = normalizeUsername(u);
  if (n.length < 3 || n.length > 20) return "Username must be 3–20 characters.";
  if (!/^[a-z0-9_]+$/.test(n)) return "Use only letters, numbers and underscores.";
  return null;
}

export function displayNameError(d: string): string | null {
  return d.trim().length > 40 ? "Display name must be 40 characters or fewer." : null;
}

export function googleDisplayName(user: {
  app_metadata: { provider?: unknown };
  user_metadata: Record<string, unknown>;
}): string | null {
  if (user.app_metadata.provider !== "google") return null;
  const name = user.user_metadata.full_name ?? user.user_metadata.name;
  return typeof name === "string" && name.trim() ? name.trim() : null;
}

export function accountError(
  error: { message: string; code?: string },
  mode: "signup" | "signin" | "profile" | "forgot",
) {
  if (error.code === "23505")
    return "That username is already in use. If it is yours, sign in or reset your password.";
  if (
    error.code === "user_already_exists" ||
    /already registered|already been registered/i.test(error.message)
  )
    return "An account already exists for this email. Sign in or reset your password instead.";
  if (error.code === "email_not_confirmed")
    return "Confirm your email before signing in. Check your inbox for the confirmation link.";
  if (mode === "signup" && /database error/i.test(error.message))
    return "Account creation failed. Please try again; this does not necessarily mean the username is taken.";
  return error.message;
}

export function deletionConfirmation(value: unknown): "DELETE" {
  if (value !== "DELETE") throw new Error("Type DELETE to confirm account deletion.");
  return value;
}

export function hasRecoveryLink(hash: string) {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  return params.get("type") === "recovery" && !!params.get("access_token") && !params.has("error");
}
