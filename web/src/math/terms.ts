import { linearOf } from "./evaluate";
import { toLatex } from "./latex";
import { type Node, parseMathStrict } from "./parse";

// The terms on each side of a linear equation, and how one line turns into the next. This is
// display only: it drives the step solver's motion (R-48), never its grading, which is the
// server's (mock/steps.ts stands in for it).

export interface Term {
  sign: 1 | -1;
  /** LaTeX without the sign. */
  body: string;
  /** The signed term's value as a*x + b. NaN when it isn't linear in x. */
  a: number;
  b: number;
}

export type Side = "left" | "right";

export interface Equation {
  left: Term[];
  right: Term[];
}

export function equationTerms(text: string): Equation | null {
  const node = parseMathStrict(text);
  if (node?.kind !== "rel" || node.ops.length !== 1 || node.ops[0] !== "=") return null;
  const [l, r] = node.parts as [Node, Node];
  return { left: flatten(l, 1), right: flatten(r, 1) };
}

function flatten(node: Node, sign: 1 | -1): Term[] {
  if (node.kind === "bin" && (node.op === "+" || node.op === "-")) {
    return [...flatten(node.left, sign), ...flatten(node.right, node.op === "-" ? flip(sign) : sign)];
  }
  if (node.kind === "neg" && node.sign === "-") return flatten(node.arg, flip(sign));
  const v = linearOf(node);
  return [{ sign, body: toLatex(node), a: v ? sign * v.slope : NaN, b: v ? sign * v.constant : NaN }];
}

const flip = (s: 1 | -1): 1 | -1 => (s === 1 ? -1 : 1);

/** One term as written in place: the first term of a side shows only a minus sign. */
export function termLatex(t: Term, first: boolean): string {
  if (first) return t.sign < 0 ? `-${t.body}` : t.body;
  return `${t.sign < 0 ? "-" : "+"} ${t.body}`;
}

const EPS = 1e-9;
const near = (p: number, q: number) => Math.abs(p - q) < EPS;
const sum = (ts: Term[]) => ts.reduce((s, t) => ({ a: s.a + t.a, b: s.b + t.b }), { a: 0, b: 0 });
const same = (p: { a: number; b: number }, q: { a: number; b: number }) => near(p.a, q.a) && near(p.b, q.b);
const isZero = (p: { a: number; b: number }) => near(p.a, 0) && near(p.b, 0);

/** Pairs each term of `to` with an equal term of `from`, at most once each. */
function match(from: Term[], to: Term[]): { pairs: [number, number][]; unmatchedFrom: number[]; unmatchedTo: number[] } {
  const used = new Set<number>();
  const pairs: [number, number][] = [];
  const unmatchedTo: number[] = [];
  to.forEach((t, j) => {
    const i = from.findIndex((f, k) => !used.has(k) && same(f, t));
    if (i < 0) {
      unmatchedTo.push(j);
    } else {
      used.add(i);
      pairs.push([i, j]);
    }
  });
  return { pairs, unmatchedFrom: from.map((_, i) => i).filter((i) => !used.has(i)), unmatchedTo };
}

export interface TermRef {
  side: Side;
  index: number;
}

export type Motion =
  /** A term crossed the equals sign: it flies from `source` to the far side, flipping as it goes. */
  | { kind: "move"; source: TermRef; to: Side; before: string; after: string }
  /** Both sides divided (or multiplied) by the same number: the factor crosses over. */
  | { kind: "scale"; source: TermRef; to: Side; before: string; after: string }
  /** The move written out on both sides: these new terms drop in. */
  | { kind: "write"; added: TermRef[] }
  /** Sums worked out: these terms of the line above fade together. */
  | { kind: "combine"; gone: TermRef[] }
  | { kind: "none" };

export interface StepPlan {
  motion: Motion;
  /** Terms of the new line that were already in the line above, and where they were. */
  kept: { from: TermRef; to: TermRef }[];
}

const SIDES: Side[] = ["left", "right"];
const other = (s: Side): Side => (s === "left" ? "right" : "left");

export function planStep(prev: Equation, next: Equation): StepPlan {
  const kept = keptTerms(prev, next);
  return { motion: motionOf(prev, next), kept };
}

