import { useEffect, useState } from "react";
import { childMathToLatex } from "../math/latex";
import { Tex } from "../math/MathText";
import type { Level } from "../content/confidence";
import type { Problem } from "../protocol";
import type { AnswerFeedback, ConfidenceCheck as Check } from "../session/state";
import { ConfidenceCheck } from "./ConfidenceCheck";
import { MathInput } from "./MathInput";
import { Mascot } from "./Mascot";
import { NextUp } from "./NextUp";
import { answerPlaceholder, canCheck, selectsAfter } from "./answer";

const FEEDBACK: Record<Exclude<AnswerFeedback, null>, { text: string; tone: string }> = {
  correct: { text: "That's right!", tone: "good" },
  partial: { text: "Part of the way there.", tone: "warm" },
  incorrect: { text: "Not yet. Keep going.", tone: "warm" },
  unreadable: { text: "Platy couldn't read that one.", tone: "warm" },
};

// A quick check (R-01) has no second try: its answer tells Platy where to start, so a miss says
// that instead of "keep going".
const PROBE_FEEDBACK: Partial<typeof FEEDBACK> = {
  incorrect: { text: "Not this one. That tells Platy where to start.", tone: "warm" },
};

/** What the card's top line calls this problem. */
export function problemLabel(problem: Pick<Problem, "kind" | "position" | "total">): string {
  if (problem.kind === "probe") return "Quick check";
  if (problem.kind === "warmup" || problem.position === 0) return "Warm-up";
  return `Problem ${problem.position} of ${problem.total}`;
}

interface Props {
  problem: Problem | null;
  feedback: AnswerFeedback;
  onAnswer: (problemId: string, text: string) => void;
  onHint: (problemId: string) => void;
  /** The new-page note (R-17), shown while there's no problem on the card. */
  note?: string | null;
  /** The label of the button to what's next, while the server waits for the student. */
  nextUp: string | null;
  onNext: () => void;
  /** The confidence check on this card (R-30): it takes the place of the answer buttons. */
  confidence?: Check | null;
  onConfidence?: (problemId: string, level: Level | null, reason: string | null) => void;
}

export function ProblemCard({ problem, feedback, onAnswer, onHint, note, nextUp, onNext, confidence = null, onConfidence }: Props) {
  const [draft, setDraft] = useState("");
  const [showFeedback, setShowFeedback] = useState(false);
  const [select, setSelect] = useState(0);
  const problemId = problem?.problem_id;

  useEffect(() => {
    setDraft("");
    setShowFeedback(false);
  }, [problemId]);

  useEffect(() => {
    if (feedback) setShowFeedback(true);
    // A wrong answer is selected, so the next try replaces it rather than adding to it (R-18).
    if (selectsAfter(feedback)) setSelect((n) => n + 1);
  }, [feedback]);

  if (!problem) {
    return (
      // One place for the new-page moment, with one mascot (R-17).
      <section className="card problem problem--waiting" aria-label="Problem">
        <Mascot size={72} mood={note ? "happy" : "calm"} />
        <p role="status">{note ?? "Your next problem is on its way."}</p>
      </section>
    );
  }

  const solved = feedback === "correct";
  const check = confidence?.problem_id === problem.problem_id ? confidence : null;
  const locked = solved || nextUp !== null || check !== null;
  const submit = () => {
    if (!canCheck(draft) || locked) return;
    onAnswer(problem.problem_id, draft.trim());
  };
  const fb = showFeedback && feedback ? ((problem.kind === "probe" && PROBE_FEEDBACK[feedback]) || FEEDBACK[feedback]) : null;

  return (
    <section className={`card problem${solved ? " problem--solved" : ""}`} aria-labelledby="problem-heading">
      <p className="problem__count">{problemLabel(problem)}</p>
      <h2 id="problem-heading" className="problem__instruction">
        {problem.instruction}
      </h2>
      <div className="problem__prompt">
        <Tex latex={problem.prompt} display />
      </div>

      <MathInput
        key={problem.problem_id}
        id="answer"
        label="Your answer"
        value={draft}
        placeholder={answerPlaceholder(problem)}
        disabled={locked}
        autoFocus="laptop"
        intoView
        select={select}
        onChange={(v) => {
          setDraft(v);
          setShowFeedback(false);
        }}
        onSubmit={submit}
      />

      {/* The verdict sits above the way on, so it's read first and stays until the student moves. */}
      <p className={`problem__feedback${fb ? ` problem__feedback--${fb.tone}` : ""}`} role="status">
        {fb?.text ?? ""}
        {/* A right answer is confirmed in the student's own words before anything moves on (R-17). */}
        {solved && fb && draft.trim() && (
          <>
            {" "}
            <Tex latex={childMathToLatex(draft.trim())} /> <span aria-hidden="true">✓</span>
          </>
        )}
      </p>

      {check !== null ? (
        // The beat comes before the verdict (R-30), so nothing here says yet whether it's right.
        <ConfidenceCheck key={check.kind} check={check} busy={false} onAnswer={(level, reason) => onConfidence?.(problem.problem_id, level, reason)} />
      ) : nextUp !== null ? (
        <NextUp label={nextUp} onNext={onNext} />
      ) : (
        <div className="problem__actions dock-bottom">
          <button type="button" className="btn btn--primary" onClick={submit} disabled={solved || !canCheck(draft)}>
            Check my answer
          </button>
          <button type="button" className="btn btn--quiet" onClick={() => onHint(problem.problem_id)} disabled={solved}>
            I need a hint
          </button>
        </div>
      )}
    </section>
  );
}
