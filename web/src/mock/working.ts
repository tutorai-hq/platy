import { evaluate } from "../math/evaluate";
import { type BinOp, type Node, parseMathStrict } from "../math/parse";
import { bareNumber, near } from "./grade";

// Working an expression out one operation at a time, in checker syntax, the way a student
// writes it line by line. The integer and order-of-operations repairs (R-37) build their flawed
// working with it, in the right order or the slipped way, and the mock grades expression lines
// with it (R-48). Pure functions on the parser's trees; the real server would use platy.mathcheck.

export type Order = "usual" | "left_to_right";

/** One operation worked out: its operands and result, so a slip can be planted on it. */
export interface Reduction {
  op: "+" | "-" | "*" | "/";
  left: number;
  right: number;
  value: number;
}

/** A planted slip: what the student writes for a reduction instead, or null to leave it right. */
export type Slip = (r: Reduction) => number | null;

export interface Working {
  /** Each line after the expression, down to one number. */
  lines: string[];
  /** The operations as they were really worked out, one per line. */
  reductions: Reduction[];
}

type Op = Reduction["op"];
type Pick = (n: Node, inGroup: boolean) => boolean;
type Apply = (n: Node) => Node;

/** A number written out, with or without a minus sign. */
const isNumeral = (n: Node): boolean => n.kind === "num" || (n.kind === "neg" && n.sign === "-" && n.arg.kind === "num");

function numeral(v: number): Node {
  const text = String(Math.round(Math.abs(v) * 1e9) / 1e9);
  return v < 0 ? { kind: "neg", sign: "-", arg: { kind: "num", value: text } } : { kind: "num", value: text };
}

function numValue(n: Node): number {
  if (n.kind === "num") return Number(n.value);
  if (n.kind === "neg" && n.arg.kind === "num") return -Number(n.arg.value);
  throw new Error("not a numeral");
}

function opOf(n: Node): Op | null {
  if (n.kind === "frac") return "/";
  if (n.kind !== "bin") return null;
  switch (n.op) {
    case "+":
    case "-":
      return n.op;
    case "*":
    case "×":
    case "implicit":
      return "*";
    case "÷":
      return "/";
    default:
      return null;
  }
}

function operands(n: Node): [Node, Node] | null {
  if (n.kind === "frac") return [n.num, n.den];
  return n.kind === "bin" ? [n.left, n.right] : null;
}

/** An operation on two numbers, ready to work out. */
function reducible(n: Node): boolean {
  const parts = operands(n);
  return opOf(n) !== null && parts !== null && isNumeral(parts[0]) && isNumeral(parts[1]);
}

const mulDiv = (n: Node): boolean => {
  const op = opOf(n);
  return op === "*" || op === "/";
};

const lowOp = (n: Node): boolean => {
  const op = opOf(n);
  return op === "+" || op === "-";
};

/** Brackets around one number, and a minus of a minus, aren't a step: fold them away. */
function collapse(n: Node): Node {
  if (n.kind === "group") return isNumeral(n.body) || n.body.kind === "group" ? collapse(n.body) : n;
  if (n.kind === "neg" && n.sign === "-") {
    const arg = collapse(n.arg);
    if (arg.kind === "neg" && arg.sign === "-") return arg.arg;
    return arg === n.arg ? n : { ...n, arg };
  }
  return n;
}

function normalize(n: Node): Node {
  switch (n.kind) {
    case "group":
      return collapse({ ...n, body: normalize(n.body) });
    case "neg":
      return collapse({ ...n, arg: normalize(n.arg) });
    case "bin":
      return { ...n, left: normalize(n.left), right: normalize(n.right) };
    case "frac":
      return { ...n, num: normalize(n.num), den: normalize(n.den) };
    case "pow":
      return { ...n, base: normalize(n.base), exp: normalize(n.exp) };
    case "sqrt":
      return { ...n, arg: normalize(n.arg) };
    case "rel":
      return { ...n, parts: n.parts.map(normalize) };
    case "list":
      return { ...n, items: n.items.map(normalize) };
    default:
      return n;
  }
}

function has(n: Node, kinds: readonly Node["kind"][]): boolean {
  if (kinds.includes(n.kind)) return true;
  switch (n.kind) {
    case "group":
      return has(n.body, kinds);
    case "neg":
    case "sqrt":
      return has(n.arg, kinds);
    case "bin":
      return has(n.left, kinds) || has(n.right, kinds);
    case "frac":
      return has(n.num, kinds) || has(n.den, kinds);
    case "pow":
      return has(n.base, kinds) || has(n.exp, kinds);
    case "rel":
      return n.parts.some((p) => has(p, kinds));
    case "list":
      return n.items.some((p) => has(p, kinds));
    default:
      return false;
  }
}

