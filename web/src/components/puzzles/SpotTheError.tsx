import { type ReactNode, useState } from "react";
import { spotStage } from "../../content/progress";
import type { PuzzleMove, SpotTheErrorPuzzle } from "../../content/types";
import { childMathToLatex } from "../../math/latex";
import { Tex } from "../../math/MathText";
import type { PuzzleState } from "../../session/state";
import { LineEntry } from "./LineEntry";

interface Props {
  state: PuzzleState & { puzzle: SpotTheErrorPuzzle };
  onMove: (move: PuzzleMove, echo?: string) => void;
  actions: ReactNode;
}

// Tap the wrong line, rewrite it, then finish the problem from the rewritten line.
export function SpotTheError({ state, onMove, actions }: Props) {
  const { puzzle, outcomes } = state;
  const stage = spotStage(outcomes);
  // One move at a time, so what's shown is always the move the server graded.
  const busy = state.pending !== null;
  const [tapped, setTapped] = useState<number | null>(null);
  const [fixed, setFixed] = useState("");
  // An equation is finished with x; worked-out expression (the integer and order repairs) with its value.
  const solving = puzzle.equation.includes("=");

  return (
    <>
      <div className="problem__prompt">
        <Tex latex={puzzle.equation} display />
      </div>
      <ol className="steps" aria-label="The solution">
        {puzzle.lines.map((line, i) => {
          const wrong = tapped === i && stage !== "find";
          return (
            <li key={i}>
              <button
                type="button"
                className={`step${wrong ? " step--wrong" : tapped === i ? " step--tapped" : ""}`}
                disabled={stage !== "find"}
                aria-disabled={busy || undefined}
                aria-pressed={tapped === i}
                onClick={() => {
                  if (busy) return;
                  setTapped(i);
                  onMove({ check: "found_error", line: i }, `I think line ${i + 1} is wrong.`);
                }}
              >
                <span className="step__n">{i + 1}</span>
                <Tex latex={line} />
                {wrong && <span className="step__tag">wrong</span>}
              </button>
              {wrong && (stage === "finish" || stage === "done") && (
                <div className="step step--fixed">
                  <span className="step__n" aria-hidden="true">
                    ✓
                  </span>
                  <Tex latex={childMathToLatex(fixed)} />
                  <span className="step__tag">your fix</span>
                </div>
              )}
            </li>
          );
        })}
      </ol>

      {stage === "find" && (
        <>
          <p className="puzzle__ask">Tap the line that's wrong.</p>
          <div className="problem__actions dock-bottom">{actions}</div>
        </>
      )}
      {stage === "fix" && (
        <LineEntry
          id="fix"
          prompt={`What should line ${(tapped ?? 0) + 1} say?`}
          placeholder="The fixed line"
          button="Check my line"
          busy={busy}
          autoFocus
          onSubmit={(text) => {
            setFixed(text);
            onMove({ check: "fixed_step", text }, text);
          }}
        >
          {actions}
        </LineEntry>
      )}
      {stage === "finish" && (
        <LineEntry
          id="final"
          prompt={solving ? "Now finish it from your line. What's x?" : "Now finish it from your line. What does it come to?"}
          placeholder={solving ? "Your answer, like x = 4" : "Your answer"}
          button="Check my answer"
          busy={busy}
          autoFocus
          onSubmit={(text) => onMove({ check: "final_answer", text }, text)}
        >
          {actions}
        </LineEntry>
      )}
      {stage === "done" && <div className="problem__actions dock-bottom">{actions}</div>}
    </>
  );
}
