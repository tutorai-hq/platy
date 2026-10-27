import skillMap from "../../../src/platy/skills/data/skill_map.json";
import { SLIPS, type SlipExample } from "../content/slips";
import { evaluate } from "../math/evaluate";
import { type Node, parseMathStrict } from "../math/parse";
import { readAnswer } from "./answers";
import { linearForm, near, sides } from "./grade";
import { unbracketed } from "./working";

// Mock-only slip detection (R-40). In the real app the server matches a wrong step against
// the slip map with sympy (platy.mathcheck); this stands in for it so the demo runs with no
// backend. Each rule rebuilds what the student would have written after one known wrong move
// and compares values, so any arrangement of the same wrong line still matches.

interface Rule {
  /** Where the slip leads from the line above: the wrong values it gives, never the right one. */
  values: (ex: Omit<SlipExample, "next">) => number[];
  /** The number the student's line says, or null when the line doesn't look like this slip. */
  said: (ex: SlipExample) => number | null;
}

/** a*x + b = c with x on one side only, or null. */
function shape(text: string): { a: number; b: number; c: number } | null {
  const s = sides(text);
  if (!s) return null;
  const [l, r] = near(s[1].slope, 0) ? s : [s[1], s[0]];
  if (near(l.slope, 0) || !near(r.slope, 0)) return null;
  return { a: l.slope, b: l.constant, c: r.constant };
}

/** A line's only solution, or null. */
function solution(text: string): number | null {
  const f = linearForm(text);
  return f && !near(f.a, 0) ? -f.b / f.a : null;
}

/** "7", "-3", "1.5", "17/2": a number written out, with nothing left to work out. */
function isNumber(node: Node): boolean {
  const n = node.kind === "neg" && node.sign === "-" ? node.arg : node;
  return n.kind === "num" || (n.kind === "frac" && n.num.kind === "num" && n.den.kind === "num");
}

/** What the student's line looks like: "x = 5", "2x = 12" (a kept) or "x + 6 = 5". */
type Form = "alone" | "kept" | "partial";

/** The student's line in a*x + b = number form, or null when the number side isn't one number. */
function written(text: string): { a: number; b: number } | null {
  const node = parseMathStrict(text);
  const s = shape(text);
  if (node?.kind !== "rel" || !s) return null;
  return node.parts.some(isNumber) ? { a: s.a, b: s.b } : null;
}

function hasForm(form: Form, prevA: number, n: { a: number; b: number }): boolean {
  if (form === "alone") return near(n.a, 1) && near(n.b, 0);
  if (form === "kept") return near(n.a, prevA) && near(n.b, 0);
  return near(n.a, 1) && !near(n.b, 0);
}

const isWhole = (n: number) => near(n, Math.round(n));

/**
 * An equation rule: the student's line has one of `forms`, and solves to one of the values
 * `wrong` gives from the line above's a, b and c, not to the right one.
 */
function equationRule(
  applies: (a: number, b: number, c: number) => boolean,
  forms: Form[],
  wrong: (a: number, b: number, c: number) => number[],
): Rule {
  return {
    values: ({ prev }) => {
      const s = shape(prev);
      if (!s || !applies(s.a, s.b, s.c)) return [];
      const right = (s.c - s.b) / s.a;
      return wrong(s.a, s.b, s.c).filter((w) => !near(w, right));
    },
    said: ({ prev, next }) => {
      const s = shape(prev);
      const n = written(next);
      return s && n && forms.some((f) => hasForm(f, s.a, n)) ? solution(next) : null;
    },
  };
}

/** The student's single number, from "-24", "x = 7" or "b = 1/5". */
function answerValue(next: string): number | null {
  const v = readAnswer(next);
  return v?.length === 1 ? v[0]! : null;
}

/** An expression to work out (no "=") and its value. */
function expression(prev: string): { node: Node; value: number } | null {
  const node = parseMathStrict(prev);
  if (!node || node.kind === "rel" || node.kind === "list") return null;
  const value = evaluate(node);
  return value?.length === 1 ? { node, value: value[0]! } : null;
}

