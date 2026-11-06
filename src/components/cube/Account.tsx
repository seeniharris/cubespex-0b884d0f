import { useEffect, useState, type FormEvent } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { Btn, Modal, inputCls } from "./ui";
import { displayNameError, normalizeUsername, usernameError } from "@/lib/cube/account";

type Mode = "signin" | "signup" | "forgot";
type Profile = { username: string; display_name: string };

export function AccountButton() {
  const [user, setUser] = useState<User | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setUser(s?.user ?? null));
    return () => data.subscription.unsubscribe();
  }, []);

  return (
    <>
      <Btn variant="ghost" onClick={() => setOpen(true)} aria-label={user ? "Account" : "Sign in"} title={user ? "Account" : "Sign in"}>
        {user ? "◉" : "Sign in"}
      </Btn>
      <Modal open={open} onClose={() => setOpen(false)} title={user ? "Account" : "CubeSpex account"}>
        {user ? <ProfilePanel user={user} onDone={() => setOpen(false)} /> : <AuthForm />}
      </Modal>
    </>
  );
}

function AuthForm() {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setMsg(null);
    setBusy(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      } else if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/reset-password` });
        if (error) throw error;
        setMsg({ ok: true, text: "If that email has an account, a reset link is on its way." });
      } else {
        const uErr = usernameError(username) ?? displayNameError(displayName);
        if (uErr) throw new Error(uErr);
        if (password.length < 8) throw new Error("Password must be at least 8 characters.");
        const u = normalizeUsername(username);
        const { data: free, error: rpcErr } = await supabase.rpc("username_available", { _username: u });
        if (rpcErr) throw rpcErr;
        if (!free) throw new Error("That username is taken.");
        const { error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: window.location.origin, data: { username: u, display_name: displayName.trim() || u } },
        });
        if (error) throw new Error(/database error/i.test(error.message) ? "That username is taken or invalid." : error.message);
        setMsg({ ok: true, text: "Check your email to confirm your account, then sign in." });
      }
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : "Something went wrong." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <p className="text-sm text-muted-foreground">Optional. Your solves stay saved in this browser either way.</p>
      <label className="block text-sm">Email<input className={inputCls} type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
      {mode !== "forgot" && (
        <label className="block text-sm">Password<input className={inputCls} type="password" required minLength={mode === "signup" ? 8 : undefined} autoComplete={mode === "signup" ? "new-password" : "current-password"} value={password} onChange={(e) => setPassword(e.target.value)} /></label>
      )}
      {mode === "signup" && (
        <>
          <label className="block text-sm">Username<input className={inputCls} required maxLength={20} autoComplete="username" placeholder="3–20: a-z, 0-9, _" value={username} onChange={(e) => setUsername(e.target.value.toLowerCase())} /></label>
          <label className="block text-sm">Display name <span className="text-muted-foreground">(optional)</span><input className={inputCls} maxLength={40} value={displayName} onChange={(e) => setDisplayName(e.target.value)} /></label>
        </>
      )}
      {msg && <p role="status" className={msg.ok ? "text-sm text-primary" : "text-sm text-destructive"}>{msg.text}</p>}
      <Btn type="submit" variant="primary" className="w-full" disabled={busy}>
        {busy ? "…" : mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : "Send reset link"}
      </Btn>
      <div className="flex flex-wrap justify-between gap-2 text-sm">
        {mode !== "signin" && <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => { setMode("signin"); setMsg(null); }}>Have an account? Sign in</button>}
        {mode !== "signup" && <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => { setMode("signup"); setMsg(null); }}>Create account</button>}
        {mode === "signin" && <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => { setMode("forgot"); setMsg(null); }}>Forgot password?</button>}
      </div>
    </form>
  );
}

function ProfilePanel({ user, onDone }: { user: User; onDone: () => void }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    supabase.from("profiles").select("username, display_name").eq("id", user.id).maybeSingle().then(({ data }) => {
      if (data) { setProfile(data); setDisplayName(data.display_name); }
    });
  }, [user.id]);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const err = displayNameError(displayName);
    if (err) return setMsg({ ok: false, text: err });
    const { error } = await supabase.from("profiles").update({ display_name: displayName.trim() }).eq("id", user.id);
    setMsg(error ? { ok: false, text: error.message } : { ok: true, text: "Saved." });
  };

  const signOut = async () => { await supabase.auth.signOut(); onDone(); };

  return (
    <form onSubmit={save} className="space-y-3">
      <p className="text-sm text-muted-foreground">Signed in as {user.email}</p>
      {profile ? (
        <>
          <p className="text-sm">Username: <span className="font-mono">@{profile.username}</span></p>
          <label className="block text-sm">Display name<input className={inputCls} maxLength={40} value={displayName} onChange={(e) => setDisplayName(e.target.value)} /></label>
          {msg && <p role="status" className={msg.ok ? "text-sm text-primary" : "text-sm text-destructive"}>{msg.text}</p>}
          <Btn type="submit" variant="primary" className="w-full">Save profile</Btn>
        </>
      ) : <p className="text-sm text-muted-foreground">Loading profile…</p>}
      <Btn variant="danger" className="w-full" onClick={signOut}>Sign out</Btn>
    </form>
  );
}
