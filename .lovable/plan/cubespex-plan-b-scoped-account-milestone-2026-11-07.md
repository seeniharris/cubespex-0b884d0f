# CubeSpex Plan B: scoped account milestone

Preserve the existing timer, local solves and all design outside the sign-in button.

## Changes
- Keep email signup, confirmation and login; distinguish duplicate usernames, existing-account responses and unrelated signup errors.
- Complete reset-link handling with expired/invalid-link states, submission loading and success states.
- Centralize session loading so reopening does not briefly show the wrong account action; clear account caches on logout without clearing local solves.
- Enable managed Google sign-in with a public return to the current origin. No Apple changes. New Google accounts receive a unique provisional username, editable in their profile.
- Add username editing alongside existing display-name editing, retaining database uniqueness and owner-only access.
- Add explicit, typed self-deletion confirmation using a signed-in server operation; never accept another user's ID.
- Style only the header sign-in button: bold white text, curved outline and a short green border trace; static reduced-motion fallback.

## Technical details
- Existing username availability RPC bypasses owner-only read restrictions correctly. The current signup error handler incorrectly labels every database failure as a username conflict.
- The existing signup trigger requires username metadata, which Google does not provide; update it to generate a collision-safe provisional username only for social signup.
- Use the generated server-side admin client exclusively inside the authenticated deletion handler; leave browser secrets untouched.
- Add focused account-rule tests and browser checks for public recovery, session reopen, profile editing and logout. Never delete the user's account for testing.

## Verification and limits
Report test/build signals, provider configuration status, and recorded credits. Google consent and actual email-link delivery require a real provider/email interaction; do not claim those verified without completing them. Do not publish.