/** An arithmetic rule: `wrong` is the value the slip gives, or null if it can't happen here. */
function arithmeticRule(wrong: (node: Node, value: number, prev: string) => number | null): Rule {
  return {
    values: ({ prev }) => {
      const e = expression(prev);
      const w = e && wrong(e.node, e.value, prev);
      return e && w !== null && !near(w, e.value) ? [w] : [];
    },
    said: ({ next }) => answerValue(next),
  };
}

/** An undo question ("x - 4 + b = x"): the right answer comes with the example. */
function undoRule(scales: boolean, wrong: (answer: number) => number): Rule {
  return {
    values: ({ prev, answer }) => {
      const right = answer === undefined ? null : answerValue(answer);
      if (right === null || undoKind(prev) !== (scales ? "scale" : "shift")) return [];
      return [wrong(right)].filter((w) => !near(w, right));
    },
    said: ({ next }) => answerValue(next),
  };
}

/** Whether the undo question adds b ("x - 4 + b = x") or multiplies by it ("(x/5)*b = x"). */
function undoKind(prev: string): "shift" | "scale" | null {
  const left = prev.split("=")[0] ?? "";
  if (/[+-]\s*b\b/.test(left)) return "shift";
  if (/[*×)]\s*b\b|\bb\s*[*×(]/.test(left)) return "scale";
  return null;
}

const valueOf = (n: Node) => {
  const v = evaluate(n);
  return v?.length === 1 ? v[0]! : null;
};

/** Every subtraction between numbers made an addition (a leading minus stays). */
function plusForMinus(node: Node): Node {
  switch (node.kind) {
    case "bin":
      return { ...node, op: node.op === "-" ? "+" : node.op, left: plusForMinus(node.left), right: plusForMinus(node.right) };
    case "group":
      return { ...node, body: plusForMinus(node.body) };
    default:
      return node;
  }
}

/** Strictly left to right, each bracket still worked out as one number. */
function leftToRight(node: Node): number | null {
  const atoms: Node[] = [];
  const ops: string[] = [];
  const walk = (n: Node) => {
    if (n.kind === "bin" && n.op !== "implicit" && n.op !== "±") {
      walk(n.left);
      ops.push(n.op);
      walk(n.right);
    } else if (n.kind === "frac") {
      walk(n.num);
      ops.push("÷");
      walk(n.den);
    } else {
      atoms.push(n);
    }
  };
  walk(node);
  let acc = valueOf(atoms[0]!);
  for (const [i, op] of ops.entries()) {
    const v = valueOf(atoms[i + 1]!);
    if (acc === null || v === null) return null;
    acc = op === "+" ? acc + v : op === "-" ? acc - v : op === "÷" ? acc / v : acc * v;
  }
  return acc;
}

/** The two numbers multiplied or divided, reading "-6 * (-4)" (parsed as -(6 * (-4))) as -6 and -4. */
function factors(node: Node): [number, number] | null {
  const outer = node.kind === "neg" && node.sign === "-" ? node.arg : node;
  const pair = outer.kind === "frac" ? [outer.num, outer.den] : outer.kind === "bin" && "*×÷implicit".includes(outer.op) ? [outer.left, outer.right] : null;
  const l = pair && valueOf(pair[0]!);
  const r = pair && valueOf(pair[1]!);
  if (l === null || r === null) return null;
  return [outer === node ? l : -l, r];
}

/** A negative answer given without its minus sign. */
const signDropped = arithmeticRule((_node, value) => (value < 0 ? -value : null));

/** a*x + b = c with both a number in front of x and one added to it. */
const twoStep = (a: number, b: number) => !near(Math.abs(a), 1) && !near(b, 0);

