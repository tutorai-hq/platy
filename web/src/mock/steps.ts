import { type Node, parseMathStrict, unwrap } from "../math/parse";
import type { StepResult } from "../protocol";
import { linearForm } from "./grade";

// Mock-only step checking for step-by-step solving (R-48). In the real app the server checks
// every line with platy.mathcheck; this stands in for it so the demo runs with no backend.
// A line is a valid step when it is an equation with the same solution as the line above.

const EPS = 1e-9;

export function checkStep(prev: string, next: string): StepResult {
  const n = linearForm(next);
  const p = linearForm(prev);
  if (!n || !p) return "unreadable";
  // "5 = 17" has no x left in it; with one solution above, it can't be equivalent.
  if (Math.abs(n.a) < EPS || Math.abs(p.a) < EPS) return "invalid";
  if (Math.abs(-n.b / n.a - -p.b / p.a) > EPS) return "invalid";
  return isFinished(next) ? "solved" : "valid";
}

/** "x = 6", "6 = x", "x = -2/3": x alone on one side, a finished number on the other. */
function isFinished(text: string): boolean {
  const node = parseMathStrict(text);
  if (node?.kind !== "rel" || node.ops.length !== 1) return false;
  const [l, r] = node.parts as [Node, Node];
  return (isX(l) && isPlainNumber(r)) || (isX(r) && isPlainNumber(l));
}

function isX(node: Node): boolean {
  const n = unwrap(node);
  return n.kind === "var" && n.name.toLowerCase() === "x";
}

function isPlainNumber(node: Node): boolean {
  const n = node.kind === "neg" && node.sign === "-" ? node.arg : node;
  if (n.kind === "num") return true;
  if (n.kind !== "frac" || n.num.kind !== "num" || n.den.kind !== "num") return false;
  const top = Number(n.num.value);
  const bottom = Number(n.den.value);
  // A fraction counts once it's in lowest terms: 2/3 yes, 12/2 or 4/6 not yet.
  return Number.isInteger(top) && Number.isInteger(bottom) && bottom > 1 && gcd(top, bottom) === 1;
}

function gcd(a: number, b: number): number {
  return b === 0 ? Math.abs(a) : gcd(b, a % b);
}
