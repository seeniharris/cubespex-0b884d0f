import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Btn, Modal, Toggle, inputCls } from "./ui";
import { AccountButton } from "./Account";
import { EVENTS, generateScramble, type Scramble } from "@/lib/cube/scramble";
import {
  bestAverage, bestSingle, combinePenalty, currentAverage, finalMs, formatMs, formatSolve, mean, parseTime,
  type Penalty, type Solve,
} from "@/lib/cube/stats";
import { initialTimer, reduceTimer, runningPenalty, type TimerEvent, type TimerState } from "@/lib/cube/timer";
import { playCue } from "@/lib/cube/sound";
import { loadData, newSession, saveData, toCSV, uid, validateData, type AppData, type Settings } from "@/lib/cube/storage";

type Tab = "timer" | "stats" | "history";

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function CubeSpex() {
  const [data, setData] = useState<AppData | null>(null);
  useEffect(() => { setData(loadData()); }, []);
  useEffect(() => { if (data) saveData(data); }, [data]);
  useEffect(() => {
    if (!data) return;
    document.documentElement.classList.toggle("light", data.settings.theme === "light");
  }, [data?.settings.theme]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!data) return <div className="flex min-h-screen items-center justify-center font-mono text-muted-foreground">Loading…</div>;
  return <App data={data} setData={setData as (f: (d: AppData) => AppData) => void} />;
}

