import { type DemoNode, gcd, type GeneratedProblem, isOneOf, type Level, problemSession } from "./generate";
import { near } from "./grade";

// The learning-gain test (R-26; Michael's design, 2026-10-22): 10 questions on the 5 demo
// skills, two per skill, generated at level 2. The pre and post forms come from different seeds,
// so their items are related but not identical (A-10). Both forms are fixed, so every student
// sits the same two tests. The real forms would come from the server's generators.

export const TEST_LEVEL: Level = 2;

/** Easiest first, the order the skills build on each other. */
const TEST_ORDER: readonly DemoNode[] = [
  "integer_arithmetic",
  "order_of_operations",
  "inverse_operations",
  "one_step_equations",
  "two_step_equations",
];

const PRE_SEED = 2610;
const POST_SEED = 7342;

/** The kind of question a prompt is: its signs, operations and how many digits each number has. */
const shape = (prompt: string) => prompt.replace(/\d/g, "#");

/** Two rounds through the skills, so the same skill never comes twice in a row. */
function preForm(seed: number): GeneratedProblem[] {
  const problems = problemSession(seed);
  return [0, 1].flatMap(() => TEST_ORDER.map((node) => problems.next(node, TEST_LEVEL)));
}

/**
 * The post form asks the same kind of question as the pre form in every slot, with new numbers,
 * so the two scores compare like with like. It never repeats a pre question, however it's written.
 */
function postForm(seed: number, pre: readonly GeneratedProblem[]): GeneratedProblem[] {
  const problems = problemSession(seed);
  const used = pre.map((p) => p.prompt);
  return pre.map((twin) => {
    for (let tries = 0; tries < 5000; tries++) {
      const p = problems.next(twin.node, TEST_LEVEL);
      if (shape(p.prompt) === shape(twin.prompt) && !used.includes(p.prompt) && !isOneOf(p.prompt, used)) return p;
    }
    throw new Error(`no post question like ${twin.prompt}`);
  });
}

export const PRE_TEST: readonly GeneratedProblem[] = preForm(PRE_SEED);
export const POST_TEST: readonly GeneratedProblem[] = postForm(POST_SEED, PRE_TEST);

/**
 * The one checker for both forms. Only a finished number counts: "-3", "x = -3", "-3 = x" or a
 * fraction in lowest terms. The question retyped ("(-3)*(-2)") or a sum left unworked ("-24/8")
 * doesn't, because the test measures whether the student can do the working.
 */
export function gradeTestAnswer(problem: GeneratedProblem, text: string): boolean {
  const t = text.replace(/[\u2212\u2013]/g, "-").replace(/\s+/g, "");
  const m = /^(?:[a-z]=)?(-?\d+(?:\.\d+)?|-?\d+\/\d+)(?:=[a-z])?$/i.exec(t);
  if (!m || /^[a-z]=.*=[a-z]$/i.test(t)) return false;
  const [n, d] = m[1]!.split("/").map(Number) as [number, number | undefined];
  if (d !== undefined && (d < 2 || gcd(Math.abs(n), d) !== 1)) return false;
  return near(d === undefined ? n : n / d, problem.answer);
}

export interface TestScore {
  correct: number;
  total: number;
  /** Per skill, in test order. Skill ids and counts only, never what the student typed. */
  bySkill: { skill_id: DemoNode; correct: number; total: number }[];
}

export function scoreTest(problems: readonly GeneratedProblem[], answers: readonly string[]): TestScore {
  const bySkill = TEST_ORDER.filter((node) => problems.some((p) => p.node === node)).map((skill_id) => ({
    skill_id,
    correct: 0,
    total: 0,
  }));
  problems.forEach((p, i) => {
    const row = bySkill.find((s) => s.skill_id === p.node)!;
    row.total += 1;
    if (gradeTestAnswer(p, answers[i] ?? "")) row.correct += 1;
  });
  return { correct: bySkill.reduce((n, s) => n + s.correct, 0), total: problems.length, bySkill };
}
