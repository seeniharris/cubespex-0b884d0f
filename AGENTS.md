<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->
- CubeTime logic (timer state machine, stats, storage, scrambles) lives as pure modules in src/lib/cube; UI in src/components/cube — keeps rules unit-testable.
- Accounts are optional: auth UI lives in src/components/cube/Account.tsx; profiles are created by a DB trigger on signup, username rules in src/lib/cube/account.ts mirror the DB check — local solve data never depends on sign-in.
- AccountSessionProvider owns the single auth listener and recovery state; sign-out clears query caches but never timer storage, preventing competing session updates.
- Self-account deletion uses authenticated server functions and a handler-only admin import; the target is always the verified caller, never a client-supplied ID.
- Google uses the managed OAuth helper with a public same-origin return; the signup trigger assigns unique provisional social usernames, preserving email username validation.
