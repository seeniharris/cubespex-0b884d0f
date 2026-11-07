import { describe, expect, it } from "vitest";
import {
  accountError,
  deletionConfirmation,
  hasRecoveryLink,
  googleDisplayName,
  normalizeUsername,
} from "@/lib/cube/account";

describe("account rules", () => {
  it("uses Google name metadata as a display name without using it as a username", () => {
    expect(
      googleDisplayName({
        app_metadata: { provider: "google" },
        user_metadata: { full_name: "  Alex Cubes  ", name: "Other", email: "alex@example.com" },
      }),
    ).toBe("Alex Cubes");
    expect(
      googleDisplayName({
        app_metadata: { provider: "google" },
        user_metadata: { name: "Alex Cubes" },
      }),
    ).toBe("Alex Cubes");
    expect(
      googleDisplayName({
        app_metadata: { provider: "email" },
        user_metadata: { full_name: "Alex Cubes" },
      }),
    ).toBeNull();
  });

  it("normalizes usernames to unique lowercase handles", () =>
    expect(normalizeUsername(" My_Cuber ")).toBe("my_cuber"));
  it("does not mislabel unrelated signup failures as taken", () =>
    expect(accountError({ message: "Database error saving new user" }, "signup")).toBe(
      "Account creation failed. Please try again; this does not necessarily mean the username is taken.",
    ));
  it("distinguishes an existing email account", () =>
    expect(accountError({ code: "user_already_exists", message: "exists" }, "signup")).toBe(
      "An account already exists for this email. Sign in or reset your password instead.",
    ));
  it("distinguishes duplicate usernames", () =>
    expect(accountError({ code: "23505", message: "unique" }, "profile")).toBe(
      "That username is already in use. If it is yours, sign in or reset your password.",
    ));
  it("requires exact explicit self-deletion confirmation", () => {
    expect(() => deletionConfirmation("delete")).toThrow();
    expect(() => deletionConfirmation(undefined)).toThrow();
    expect(deletionConfirmation("DELETE")).toBe("DELETE");
  });
  it("accepts recovery links only, not ordinary sign-in tokens", () => {
    expect(hasRecoveryLink("#access_token=test&type=recovery")).toBe(true);
    expect(hasRecoveryLink("#access_token=test&type=signup")).toBe(false);
    expect(hasRecoveryLink("#type=recovery")).toBe(false);
    expect(hasRecoveryLink("#access_token=test&type=recovery&error=expired")).toBe(false);
  });
});