function keptTerms(prev: Equation, next: Equation): StepPlan["kept"] {
  // Sides swapped ("12 = 2x") keep their terms too, so match each new side against whichever
  // old side shares more of them.
  const out: StepPlan["kept"] = [];
  const straight = match(prev.left, next.left).pairs.length + match(prev.right, next.right).pairs.length;
  const swapped = match(prev.right, next.left).pairs.length + match(prev.left, next.right).pairs.length;
  const fromOf = (s: Side): Side => (swapped > straight ? other(s) : s);
  for (const s of SIDES) {
    for (const [i, j] of match(prev[fromOf(s)], next[s]).pairs) {
      out.push({ from: { side: fromOf(s), index: i }, to: { side: s, index: j } });
    }
  }
  return out;
}

function motionOf(prev: Equation, next: Equation): Motion {
  const pL = sum(prev.left);
  const pR = sum(prev.right);
  const nL = sum(next.left);
  const nR = sum(next.right);
  if ([pL, pR, nL, nR].some((v) => Number.isNaN(v.a) || Number.isNaN(v.b))) return { kind: "none" };

  // Simplifying only: each side keeps its value. Whatever changed was worked out.
  if (same(pL, nL) && same(pR, nR)) {
    const gone = SIDES.flatMap((s) => match(prev[s], next[s]).unmatchedFrom.map((index) => ({ side: s, index })));
    return gone.length > 0 ? { kind: "combine", gone } : { kind: "none" };
  }

  // The same amount taken from both sides.
  const t = { a: pL.a - nL.a, b: pL.b - nL.b };
  if (!isZero(t) && same(t, { a: pR.a - nR.a, b: pR.b - nR.b })) {
    for (const s of SIDES) {
      const m = match(prev[s], next[s]);
      const only = m.unmatchedFrom.length === 1 ? m.unmatchedFrom[0]! : -1;
      if (only >= 0 && same(prev[s][only]!, t)) {
        const term = prev[s][only]!;
        return {
          kind: "move",
          source: { side: s, index: only },
          to: other(s),
          before: termLatex(term, false),
          after: termLatex({ ...term, sign: flip(term.sign) }, false),
        };
      }
    }
    const added = SIDES.flatMap((s) => match(prev[s], next[s]).unmatchedTo.map((index) => ({ side: s, index })));
    // Written out: the old terms are all still there, and the move shows on both sides.
    const wroteOut = SIDES.every((s) => match(prev[s], next[s]).unmatchedFrom.length === 0);
    return wroteOut && added.length > 0 ? { kind: "write", added } : { kind: "none" };
  }

  // Both sides divided by the same number k.
  const k = ratio(pL, nL) ?? ratio(pR, nR);
  if (k !== null && !near(k, 1) && same(pL, scaled(nL, k)) && same(pR, scaled(nR, k))) {
    const s = SIDES.find((side) => prev[side].filter((t) => !near(t.a, 0)).length === 1);
    const factor = factorLatex(k);
    if (s && factor) {
      const index = prev[s].findIndex((t) => !near(t.a, 0));
      return { kind: "scale", source: { side: s, index }, to: other(s), ...factor };
    }
  }
  return { kind: "none" };
}

function ratio(p: { a: number; b: number }, n: { a: number; b: number }): number | null {
  if (!near(n.a, 0)) return p.a / n.a;
  if (!near(n.b, 0)) return p.b / n.b;
  return null;
}

const scaled = (v: { a: number; b: number }, k: number) => ({ a: v.a * k, b: v.b * k });

// 2x = 12 to x = 6: "2" leaves the x and arrives as "÷ 2". x/3 = 4 to x = 12: "÷ 3" arrives as "× 3".
function factorLatex(k: number): { before: string; after: string } | null {
  const show = (n: number) => (n < 0 ? `(${n})` : `${n}`);
  if (Number.isInteger(k)) return { before: show(k), after: `\\div ${show(k)}` };
  const inv = 1 / k;
  if (near(inv, Math.round(inv))) {
    const m = Math.round(inv);
    return { before: `\\div ${show(m)}`, after: `\\times ${show(m)}` };
  }
  return null;
}
