import { parseMathStrict } from "../math/parse";
import type { Problem } from "../protocol";
import type { AnswerFeedback } from "../session/state";

/**
 * The answer box's placeholder (R-18): the server's example of the form the answer takes ("b = 4",
 * or "x = 3, x = -3" when there are two), so a `b` problem doesn't say "like x = 4" and a
 * two-root problem says both go in one box. The example is never the answer itself.
 */
export function answerPlaceholder(problem: Pick<Problem, "answer_example">): string {
  return problem.answer_example ? `Your answer, like ${problem.answer_example}` : "Your answer";
}

/** Check waits until "Platy reads" can show all of it: nothing dropped, no box left to fill. */
export function canCheck(text: string): boolean {
  if (!text.trim()) return false;
  const node = parseMathStrict(text);
  return node !== null && !JSON.stringify(node).includes('"missing"');
}

/**
 * After these verdicts the box's text is selected, so typing replaces it. "Part of the way there"
 * keeps the caret: the student adds to what they wrote.
 */
export function selectsAfter(feedback: AnswerFeedback): boolean {
  return feedback === "incorrect" || feedback === "unreadable";
}