function App({ data, setData }: { data: AppData; setData: (f: (d: AppData) => AppData) => void }) {
  const s = data.settings;
  const session = data.sessions.find((x) => x.id === data.activeSession[data.event]) ?? data.sessions.find((x) => x.event === data.event);
  const solves = session?.solves ?? [];
  const eventSessions = data.sessions.filter((x) => x.event === data.event);

  const [scramble, setScramble] = useState<Scramble | null>(null);
  const [scrLoading, setScrLoading] = useState(false);
  const scrReq = useRef(0);
  const nextScramble = useCallback((ev: string) => {
    const id = ++scrReq.current;
    setScrLoading(true);
    generateScramble(ev).then((r) => { if (id === scrReq.current) { setScramble(r); setScrLoading(false); } });
  }, []);
  useEffect(() => { nextScramble(data.event); }, [data.event, nextScramble]);

  const [tab, setTab] = useState<Tab>("timer");
  const [modal, setModal] = useState<null | "settings" | "guide" | "sessions" | "data" | "manual">(s.seenGuide ? null : "guide");
  const [detail, setDetail] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; undo?: () => void } | null>(null);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 6000); return () => clearTimeout(t); }, [toast]);

  const updSettings = (p: Partial<Settings>) => setData((d) => ({ ...d, settings: { ...d.settings, ...p } }));
  const updSolves = (fn: (sv: Solve[]) => Solve[]) => {
    if (!session) return;
    setData((d) => ({ ...d, sessions: d.sessions.map((x) => (x.id === session.id ? { ...x, solves: fn(x.solves) } : x)) }));
  };

  const addSolve = (time: number, penalty: Penalty, scr = scramble?.text ?? "") => {
    updSolves((sv) => [...sv, { id: uid(), time, penalty, scramble: scr, date: Date.now(), event: data.event }]);
  };

  // ---------- timer ----------
  const tRef = useRef<TimerState>(initialTimer);
  const [ts, setTs] = useState<TimerState>(initialTimer);
  const [now, setNow] = useState(0);
  const cfgRef = useRef({ inspection: s.inspection, holdDelay: s.holdDelay });
  cfgRef.current = { inspection: s.inspection, holdDelay: s.holdDelay };
  const ctxRef = useRef({ addSolve, nextScramble, event: data.event, sound: s.sound });
  ctxRef.current = { addSolve, nextScramble, event: data.event, sound: s.sound };

  const dispatch = useCallback((e: TimerEvent) => {
    const prev = tRef.current;
    const out = reduceTimer(prev, e, cfgRef.current);
    if (out.finished) {
      const pen = combinePenalty(runningPenalty(prev), out.finished.penalty);
      ctxRef.current.addSolve(out.finished.time, pen);
      ctxRef.current.nextScramble(ctxRef.current.event);
    }
    if (out.cue && ctxRef.current.sound) playCue(out.cue);
    tRef.current = out.state;
    if (out.state !== prev) setTs(out.state);
  }, []);

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const t = performance.now();
      if (tRef.current.phase !== "idle" && tRef.current.phase !== "stopped") { dispatch({ type: "tick", t }); setNow(t); }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [dispatch]);

  const blocked = modal !== null || detail !== null;
  const blockedRef = useRef(blocked);
  blockedRef.current = blocked;

  useEffect(() => {
    const isField = (el: EventTarget | null) => el instanceof HTMLElement && (el.closest("input,textarea,select,[contenteditable]") !== null);
    const down = (e: KeyboardEvent) => {
      if (blockedRef.current || isField(e.target)) return;
      const ph = tRef.current.phase;
      if (ph === "running") { // any key stops
        e.preventDefault(); dispatch({ type: "press", t: performance.now() }); return;
      }
      if (e.code === "Space") {
        e.preventDefault();
        if (e.repeat) return;
        (document.activeElement as HTMLElement | null)?.blur?.();
        dispatch({ type: "press", t: performance.now() });
      } else if (e.key === "Escape") {
        dispatch({ type: "cancel" });
      }
    };
    const up = (e: KeyboardEvent) => {
      if (isField(e.target)) return;
      if (e.code === "Space" || tRef.current.phase === "stopped") {
        if (e.code === "Space") e.preventDefault();
        dispatch({ type: "release", t: performance.now() });
      }
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, [dispatch]);

  const phase = ts.phase;
  const active = phase !== "idle" && phase !== "stopped";
  const focusMode = active;

  // ---------- display ----------
  const last = solves[solves.length - 1];
  let display = "0.00";
  let tone = "text-foreground";
  let sub = "";
  const inInsp = ts.inspectStart !== null && (phase === "inspecting" || phase === "holding" || phase === "ready");
  if (phase === "running") {
    display = s.hideWhileRunning ? "solving" : formatMs(now - ts.startAt, s.precision);
  } else if (inInsp) {
    const el = now - (ts.inspectStart as number);
    const left = Math.ceil((15000 - el) / 1000);
    display = left > 0 ? String(left) : el < 17000 ? "+2" : "DNF";
    tone = el >= 12000 ? "text-destructive" : el >= 8000 ? "text-warning" : "text-foreground";
    sub = "Inspection";
  } else if (phase === "armInspect") {
    display = "15"; sub = "Release to inspect";
  } else if (last) {
    display = formatSolve(last, s.precision);
  } else display = s.precision === 3 ? "0.000" : "0.00";
  if (phase === "holding") tone = "text-destructive";
  if (phase === "ready") tone = "text-primary";
  if (phase === "holding") sub = "Hold…";
  if (phase === "ready") sub = "Release to start";

  // ---------- touch ----------
  const touchId = useRef<number | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if ((e.target as HTMLElement).closest("button,input,a")) return;
    e.preventDefault();
    touchId.current = e.pointerId;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    dispatch({ type: "press", t: performance.now() });
  };
  const onPointerUp = (e: React.PointerEvent) => {
    if (touchId.current !== e.pointerId) return;
    touchId.current = null;
    dispatch({ type: "release", t: performance.now() });
  };

  // ---------- stats ----------
  const st = useMemo(() => ({
    count: solves.length,
    best: bestSingle(solves),
    current: last ? finalMs(last) : null,
    mean: mean(solves),
    ao5: currentAverage(solves, 5), bao5: bestAverage(solves, 5),
    ao12: currentAverage(solves, 12), bao12: bestAverage(solves, 12),
    dnf: solves.filter((x) => x.penalty === "DNF").length,
  }), [solves, last]);

  const setPenalty = (id: string, p: Penalty) => updSolves((sv) => sv.map((x) => (x.id === id ? { ...x, penalty: x.penalty === p ? "none" : p } : x)));
  const deleteSolve = (id: string, skipConfirm = false) => {
    if (!session) return;
    if (!skipConfirm && s.confirmDelete && !confirm("Delete this solve?")) return;
    const idx = session.solves.findIndex((x) => x.id === id);
    const solve = session.solves[idx];
    if (!solve) return;
    const sid = session.id;
    updSolves((sv) => sv.filter((x) => x.id !== id));
    setDetail(null);
    setToast({
      msg: `Deleted ${formatSolve(solve, s.precision)}`,
      undo: () => setData((d) => ({ ...d, sessions: d.sessions.map((x) => { if (x.id !== sid) return x; const n = [...x.solves]; n.splice(idx, 0, solve); return { ...x, solves: n }; }) })),
    });
  };

  const changeEvent = (ev: string) => {
    setData((d) => {
      if (d.sessions.some((x) => x.event === ev)) return { ...d, event: ev };
      const ns = newSession(ev);
      return { ...d, event: ev, sessions: [...d.sessions, ns], activeSession: { ...d.activeSession, [ev]: ns.id } };
    });
  };

  const copyScramble = async () => {
    if (!scramble) return;
    try { await navigator.clipboard.writeText(scramble.text); setToast({ msg: "Scramble copied" }); } catch { setToast({ msg: "Couldn't access clipboard" }); }
  };

  const ev = EVENTS.find((e) => e.id === data.event)!;
  const detailSolve = solves.find((x) => x.id === detail) ?? null;

  const statsPanel = <StatsPanel st={st} precision={s.precision} solves={solves} />;
  const historyPanel = (
    <History solves={solves} precision={s.precision} onOpen={setDetail}
      onClear={() => {
        if (!solves.length) return;
        if (s.confirmClear && !confirm(`Clear all ${solves.length} solves from "${session?.name}"? This can't be undone.`)) return;
        updSolves(() => []);
      }} />
  );

  return (
    <div className={cn("flex min-h-dvh flex-col bg-background text-foreground", active && "select-none")}>
      {/* top bar */}
      <header className={cn("flex flex-wrap items-center gap-2 border-b border-border px-3 py-2 transition-opacity sm:px-5", focusMode && "pointer-events-none opacity-0")}>
        <div className="mr-2 flex items-center gap-2 font-mono text-sm font-bold tracking-tight">
          <span className="inline-block h-3 w-3 rounded-sm bg-primary" aria-hidden /> CubeSpex
        </div>
        <label className="sr-only" htmlFor="event">Event</label>
        <select id="event" value={data.event} onChange={(e) => changeEvent(e.target.value)} className="rounded-md border border-input bg-secondary px-2 py-1.5 text-sm">
          {EVENTS.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
        <Btn onClick={() => setModal("sessions")} aria-label="Manage sessions">{session?.name ?? "Session"} ▾</Btn>
        <div className="ml-auto flex items-center gap-1">
          <Btn variant="ghost" onClick={() => setModal("manual")} aria-label="Add time manually" title="Add time manually">＋ Time</Btn>
          <Btn variant="ghost" onClick={() => setModal("data")} aria-label="Import or export data" title="Import / export">⇅</Btn>
          <Btn variant="ghost" onClick={() => setModal("guide")} aria-label="Quick guide" title="Guide">?</Btn>
          <Btn variant="ghost" onClick={() => setModal("settings")} aria-label="Settings" title="Settings">⚙</Btn>
          <AccountButton />
        </div>
      </header>

      {/* mobile tabs */}
      <nav className={cn("flex border-b border-border lg:hidden", focusMode && "invisible")} role="tablist" aria-label="Sections">
        {(["timer", "stats", "history"] as Tab[]).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
            className={cn("flex-1 py-2 text-xs font-medium uppercase tracking-widest", tab === t ? "border-b-2 border-primary text-primary" : "text-muted-foreground")}>
            {t}{t === "history" && solves.length ? ` (${solves.length})` : ""}
          </button>
        ))}
      </nav>

      <div className="flex flex-1 lg:grid lg:grid-cols-[1fr_360px]">
        {/* main */}
        <main className={cn("flex flex-1 flex-col", tab !== "timer" && "hidden lg:flex")}>
          <section aria-label="Scramble" className={cn("border-b border-border px-4 py-4 text-center transition-opacity sm:px-8", focusMode && "opacity-0")}>
            <div className="mb-2 flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <span className="font-mono uppercase tracking-widest">{ev.short} scramble</span>
              {scramble?.source === "practice" && <span className="rounded border border-warning/50 px-1.5 py-0.5 text-warning" title="Official generator unavailable; random-move practice scramble">practice scramble</span>}
            </div>
            <p className={cn("mx-auto max-w-4xl whitespace-pre-line break-words font-mono leading-relaxed", (scramble?.text.length ?? 0) > 200 ? "text-xs sm:text-sm" : (scramble?.text.length ?? 0) > 90 ? "text-sm sm:text-base" : "text-lg sm:text-2xl", scrLoading && "opacity-40")} aria-live="polite">
              {scramble ? scramble.text : "Generating…"}
            </p>
            <div className="mt-3 flex justify-center gap-2">
              <Btn variant="ghost" onClick={() => nextScramble(data.event)} aria-label="New scramble">↻ New</Btn>
              <Btn variant="ghost" onClick={copyScramble} aria-label="Copy scramble">⧉ Copy</Btn>
            </div>
          </section>

          {/* timer pad */}
          <div
            className="relative flex flex-1 touch-none select-none flex-col items-center justify-center px-4 py-10 [-webkit-touch-callout:none]"
            style={{ WebkitUserSelect: "none" }}
            onPointerDown={onPointerDown} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
            onContextMenu={(e) => e.preventDefault()}
            role="application" aria-label="Timer pad. Hold Space or touch and hold to arm; release to start."
          >
            <div className="h-5 text-xs uppercase tracking-[0.3em] text-muted-foreground">{sub}</div>
            <div className={cn("font-mono font-bold tabular leading-none tracking-tighter transition-colors", tone, display.length > 7 ? "text-[17vw] sm:text-8xl lg:text-9xl" : "text-[22vw] sm:text-9xl lg:text-[11rem]")}
              aria-live={active ? "off" : "polite"} aria-label="Timer">
              {display}
            </div>
            {!active && last && (
              <div className="mt-6 flex gap-2" aria-label="Penalty for last solve">
                <Btn variant={last.penalty === "+2" ? "chipActive" : "chip"} onClick={() => setPenalty(last.id, "+2")}>+2</Btn>
                <Btn variant={last.penalty === "DNF" ? "chipActive" : "chip"} onClick={() => setPenalty(last.id, "DNF")}>DNF</Btn>
                <Btn variant="chip" onClick={() => deleteSolve(last.id)} aria-label="Delete last solve">✕</Btn>
              </div>
            )}
            {!active && (
              <div className="mt-6 grid grid-cols-2 gap-x-8 gap-y-1 font-mono text-sm text-muted-foreground lg:hidden">
                <span>ao5 <b className="text-foreground">{formatMs(st.ao5, s.precision)}</b></span>
                <span>ao12 <b className="text-foreground">{formatMs(st.ao12, s.precision)}</b></span>
              </div>
            )}
            <p className={cn("absolute bottom-4 text-center text-xs text-muted-foreground", active && "hidden")}>
              <span className="hidden sm:inline">Hold <kbd className="rounded border border-border px-1">Space</kbd>, release to start · any key stops · <kbd className="rounded border border-border px-1">Esc</kbd> cancels</span>
              <span className="sm:hidden">Touch &amp; hold here, release to start · tap to stop</span>
            </p>
            {phase === "inspecting" && (
              <Btn variant="ghost" className="mt-6" onClick={() => dispatch({ type: "cancel" })}>Cancel inspection</Btn>
            )}
          </div>
        </main>

        <aside className={cn("flex-1 flex-col border-border lg:flex lg:border-l", tab === "timer" ? "hidden" : "flex", focusMode && "lg:opacity-0")}>
          <div className={cn(tab === "history" && "hidden lg:block")}>{statsPanel}</div>
          <div className={cn("flex min-h-0 flex-1 flex-col", tab === "stats" && "hidden lg:flex")}>{historyPanel}</div>
        </aside>
      </div>

      {toast && (
        <div role="status" className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-lg border border-border bg-popover px-4 py-2 text-sm shadow-xl">
          {toast.msg}
          {toast.undo && <Btn variant="primary" onClick={() => { toast.undo!(); setToast(null); }}>Undo</Btn>}
        </div>
      )}

      <SolveDetail solve={detailSolve} precision={s.precision} onClose={() => setDetail(null)}
        onPenalty={setPenalty} onDelete={(id) => deleteSolve(id)}
        onEdit={(id, t) => updSolves((sv) => sv.map((x) => (x.id === id ? { ...x, time: t } : x)))} />
      <SettingsModal open={modal === "settings"} onClose={() => setModal(null)} s={s} upd={updSettings} />
      <GuideModal open={modal === "guide"} onClose={() => { setModal(null); if (!s.seenGuide) updSettings({ seenGuide: true }); }} />
      <SessionsModal open={modal === "sessions"} onClose={() => setModal(null)} sessions={eventSessions} activeId={session?.id}
        onSwitch={(id) => setData((d) => ({ ...d, activeSession: { ...d.activeSession, [d.event]: id } }))}
        onCreate={(name) => setData((d) => { const ns = newSession(d.event, name); return { ...d, sessions: [...d.sessions, ns], activeSession: { ...d.activeSession, [d.event]: ns.id } }; })}
        onRename={(id, name) => setData((d) => ({ ...d, sessions: d.sessions.map((x) => (x.id === id ? { ...x, name } : x)) }))}
        onDelete={(id) => setData((d) => {
          const rest = d.sessions.filter((x) => x.id !== id);
          const same = rest.filter((x) => x.event === d.event);
          if (!same.length) { const ns = newSession(d.event); return { ...d, sessions: [...rest, ns], activeSession: { ...d.activeSession, [d.event]: ns.id } }; }
          return { ...d, sessions: rest, activeSession: { ...d.activeSession, [d.event]: same[0].id } };
        })} />
      <ManualModal open={modal === "manual"} onClose={() => setModal(null)} onAdd={(t, p) => { addSolve(t, p); nextScramble(data.event); setModal(null); }} />
      <DataModal open={modal === "data"} onClose={() => setModal(null)} data={data}
        onImport={(d) => { setData(() => d); setToast({ msg: `Imported ${d.sessions.length} session(s)` }); setModal(null); }} />
    </div>
  );
}

