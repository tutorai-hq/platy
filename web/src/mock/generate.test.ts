import { describe, expect, it } from "vitest";
import { applyMove, isSolved, pansLatex } from "../content/balance";
import { matchesValue } from "./answers";
import {
  balance,
  DEMO_NODES,
  type DemoNode,
  gcd,
  type GeneratedProblem,
  LEVELS,
  makeProblem,
  missingStep,
  problemSession,
  seeded,
  spotTheError,
  verifyProblem,
  workedExample,
} from "./generate";
import { hasSolution, sameLine } from "./grade";
import { detectSlip, slipValues } from "./slips";

const SEEDS = Array.from({ length: 300 }, (_, i) => i + 1);

describe("spot the error generator", () => {
  it("makes problems whose only wrong line is the first, and whose fix is right", () => {
    for (const seed of SEEDS) {
      const p = spotTheError(seeded(seed));
      expect(hasSolution(p.equation, p.answer), p.equation).toBe(true);
      // Line 0 is the slip: it no longer has the problem's solution.
      expect(hasSolution(p.lines[0]!, p.answer)).toBe(false);
      // Line 1 follows correctly from line 0, so only line 0 is wrong.
      const wrong = Number(p.lines[1]!.split("=")[1]);
      expect(hasSolution(p.lines[0]!, wrong)).toBe(true);
      expect(Number.isInteger(wrong)).toBe(true);
      expect(hasSolution(p.fix, p.answer)).toBe(true);
      expect(sameLine(p.slip, p.lines[0]!)).toBe(true);
    }
  });

  it("never puts the answer on screen, in the problem or the flawed lines", () => {
    for (let seed = 1; seed <= 5000; seed++) {
      const p = spotTheError(seeded(seed));
      const shown = [p.equation, ...p.lines].join(" ").match(/\d+/g)!.map(Number);
      expect(shown, p.equation).not.toContain(p.answer);
      expect(p.c).toBeGreaterThan(0);
    }
  });
});

describe("missing step generator", () => {
  it("blanks the step between the problem and the answer", () => {
    for (const seed of SEEDS) {
      const p = missingStep(seeded(seed));
      expect(hasSolution(p.equation, p.answer)).toBe(true);
      expect(hasSolution(p.expected, p.answer)).toBe(true);
      expect(hasSolution(p.slip, p.answer)).toBe(false);
      expect(p.linesLatex).toEqual([null, `x = ${p.answer}`]);
      expect([p.a, p.b]).not.toContain(p.answer);
    }
  });

  it("never lets a divide come first, so the blanked step is the only next line", () => {
    for (let seed = 1; seed <= 2000; seed++) {
      const p = missingStep(seeded(seed));
      for (let d = 2; d <= p.a; d++) expect(p.a % d === 0 && p.b % d === 0, p.equation).toBe(false);
    }
  });
});

describe("balance generator", () => {
  it("makes scales solved by taking the units off, then splitting", () => {
    for (const seed of SEEDS) {
      const p = balance(seeded(seed));
      const one = applyMove(p.start, p.start, { op: "remove_units", n: p.b });
      if (!one.ok) throw new Error("removing the units was refused");
      const two = applyMove(one.pans, p.start, { op: "split", groups: p.a });
      if (!two.ok) throw new Error("splitting was refused");
      expect(isSolved(two.pans)).toBe(true);
      expect(pansLatex(two.pans)).toBe(`x = ${p.answer}`);
    }
  });

  it("makes splitting first impossible, so the order of moves matters", () => {
    for (const seed of SEEDS) {
      const p = balance(seeded(seed));
      for (let g = 2; g <= 9; g++) expect(applyMove(p.start, p.start, { op: "split", groups: g }).ok, p.latex).toBe(false);
      expect(p.c).toBeLessThanOrEqual(30);
      expect([p.a, p.b]).not.toContain(p.answer);
    }
  });

  it("repeats the same problem for the same seed", () => {
    expect(balance(seeded(7))).toEqual(balance(seeded(7)));
  });
});

