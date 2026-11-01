import { describe, expect, it } from "vitest";
import { bestAverage, currentAverage, finalMs, formatMs, inspectionPenalty, mean, parseTime, trimmedAverage, type Solve } from "@/lib/cube/stats";
import { initialTimer, reduceTimer, type TimerEvent, type TimerState } from "@/lib/cube/timer";
import { defaultData, validateData } from "@/lib/cube/storage";
import { practiceScramble } from "@/lib/cube/scramble";

const S = (time: number, penalty: Solve["penalty"] = "none"): Solve => ({ id: String(Math.random()), time, penalty, scramble: "", date: 0, event: "333" });

describe("penalty boundaries", () => {
  it("15.00s inspection is fine", () => expect(inspectionPenalty(15000)).toBe("none"));
  it("15.01s is +2", () => expect(inspectionPenalty(15010)).toBe("+2"));
  it("16.99s is +2", () => expect(inspectionPenalty(16990)).toBe("+2"));
  it("17.00s is DNF", () => expect(inspectionPenalty(17000)).toBe("DNF"));
  it("+2 adds 2s", () => expect(finalMs(S(10000, "+2"))).toBe(12000));
});

describe("averages", () => {
  it("Ao5 drops best and worst", () => {
    expect(currentAverage([1, 2, 3, 4, 100].map((x) => S(x * 1000)), 5)).toBe(3000);
  });
  it("Ao5 with one DNF counts DNF as worst", () => {
    expect(currentAverage([S(1000), S(2000), S(3000), S(4000), S(5000, "DNF")], 5)).toBe(3000);
  });
  it("Ao5 with two DNFs is DNF", () => {
    expect(currentAverage([S(1000), S(2000), S(3000), S(4000, "DNF"), S(5000, "DNF")], 5)).toBe(Infinity);
  });
  it("Ao12 drops one best and one worst", () => {
    const v = Array.from({ length: 12 }, (_, i) => (i + 1) * 1000);
    expect(trimmedAverage(v)).toBe(6500);
  });
  it("insufficient solves gives null / --", () => {
    expect(currentAverage([S(1000)], 5)).toBeNull();
    expect(formatMs(null)).toBe("--");
  });
  it("best Ao5 slides over windows", () => {
    const s = [10, 10, 10, 10, 10, 1, 1, 1].map((x) => S(x * 1000));
    expect(bestAverage(s, 5)).toBe(4000);
  });
  it("mean excludes DNFs and is untrimmed", () => {
    expect(mean([S(1000), S(3000), S(9000, "DNF")])).toBe(2000);
  });
});

describe("format / parse", () => {
  it("formats minutes", () => expect(formatMs(62345)).toBe("1:02.34"));
  it("parses", () => {
    expect(parseTime("12.34")).toBe(12340);
    expect(parseTime("1:02.5")).toBe(62500);
    expect(parseTime("abc")).toBeNull();
  });
});

function run(events: TimerEvent[], cfg = { inspection: false, holdDelay: 300 }) {
  let s: TimerState = initialTimer;
  const finished: { time: number; penalty: string }[] = [];
  for (const e of events) {
    const o = reduceTimer(s, e, cfg);
    s = o.state;
    if (o.finished) finished.push(o.finished);
  }
  return { s, finished };
}

describe("timer state machine", () => {
  it("releasing before hold delay does not start", () => {
    const { s } = run([{ type: "press", t: 0 }, { type: "tick", t: 100 }, { type: "release", t: 150 }]);
    expect(s.phase).toBe("idle");
  });
  it("full solve measures release-to-press", () => {
    const { s, finished } = run([
      { type: "press", t: 0 }, { type: "tick", t: 300 }, { type: "release", t: 400 },
      { type: "press", t: 10400 }, { type: "release", t: 10500 },
    ]);
    expect(finished).toEqual([{ time: 10000, penalty: "none" }]);
    expect(s.phase).toBe("idle");
  });
  it("inspection over 15s gives +2", () => {
    const { finished } = run([
      { type: "press", t: 0 }, { type: "release", t: 0 },
      { type: "press", t: 15000 }, { type: "tick", t: 15300 }, { type: "release", t: 15500 },
      { type: "press", t: 25500 },
    ], { inspection: true, holdDelay: 300 });
    expect(finished[0]).toEqual({ time: 10000, penalty: "+2" });
  });
  it("inspection reaching 17s is DNF automatically", () => {
    const { finished, s } = run([{ type: "press", t: 0 }, { type: "release", t: 0 }, { type: "tick", t: 17000 }], { inspection: true, holdDelay: 300 });
    expect(finished[0].penalty).toBe("DNF");
    expect(s.phase).toBe("idle");
  });
  it("cancel resets inspection", () => {
    const { s } = run([{ type: "press", t: 0 }, { type: "release", t: 0 }, { type: "cancel" }], { inspection: true, holdDelay: 300 });
    expect(s.phase).toBe("idle");
    expect(s.inspectStart).toBeNull();
  });
});

describe("persistence validation", () => {
  it("round-trips default data", () => {
    const d = defaultData();
    expect(validateData(JSON.parse(JSON.stringify(d))).sessions).toHaveLength(1);
  });
  it("rejects bad files", () => {
    expect(() => validateData({ foo: 1 })).toThrow();
    expect(() => validateData({ version: 1, sessions: [{ id: "a", name: "x", event: "333", solves: [{ time: "x", penalty: "none" }] }] })).toThrow();
  });
});

describe("practice scrambles", () => {
  it("3x3 has 20 moves without same-face repeats", () => {
    const m = practiceScramble("333").split(" ");
    expect(m).toHaveLength(20);
    for (let i = 1; i < m.length; i++) expect(m[i][0]).not.toBe(m[i - 1][0]);
  });
});