// ---------------- panels ----------------

type St = { count: number; best: number | null; current: number | null; mean: number | null; ao5: number | null; bao5: number | null; ao12: number | null; bao12: number | null; dnf: number };

function StatsPanel({ st, precision, solves }: { st: St; precision: 2 | 3; solves: Solve[] }) {
  const f = (v: number | null) => formatMs(v, precision);
  const cell = (label: string, cur: number | null, best: number | null) => (
    <div className="rounded-md border border-border bg-card p-2.5">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="mt-1 flex items-baseline justify-between font-mono tabular">
        <span className="text-lg font-semibold">{f(cur)}</span>
        <span className={cn("text-xs", best !== null && best !== Infinity ? "text-primary" : "text-muted-foreground")} title="Best">★ {f(best)}</span>
      </div>
    </div>
  );
  return (
    <section aria-label="Statistics" className="space-y-3 border-b border-border p-4">
      <div className="grid grid-cols-2 gap-2">
        {cell("Single", st.current, st.best)}
        {cell("Ao5 (trimmed)", st.ao5, st.bao5)}
        {cell("Ao12 (trimmed)", st.ao12, st.bao12)}
        <div className="rounded-md border border-border bg-card p-2.5">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Mean (all, excl. DNF)</div>
          <div className="mt-1 font-mono text-lg font-semibold tabular">{f(st.mean)}</div>
        </div>
      </div>
      <div className="flex justify-between font-mono text-xs text-muted-foreground">
        <span>{st.count} solves</span><span>{st.dnf} DNF</span>
        <span>{st.count ? `${(((st.count - st.dnf) / st.count) * 100).toFixed(0)}% success` : ""}</span>
      </div>
      <Trend solves={solves} precision={precision} />
    </section>
  );
}

