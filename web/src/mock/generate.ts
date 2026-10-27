import type { Pans } from "../content/types";
import { evaluate } from "../math/evaluate";
import { childMathToLatex } from "../math/latex";
import { parseMathStrict } from "../math/parse";
import { readAnswer } from "./answers";
import { bareNumber, hasSolution, linearForm, near, sides } from "./grade";
import { slipValues } from "./slips";
import { firstWrong, numeralsIn, type Reduction, sameExpression, unbracketed, workOut } from "./working";

// Mock-only problem generators for the puzzle templates. They follow each item's
// generator rules (content/prompts/puzzle-v1.md), so every instance has whole-number answers
// and no answer that a guess at a number already on screen could hit. The real server would
// generate these and check them with platy.mathcheck before sending them.

export type Rng = () => number;

/** A small seeded generator (mulberry32), so tests and demos are repeatable. */
export function seeded(seed: number): Rng {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

const int = (rng: Rng, lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1));
export const gcd = (m: number, n: number): number => (n === 0 ? m : gcd(n, m % n));

function draw<T>(rng: Rng, make: (rng: Rng) => T | null): T {
  for (let i = 0; i < 10_000; i++) {
    const found = make(rng);
    if (found) return found;
  }
  throw new Error("no instance satisfies the generator rules");
}

export interface Numbers {
  a: number;
  b: number;
  c: number;
  answer: number;
}

export interface SpotInstance extends Numbers {
  /** An equation solved in lines; "working" is an expression worked out (the integer and order repairs). */
  kind: "equation";
  /** a*x - b = c, in checker syntax and as LaTeX. */
  equation: string;
  latex: string;
  /** The flawed solution: b is subtracted instead of added at line 0, then divided correctly. */
  lines: string[];
  linesLatex: string[];
  /** What line 0 should say. */
  fix: string;
  /** The line the slip produces, for spotting it when a child repeats it. */
  slip: string;
}

export function spotTheError(rng: Rng): SpotInstance {
  return draw(rng, (r) => {
    const a = int(r, 2, 6);
    const answer = int(r, 2, 12);
    const b = int(r, 2, 15);
    const c = a * answer - b;
    // The wrong path must also land on a whole number, so a fraction doesn't give it away.
    // No number on screen may be the answer, including the flawed line's right side.
    if (c <= 0 || c - b <= 0 || (2 * b) % a !== 0 || [a, b, c, c - b].includes(answer)) return null;
    const wrong = (c - b) / a;
    return {
      kind: "equation",
      a, b, c, answer,
      equation: `${a}*x - ${b} = ${c}`,
      latex: `${a}x - ${b} = ${c}`,
      lines: [`${a}*x = ${c - b}`, `x = ${wrong}`],
      linesLatex: [`${a}x = ${c - b}`, `x = ${wrong}`],
      fix: `${a}*x = ${c + b}`,
      slip: `${a}*x = ${c - b}`,
    };
  });
}

export interface MissingInstance extends Numbers {
  /** a*x + b = c. */
  equation: string;
  latex: string;
  /** The solution with the middle line blanked out. */
  linesLatex: (string | null)[];
  /** The blanked line, and the line the slip of adding b would give. */
  expected: string;
  slip: string;
  /**
   * "last": the first step is shown and the last line is blank; "working": an expression's middle
   * line, the first two numbers worked out (repair items' variants).
   */
  blank?: "last" | "working";
  /** A "last" or "working" blank's known wrong lines (R-40): the value each slip gives and the ask to use. */
  slips?: { value: number; key: string }[];
  /** Words for the item's text slots that depend on the instance, like which way to undo. */
  vars?: Record<string, string | number>;
}

