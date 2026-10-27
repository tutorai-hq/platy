import skillMap from "../../../src/platy/skills/data/skill_map.json";
import { prerequisiteChains } from "../content/catalog";
import { SLIPS } from "../content/slips";
import { bareNumber, linearForm, near } from "../mock/grade";
import { probeProblem } from "../mock/script";
import { slipValues } from "../mock/slips";
import type { Problem } from "../protocol";
import data from "./students.json";

// A simulated student for the bench (R-01): a rule, not a learner. It answers by its fixture:
// wrong on a gap node and on every node that needs it until that node is taught, one known wrong
// move for each slip until its repair, right everywhere else. Deterministic, no LLM (P-13).

export interface Fixture {
  id: string;
  /** Skill-map nodes the student can't do yet. */
  gaps: string[];
  /** Slip ids from slips.json the student makes every time, until each is repaired. */
  slips: string[];
  answers_right_elsewhere: true;
  /** What the mock primer should name as the gap, or null; `note` says why it differs from the planted gaps. */
  expected: { found: string | null; note?: string };
}

const NODE_IDS = new Set(skillMap.nodes.map((n) => n.id));
const SLIP_IDS = new Set(SLIPS.map((s) => s.id));

function load(raw: unknown): Fixture[] {
  const file = raw as { schema_version?: unknown; students?: unknown };
  if (file.schema_version !== 1 || !Array.isArray(file.students)) throw new Error("students.json: unexpected shape");
  for (const s of file.students as Fixture[]) {
    if (typeof s.id !== "string" || s.answers_right_elsewhere !== true || !s.expected || !("found" in s.expected)) throw new Error(`students.json: ${s.id} is missing a field`);
    for (const g of s.gaps) if (!NODE_IDS.has(g)) throw new Error(`students.json: ${s.id} gap ${g} is not a skill-map node`);
    for (const slip of s.slips) if (!SLIP_IDS.has(slip)) throw new Error(`students.json: ${s.id} slip ${slip} is not in slips.json`);
    if (s.expected.found !== null && !NODE_IDS.has(s.expected.found)) throw new Error(`students.json: ${s.id} expects a gap that is not a node`);
  }
  return file.students as Fixture[];
}

export const STUDENTS: readonly Fixture[] = load(data);

/** Every node each node needs, transitively, from the skill map. */
const NEEDS = prerequisiteChains(skillMap.nodes);

/** A two-step problem as the lesson and the level-1 generator write it. */
const TWO_STEP = /^(-?\d+)x ([+-]) (\d+) = (-?\d+)$/;
/** A one-step line with the coefficient kept, "2x = 12". */
const KEPT = /^(-?\d+)x = (-?\d+)$/;

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 1000) / 1000));

/** The right answer to a problem, the way the mock's own checker sees it, or null if the student can't tell. */
export function solve(problem: Pick<Problem, "prompt" | "skill_id" | "kind">): number | null {
  // A quick check is the skill map's probe; its answer is in the map (a value, or b in "x - 4 + b = x").
  if (problem.kind === "probe") return probeProblem(problem.skill_id).solutions[0] ?? null;
  const f = linearForm(problem.prompt);
  const v = f && !near(f.a, 0) ? -f.b / f.a : bareNumber(problem.prompt);
  // A whole answer written whole: 18, not 18.000000000000004.
  return v !== null && near(v, Math.round(v)) ? Math.round(v) : v;
}

/** The lines a careful student writes for a problem: the two moves of a two-step equation, else the answer. */
export function rightLines(prompt: string, answer: number): string[] {
  const m = TWO_STEP.exec(prompt);
  if (!m) return [`x = ${fmt(answer)}`];
  const [, a, sign, b, c] = m as unknown as [string, string, string, string, string];
  const mid = sign === "+" ? Number(c) - Number(b) : Number(c) + Number(b);
  return [`${a}x = ${mid}`, `x = ${fmt(answer)}`];
}

/**
 * What each slip looks like as a line, from the line above (the problem, or the last accepted
 * line). Null when the slip can't be made from that line. The mock's detector (`mock/slips.ts`)
 * names these; the bench test checks that it does.
 */
const SLIP_LINES: Record<string, (prev: string) => string | null> = {
  // Doing the same thing to the number instead of undoing it: 2x + 5 = 17 → 2x = 22.
  constant_moved_without_undoing: (prev) => {
    const m = TWO_STEP.exec(prev);
    if (!m) return null;
    const [, a, sign, b, c] = m as unknown as [string, string, string, string, string];
    return `${a}x = ${sign === "+" ? Number(c) + Number(b) : Number(c) - Number(b)}`;
  },
  // Taking the coefficient away instead of dividing by it: 2x = 12 → x = 10.
  coefficient_subtracted: (prev) => {
    const m = KEPT.exec(prev);
    if (!m) return null;
    const [, a, c] = m as unknown as [string, string, string];
    return `x = ${Number(c) - Number(a)}`;
  },
};

export class SimStudent {
  private readonly taughtNodes = new Set<string>();
  private readonly repairedSlips = new Set<string>();

  constructor(readonly fixture: Fixture) {}

  /** The student can't do this skill: it is a gap, or needs one, that hasn't been taught. */
  hasGap(skill_id: string): boolean {
    return this.fixture.gaps.some((g) => !this.taughtNodes.has(g) && (g === skill_id || (NEEDS.get(skill_id)?.has(g) ?? false)));
  }

  /** The planted learning: once the gap node is taught, the student has it. */
  taught(skill_id: string): void {
    if (this.fixture.gaps.includes(skill_id)) this.taughtNodes.add(skill_id);
  }

  /** The planted learning: once a slip's repair ran, the student stops making it. */
  repaired(slip: string): void {
    this.repairedSlips.add(slip);
  }

  /** What's learned so far, for the report. */
  learned(): { taught: string[]; repaired: string[] } {
    return { taught: [...this.taughtNodes], repaired: [...this.repairedSlips] };
  }

  /** The answer typed into an answer box: wrong on a gap, else right. */
  answer(problem: Problem): string {
    const right = solve(problem);
    if (right === null) return "0";
    if (!this.hasGap(problem.skill_id)) return fmt(right);
    // The wrong value a known slip gives on this problem, when there is one; else one off.
    const wrong = slipValues(problem.skill_id, { prev: problem.prompt, answer: fmt(right) }).find((s) => !near(s.value, right));
    return fmt(wrong ? wrong.value : right + 1);
  }

  /** The next line on a step-by-step problem, given the lines accepted so far. */
  line(problem: Problem, accepted: readonly string[]): string {
    const right = solve(problem) ?? 0;
    const prev = accepted.at(-1) ?? problem.prompt;
    // A slip is a move the student makes whenever the line above invites it.
    for (const slip of this.fixture.slips) {
      if (this.repairedSlips.has(slip)) continue;
      const line = SLIP_LINES[slip]?.(prev);
      if (line !== null && line !== undefined) return line;
    }
    if (this.hasGap(problem.skill_id)) return `x = ${fmt(right + 1)}`;
    const plan = rightLines(problem.prompt, right);
    return plan[accepted.length] ?? plan[plan.length - 1]!;
  }
}
