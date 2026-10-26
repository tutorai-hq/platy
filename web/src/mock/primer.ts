import type { PrimerState } from "../protocol";

// Mock-only primer beliefs for the demo primer view (R-42). The real primer is Connor's policy
// with pyBKT mastery (A-5) on the server; this stands in for it so the demo runs with no backend.
// It holds numbers and codes only, never anything the student wrote.

/** The demo path, goal first, so a probe moves down the list. */
export const PRIMER_PATH = [
  "two_step_equations",
  "one_step_equations",
  "inverse_operations",
  "integer_arithmetic",
  "order_of_operations",
] as const;

/** Which prerequisite to probe after a miss, one level down the demo path (R-01). */
export const PROBE_BELOW: Readonly<Record<string, string>> = {
  two_step_equations: "one_step_equations",
  one_step_equations: "inverse_operations",
};

// Made-up starting beliefs and BKT parameters, chosen so the demo arc reads clearly.
const PRIOR: Readonly<Record<string, number>> = {
  two_step_equations: 0.4,
  one_step_equations: 0.6,
  inverse_operations: 0.65,
  integer_arithmetic: 0.85,
  order_of_operations: 0.75,
};
const GUESS = 0.2;
const SLIP = 0.1;
const LEARN = 0.15;

export class MockPrimer {
  private readonly p = new Map<string, number>(PRIMER_PATH.map((id) => [id, PRIOR[id]!]));
  private hypothesis: PrimerState["hypothesis"] = null;

  /** One piece of evidence: a BKT update, then the chance of learning from the step. */
  observe(skill_id: string, correct: boolean): void {
    const p = this.p.get(skill_id);
    if (p === undefined) return;
    const known = correct ? p * (1 - SLIP) : p * SLIP;
    const posterior = known / (known + (correct ? (1 - p) * GUESS : (1 - p) * (1 - GUESS)));
    this.p.set(skill_id, posterior + (1 - posterior) * LEARN);
  }

  /** A teaching moment, such as a worked example: the chance of learning, with no evidence. */
  taught(skill_id: string): void {
    const p = this.p.get(skill_id);
    if (p !== undefined) this.p.set(skill_id, p + (1 - p) * LEARN);
  }

  hypothesize(code: string, skill_id: string): void {
    this.hypothesis = { code, skill_id };
  }

  /** Probing stopped before it found anything, so there's no hypothesis to show. */
  dropHypothesis(): void {
    this.hypothesis = null;
  }

  /** The state to send after a move, with the move's code, its reason and its skill. */
  after(code: string, reason: string, skill_id: string): PrimerState {
    return {
      mastery: PRIMER_PATH.map((id) => ({ skill_id: id, p: Math.round(this.p.get(id)! * 100) / 100 })),
      hypothesis: this.hypothesis,
      move: { code, reason, skill_id },
    };
  }
}