describe("worked example generator", () => {
  it("makes two-step problems whose first step, either way round, leads to the answer", () => {
    for (const seed of SEEDS) {
      const p = workedExample(seeded(seed));
      expect(hasSolution(p.equation, p.answer), p.equation).toBe(true);
      expect(p.kind).toBe("equation");
      expect(hasSolution(p.lines[0], p.answer)).toBe(true);
      expect(p.lines[1]).toBe(`x = ${p.answer}`);
      for (const other of p.alsoFirst) expect(hasSolution(other, p.answer)).toBe(true);
      // Adding b again: simplified, and written out as "+ b + b" (a true line, but not the move).
      expect(p.firstSlips).toEqual([{ line: `${p.a}*x = ${p.c + p.b}`, key: "same_op" }, { line: `${p.a}*x + ${2 * p.b} = ${p.c + p.b}`, key: "same_op" }]);
      for (const slip of p.finalSlips) expect(slip.value).not.toBe(p.answer);
      expect(p.linesLatex).toEqual([`${p.a}x = ${p.c - p.b}`, `x = ${p.answer}`]);
      expect([...p.order].sort()).toEqual([0, 1, 2]);
    }
  });

  it("doesn't always put the right reason first", () => {
    const firsts = new Set(SEEDS.map((seed) => workedExample(seeded(seed)).order[0]));
    expect(firsts).toEqual(new Set([0, 1, 2]));
  });
});

