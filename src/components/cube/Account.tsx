import { useEffect, useState, type FormEvent } from "react";
import type { User } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Btn, Modal, inputCls } from "./ui";
import { useAccountSession } from "./AccountSession";
import { accountError, displayNameError, normalizeUsername, usernameError } from "@/lib/cube/account";
import { deleteOwnAccount } from "@/lib/cube/account.functions";

type Mode = "signin" | "signup" | "forgot";
type Profile = { username: string; display_name: string };
type Message = { ok: boolean; text: string } | null;

export function AccountButton() {
  const { user, loading, error } = useAccountSession();
  const [open, setOpen] = useState(false);
  return <>
    <Btn variant="ghost" className={!user ? "account-signin" : undefined} disabled={loading} onClick={() => setOpen(true)} aria-label={loading ? "Checking account" : user ? "Account" : "Sign in"} title={user ? "Account" : "Sign in"}>
      {loading ? "…" : user ? "◉" : "Sign in"}
      {!user && <svg aria-hidden="true" className="account-signin-trace"><rect x="1" y="1" width="calc(100% - 2px)" height="calc(100% - 2px)" rx="16" pathLength="100" /></svg>}
    </Btn>
    <Modal open={open} onClose={() => setOpen(false)} title={user ? "Account" : "CubeSpex account"}>
      {error && <p role="status" className="text-sm text-destructive">{error}</p>}
      {user ? <ProfilePanel key={user.id} user={user} onDone={() => setOpen(false)} /> : <AuthForm />}
    </Modal>
  </>;
}