function Trend({ solves, precision }: { solves: Solve[]; precision: 2 | 3 }) {
  const recent = solves.slice(-50);
  const pts = recent.map((s, i) => ({ i, v: finalMs(s) })).filter((p) => p.v !== Infinity);
  if (pts.length < 2) return <div className="flex h-24 items-center justify-center rounded-md border border-dashed border-border text-xs text-muted-foreground">Trend appears after 2 solves</div>;
  const min = Math.min(...pts.map((p) => p.v)), max = Math.max(...pts.map((p) => p.v));
  const W = 320, H = 96, n = Math.max(recent.length - 1, 1);
  const x = (i: number) => (i / n) * (W - 8) + 4;
  const y = (v: number) => H - 6 - ((v - min) / (max - min || 1)) * (H - 12);
  const ao5: { i: number; v: number }[] = [];
  for (let i = 4; i < recent.length; i++) { const a = currentAverage(recent.slice(0, i + 1), 5); if (a !== null && a !== Infinity) ao5.push({ i, v: a }); }
  const bestI = pts.reduce((b, p) => (p.v < b.v ? p : b), pts[0]);
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-24 w-full" role="img" aria-label={`Trend of last ${recent.length} solves, from ${formatMs(min, precision)} to ${formatMs(max, precision)}`}>
        <polyline fill="none" stroke="var(--chart-2)" strokeWidth="1.5" points={pts.map((p) => `${x(p.i)},${y(p.v)}`).join(" ")} />
        {ao5.length > 1 && <polyline fill="none" stroke="var(--chart-1)" strokeWidth="2" points={ao5.map((p) => `${x(p.i)},${y(Math.min(Math.max(p.v, min), max))}`).join(" ")} />}
        <circle cx={x(bestI.i)} cy={y(bestI.v)} r="3.5" fill="var(--chart-1)" />
      </svg>
      <figcaption className="flex justify-between font-mono text-[10px] text-muted-foreground">
        <span>last {recent.length}</span>
        <span><span className="text-muted-foreground">— single</span> <span className="text-primary">— ao5</span> <span className="text-primary">● PB</span></span>
      </figcaption>
    </figure>
  );
}