// R-41: generated problems for the demo skills, three levels each, checked before they're shown.
describe("problem generators (R-41)", () => {
  const PER_LEVEL = Array.from({ length: 200 }, (_, i) => i + 1);
  const whole = (n: number) => Number.isInteger(n);
  // A minus that starts a number, not one that subtracts: "-9 + 4", "= -3", "(-6)".
  const negativeIn = (text: string) => /(^|[(+\-*/=]\s*)-\s*\d/.test(text);
  const numbers = (text: string) => (text.match(/\d+(\.\d+)?/g) ?? []).map(Number);
  const left = (p: GeneratedProblem) => p.prompt.split("=")[0]!;
  const ops = (text: string) => (text.match(/[*/+]/g)?.length ?? 0) + (text.match(/[\d)x]\s*-/g)?.length ?? 0);

  // Level 1: small positive whole numbers. Level 2: negatives or bigger numbers. Level 3: a
  // fraction or decimal in the answer, or an extra step.
  const LEVEL_1 = (p: GeneratedProblem) =>
    !negativeIn(p.prompt) && whole(p.answer) && p.answer >= 0 && numbers(left(p)).every((n) => n <= 12);
  const LEVEL_2 = (p: GeneratedProblem) =>
    whole(p.answer) && (negativeIn(p.prompt) || p.answer < 0 || numbers(p.prompt).some((n) => n > 12));
  const LEVEL_3: Record<DemoNode, (p: GeneratedProblem) => boolean> = {
    integer_arithmetic: (p) => whole(p.answer) && ops(p.prompt) >= 3 && /[*/]/.test(p.prompt),
    order_of_operations: (p) => whole(p.answer) && ops(p.prompt) >= 4 && p.prompt.includes("("),
    inverse_operations: (p) => !whole(p.answer),
    one_step_equations: (p) => !whole(p.answer),
    two_step_equations: (p) => !whole(p.answer),
  };
  const hasFeatures = (p: GeneratedProblem) => (p.level === 1 ? LEVEL_1(p) : p.level === 2 ? LEVEL_2(p) : LEVEL_3[p.node](p));

  // Clean: a whole number, a fraction in lowest terms with a small bottom, or a half.
  const clean = (text: string) => {
    const f = /^-?(\d+)\/(\d+)$/.exec(text);
    if (f) return gcd(Number(f[1]), Number(f[2])) === 1 && Number(f[2]) <= 12;
    return /^-?\d+(\.5)?$/.test(text);
  };

  it("makes 200 problems per skill and level that pass the checker, with the level's features and a clean answer", () => {
    for (const node of DEMO_NODES) {
      for (const level of LEVELS) {
        for (const seed of PER_LEVEL) {
          const p = makeProblem(node, level, seeded(seed));
          const where = `${node} L${level}: ${p.prompt} -> ${p.answerText}`;
          expect([p.node, p.level], where).toEqual([node, level]);
          expect(verifyProblem(p), where).toBe(true);
          expect(hasFeatures(p), where).toBe(true);
          expect(clean(p.answerText), where).toBe(true);
          expect(matchesValue(p.answerText, p.answer), where).toBe(true);
          // The checker isn't just saying yes: a wrong answer fails it, and so does a rounded one.
          expect(verifyProblem({ ...p, answer: p.answer + 1, answerText: String(p.answer + 1) }), where).toBe(false);
          const rounded = p.answer.toFixed(6);
          if (Number(rounded) !== p.answer) expect(verifyProblem({ ...p, answerText: rounded }), where).toBe(false);
        }
      }
    }
  });

  it("never repeats a problem within a session", () => {
    for (const node of DEMO_NODES) {
      for (const level of LEVELS) {
        const session = problemSession(1);
        const prompts = Array.from({ length: 20 }, () => session.next(node, level).prompt);
        expect(new Set(prompts).size, `${node} L${level}`).toBe(20);
      }
    }
    // A mixed session, the way a lesson moves between skills and levels.
    const session = problemSession(2);
    const mixed = Array.from({ length: 150 }, (_, i) => session.next(DEMO_NODES[i % 5]!, LEVELS[i % 3]!).prompt);
    expect(new Set(mixed).size).toBe(150);
  });

  it("says so when a session runs out of new problems, instead of repeating one", () => {
    const session = problemSession(3);
    const prompts: string[] = [];
    expect(() => {
      for (let i = 0; i < 200; i++) prompts.push(session.next("inverse_operations", 1).prompt);
    }).toThrow(/no instance satisfies/);
    expect(new Set(prompts).size).toBe(prompts.length);
  });

  it("gives the same problems for the same seed, so tests and demos repeat", () => {
    const run = () => {
      const s = problemSession(42);
      return DEMO_NODES.map((node) => s.next(node, 2).prompt);
    };
    expect(run()).toEqual(run());
  });

  it("lists the wrong answers its slips lead to, and the slip detector agrees", () => {
    const equation = (node: DemoNode) => node === "one_step_equations" || node === "two_step_equations";
    for (const node of DEMO_NODES) {
      for (const level of LEVELS) {
        for (const seed of PER_LEVEL.slice(0, 50)) {
          const p = makeProblem(node, level, seeded(seed));
          for (const { slip, value } of p.slips) {
            expect(Math.abs(value - p.answer), `${p.prompt}: ${slip}`).toBeGreaterThan(1e-9);
            const next = equation(node) ? `x = ${value}` : String(value);
            const found = detectSlip(node, { prev: p.prompt, next, answer: p.answerText });
            // The detector never names a slip the list didn't predict for that value...
            if (found) expect(p.slips.some((s) => s.slip === found && Math.abs(s.value - value) < 1e-9), `${p.prompt}: ${next}`).toBe(true);
            // ...and a value only one slip leads to is named, on an answer box or as "x = value"
            // (dividing only some terms shows as "x + 6 = 5", never as x alone).
            const unique = p.slips.filter((s) => Math.abs(s.value - value) < 1e-9).length === 1;
            if (unique && slip !== "divided_one_term") expect(found, `${p.prompt}: ${next}`).toBe(slip);
          }
        }
      }
    }
    // The demo's own problem: the three two-step slips, at 11, 17/2 and 10.
    const values = slipValues("two_step_equations", { prev: "2x + 5 = 17" });
    expect(values).toEqual(
      expect.arrayContaining([
        { slip: "constant_moved_without_undoing", value: 11 },
        { slip: "constant_ignored", value: 8.5 },
        { slip: "coefficient_subtracted_after_constant", value: 10 },
      ]),
    );
  });
});