/** An expression in numbers to work out, tidied: no "=", nothing missing, no letter in it. */
function expression(text: string): Node | null {
  const n = parseMathStrict(text);
  if (!n || n.kind === "rel" || n.kind === "list" || has(n, ["var", "missing"])) return null;
  return normalize(n);
}

/** In a product or division, a negative number or a sum goes in brackets: "(-6)*(-4)", "(6 - 4)*5". */
const factor = (n: Node): string => (n.kind === "neg" || lowOp(n) ? `(${print(n)})` : print(n));

/** A number after a plus or minus keeps its own sign in brackets: "7 + (-15)". */
const afterOp = (n: Node): string => (n.kind === "neg" ? `(${print(n)})` : print(n));

/** The tree in checker syntax, the way a student writes a line: "20 - 3*6", "(-6)*(-4)". */
function print(n: Node): string {
  switch (n.kind) {
    case "num":
      return n.value;
    case "var":
      return n.name;
    case "pi":
      return "pi";
    case "missing":
      return "";
    case "group":
      return `(${print(n.body)})`;
    case "neg":
      return `${n.sign}${lowOp(n.arg) ? `(${print(n.arg)})` : print(n.arg)}`;
    case "bin": {
      const op = opOf(n);
      if (op === "+" || op === "-") return `${print(n.left)} ${op} ${afterOp(n.right)}`;
      if (op === null) return `${print(n.left)} ± ${print(n.right)}`;
      return `${factor(n.left)}${op}${factor(n.right)}`;
    }
    case "frac":
      return `${factor(n.num)}/${factor(n.den)}`;
    case "pow":
      return `${factor(n.base)}^${factor(n.exp)}`;
    case "sqrt":
      return `sqrt(${print(n.arg)})`;
    case "rel":
      return n.parts.map(print).join(` ${n.ops[0] ?? "="} `);
    case "list":
      return n.items.map(print).join(", ");
  }
}

function reductionOf(n: Node): Reduction {
  const [left, right] = operands(n)!;
  return { op: opOf(n)!, left: numValue(left), right: numValue(right), value: evaluate(n)![0]! };
}

/** Works out the leftmost operation `pick` accepts, or null when there's none. */
function reduceLeftmost(n: Node, pick: Pick, apply: Apply, inGroup = false): Node | null {
  if (pick(n, inGroup)) return apply(n);
  switch (n.kind) {
    case "group": {
      const body = reduceLeftmost(n.body, pick, apply, true);
      return body && collapse({ ...n, body });
    }
    case "neg": {
      const arg = reduceLeftmost(n.arg, pick, apply, inGroup);
      return arg && collapse({ ...n, arg });
    }
    case "bin": {
      const left = reduceLeftmost(n.left, pick, apply, inGroup);
      if (left) return { ...n, left };
      const right = reduceLeftmost(n.right, pick, apply, inGroup);
      return right && { ...n, right };
    }
    case "frac": {
      const num = reduceLeftmost(n.num, pick, apply, inGroup);
      if (num) return { ...n, num };
      const den = reduceLeftmost(n.den, pick, apply, inGroup);
      return den && { ...n, den };
    }
    default:
      return null;
  }
}

// The usual order: brackets first (the usual order inside them too), then multiplying and
// dividing, then adding and taking away, each left to right.
const PASSES: Pick[] = [
  (n, inGroup) => inGroup && reducible(n) && mulDiv(n),
  (n, inGroup) => inGroup && reducible(n),
  (n) => reducible(n) && mulDiv(n),
  (n) => reducible(n),
];

function stepUsual(n: Node, apply: Apply): Node | null {
  for (const pick of PASSES) {
    const next = reduceLeftmost(n, pick, apply);
    if (next) return next;
  }
  return null;
}

/** The tree as a student reads it: the numbers and the operations between them, in order. */
function flatten(n: Node, atoms: Node[], ops: Op[]): void {
  const op = opOf(n);
  const parts = operands(n);
  if (op && parts) {
    flatten(parts[0], atoms, ops);
    ops.push(op);
    flatten(parts[1], atoms, ops);
  } else {
    atoms.push(n);
  }
}

function joinFlat(atoms: Node[], ops: Op[]): string {
  const first = atoms[0]!;
  let text = ops[0] === "*" || ops[0] === "/" ? factor(first) : print(first);
  ops.forEach((op, i) => {
    const next = atoms[i + 1]!;
    text += op === "+" || op === "-" ? ` ${op} ${afterOp(next)}` : `${op}${factor(next)}`;
  });
  return text;
}