const RULES: Record<string, Rule> = {
  // integer_arithmetic
  negative_times_negative_negative: arithmeticRule((node, value) => {
    const f = factors(node);
    return f && f[0] < 0 && f[1] < 0 ? -value : null;
  }),
  subtraction_treated_as_addition: arithmeticRule((node) => valueOf(plusForMinus(node))),
  integer_sign_dropped: signDropped,
  // order_of_operations
  left_to_right_ignoring_precedence: arithmeticRule((node) => leftToRight(node)),
  brackets_ignored: arithmeticRule((_node, _value, prev) => {
    if (!/[()]/.test(prev)) return null;
    const flat = parseMathStrict(unbracketed(prev));
    return flat ? valueOf(flat) : null;
  }),
  order_sign_dropped: signDropped,
  // inverse_operations
  undo_with_same_operation: undoRule(false, (right) => -right),
  undo_scale_by_repeating: undoRule(true, (right) => 1 / right),
  undo_scale_with_negative: undoRule(true, (right) => -right),
  // one_step_equations
  add_subtract_wrong_direction: equationRule((a, b) => near(a, 1) && !near(b, 0), ["alone"], (_a, b, c) => [c + b]),
  divided_instead_of_multiplied: equationRule((a, b) => near(b, 0) && Math.abs(a) < 1 && isWhole(1 / a), ["alone"], (a, _b, c) => [c * a]),
  multiplied_instead_of_divided: equationRule((a, b) => near(b, 0) && Math.abs(a) > 1 && isWhole(a), ["alone"], (a, _b, c) => [c * a]),
  coefficient_subtracted: equationRule((a, b) => near(b, 0) && Math.abs(a) > 1 && isWhole(a), ["alone"], (a, _b, c) => [c - a]),
  coefficient_sign_dropped: equationRule((a) => a < 0, ["alone"], (a, b, c) => [(c - b) / Math.abs(a)]),
  // two_step_equations
  constant_moved_without_undoing: equationRule(twoStep, ["kept", "alone"], (a, b, c) => [(c + b) / a]),
  // Only some terms divided: x and the right side, the left side only, or x alone.
  divided_one_term: equationRule(twoStep, ["partial"], (a, b, c) => [c / a - b, c - b / a, c - b]),
  constant_ignored: equationRule(twoStep, ["alone"], (a, _b, c) => [c / a]),
  coefficient_subtracted_after_constant: equationRule(twoStep, ["alone"], (a, b, c) => [c - b - a]),
};

/** A node and everything under it in the skill map, nearest first. */
function chain(node: string): string[] {
  const prereqs = new Map(skillMap.nodes.map((n) => [n.id, n.prerequisites]));
  const out: string[] = [];
  const queue = [node];
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (out.includes(id)) continue;
    out.push(id);
    queue.push(...(prereqs.get(id) ?? []));
  }
  return out;
}

/**
 * The id of the slip a wrong step matches, looking at the problem's own skill first and then
 * its prerequisites (a slip two levels down is the gap the primer is looking for), or null.
 * Two slips on the same skill that both fit can't be told apart, so neither is named.
 */
export function detectSlip(node: string, ex: SlipExample): string | null {
  const matches = (rule: Rule | undefined) => {
    const said = rule?.said(ex) ?? null;
    return said !== null && rule!.values(ex).some((w) => near(said, w));
  };
  for (const id of chain(node)) {
    const hits = SLIPS.filter((slip) => slip.node === id && matches(RULES[slip.id]));
    if (hits.length > 0) return hits.length === 1 ? hits[0]!.id : null;
  }
  return null;
}

/**
 * The wrong answers each slip would give on a problem (its own skill's slips and its
 * prerequisites'), so a wrong answer can be matched to a slip (R-41). Two slips can share a
 * value; detectSlip names neither then.
 */
export function slipValues(node: string, problem: Omit<SlipExample, "next">): { slip: string; value: number }[] {
  const out: { slip: string; value: number }[] = [];
  for (const id of chain(node)) {
    for (const slip of SLIPS.filter((s) => s.node === id)) {
      for (const value of RULES[slip.id]?.values(problem) ?? []) out.push({ slip: slip.id, value });
    }
  }
  return out;
}
