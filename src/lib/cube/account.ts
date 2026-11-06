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