function binOf(op: Op, left: Node, right: Node): Node {
  const binOp: BinOp = op === "/" ? "÷" : op;
  return { kind: "bin", op: binOp, left, right };
}

/** Strictly left to right, brackets still first: the slip of ignoring precedence. */
function stepLeftToRight(n: Node, apply: Apply): Node | null {
  for (const pick of PASSES.slice(0, 2)) {
    const next = reduceLeftmost(n, pick, apply);
    if (next) return next;
  }
  const atoms: Node[] = [];
  const ops: Op[] = [];
  flatten(n, atoms, ops);
  if (atoms.length < 2 || !atoms.every(isNumeral)) return stepUsual(n, apply);
  const first = apply(binOf(ops[0]!, atoms[0]!, atoms[1]!));
  // The line as the student writes it; the next step reads it the usual way again.
  return expression(joinFlat([first, ...atoms.slice(2)], ops.slice(1)));
}

/**
 * `expr` worked out a line at a time until one number is left, in the usual order or strictly
 * left to right (brackets still first). `slip` can change what one operation comes to, the way a
 * slip would, and the lines after it follow from the wrong value. Null for anything that isn't an
 * expression in numbers.
 */
export function workOut(expr: string, order: Order = "usual", slip?: Slip): Working | null {
  const start = expression(expr);
  if (!start) return null;
  let node: Node = start;
  const lines: string[] = [];
  const reductions: Reduction[] = [];
  let slipped = false;
  const apply: Apply = (n) => {
    const r = reductionOf(n);
    reductions.push(r);
    const wrong = slipped || !slip ? null : slip(r);
    if (wrong !== null) slipped = true;
    return numeral(wrong ?? r.value);
  };
  for (let i = 0; !isNumeral(node); i++) {
    if (i > 40) return null;
    const next = order === "usual" ? stepUsual(node, apply) : stepLeftToRight(node, apply);
    if (!next) return null;
    node = next;
    lines.push(print(node));
  }
  return { lines, reductions };
}

/** The first line that doesn't come to what `expr` comes to, or -1 when they all do. */
export function firstWrong(expr: string, lines: readonly string[]): number {
  const value = bareNumber(expr);
  if (value === null) return -1;
  return lines.findIndex((l) => {
    const w = bareNumber(l);
    return w === null || !near(w, value);
  });
}

/** One number written out, like "-24" or "3.5", with nothing left to work out. */
export function isNumeralText(text: string): boolean {
  const n = expression(text);
  return n !== null && isNumeral(n);
}

/** The same expression however it's spaced or bracketed: "2(3 + 4)" is "2*(3+4)". */
export function sameExpression(a: string, b: string): boolean {
  const x = expression(a);
  const y = expression(b);
  return x !== null && y !== null && print(x) === print(y);
}

/** The numbers added and taken away, signs included, or null for anything with a product in it. */
function terms(n: Node, sign = 1): number[] | null {
  if (isNumeral(n)) return [sign * numValue(n)];
  if (n.kind === "neg" && n.sign === "-") return terms(n.arg, -sign);
  if (n.kind === "group") return terms(n.body, sign);
  if (n.kind === "bin" && (n.op === "+" || n.op === "-")) {
    const left = terms(n.left, sign);
    const right = terms(n.right, n.op === "+" ? sign : -sign);
    return left && right ? [...left, ...right] : null;
  }
  return null;
}

/** The same numbers added and taken away, in any order: "-5 - 3" is "-3 - 5" and "-5 + (-3)". */
export function sameSum(a: string, b: string): boolean {
  const x = expression(a);
  const y = expression(b);
  const s = x && terms(x);
  const t = y && terms(y);
  if (!s || !t || s.length !== t.length) return false;
  const sorted = (v: number[]) => [...v].sort((p, q) => p - q);
  const u = sorted(t);
  return sorted(s).every((v, i) => near(v, u[i]!));
}

/** The expression with its brackets taken away, a bracket that multiplied now a "*". */
export function unbracketed(expr: string): string {
  return expr
    .replace(/\)\s*\(/g, "*")
    .replace(/([0-9.a-z])\s*\(/gi, "$1*")
    .replace(/\)\s*([0-9.a-z])/gi, "*$1")
    .replace(/[()]/g, "");
}

/** Every number written in the text, as written, so "-24" counts as 24. */
export function numeralsIn(text: string): number[] {
  return (text.match(/\d+(\.\d+)?/g) ?? []).map(Number);
}
