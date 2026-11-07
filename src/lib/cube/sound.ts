import type { Cue } from "./timer";

let ctx: AudioContext | null = null;

function tone(freq: number, dur: number, when = 0, vol = 0.08) {
  if (typeof window === "undefined") return;
  ctx ??= new (
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
  )();
  if (ctx.state === "suspended") void ctx.resume();
  const t = ctx.currentTime + when;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = "sine";
  o.frequency.value = freq;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ctx.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

export function playCue(c: Cue) {
  try {
    switch (c) {
      case "ready":
        return tone(880, 0.08);
      case "start":
        return tone(1320, 0.06);
      case "stop":
        tone(660, 0.07);
        return tone(990, 0.09, 0.07);
      case "inspect":
        return tone(520, 0.08);
      case "warn8":
        return tone(740, 0.15);
      case "warn12":
        tone(740, 0.1);
        return tone(740, 0.1, 0.15);
    }
  } catch {
    /* audio unavailable */
  }
}