function History({ solves, precision, onOpen, onClear }: { solves: Solve[]; precision: 2 | 3; onOpen: (id: string) => void; onClear: () => void }) {
  const best = bestSingle(solves);
  return (
    <section aria-label="Solve history" className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <h2 className="text-xs uppercase tracking-widest text-muted-foreground">History</h2>
        <Btn variant="ghost" className="text-xs" onClick={onClear} disabled={!solves.length}>Clear session</Btn>
      </div>
      {!solves.length ? (
        <p className="px-4 py-10 text-center text-sm text-muted-foreground">No solves yet. Scramble your cube and hit Space.</p>
      ) : (
        <ol className="min-h-0 flex-1 overflow-y-auto px-2 pb-4 lg:max-h-[calc(100dvh-420px)]">
          {solves.map((sv, i) => ({ sv, i })).reverse().map(({ sv, i }) => {
            const ao5 = i >= 4 ? currentAverage(solves.slice(0, i + 1), 5) : null;
            const isPb = finalMs(sv) === best && best !== Infinity;
            return (
              <li key={sv.id}>
                <button onClick={() => onOpen(sv.id)} className="grid w-full grid-cols-[3rem_1fr_auto] items-center gap-2 rounded-md px-2 py-1.5 text-left font-mono text-sm tabular hover:bg-accent">
                  <span className="text-xs text-muted-foreground">{i + 1}</span>
                  <span className={cn(sv.penalty === "DNF" && "text-destructive", isPb && "text-primary font-semibold")}>{formatSolve(sv, precision)}{isPb && " ★"}</span>
                  <span className="text-xs text-muted-foreground">{ao5 !== null ? `ao5 ${formatMs(ao5, precision)}` : ""}</span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

// ---------------- modals ----------------

function SolveDetail({ solve, precision, onClose, onPenalty, onDelete, onEdit }: {
  solve: Solve | null; precision: 2 | 3; onClose: () => void; onPenalty: (id: string, p: Penalty) => void; onDelete: (id: string) => void; onEdit: (id: string, t: number) => void;
}) {
  const [val, setVal] = useState("");
  const [err, setErr] = useState("");
  useEffect(() => { if (solve) { setVal(formatMs(solve.time, 3)); setErr(""); } }, [solve?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!solve) return null;
  return (
    <Modal open onClose={onClose} title={`Solve · ${formatSolve(solve, precision)}`}>
      <div className="space-y-4 text-sm">
        <div className="text-muted-foreground">{new Date(solve.date).toLocaleString()}</div>
        <div>
          <div className="mb-1 text-xs uppercase tracking-widest text-muted-foreground">Scramble</div>
          <p className="whitespace-pre-line rounded-md bg-muted p-3 font-mono text-xs leading-relaxed">{solve.scramble || "—"}</p>
        </div>
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); const t = parseTime(val); if (t === null) { setErr("Use a format like 12.34 or 1:02.34"); return; } onEdit(solve.id, t); setErr(""); }}>
          <label className="sr-only" htmlFor="edit-time">Raw time</label>
          <input id="edit-time" className={inputCls} value={val} onChange={(e) => setVal(e.target.value)} inputMode="decimal" />
          <Btn type="submit" variant="primary">Save time</Btn>
        </form>
        {err && <p className="text-destructive" role="alert">{err}</p>}
        <div className="flex flex-wrap gap-2">
          <Btn variant={solve.penalty === "none" ? "chipActive" : "chip"} onClick={() => solve.penalty !== "none" && onPenalty(solve.id, solve.penalty)}>OK</Btn>
          <Btn variant={solve.penalty === "+2" ? "chipActive" : "chip"} onClick={() => onPenalty(solve.id, "+2")}>+2</Btn>
          <Btn variant={solve.penalty === "DNF" ? "chipActive" : "chip"} onClick={() => onPenalty(solve.id, "DNF")}>DNF</Btn>
          <Btn variant="danger" className="ml-auto" onClick={() => onDelete(solve.id)}>Delete</Btn>
        </div>
      </div>
    </Modal>
  );
}

function SettingsModal({ open, onClose, s, upd }: { open: boolean; onClose: () => void; s: Settings; upd: (p: Partial<Settings>) => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Settings">
      <div className="divide-y divide-border">
        <Toggle label="WCA inspection (15s)" hint="+2 after 15s, DNF at 17s. Warnings at 8s & 12s." checked={s.inspection} onChange={(v) => upd({ inspection: v })} />
        <label className="flex items-center justify-between gap-4 py-2 text-sm">
          <span>Hold-to-start delay<span className="block text-xs text-muted-foreground">{s.holdDelay} ms</span></span>
          <input type="range" min={0} max={1000} step={50} value={s.holdDelay} onChange={(e) => upd({ holdDelay: +e.target.value })} className="w-40 accent-[var(--primary)]" aria-label="Hold delay in milliseconds" />
        </label>
        <label className="flex items-center justify-between py-2 text-sm">
          <span>Precision</span>
          <select value={s.precision} onChange={(e) => upd({ precision: +e.target.value as 2 | 3 })} className="rounded-md border border-input bg-secondary px-2 py-1">
            <option value={2}>0.01 (hundredths)</option><option value={3}>0.001 (thousandths)</option>
          </select>
        </label>
        <Toggle label="Hide time while solving" checked={s.hideWhileRunning} onChange={(v) => upd({ hideWhileRunning: v })} />
        <Toggle label="Sound cues" hint="Ready, start, stop and inspection warnings" checked={s.sound} onChange={(v) => upd({ sound: v })} />
        <Toggle label="Light theme" checked={s.theme === "light"} onChange={(v) => upd({ theme: v ? "light" : "dark" })} />
        <Toggle label="Confirm before deleting a solve" checked={s.confirmDelete} onChange={(v) => upd({ confirmDelete: v })} />
        <Toggle label="Confirm before clearing a session" checked={s.confirmClear} onChange={(v) => upd({ confirmClear: v })} />
      </div>
    </Modal>
  );
}

function GuideModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const rows: [string, string][] = [
    ["Hold Space", "Arm the timer — turns lime when ready"],
    ["Release", "Start the solve"],
    ["Any key / tap", "Stop"],
    ["Esc", "Cancel inspection or armed timer"],
    ["Touch & hold", "Same as Space on phones/tablets"],
  ];
  return (
    <Modal open={open} onClose={onClose} title="Welcome to CubeSpex">
      <div className="space-y-4 text-sm">
        <p className="text-muted-foreground">A competition-style timer. Scramble your puzzle with the scramble shown, then:</p>
        <dl className="space-y-2">
          {rows.map(([k, v]) => (
            <div key={k} className="flex gap-3"><dt className="w-28 shrink-0 font-mono text-primary">{k}</dt><dd>{v}</dd></div>
          ))}
        </dl>
        <p className="text-muted-foreground">Turn on WCA inspection in Settings. Tap a solve in History to edit it, add +2/DNF or delete. Everything is saved in this browser — use ⇅ to back up.</p>
        <Btn variant="primary" className="w-full py-2" onClick={onClose}>Start cubing</Btn>
      </div>
    </Modal>
  );
}

function SessionsModal({ open, onClose, sessions, activeId, onSwitch, onCreate, onRename, onDelete }: {
  open: boolean; onClose: () => void; sessions: { id: string; name: string; solves: Solve[] }[]; activeId?: string;
  onSwitch: (id: string) => void; onCreate: (n: string) => void; onRename: (id: string, n: string) => void; onDelete: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  return (
    <Modal open={open} onClose={onClose} title="Sessions">
      <ul className="mb-4 space-y-1">
        {sessions.map((x) => (
          <li key={x.id} className={cn("flex items-center gap-2 rounded-md border px-2 py-1.5", x.id === activeId ? "border-primary" : "border-border")}>
            {editing === x.id ? (
              <form className="flex flex-1 gap-2" onSubmit={(e) => { e.preventDefault(); if (editName.trim()) onRename(x.id, editName.trim()); setEditing(null); }}>
                <input aria-label="Session name" className={inputCls} value={editName} onChange={(e) => setEditName(e.target.value)} autoFocus />
                <Btn type="submit" variant="primary">Save</Btn>
              </form>
            ) : (
              <>
                <button className="flex-1 text-left text-sm" onClick={() => { onSwitch(x.id); onClose(); }}>
                  {x.name} <span className="font-mono text-xs text-muted-foreground">· {x.solves.length}</span>
                </button>
                <Btn variant="ghost" onClick={() => { setEditing(x.id); setEditName(x.name); }} aria-label={`Rename ${x.name}`}>✎</Btn>
                <Btn variant="ghost" onClick={() => confirm(`Delete session "${x.name}" and its ${x.solves.length} solves?`) && onDelete(x.id)} aria-label={`Delete ${x.name}`}>✕</Btn>
              </>
            )}
          </li>
        ))}
      </ul>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); onCreate(name.trim() || `Session ${sessions.length + 1}`); setName(""); onClose(); }}>
        <input aria-label="New session name" placeholder={`Session ${sessions.length + 1}`} className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
        <Btn type="submit" variant="primary">Create</Btn>
      </form>
    </Modal>
  );
}

function ManualModal({ open, onClose, onAdd }: { open: boolean; onClose: () => void; onAdd: (t: number, p: Penalty) => void }) {
  const [v, setV] = useState("");
  const [p, setP] = useState<Penalty>("none");
  const [err, setErr] = useState("");
  return (
    <Modal open={open} onClose={onClose} title="Add time manually">
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); const t = parseTime(v); if (t === null) { setErr("Use a format like 12.34 or 1:02.34"); return; } onAdd(t, p); setV(""); setP("none"); setErr(""); }}>
        <input aria-label="Time" placeholder="12.34" inputMode="decimal" className={cn(inputCls, "text-2xl")} value={v} onChange={(e) => setV(e.target.value)} />
        <div className="flex gap-2">
          {(["none", "+2", "DNF"] as Penalty[]).map((x) => <Btn key={x} variant={p === x ? "chipActive" : "chip"} onClick={() => setP(x)}>{x === "none" ? "OK" : x}</Btn>)}
        </div>
        {err && <p className="text-sm text-destructive" role="alert">{err}</p>}
        <Btn type="submit" variant="primary" className="w-full py-2">Add solve</Btn>
      </form>
    </Modal>
  );
}

