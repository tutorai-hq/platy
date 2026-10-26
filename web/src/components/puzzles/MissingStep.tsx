import { type ReactNode, useState } from "react";
import type { MissingStepPuzzle, PuzzleMove } from "../../content/types";
import { childMathToLatex } from "../../math/latex";
import { Tex } from "../../math/MathText";
import type { PuzzleState } from "../../session/state";
import { LineEntry } from "./LineEntry";

interface Props {
  state: PuzzleState & { puzzle: MissingStepPuzzle };
  onMove: (move: PuzzleMove, echo?: string) => void;
  actions: ReactNode;
}

// A solution with one line blanked out. The student writes the line for the gap.
export function MissingStep({ state, onMove, actions }: Props) {
  const { puzzle, done } = state;
  const [sent, setSent] = useState("");

  return (
    <>
      <div className="problem__prompt">
        <Tex latex={puzzle.equation} display />
      </div>
      <ol className="steps" aria-label="The solution">
        {puzzle.lines.map((line, i) => (
          <li key={i}>
            {line === null ? (
              <div className={`step ${done ? "step--fixed" : "step--gap"}`}>
                <span className="step__n">{i + 1}</span>
                {done ? <Tex latex={childMathToLatex(sent)} /> : <span className="step__blank">missing line</span>}
              </div>
            ) : (
              <div className="step">
                <span className="step__n">{i + 1}</span>
                <Tex latex={line} />
              </div>
            )}
          </li>
        ))}
      </ol>

      {done ? (
        <div className="problem__actions dock-bottom">{actions}</div>
      ) : (
        <LineEntry
          id="missing"
          prompt={`What goes in line ${puzzle.lines.indexOf(null) + 1}?`}
          placeholder="The missing line"
          button="Check my line"
          busy={state.pending !== null}
          onSubmit={(text) => {
            setSent(text);
            onMove({ check: "missing_line", text }, text);
          }}
        >
          {actions}
        </LineEntry>
      )}
    </>
  );
}
