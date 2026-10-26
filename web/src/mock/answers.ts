import { evaluate } from "../math/evaluate";
import { type Node, parseMath } from "../math/parse";

export type AnswerResult = "correct" | "partial" | "incorrect" | "unreadable";

// Reads "5", "x = 5", "5 = x", "x=7 or x=-7", "7, -7" and "±7" as a set of numbers.
// Returns null when any piece isn't a plain number (or "x = number").
export function readAnswer(text: string): number[] | null {
  const pieces = text.split(/\bor\b|\band\b|,|;/i).map((p) => p.trim()).filter(Boolean);
  if (pieces.length === 0) return null;
  const values: number[] = [];
  for (const piece of pieces) {
    const node = parseMath(piece);
    let found: number[] | null;
    if (node.kind === "rel") {
      if (node.ops.length !== 1 || node.ops[0] !== "=") return null;
      const [left, right] = node.parts as [Node, Node];
      found = left.kind === "var" ? evaluate(right) : right.kind === "var" ? evaluate(left) : null;
    } else {
      found = evaluate(node);
    }
    if (!found) return null;
    values.push(...found);
  }
  return values;
}

const close = (a: number, b: number) => Math.abs(a - b) < 1e-6;

export function checkAnswer(text: string, solutions: number[]): AnswerResult {
  const values = readAnswer(text);
  if (!values) return "unreadable";
  if (!values.every((v) => solutions.some((s) => close(s, v)))) return "incorrect";
  return solutions.every((s) => values.some((v) => close(s, v))) ? "correct" : "partial";
}

export function matchesValue(text: string, value: number): boolean {
  const values = readAnswer(text);
  return values !== null && values.length > 0 && values.every((v) => close(v, value));
}

/**
 * The answer box's example of the answer's form (R-18): "b = 4", or "x = 3, x = -3" for two
 * solutions. Its numbers are never a solution, so the example can't give one away (R-02). None
 * for an expression to simplify, where a number would mislead.
 */
export function answerExample(variable: string | null, solutions: number[]): string | undefined {
  if (solutions.length === 0 || !solutions.every(Number.isFinite)) return undefined;
  const two = solutions.length > 1;
  const n = (two ? [3, 4, 6, 2, 8] : [4, 3, 6, 2, 8]).find((c) => !solutions.some((s) => close(Math.abs(s), c)))!;
  const one = (v: number) => (variable ? `${variable} = ${v}` : String(v));
  return two ? `${one(n)}, ${one(-n)}` : one(n);
}
