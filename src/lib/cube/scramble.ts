export interface CubeEvent {
  id: string; // WCA / cubing.js event id
  name: string;
  short: string;
}

export const EVENTS: CubeEvent[] = [
  { id: "333", name: "3x3x3", short: "3x3" },
  { id: "222", name: "2x2x2", short: "2x2" },
  { id: "444", name: "4x4x4", short: "4x4" },
  { id: "555", name: "5x5x5", short: "5x5" },
  { id: "666", name: "6x6x6", short: "6x6" },
  { id: "777", name: "7x7x7", short: "7x7" },
  { id: "333bf", name: "3x3 Blindfolded", short: "3BLD" },
  { id: "333oh", name: "3x3 One-Handed", short: "OH" },
  { id: "333fm", name: "Fewest Moves", short: "FMC" },
  { id: "clock", name: "Clock", short: "Clock" },
  { id: "minx", name: "Megaminx", short: "Mega" },
  { id: "pyram", name: "Pyraminx", short: "Pyra" },
  { id: "skewb", name: "Skewb", short: "Skewb" },
  { id: "sq1", name: "Square-1", short: "SQ-1" },
];

export interface Scramble {
  text: string;
  source: "official" | "practice";
}

const pick = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)];

/** Random-move scramble for NxN; avoids same-face repeats and redundant same-axis triples. */
function nxn(n: number, len: number): string {
  const faces = n === 2 ? ["U", "R", "F"] : ["U", "D", "L", "R", "F", "B"];
  const axis: Record<string, number> = { U: 0, D: 0, L: 1, R: 1, F: 2, B: 2 };
  const out: string[] = [];
  let prev: string[] = [];
  while (out.length < len) {
    const f = pick(faces);
    if (prev[0] === f) continue;
    if (prev.length >= 2 && axis[prev[0]] === axis[f] && axis[prev[1]] === axis[f]) continue;
    let mv = f;
    if (n >= 4) {
      const maxDepth = Math.floor(n / 2);
      const depth = 1 + Math.floor(Math.random() * maxDepth);
      if (depth >= 2) mv = (depth >= 3 ? depth : "") + f + "w";
    }
    out.push(mv + pick(["", "'", "2"]));
    prev = [f, ...prev].slice(0, 2);
  }
  return out.join(" ");
}

export function practiceScramble(event: string): string {
  switch (event) {
    case "222":
      return nxn(2, 11);
    case "444":
      return nxn(4, 40);
    case "555":
      return nxn(5, 60);
    case "666":
      return nxn(6, 80);
    case "777":
      return nxn(7, 100);
    case "pyram": {
      const base = nxn(2, 0);
      const mv: string[] = [];
      let p = "";
      while (mv.length < 10) {
        const f = pick(["U", "L", "R", "B"]);
        if (f === p) continue;
        p = f;
        mv.push(f + pick(["", "'"]));
      }
      const tips = ["u", "l", "r", "b"]
        .filter(() => Math.random() < 0.5)
        .map((t) => t + pick(["", "'"]));
      return [base, ...mv, ...tips].filter(Boolean).join(" ");
    }
    case "skewb": {
      const mv: string[] = [];
      let p = "";
      while (mv.length < 11) {
        const f = pick(["R", "U", "L", "B"]);
        if (f === p) continue;
        p = f;
        mv.push(f + pick(["", "'"]));
      }
      return mv.join(" ");
    }
    case "minx": {
      const lines: string[] = [];
      for (let l = 0; l < 7; l++) {
        const parts: string[] = [];
        for (let i = 0; i < 10; i++) parts.push((i % 2 ? "D" : "R") + pick(["++", "--"]));
        parts.push(pick(["U", "U'"]));
        lines.push(parts.join(" "));
      }
      return lines.join("\n");
    }
    case "clock": {
      const pins = ["UR", "DR", "DL", "UL", "U", "R", "D", "L", "ALL"];
      const a = pins.map((p) => {
        const v = Math.floor(Math.random() * 12) - 5;
        return `${p}${Math.abs(v)}${v < 0 ? "-" : "+"}`;
      });
      return [
        ...a,
        "y2",
        ...["U", "R", "D", "L", "ALL"].map((p) => {
          const v = Math.floor(Math.random() * 12) - 5;
          return `${p}${Math.abs(v)}${v < 0 ? "-" : "+"}`;
        }),
      ].join(" ");
    }
    case "sq1": {
      const out: string[] = [];
      for (let i = 0; i < 12; i++)
        out.push(`(${Math.floor(Math.random() * 12) - 5},${Math.floor(Math.random() * 12) - 5})`);
      return out.join(" / ");
    }
    default:
      return nxn(3, 20);
  }
}

let lib: Promise<typeof import("cubing/scramble")> | null = null;

/** Random-state official scramble via cubing.js; falls back to a labeled practice scramble. */
export async function generateScramble(event: string): Promise<Scramble> {
  try {
    lib ??= import("cubing/scramble");
    const { randomScrambleForEvent } = await lib;
    const alg = await Promise.race([
      randomScrambleForEvent(event),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), 15000)),
    ]);
    let text = alg.toString();
    if (event === "minx") text = text.replace(/ (U'?)( |$)/g, " $1\n").trim();
    return { text, source: "official" };
  } catch {
    return { text: practiceScramble(event), source: "practice" };
  }
}
