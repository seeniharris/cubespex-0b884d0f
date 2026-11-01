export type Penalty = "none" | "+2" | "DNF";

export interface Solve {
  id: string;
  time: number; // raw ms
  penalty: Penalty;
  scramble: string;
  date: number;
  event: string;
}

export const DNF = Infinity;

/** Final result in ms (Infinity for DNF). */
export function finalMs(s: Pick<Solve, "time" | "penalty">): number {
  if (s.penalty === "DNF") return DNF;
  return s.penalty === "+2" ? s.time + 2000 : s.time;
}

/** WCA inspection penalty from elapsed inspection ms at solve start. */
export function inspectionPenalty(elapsedMs: number): Penalty {
  if (elapsedMs >= 17000) return "DNF";
  if (elapsedMs > 15000) return "+2";
  return "none";
}

export function combinePenalty(a: Penalty, b: Penalty): Penalty {
  if (a === "DNF" || b === "DNF") return "DNF";
  if (a === "+2" || b === "+2") return "+2";
  return "none";
}

/** Trimmed average of exactly the given values (WCA: trim ceil(5%) each side). null if too few. */
export function trimmedAverage(values: number[]): number | null {
  const n = values.length;
  if (n < 3) return null;
  const trim = Math.ceil(n * 0.05);
  const sorted = [...values].sort((a, b) => a - b);
  const kept = sorted.slice(trim, n - trim);
  if (kept.some((v) => v === DNF)) return DNF;
  return kept.reduce((a, b) => a + b, 0) / kept.length;
}

/** Solves are oldest-first. Returns current AoN of the last N solves. */
export function currentAverage(solves: Solve[], n: number): number | null {
  if (solves.length < n) return null;
  return trimmedAverage(solves.slice(-n).map(finalMs));
}

export function bestAverage(solves: Solve[], n: number): number | null {
  if (solves.length < n) return null;
  const vals = solves.map(finalMs);
  let best: number | null = null;
  for (let i = 0; i + n <= vals.length; i++) {
    const a = trimmedAverage(vals.slice(i, i + n))!;
    if (best === null || a < best) best = a;
  }
  return best;
}

/** Arithmetic mean of non-DNF results (untrimmed). */
export function mean(solves: Solve[]): number | null {
  const v = solves.map(finalMs).filter((x) => x !== DNF);
  if (!v.length) return null;
  return v.reduce((a, b) => a + b, 0) / v.length;
}

export function bestSingle(solves: Solve[]): number | null {
  if (!solves.length) return null;
  return Math.min(...solves.map(finalMs));
}

export function formatMs(ms: number | null | undefined, precision: 2 | 3 = 2): string {
  if (ms === null || ms === undefined || Number.isNaN(ms)) return "--";
  if (ms === DNF) return "DNF";
  const total = precision === 3 ? Math.floor(ms) : Math.floor(ms / 10) * 10;
  const minutes = Math.floor(total / 60000);
  const secs = Math.floor((total % 60000) / 1000);
  const frac = precision === 3 ? String(total % 1000).padStart(3, "0") : String(Math.floor((total % 1000) / 10)).padStart(2, "0");
  return minutes > 0 ? `${minutes}:${String(secs).padStart(2, "0")}.${frac}` : `${secs}.${frac}`;
}

export function formatSolve(s: Solve, precision: 2 | 3 = 2): string {
  if (s.penalty === "DNF") return `DNF(${formatMs(s.time, precision)})`;
  if (s.penalty === "+2") return `${formatMs(s.time + 2000, precision)}+`;
  return formatMs(s.time, precision);
}

/** Parse "12.34", "1:02.5", "62" (seconds) into ms; null if invalid. */
export function parseTime(input: string): number | null {
  const t = input.trim();
  const m = /^(?:(\d+):)?(\d+)(?:\.(\d{1,3}))?$/.exec(t);
  if (!m) return null;
  const min = m[1] ? parseInt(m[1], 10) : 0;
  const sec = parseInt(m[2], 10);
  if (m[1] && sec >= 60) return null;
  const frac = m[3] ? parseInt(m[3].padEnd(3, "0"), 10) : 0;
  const ms = min * 60000 + sec * 1000 + frac;
  return ms > 0 ? ms : null;
}
