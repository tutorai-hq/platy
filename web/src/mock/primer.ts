import { MASTERED } from "../content/map";
import type { PrimerState, SkillReport } from "../protocol";

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

// Made-up starting beliefs for a demo student, one per skill in the map, and BKT parameters,
// chosen so the demo arc reads clearly: foundations solid, the equations path in progress.
const PRIOR: Readonly<Record<string, number>> = {
  integer_arithmetic: 0.85,
  order_of_operations: 0.75,
  fraction_operations: 0.7,
  reciprocals: 0.45,
  inverse_operations: 0.65,
  combining_like_terms: 0.85,
  distributive_property: 0.85,
  simplifying_expressions: 0.82,
  writing_expressions: 0.6,
  one_step_equations: 0.6,
  fraction_coefficient_equations: 0.2,
  two_step_equations: 0.4,
  multi_step_equations: 0.1,
  equations_with_fractions: 0.05,
  variables_both_sides: 0.05,
  linear_equation_word_problems: 0.05,
};
const GUESS = 0.2;
const SLIP = 0.1;
const LEARN = 0.15;

export class MockPrimer {
  private readonly p = new Map<string, number>(Object.entries(PRIOR));
  private readonly practiced = new Set<string>();
  private hypothesis: PrimerState["hypothesis"] = null;

  /** One piece of evidence: a BKT update, then the chance of learning from the step. */
  observe(skill_id: string, correct: boolean): void {
    const p = this.p.get(skill_id);
    if (p === undefined) return;
    this.practiced.add(skill_id);
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

  /**
   * Every skill's mastery over the session, for "Your map" (R-13). The mock's "due for review" is a
   * skill on today's path that wasn't practiced and isn't mastered; the real primer would use
   * its forgetting model.
   */
  report(): SkillReport[] {
    return Object.entries(PRIOR).map(([skill_id, before]) => {
      const after = this.p.get(skill_id)!;
      const onPath = (PRIMER_PATH as readonly string[]).includes(skill_id);
      return {
        skill_id,
        before,
        after: Math.round(after * 100) / 100,
        due: onPath && !this.practiced.has(skill_id) && after < MASTERED,
      };
    });
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
