import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Btn, inputCls } from "@/components/cube/ui";
import { useAccountSession } from "@/components/cube/AccountSession";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Reset password — CubeSpex" },
      { name: "description", content: "Choose a new password for your CubeSpex account." },
      { property: "og:title", content: "Reset password — CubeSpex" },
      { property: "og:description", content: "Choose a new password for your CubeSpex account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResetPassword,
});

function ResetPassword() {
  const { user, loading, recovery } = useAccountSession();
  const [pw, setPw] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user || !recovery || loading || busy) return;
    if (pw.length < 8) return setMsg({ ok: false, text: "Password must be at least 8 characters." });
    setBusy(true); setMsg(null);
    try {
      const { error } = await supabase.auth.updateUser({ password: pw });
      if (error) throw error;
      setPw(""); setMsg({ ok: true, text: "Password updated. You're signed in." });
    } catch (err) { setMsg({ ok: false, text: err instanceof Error ? err.message : "Password could not be updated. Please request a new reset link." }); }
    finally { setBusy(false); }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4 text-foreground">
      <form onSubmit={submit} className="w-full max-w-sm space-y-3 rounded-xl border border-border bg-popover p-5">
        <h1 className="text-lg font-semibold">Set a new password</h1>
        {loading ? <p role="status" className="text-sm text-muted-foreground">Checking reset link…</p> : (!user || !recovery) && <p role="status" className="text-sm text-destructive">This reset link is missing, expired or invalid. Open Sign in and choose Forgot password to request a new link.</p>}
        <label className="block text-sm">New password<input className={inputCls} type="password" autoComplete="new-password" required minLength={8} disabled={loading || !recovery || !user || busy || msg?.ok} value={pw} onChange={(e) => setPw(e.target.value)} /></label>
        {msg && <p role="status" className={msg.ok ? "text-sm text-primary" : "text-sm text-destructive"}>{msg.text}</p>}
        <Btn type="submit" variant="primary" className="w-full" disabled={loading || !recovery || !user || busy || msg?.ok}>{busy ? "Updating…" : "Update password"}</Btn>
        <Link to="/" className="block text-center text-sm text-muted-foreground hover:text-foreground">Back to timer</Link>
      </form>
    </main>
  );
}