export function missingStep(rng: Rng): MissingInstance {
  return draw(rng, (r) => {
    const a = int(r, 2, 9);
    const answer = int(r, 1, 12);
    const b = int(r, 1, 20);
    const c = a * answer + b;
    // a and b share no factor, so no divide works before the b comes off and the blanked line
    // is the only next step.
    if (gcd(a, b) !== 1 || answer === a || answer === b || c > 120) return null;
    return {
      a, b, c, answer,
      equation: `${a}*x + ${b} = ${c}`,
      latex: `${a}x + ${b} = ${c}`,
      linesLatex: [null, `x = ${answer}`],
      expected: `${a}*x = ${c - b}`,
      slip: `${a}*x = ${c + b}`,
    };
  });
}

export interface BalanceInstance extends Numbers {
  latex: string;
  start: Pans;
}

export function balance(rng: Rng): BalanceInstance {
  return draw(rng, (r) => {
    const a = int(r, 2, 4);
    const answer = int(r, 1, 6);
    const b = int(r, 1, 8);
    const c = a * answer + b;
    // a and b share no factor, so no split works before the units come off and the order of
    // moves matters. c stays small enough to draw every unit.
    if (gcd(a, b) !== 1 || c > 30 || answer === a || answer === b) return null;
    return {
      a, b, c, answer,
      latex: `${a}x + ${b} = ${c}`,
      start: { left: { x: a, units: b }, right: { x: 0, units: c } },
    };
  });
}

export interface WorkedInstance extends Numbers {
  /** a*x + b = c. */
  equation: string;
  latex: string;
  /** The two lines of the solution: take b off, then divide by a. */
  linesLatex: [string, string];
  /** The first step; the slip of adding b; and dividing first, a fine path, just a harder one. */
  expected: string;
  slip: string;
  divideFirst: string;
  /** The order the "why" choices are shown in, so the right one isn't always first. */
  order: number[];
}

