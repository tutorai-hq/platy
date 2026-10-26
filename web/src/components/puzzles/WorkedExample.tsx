import { type ReactNode, useRef, useState } from "react";
import { workedStage } from "../../content/progress";
import type { PuzzleMove, WorkedExamplePuzzle } from "../../content/types";
import { childMathToLatex } from "../../math/latex";
import { MathText, Tex } from "../../math/MathText";
import type { PuzzleState } from "../../session/state";
import { useIntoView } from "../intoView";
import { LineEntry } from "./LineEntry";

interface Props {
  state: PuzzleState & { puzzle: WorkedExamplePuzzle };
  onMove: (move: PuzzleMove, echo?: string) => void;
  actions: ReactNode;
}

// A solved problem the primer fades as mastery grows (R-37). Shown steps carry the move that
// made them; blank ones are the student's to write, in order. When every step is shown, it
// asks why the first one works (R-03).
export function WorkedExample({ state, onMove, actions }: Props) {
  const { puzzle, outcomes } = state;
  const stage = workedStage(puzzle, outcomes);
  const busy = state.pending !== null;
  // A fully shown solution appears a step at a time, so each line is read before the next.
  const watching = puzzle.steps.every((step) => step !== null);
  const [seen, setSeen] = useState(watching ? 1 : puzzle.steps.length);
  const [written, setWritten] = useState<string[]>([]);
  const [picked, setPicked] = useState<number | null>(null);
  const writing = stage === "first_step" ? 0 : stage === "final_answer" ? 1 : null;
  const passed = (i: number) => outcomes[i === 0 ? "first_step" : "final_answer"] === "correct";
  const askWhy = puzzle.why !== null && seen === puzzle.steps.length;

  const write = (i: number) => (text: string) => {
    setWritten((lines) => {
      const next = [...lines];
      next[i] = text;
      return next;
    });
    onMove(i === 0 ? { check: "first_step", text } : { check: "final_answer", text }, text);
  };

  // The choices appear under the pinned hint button; bring them into view (R-27).
  const choices = useRef<HTMLDivElement>(null);
  useIntoView(choices, askWhy);

  return (
    <>
      <div className="problem__prompt">
        <Tex latex={puzzle.equation} display />
      </div>
      <ol className="steps" aria-label="The solution">
        {puzzle.steps.slice(0, seen).map((step, i) => (
          <li key={i}>
            {step ? (
              <div className="step step--worked">
                <span className="step__n">{i + 1}</span>
                <Tex latex={step.latex} />
                <span className="step__reason">
                  <MathText text={step.reason} />
                </span>
              </div>
            ) : passed(i) ? (
              <div className="step step--fixed">
                <span className="step__n">{i + 1}</span>
                <Tex latex={childMathToLatex(written[i] ?? "")} />
                <span className="step__tag">your line</span>
              </div>
            ) : (
              <div className="step step--gap">
                <span className="step__n">{i + 1}</span>
                <span className="step__blank">{i === writing ? "your turn" : ""}</span>
              </div>
            )}
          </li>
        ))}
      </ol>

      {!askWhy && stage === "why" && (
        <div className="problem__actions dock-bottom">
          <button type="button" className="btn btn--primary" onClick={() => setSeen(seen + 1)}>
            Next step
          </button>
        </div>
      )}
      {askWhy && puzzle.why && (
        <>
          <p className="puzzle__ask" id="why-ask">
            <MathText text={puzzle.why.question} />
          </p>
          <div className="choices" role="group" aria-labelledby="why-ask" ref={choices}>
            {puzzle.why.choices.map((choice, k) => (
              <button
                key={k}
                type="button"
                // The choices replace the Next step button the student just tapped.
                autoFocus={k === 0}
                className={`choice${picked === k ? (stage === "done" ? " choice--right" : " choice--picked") : ""}`}
                aria-pressed={picked === k}
                disabled={stage === "done"}
                aria-disabled={busy || undefined}
                onClick={() => {
                  if (busy) return;
                  setPicked(k);
                  onMove({ check: "why", choice: k }, choice.replaceAll("$", ""));
                }}
              >
                <MathText text={choice} />
              </button>
            ))}
          </div>
          {stage === "why" && <div className="problem__actions dock-bottom">{actions}</div>}
        </>
      )}
      {stage === "first_step" && (
        <LineEntry
          id="first-step"
          prompt="Write line 1, the first step."
          placeholder="Line 1"
          button="Check my line"
          busy={busy}
          onSubmit={write(0)}
        >
          {actions}
        </LineEntry>
      )}
      {stage === "final_answer" && (
        <LineEntry
          id="last-step"
          prompt="Write the last line, with x on its own."
          placeholder="Your last line"
          button="Check my line"
          busy={busy}
          autoFocus={puzzle.steps[0] === null}
          onSubmit={write(1)}
        >
          {actions}
        </LineEntry>
      )}
      {stage === "done" && <div className="problem__actions dock-bottom">{actions}</div>}
    </>
  );
}
