import { combinePenalty, inspectionPenalty, type Penalty } from "./stats";

export type Phase =
  "idle" | "armInspect" | "inspecting" | "holding" | "ready" | "running" | "stopped";

export interface TimerState {
  phase: Phase;
  holdStart: number;
  inspectStart: number | null;
  startAt: number;
  warned: 0 | 8 | 12;
  lastTime: number;
}

export type TimerEvent =
  | { type: "press"; t: number }
  | { type: "release"; t: number }
  | { type: "tick"; t: number }
  | { type: "cancel" };

export interface TimerConfig {
  inspection: boolean;
  holdDelay: number;
}

export type Cue = "ready" | "start" | "stop" | "warn8" | "warn12" | "inspect";

export interface TimerOutput {
  state: TimerState;
  finished?: { time: number; penalty: Penalty };
  cue?: Cue;
}

export const initialTimer: TimerState = {
  phase: "idle",
  holdStart: 0,
  inspectStart: null,
  startAt: 0,
  warned: 0,
  lastTime: 0,
};

export function reduceTimer(s: TimerState, e: TimerEvent, cfg: TimerConfig): TimerOutput {
  if (e.type === "cancel") {
    return { state: { ...initialTimer, lastTime: s.lastTime } };
  }
  const inInspection = s.inspectStart !== null;

  if (e.type === "press") {
    switch (s.phase) {
      case "idle":
        if (cfg.inspection) return { state: { ...s, phase: "armInspect" } };
        return cfg.holdDelay <= 0
          ? { state: { ...s, phase: "ready", holdStart: e.t }, cue: "ready" }
          : { state: { ...s, phase: "holding", holdStart: e.t } };
      case "inspecting":
        return cfg.holdDelay <= 0
          ? { state: { ...s, phase: "ready", holdStart: e.t }, cue: "ready" }
          : { state: { ...s, phase: "holding", holdStart: e.t } };
      case "running": {
        const time = Math.max(0, e.t - s.startAt);
        const penalty = (s as TimerState & { _pen?: Penalty })._pen ?? "none";
        return {
          state: { ...initialTimer, phase: "stopped", lastTime: time },
          finished: { time, penalty },
          cue: "stop",
        };
      }
      default:
        return { state: s };
    }
  }

  if (e.type === "release") {
    switch (s.phase) {
      case "armInspect":
        return {
          state: { ...s, phase: "inspecting", inspectStart: e.t, warned: 0 },
          cue: "inspect",
        };
      case "holding":
        return { state: { ...s, phase: inInspection ? "inspecting" : "idle" } };
      case "ready": {
        const pen: Penalty = inInspection
          ? inspectionPenalty(e.t - (s.inspectStart as number))
          : "none";
        const next = {
          ...s,
          phase: "running" as Phase,
          startAt: e.t,
          inspectStart: null,
          _pen: pen,
        };
        return { state: next, cue: "start" };
      }
      case "stopped":
        return { state: { ...s, phase: "idle" } };
      default:
        return { state: s };
    }
  }

  // tick
  let state = s;
  let cue: Cue | undefined;
  if (inInspection && (s.phase === "inspecting" || s.phase === "holding" || s.phase === "ready")) {
    const el = e.t - (s.inspectStart as number);
    if (el >= 17000) {
      // Inspection over: DNF. If key still held, wait for release.
      return {
        state: {
          ...initialTimer,
          phase: s.phase === "inspecting" ? "idle" : "stopped",
          lastTime: 0,
        },
        finished: { time: 0, penalty: "DNF" },
        cue: "stop",
      };
    }
    if (el >= 12000 && s.warned < 12) {
      state = { ...state, warned: 12 };
      cue = "warn12";
    } else if (el >= 8000 && s.warned < 8) {
      state = { ...state, warned: 8 };
      cue = "warn8";
    }
  }
  if (state.phase === "holding" && e.t - state.holdStart >= cfg.holdDelay) {
    state = { ...state, phase: "ready" };
    cue = "ready";
  }
  return { state, cue };
}

/** Penalty carried from inspection into the running solve. */
export function runningPenalty(s: TimerState): Penalty {
  return (s as TimerState & { _pen?: Penalty })._pen ?? "none";
}

export { combinePenalty };