// The same numbers as a missing-step problem: a and b share no factor, so taking b off first
// is the clean path and dividing first gives fractions.
export function workedExample(rng: Rng): WorkedInstance {
  const { a, b, c, answer, equation, latex, expected, slip } = missingStep(rng);
  const order = [0, 1, 2];
  for (let i = order.length - 1; i > 0; i--) {
    const j = int(rng, 0, i);
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  return {
    a, b, c, answer, equation, latex, expected, slip, order,
    linesLatex: [`${a}x = ${c - b}`, `x = ${answer}`],
    divideFirst: `x + ${b}/${a} = ${c}/${a}`,
  };
}

// Problem generators for the demo skills (R-41). Three levels each: 1 small positive whole
// numbers, 2 negatives or bigger numbers, 3 a fraction or decimal in the answer or an extra
// step. Every problem is checked before it's returned, and a session never repeats one. The
// real generators live on the server behind platy.mathcheck (docs/proposals/generators-python.md).

export const DEMO_NODES = [
  "integer_arithmetic",
  "inverse_operations",
  "one_step_equations",
  "two_step_equations",
  "order_of_operations",
] as const;
export type DemoNode = (typeof DEMO_NODES)[number];
export type Level = 1 | 2 | 3;
export const LEVELS: readonly Level[] = [1, 2, 3];

export interface GeneratedProblem {
  node: DemoNode;
  level: Level;
  /** Checker syntax ("2x + 5 = 17", "(-6)*(-4)", "x - 4 + b = x"); also what keeps a session from repeating. */
  prompt: string;
  answer: number;
  /** The answer as a student would type it: "7", "-3", "5/2", "-3.5". */
  answerText: string;
  /** The wrong answers known slips lead to (R-40), so a wrong answer can be matched to one. */
  slips: { slip: string; value: number }[];
}

type Draft = Pick<GeneratedProblem, "prompt" | "answer" | "answerText">;
type Maker = (rng: Rng) => Draft | null;

/** A whole number from lo to hi, either sign. */
const signed = (rng: Rng, lo: number, hi: number) => int(rng, lo, hi) * (rng() < 0.5 ? -1 : 1);
/** "+ 5" or "- 5", for the term after x. */
const plus = (n: number) => (n < 0 ? `- ${-n}` : `+ ${n}`);
/**
 * Level 2 keeps only problems with a negative number in them (a minus that starts a number,
 * not one that subtracts), a negative answer, or a number past 12.
 */
function level2(make: Maker): Maker {
  return (rng) => {
    const d = make(rng);
    if (!d) return null;
    const negative = /(^|[(+\-*/=]\s*)-\s*\d/.test(d.prompt) || d.answer < 0;
    return negative || (d.prompt.match(/\d+/g) ?? []).some((n) => Number(n) > 12) ? d : null;
  };
}

function whole(prompt: string, answer: number): Draft {
  return { prompt, answer, answerText: String(answer) };
}

/** n/d in lowest terms, the sign on top. */
function ratio(n: number, d: number): Pick<Draft, "answer" | "answerText"> {
  const g = gcd(Math.abs(n), Math.abs(d));
  const [p, q] = d < 0 ? [-n / g, -d / g] : [n / g, d / g];
  return { answer: p / q, answerText: q === 1 ? `${p}` : `${p}/${q}` };
}

/** a*x + b = c, written the way the step solver shows it. */
function linear(a: number, b: number, c: number, answer: Pick<Draft, "answer" | "answerText">): Draft {
  return { prompt: `${a}x ${plus(b)} = ${c}`, ...answer };
}

const MAKERS: Record<DemoNode, Record<Level, Maker>> = {
  integer_arithmetic: {
    1: (r) => {
      const [a, b, c] = [int(r, 1, 12), int(r, 1, 12), int(r, 1, 12)];
      const form = int(r, 0, 2);
      if (form === 2) return whole(`${a}*${b}`, a * b);
      const answer = form === 0 ? a + b - c : a - b + c;
      return answer < 0 ? null : whole(form === 0 ? `${a} + ${b} - ${c}` : `${a} - ${b} + ${c}`, answer);
    },
    2: level2((r) => {
      const [a, b, c] = [int(r, 2, 20), int(r, 2, 12), int(r, 1, 20)];
      switch (int(r, 0, 4)) {
        case 0:
          return whole(`-${a} + ${b} - ${c}`, -a + b - c);
        case 1:
          return whole(`(-${a})*(-${b})`, a * b);
        case 2:
          return whole(`(-${a * b})/(-${b})`, a);
        case 3:
          return whole(`${a}*(-${b})`, -a * b);
        default:
          return a - b - c < 0 ? whole(`${a} - ${b} - ${c}`, a - b - c) : null;
      }
    }),
    3: (r) => {
      const [a, b, c, d] = [int(r, 2, 12), int(r, 2, 9), int(r, 2, 20), int(r, 2, 9)];
      switch (int(r, 0, 2)) {
        case 0:
          return whole(`(-${a})*(-${b}) - ${c} + ${d}`, a * b - c + d);
        case 1:
          return whole(`${a}*(-${b}) - ${c}*${d}`, -a * b - c * d);
        default:
          return whole(`(-${a * b})/(-${b}) + ${c}*(-${d})`, a - c * d);
      }
    },
  },
  order_of_operations: {
    1: (r) => {
      const [a, b, c] = [int(r, 1, 12), int(r, 2, 6), int(r, 2, 6)];
      switch (int(r, 0, 3)) {
        case 0:
          return whole(`${a} + ${b}*${c}`, a + b * c);
        case 1:
          return whole(`${b}*${c} + ${a}`, b * c + a);
        case 2:
          return a - b * c >= 0 ? whole(`${a} - ${b}*${c}`, a - b * c) : null;
        default:
          return b * c <= 12 ? whole(`${b * c}/${b} + ${a}`, c + a) : null;
      }
    },
    2: level2((r) => {
      const [a, b, c, d] = [int(r, 2, 20), int(r, 2, 9), int(r, 1, 12), int(r, 1, 12)];
      switch (int(r, 0, 2)) {
        case 0:
          return whole(`${b}*(${c} - ${a})`, b * (c - a));
        case 1:
          return whole(`${a} - ${b}*(${c} + ${d})`, a - b * (c + d));
        default:
          return whole(`(${c} + ${d})*${b} - ${a}`, (c + d) * b - a);
      }
    }),
    3: (r) => {
      const [a, b, c, d, e, f] = [int(r, 1, 20), int(r, 1, 20), int(r, 2, 6), int(r, 2, 6), int(r, 2, 12), int(r, 1, 12)];
      if (e === f) return null;
      if (int(r, 0, 1) === 0) {
        return (a + b) % c === 0 ? whole(`(${a} + ${b})/${c} - ${d}*(${e} - ${f})`, (a + b) / c - d * (e - f)) : null;
      }
      return (a * c) % (e + f) === 0 ? whole(`${d}*(${e} - ${f}) + ${a * c}/(${e} + ${f})`, d * (e - f) + (a * c) / (e + f)) : null;
    },
  },
  inverse_operations: {
    // "x - 4 + b = x": what b brings x back.
    // Level 1 keeps answers positive: taking a number away, or dividing.
    1: (r) => {
      const n = int(r, 1, 12);
      if (rng01(r)) return undo(`x - ${n} + b = x`);
      return n < 2 ? null : undo(`(x/${n})*b = x`, ratio(n, 1));
    },
    2: level2((r) => {
      switch (int(r, 0, 2)) {
        case 0:
          return undo(rng01(r) ? `x + ${int(r, 1, 12)} + b = x` : `x ${plus(signed(r, 13, 40))} + b = x`);
        case 1: {
          const n = int(r, 13, 30);
          return undo(`(x/${n})*b = x`, ratio(n, 1));
        }
        default: {
          const n = int(r, 2, 12);
          return undo(`(x/(-${n}))*b = x`, ratio(-n, 1));
        }
      }
    }),
    3: (r) => {
      if (rng01(r)) {
        const [p, q] = [int(r, 1, 9), int(r, 2, 9)];
        if (p === q || gcd(p, q) !== 1) return null;
        return p === 1 ? undo(`${q}x*b = x`, ratio(1, q)) : undo(`(${p}/${q})x*b = x`, ratio(q, p));
      }
      const k = int(r, 0, 9) + 0.5;
      return undo(`x ${plus(rng01(r) ? k : -k)} + b = x`);
    },
  },
  one_step_equations: {
    1: (r) => {
      const [a, n] = [int(r, 2, 9), int(r, 1, 12)];
      switch (int(r, 0, 3)) {
        case 0:
          return whole(`x + ${a} = ${n + a}`, n);
        case 1:
          return n - a > 0 ? whole(`x - ${a} = ${n - a}`, n) : null;
        case 2:
          return whole(`${a}x = ${a * n}`, n);
        default:
          return whole(`x/${a} = ${n}`, a * n);
      }
    },
    2: level2((r) => {
      const [a, b, n] = [signed(r, 2, 12), signed(r, 1, 30), signed(r, 1, 15)];
      switch (int(r, 0, 2)) {
        case 0:
          return whole(`x ${plus(b)} = ${n + b}`, n);
        case 1:
          return whole(`${a}x = ${a * n}`, n);
        default: {
          const d = Math.abs(a);
          return whole(`x/${d} = ${n}`, d * n);
        }
      }
    }),
    3: (r) => {
      const [a, c] = [int(r, 2, 9), signed(r, 1, 40)];
      return c % a === 0 ? null : { prompt: `${a}x = ${c}`, ...ratio(c, a) };
    },
  },
  two_step_equations: {
    1: (r) => {
      const [a, b, n] = [int(r, 2, 9), int(r, 1, 12), int(r, 1, 12)];
      const minus = rng01(r);
      const c = minus ? a * n - b : a * n + b;
      return c > 0 ? linear(a, minus ? -b : b, c, ratio(n, 1)) : null;
    },
    2: level2((r) => {
      const [a, b, n] = [signed(r, 2, 9), signed(r, 1, 30), signed(r, 1, 12)];
      return linear(a, b, a * n + b, ratio(n, 1));
    }),
    3: (r) => {
      const [a, b, c] = [int(r, 2, 6), signed(r, 1, 20), int(r, -30, 40)];
      return (c - b) % a === 0 ? null : linear(a, b, c, ratio(c - b, a));
    },
  },
};

const rng01 = (rng: Rng) => rng() < 0.5;


/** An undo question. A shift's answer is the number with its sign flipped. */
function undo(prompt: string, answer?: Pick<Draft, "answer" | "answerText">): Draft {
  if (answer) return { prompt, ...answer };
  const n = Number(/x ([+-]) ([\d.]+)/.exec(prompt)!.slice(1).join(""));
  return { prompt, answer: -n, answerText: String(-n) };
}

export const CHECKED_AS: Record<DemoNode, "value" | "undo" | "equation"> = {
  integer_arithmetic: "value",
  order_of_operations: "value",
  inverse_operations: "undo",
  one_step_equations: "equation",
  two_step_equations: "equation",
};

/** The checker's verdict on a problem and its answer (platy.mathcheck on the server). */
export function verifyProblem(p: Pick<GeneratedProblem, "node" | "prompt" | "answer" | "answerText">): boolean {
  // The text the student would type must say exactly the answer, not a rounding of it.
  const typed = readAnswer(p.answerText);
  if (typed?.length !== 1 || !near(typed[0]!, p.answer)) return false;
  switch (CHECKED_AS[p.node]) {
    case "value": {
      const node = parseMathStrict(p.prompt);
      const v = node && node.kind !== "rel" ? evaluate(node) : null;
      return v?.length === 1 && near(v[0]!, p.answer);
    }
    case "undo": {
      // Put the answer in for b: the two sides must then be the same for every x.
      const f = linearForm(p.prompt.replace(/\bb\b/, `(${p.answerText})`));
      return f !== null && near(f.a, 0) && near(f.b, 0);
    }
    case "equation":
      return hasSolution(p.prompt, p.answer);
  }
}

function finish(node: DemoNode, level: Level, d: Draft): GeneratedProblem {
  const p = { node, level, ...d, slips: slipValues(node, { prev: d.prompt, answer: d.answerText }) };
  // Never show a problem the checker hasn't passed (R-41).
  if (!verifyProblem(p)) throw new Error(`generated problem failed the check: ${node} L${level}`);
  return p;
}

/** One problem for a skill at a level. Seeded, so the same rng gives the same problem. */
export function makeProblem(node: DemoNode, level: Level, rng: Rng): GeneratedProblem {
  return finish(node, level, draw(rng, MAKERS[node][level]));
}

/** A session's problems: seeded, and never the same problem twice. */
export function problemSession(seed: number): { next: (node: DemoNode, level: Level) => GeneratedProblem } {
  const rng = seeded(seed);
  const seen = new Set<string>();
  return {
    next(node, level) {
      const d = draw(rng, (r) => {
        const found = MAKERS[node][level](r);
        return found && !seen.has(found.prompt) ? found : null;
      });
      seen.add(d.prompt);
      return finish(node, level, d);
    },
  };
}

// Repair puzzles (R-37) take their numbers from the generators above, at the student's level,
// and never use a problem in the student's lesson (`avoid`), so they can't give its answer.

/** a, b and c of a linear equation "ax + b = c", or null for anything else. */
function equationOf(text: string): Omit<Numbers, "answer"> | null {
  const s = sides(text);
  return s && near(s[1].slope, 0) ? { a: s[0].slope, b: s[0].constant, c: s[1].constant } : null;
}

/** True when `text` is the same equation as one of `others`, however each is written. */
export function isOneOf(text: string, others: readonly string[]): boolean {
  const e = equationOf(text);
  return (
    e !== null &&
    others.some((o) => {
      const f = equationOf(o);
      return f !== null && near(f.a, e.a) && near(f.b, e.b) && near(f.c, e.c);
    })
  );
}

/** a, b and c of a generated "ax + b = c", "x + b = c" or "ax = c". */
function numbersOf(p: GeneratedProblem): Numbers {
  const [l, r] = sides(p.prompt)!;
  return { a: l.slope, b: l.constant, c: r.constant, answer: p.answer };
}

/** A two-step problem with its first step shown and the last line left for the student. */
export function lastStep(rng: Rng, level: Level, avoid: readonly string[] = []): MissingInstance {
  // Level 3's fraction answers are for solving, not for this one move, so it caps at 2.
  const at: Level = level === 3 ? 2 : level;
  return draw(rng, (r) => {
    const p = makeProblem("two_step_equations", at, r);
    const { a, b, c, answer } = numbersOf(p);
    // No number on screen is the answer (b shows without its sign), and the slip lands elsewhere.
    if (isOneOf(p.prompt, avoid) || [a, Math.abs(b), c, c - b, c - b - a].includes(answer)) return null;
    return {
      a, b, c, answer,
      equation: p.prompt,
      latex: p.prompt,
      linesLatex: [`${a}x = ${c - b}`, null],
      expected: `x = ${answer}`,
      slip: `x = ${c - b - a}`,
      blank: "last",
    };
  });
}

export type OneStepKind = "multiply" | "sign" | "direction";

const isWhole = (v: number) => near(v, Math.round(v));

/**
 * A one-step equation with its one line left for the student (a repair item's variant):
 * "x/k = c" (multiply both sides by k), "-ax = c" (divide, and keep the sign) or "x + b = c"
 * (undo the adding or the taking away). Numbers come from the one-step generator at the
 * student's level, capped at 2 because level 3 is about fraction answers, not this one move;
 * the sign variant needs level 2, where the number in front of x can be negative.
 */
export function oneStepLine(rng: Rng, kind: OneStepKind, level: Level, avoid: readonly string[] = []): MissingInstance {
  const at: Level = kind === "sign" || level === 3 ? 2 : level;
  return draw(rng, (r): MissingInstance | null => {
    const p = makeProblem("one_step_equations", at, r);
    if (isOneOf(p.prompt, avoid)) return null;
    const { a, b, c, answer } = numbersOf(p);
    const linesLatex: (string | null)[] = [null];
    const base = { a, b, c, answer, equation: p.prompt, latex: p.prompt, linesLatex, expected: `x = ${answer}`, blank: "last" as const };
    switch (kind) {
      case "multiply": {
        // x/k = c: the slope a is 1/k. No number on screen is the answer.
        const k = Math.round(1 / a);
        if (!near(b, 0) || a <= 0 || a >= 1 || !near(a * k, 1) || [k, c, -c].includes(answer)) return null;
        return { ...base, slip: `x = ${c / k}`, slips: [{ value: c / k, key: "divided_again" }], vars: { k } };
      }
      case "sign":
        if (!near(b, 0) || a >= 0 || !isWhole(a) || [a, -a, c, -c].includes(answer)) return null;
        return { ...base, slip: `x = ${-answer}`, slips: [{ value: -answer, key: "sign_dropped" }] };
      case "direction": {
        if (!near(a, 1) || near(b, 0) || [Math.abs(b), c, -c].includes(answer)) return null;
        const added = b > 0;
        const n = Math.abs(b);
        return {
          ...base,
          slip: `x = ${c + b}`,
          slips: [{ value: c + b, key: "same_op" }],
          vars: {
            b_abs: n,
            done: added ? "added to x" : "taken away from x",
            done_noun: added ? "adding" : "taking away",
            undo_move: added ? `Take $${n}$ away from` : `Add $${n}$ to`,
          },
        };
      }
    }
  });
}

/**
 * True when `prompt` is one of `avoid` (the lesson's problems and lines the student has written)
 * however it's written, or an expression with the same working or the same value as one, which
 * would give it away (R-02).
 */
export function clashes(prompt: string, avoid: readonly string[]): boolean {
  if (isOneOf(prompt, avoid)) return true;
  const value = bareNumber(prompt);
  if (value === null) return false;
  return avoid.some((o) => {
    const w = bareNumber(o);
    return (w !== null && near(w, value)) || sameExpression(prompt, o);
  });
}

/**
 * Spot-the-error on an expression (the integer and order-of-operations repairs): {player}'s
 * working, one operation per line, with one line wrong and the lines after it following from it.
 */
export interface WorkingSpotInstance {
  kind: "working";
  /** The expression in checker syntax, and as LaTeX for the player. */
  expression: string;
  latex: string;
  lines: string[];
  linesLatex: string[];
  /** Which line is wrong, found by working the lines out, never by where the slip was planted. */
  wrong: number;
  /** One right next line from the line above the wrong one. */
  fix: string;
  answer: number;
  /** Final answers to ask about (R-40): what the flawed lines came to, and the answer without its sign. */
  slips: { value: number; key: string }[];
  /** Fixes to ask about: the same slip again. */
  fixSlips: { value: number; key: string }[];
  vars: Record<string, string | number>;
}

/** True when a number written anywhere in `texts` is the answer, sign aside (R-02). */
function showsAnswer(texts: readonly string[], answer: number): boolean {
  return texts.some((t) => numeralsIn(t).some((v) => near(v, Math.abs(answer))));
}

/** A spot-the-error instance from flawed working, or null when the working doesn't make one. */
function workingSpot(expression: string, answer: number, flawed: string[], fixKey: string, avoid: readonly string[]): WorkingSpotInstance | null {
  const wrong = firstWrong(expression, flawed);
  // The slip has to change something, and leave a line to finish from (never the last line).
  if (wrong < 0 || wrong === flawed.length - 1 || clashes(expression, avoid) || showsAnswer([expression, ...flawed], answer)) return null;
  const fix = workOut(wrong === 0 ? expression : flawed[wrong - 1]!, "usual")?.lines[0];
  const old = bareNumber(flawed[flawed.length - 1]!);
  const wrongValue = bareNumber(flawed[wrong]!);
  if (fix === undefined || old === null || wrongValue === null) return null;
  const slips = [{ value: old, key: "old_answer" }];
  if (answer !== 0 && !near(-answer, old)) slips.push({ value: -answer, key: "sign_lost" });
  return {
    kind: "working",
    expression,
    latex: childMathToLatex(expression),
    lines: flawed,
    linesLatex: flawed.map(childMathToLatex),
    wrong,
    fix,
    answer,
    slips,
    fixSlips: [{ value: wrongValue, key: fixKey }],
    vars: {},
  };
}

/**
 * Integer signs (R-37): a level 3 integer problem, products of signed numbers with more to do
 * after them, worked out with one product's or quotient's sign wrong. Only that level has a line
 * to finish from after the slip, so every level gets its numbers.
 */
export function signChain(rng: Rng, avoid: readonly string[] = []): WorkingSpotInstance {
  const signed = (r: Reduction) => (r.op === "*" || r.op === "/") && (r.left < 0 || r.right < 0);
  return draw(rng, (r) => {
    const p = makeProblem("integer_arithmetic", 3, r);
    const right = workOut(p.prompt, "usual");
    const spots = right?.reductions.filter(signed).length ?? 0;
    if (spots === 0) return null;
    // The slip lands on one of the signed products or quotients: that result gets the wrong sign.
    let k = int(r, 0, spots - 1);
    const flawed = workOut(p.prompt, "usual", (red) => (signed(red) && k-- === 0 ? -red.value : null));
    return flawed && workingSpot(p.prompt, p.answer, flawed.lines, "sign", avoid);
  });
}

export type OrderSlip = "precedence" | "brackets";

/**
 * Order of operations (R-37): a problem at the student's level worked out the slipped way, left
 * to right (brackets still first) or with the brackets skipped. Level 1 has no brackets, so the
 * brackets item starts at 2.
 */
export function orderChain(rng: Rng, kind: OrderSlip, level: Level, avoid: readonly string[] = []): WorkingSpotInstance {
  const at: Level = kind === "brackets" && level === 1 ? 2 : level;
  return draw(rng, (r) => {
    const p = makeProblem("order_of_operations", at, r);
    const flawed = kind === "precedence" ? workOut(p.prompt, "left_to_right") : workOut(unbracketed(p.prompt), "usual");
    return flawed && workingSpot(p.prompt, p.answer, flawed.lines, kind === "precedence" ? "left_first" : "bracket", avoid);
  });
}

/**
 * Integer subtraction (R-37): "n1 ± n2 - n3" from the integer generator at the student's level
 * (capped at 2, since level 3 is products), with the middle line left for the student: the first
 * two numbers worked out, the last one still taken away.
 */
export function sumLine(rng: Rng, level: Level, avoid: readonly string[] = []): MissingInstance {
  const at: Level = level === 3 ? 2 : level;
  return draw(rng, (r) => {
    const p = makeProblem("integer_arithmetic", at, r);
    const m = /^(-?\d+) ([+-]) (\d+) - (\d+)$/.exec(p.prompt);
    if (!m || clashes(p.prompt, avoid)) return null;
    const [n1, n2, n3] = [Number(m[1]), Number(m[3]), Number(m[4])];
    const minusFirst = m[2] === "-";
    const mid = minusFirst ? n1 - n2 : n1 + n2;
    const { answer } = p;
    // No number on screen is the answer, and the middle value isn't 0 or the answer either.
    if (mid === 0 || [n1, n2, n3, mid].some((v) => Math.abs(v) === Math.abs(answer))) return null;
    // The last minus read as a plus, or, with two minuses, the first one.
    const slips = [{ value: mid + n3, key: "plus_for_minus" }];
    if (minusFirst) slips.push({ value: n1 + n2 - n3, key: "first_plus" }, { value: n1 + n2 + n3, key: "first_plus" });
    return {
      a: n1, b: n2, c: n3, answer,
      equation: p.prompt,
      latex: childMathToLatex(p.prompt),
      linesLatex: [null, childMathToLatex(String(answer))],
      expected: `${mid} - ${n3}`,
      slip: `${mid} + ${n3}`,
      blank: "working",
      slips: slips.filter((s) => !near(s.value, answer)),
      vars: { first: `${m[1]} ${m[2]} ${n2}`, mid, c_abs: n3 },
    };
  });
}

/**
 * A balance scale from a level 1 one-step problem: "x + b = c" (take the units off) or "ax = c"
 * (split). The scale draws every unit, so the numbers stay small and positive at any level.
 */
export function oneStepBalance(rng: Rng, kind: "shift" | "split", avoid: readonly string[] = []): BalanceInstance {
  return draw(rng, (r) => {
    const p = makeProblem("one_step_equations", 1, r);
    const { a, b, c, answer } = numbersOf(p);
    // As in balance(), the answer is never the number already on the scale's left.
    const fits =
      kind === "shift" ? near(a, 1) && b > 0 && answer !== b : Number.isInteger(a) && a > 1 && near(b, 0) && answer !== a;
    if (!fits || c > 30 || isOneOf(p.prompt, avoid)) return null;
    return { a, b, c, answer, latex: p.prompt, start: { left: { x: a, units: b }, right: { x: 0, units: c } } };
  });
}
