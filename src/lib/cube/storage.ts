import { EVENTS } from "./scramble";
import type { Penalty, Solve } from "./stats";

export interface Session {
  id: string;
  name: string;
  event: string;
  solves: Solve[]; // oldest first
  created: number;
}

export interface Settings {
  inspection: boolean;
  holdDelay: number;
  precision: 2 | 3;
  hideWhileRunning: boolean;
  sound: boolean;
  theme: "dark" | "light";
  confirmDelete: boolean;
  confirmClear: boolean;
  seenGuide: boolean;
}

export interface AppData {
  version: 1;
  event: string;
  activeSession: Record<string, string>;
  sessions: Session[];
  settings: Settings;
}

export const STORAGE_KEY = "cubetime:v1";

export const defaultSettings: Settings = {
  inspection: false,
  holdDelay: 300,
  precision: 2,
  hideWhileRunning: false,
  sound: true,
  theme: "dark",
  confirmDelete: true,
  confirmClear: true,
  seenGuide: false,
};

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

export function newSession(event: string, name = "Session 1"): Session {
  return { id: uid(), name, event, solves: [], created: Date.now() };
}

export function defaultData(): AppData {
  const s = newSession("333");
  return { version: 1, event: "333", activeSession: { "333": s.id }, sessions: [s], settings: { ...defaultSettings } };
}

const PENALTIES: Penalty[] = ["none", "+2", "DNF"];
const EVENT_IDS = new Set(EVENTS.map((e) => e.id));

/** Validate untrusted data; throws Error with a readable message. */
export function validateData(raw: unknown): AppData {
  if (!raw || typeof raw !== "object") throw new Error("File is not a CubeTime JSON export.");
  const r = raw as Record<string, unknown>;
  if (r.version !== 1) throw new Error("Unsupported or missing version (expected 1).");
  if (!Array.isArray(r.sessions)) throw new Error("Missing sessions list.");
  const sessions: Session[] = r.sessions.map((s: unknown, i: number) => {
    const o = s as Record<string, unknown>;
    if (!o || typeof o.id !== "string" || typeof o.name !== "string" || typeof o.event !== "string")
      throw new Error(`Session #${i + 1} is malformed.`);
    if (!EVENT_IDS.has(o.event)) throw new Error(`Session "${o.name}" has unknown event "${o.event}".`);
    if (!Array.isArray(o.solves)) throw new Error(`Session "${o.name}" has no solves array.`);
    const solves: Solve[] = o.solves.map((x: unknown, j: number) => {
      const v = x as Record<string, unknown>;
      if (!v || typeof v.time !== "number" || !Number.isFinite(v.time) || v.time < 0 || !PENALTIES.includes(v.penalty as Penalty))
        throw new Error(`Solve #${j + 1} in "${o.name}" is malformed.`);
      return {
        id: typeof v.id === "string" ? v.id : uid(),
        time: v.time,
        penalty: v.penalty as Penalty,
        scramble: typeof v.scramble === "string" ? v.scramble : "",
        date: typeof v.date === "number" ? v.date : Date.now(),
        event: o.event as string,
      };
    });
    return { id: o.id, name: o.name, event: o.event as string, solves, created: typeof o.created === "number" ? o.created : Date.now() };
  });
  if (!sessions.length) throw new Error("File contains no sessions.");
  const settings = { ...defaultSettings, ...(typeof r.settings === "object" && r.settings ? (r.settings as Partial<Settings>) : {}) };
  const event = typeof r.event === "string" && EVENT_IDS.has(r.event) ? r.event : sessions[0].event;
  const activeSession: Record<string, string> = {};
  const act = (r.activeSession ?? {}) as Record<string, unknown>;
  for (const s of sessions) {
    const a = act[s.event];
    if (typeof a === "string" && sessions.some((x) => x.id === a && x.event === s.event)) activeSession[s.event] = a;
    else activeSession[s.event] ??= s.id;
  }
  return { version: 1, event, activeSession, sessions, settings };
}

export function loadData(): AppData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultData();
    return validateData(JSON.parse(raw));
  } catch {
    return defaultData();
  }
}

export function saveData(d: AppData) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(d));
  } catch {
    /* quota exceeded — ignore */
  }
}

export function toCSV(d: AppData): string {
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const rows = ["session,event,date,raw_ms,penalty,final_ms,scramble"];
  for (const s of d.sessions)
    for (const v of s.solves) {
      const fin = v.penalty === "DNF" ? "DNF" : String(v.penalty === "+2" ? v.time + 2000 : v.time);
      rows.push([esc(s.name), s.event, new Date(v.date).toISOString(), v.time, v.penalty, fin, esc(v.scramble.replace(/\n/g, " "))].join(","));
    }
  return rows.join("\n");
}
