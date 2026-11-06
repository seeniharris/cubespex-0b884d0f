import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Btn, inputCls } from "@/components/cube/ui";

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
  const [pw, setPw] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (pw.length < 8) return setMsg({ ok: false, text: "Password must be at least 8 characters." });
    const { error } = await supabase.auth.updateUser({ password: pw });
    setMsg(error ? { ok: false, text: error.message } : { ok: true, text: "Password updated. You're signed in." });
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4 text-foreground">
      <form onSubmit={submit} className="w-full max-w-sm space-y-3 rounded-xl border border-border bg-popover p-5">
        <h1 className="text-lg font-semibold">Set a new password</h1>
        <label className="block text-sm">New password<input className={inputCls} type="password" autoComplete="new-password" required value={pw} onChange={(e) => setPw(e.target.value)} /></label>
        {msg && <p role="status" className={msg.ok ? "text-sm text-primary" : "text-sm text-destructive"}>{msg.text}</p>}
        <Btn type="submit" variant="primary" className="w-full">Update password</Btn>
        <Link to="/" className="block text-center text-sm text-muted-foreground hover:text-foreground">Back to timer</Link>
      </form>
    </main>
  );
}