function AuthForm() {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [msg, setMsg] = useState<Message>(null);
  const [busy, setBusy] = useState(false);
  const [confirmedSignup, setConfirmedSignup] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setMsg(null); setBusy(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw new Error(accountError(error, mode));
      } else if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/reset-password` });
        if (error) throw error;
        setMsg({ ok: true, text: "If that email has an account, a reset link is on its way. Check your inbox and spam folder." });
      } else {
        const validation = usernameError(username) ?? displayNameError(displayName);
        if (validation) throw new Error(validation);
        if (password.length < 8) throw new Error("Password must be at least 8 characters.");
        const u = normalizeUsername(username);
        const { data: free, error: rpcErr } = await supabase.rpc("username_available", { _username: u });
        if (rpcErr) throw rpcErr;
        if (free !== true) throw new Error("That username is already in use. If it is yours, sign in or reset your password.");
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: window.location.origin, data: { username: u, display_name: displayName.trim() || u } } });
        if (error) {
          if (/database error/i.test(error.message)) {
            const result = await supabase.rpc("username_available", { _username: u });
            if (!result.error && result.data === false) throw new Error(accountError({ code: "23505", message: error.message }, mode));
          }
          throw new Error(accountError(error, mode));
        }
        setConfirmedSignup(true);
        setMsg({ ok: true, text: data.user?.identities?.length === 0
          ? "If this email already has an account, sign in or reset your password. Otherwise, check your inbox for confirmation."
          : "Check your email to confirm your account, then sign in. Already registered? Sign in or reset your password instead." });
      }
    } catch (err) { setMsg({ ok: false, text: err instanceof Error ? err.message : "Something went wrong." }); }
    finally { setBusy(false); }
  };
  const google = async () => {
    setBusy(true); setMsg(null);
    try {
      const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
      if (result.error) throw result.error;
      if (result.redirected) return;
    } catch (err) { setMsg({ ok: false, text: err instanceof Error ? err.message : "Google sign-in could not be completed. Please try again." }); }
    finally { setBusy(false); }
  };
  const changeMode = (next: Mode) => { setMode(next); setMsg(null); setConfirmedSignup(false); };
  return <form onSubmit={submit} className="space-y-3" aria-busy={busy}>
    <p className="text-sm text-muted-foreground">Optional. Your solves stay saved in this browser either way.</p>
    <label className="block text-sm">Email<input className={inputCls} type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
    {mode !== "forgot" && <label className="block text-sm">Password<input className={inputCls} type="password" required minLength={mode === "signup" ? 8 : undefined} autoComplete={mode === "signup" ? "new-password" : "current-password"} value={password} onChange={(e) => setPassword(e.target.value)} /></label>}
    {mode === "signup" && <>
      <label className="block text-sm">Username<input className={inputCls} required maxLength={20} autoComplete="username" placeholder="3–20: a-z, 0-9, _" value={username} onChange={(e) => setUsername(e.target.value.toLowerCase())} /></label>
      <label className="block text-sm">Display name <span className="text-muted-foreground">(optional)</span><input className={inputCls} maxLength={40} value={displayName} onChange={(e) => setDisplayName(e.target.value)} /></label>
    </>}
    {msg && <p role="status" className={msg.ok ? "text-sm text-primary" : "text-sm text-destructive"}>{msg.text}</p>}
    <Btn type="submit" variant="primary" className="w-full" disabled={busy || (mode === "signup" && confirmedSignup)}>{busy ? "…" : mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : "Send reset link"}</Btn>
    {mode !== "forgot" && <Btn className="google-signin w-full" disabled={busy} onClick={google}>
      <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18"><path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"/><path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z"/><path fill="#FBBC05" d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z"/><path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z"/></svg>
      Continue with Google
    </Btn>}
    <div className="flex flex-wrap justify-between gap-2 text-sm">
      {mode !== "signin" && <Btn variant="ghost" className="p-0" disabled={busy} onClick={() => changeMode("signin")}>Have an account? Sign in</Btn>}
      {mode !== "signup" && <Btn variant="ghost" className="p-0" disabled={busy} onClick={() => changeMode("signup")}>Create account</Btn>}
      {mode !== "forgot" && <Btn variant="ghost" className="p-0" disabled={busy} onClick={() => changeMode("forgot")}>Forgot password?</Btn>}
    </div>
  </form>;
}

function ProfilePanel({ user, onDone }: { user: User; onDone: () => void }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [msg, setMsg] = useState<Message>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const queryClient = useQueryClient();
  const removeAccount = useServerFn(deleteOwnAccount);
  useEffect(() => {
    let active = true;
    void supabase.from("profiles").select("username, display_name").eq("id", user.id).maybeSingle().then(({ data, error }) => {
      if (!active) return;
      if (data) { setProfile(data); setUsername(data.username); setDisplayName(data.display_name); }
      else setMsg({ ok: false, text: error ? "Profile could not be loaded. Reopen Account to try again." : "Profile not found. Please sign out and sign in again." });
      setLoading(false);
    });
    return () => { active = false; };
  }, [user.id]);
  const save = async (e: FormEvent) => {
    e.preventDefault(); setMsg(null);
    const err = usernameError(username) ?? displayNameError(displayName);
    if (err) return setMsg({ ok: false, text: err });
    setBusy(true);
    try {
      const update = { username: normalizeUsername(username), display_name: displayName.trim() };
      const { data, error } = await supabase.from("profiles").update(update).eq("id", user.id).select("username, display_name").single();
      if (error) throw new Error(accountError(error, "profile"));
      setProfile(data); setUsername(data.username); setMsg({ ok: true, text: "Saved." });
    } catch (err) { setMsg({ ok: false, text: err instanceof Error ? err.message : "Profile could not be saved." }); }
    finally { setBusy(false); }
  };
  const signOut = async () => {
    setBusy(true); setMsg(null);
    try {
      await queryClient.cancelQueries(); queryClient.clear();
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      onDone();
    } catch (err) { setMsg({ ok: false, text: err instanceof Error ? err.message : "Sign out failed. Please try again." }); }
    finally { setBusy(false); }
  };
  const deleteAccount = async () => {
    setBusy(true); setMsg(null);
    try {
      await removeAccount({ data: { confirmation } });
      await queryClient.cancelQueries(); queryClient.clear();
      await supabase.auth.signOut({ scope: "local" }); onDone();
    } catch (err) { setMsg({ ok: false, text: err instanceof Error ? err.message : "Account deletion failed." }); }
    finally { setBusy(false); }
  };
  return <form onSubmit={save} className="space-y-3" aria-busy={busy || loading}>
    <p className="text-sm text-muted-foreground">Signed in as {user.email}</p>
    {profile && <>
      <label className="block text-sm">Username<input className={inputCls} required maxLength={20} autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value.toLowerCase())} /></label>
      <label className="block text-sm">Display name<input className={inputCls} maxLength={40} value={displayName} onChange={(e) => setDisplayName(e.target.value)} /></label>
    </>}
    {loading && <p className="text-sm text-muted-foreground">Loading profile…</p>}
    {msg && <p role="status" className={msg.ok ? "text-sm text-primary" : "text-sm text-destructive"}>{msg.text}</p>}
    {profile && <Btn type="submit" variant="primary" className="w-full" disabled={busy}>Save profile</Btn>}
    <Btn variant="danger" className="w-full" disabled={busy} onClick={signOut}>Sign out</Btn>
    {!confirmDelete ? <Btn variant="ghost" className="w-full" disabled={busy} onClick={() => setConfirmDelete(true)}>Delete my account</Btn> : <>
      <p className="text-sm text-destructive">Permanently delete your account and profile? This cannot be undone. Solves saved in this browser will remain.</p>
      <label className="block text-sm">Type DELETE to confirm<input className={inputCls} value={confirmation} onChange={(e) => setConfirmation(e.target.value)} autoComplete="off" /></label>
      <Btn variant="danger" className="w-full" disabled={busy || confirmation !== "DELETE"} onClick={deleteAccount}>Permanently delete my account</Btn>
      <Btn variant="ghost" disabled={busy} onClick={() => { setConfirmDelete(false); setConfirmation(""); }}>Cancel</Btn>
    </>}
  </form>;
}