function DataModal({ open, onClose, data, onImport }: { open: boolean; onClose: () => void; data: AppData; onImport: (d: AppData) => void }) {
  const [err, setErr] = useState("");
  const total = data.sessions.reduce((a, s) => a + s.solves.length, 0);
  const stamp = new Date().toISOString().slice(0, 10);
  return (
    <Modal open={open} onClose={onClose} title="Import / export">
      <div className="space-y-4 text-sm">
        <p className="text-muted-foreground">{data.sessions.length} sessions · {total} solves stored in this browser.</p>
        <div className="flex flex-wrap gap-2">
          <Btn variant="primary" onClick={() => download(`cubetime-${stamp}.json`, JSON.stringify(data, null, 2), "application/json")}>Export JSON</Btn>
          <Btn onClick={() => download(`cubetime-${stamp}.csv`, toCSV(data), "text/csv")}>Export CSV</Btn>
        </div>
        <label className="block">
          <span className="mb-1 block text-xs uppercase tracking-widest text-muted-foreground">Import CubeSpex JSON</span>
          <input type="file" accept="application/json,.json" className="text-sm file:mr-3 file:rounded-md file:border file:border-border file:bg-secondary file:px-3 file:py-1.5 file:text-foreground"
            onChange={async (e) => {
              const f = e.target.files?.[0]; e.target.value = "";
              if (!f) return;
              try {
                const parsed = validateData(JSON.parse(await f.text()));
                const n = parsed.sessions.reduce((a, s) => a + s.solves.length, 0);
                if (!confirm(`Replace all current data (${total} solves) with ${parsed.sessions.length} sessions / ${n} solves from the file?`)) return;
                setErr(""); onImport(parsed);
              } catch (x) { setErr(x instanceof SyntaxError ? "That file isn't valid JSON." : (x as Error).message); }
            }} />
        </label>
        {err && <p className="text-destructive" role="alert">Import failed: {err}</p>}
      </div>
    </Modal>
  );
}
