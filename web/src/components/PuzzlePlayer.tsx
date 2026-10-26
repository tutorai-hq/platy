import { type CSSProperties, useEffect, useRef, useState } from "react";
import { pansLatex } from "../content/balance";
import { PALETTE } from "../content/palette";
import type { PaletteId, PuzzleMove } from "../content/types";
import type { PuzzleState } from "../session/state";
import { BalanceScale } from "./puzzles/BalanceScale";
import { Emblem } from "./puzzles/Emblem";
import { MissingStep } from "./puzzles/MissingStep";
import "./puzzles/puzzles.css";
import { SpotTheError } from "./puzzles/SpotTheError";
import { chip, Swatches } from "./puzzles/Swatches";
import { WorkedExample } from "./puzzles/WorkedExample";

interface Props {
  state: PuzzleState;
  /** Keep going was tapped; the next problem is on its way. */
  moving: boolean;
  /** Called once the puzzle is solved, to move focus on from controls that are now gone. */
  onSolved: () => void;
  onMove: (instanceId: string, move: PuzzleMove, echo?: string) => void;
  onHint: (instanceId: string) => void;
  onNext: (instanceId: string) => void;
  onColors: (colors: PaletteId) => void;
}

// Shows a puzzle in place of the problem card (R-37) in the student's skin (R-38). It reports
// what the student did and shows the server's verdicts; it never decides "correct" itself.
export function PuzzlePlayer({ state, moving, onSolved, onMove, onHint, onNext, onColors }: Props) {
  const { puzzle, done, pending } = state;
  const id = puzzle.instance_id;
  const colors = PALETTE[puzzle.skin.colors];
  const [picking, setPicking] = useState(false);
  const style = { "--team": colors.primary, "--team-2": colors.secondary } as CSSProperties;
  const move = (m: PuzzleMove, echo?: string) => onMove(id, m, echo);
  const fb = feedback(state);
  const card = useRef<HTMLElement>(null);

  // Solving removes the control that had focus. Move on unless the child is already elsewhere.
  useEffect(() => {
    const at = document.activeElement;
    if (done && (at === document.body || card.current?.contains(at))) onSolved();
  }, [done, onSolved]);

  // Held, not disabled, while waiting, so a keyboard user's focus stays put.
  const actions = done ? (
    <button type="button" className="btn btn--primary" aria-disabled={moving || undefined} onClick={() => !moving && onNext(id)}>
      Keep going
    </button>
  ) : (
    <button
      type="button"
      className="btn btn--quiet"
      aria-disabled={pending !== null || undefined}
      onClick={() => pending === null && onHint(id)}
    >
      I need a hint
    </button>
  );

  return (
    <section
      ref={card}
      className={`card problem puzzle${done ? " problem--solved" : ""}`}
      style={style}
      aria-labelledby="puzzle-heading"
    >
      <div className="puzzle__team">
        <span className="puzzle__badge">
          <Emblem id={puzzle.skin.emblem} />
        </span>
        <span className="puzzle__name">{puzzle.skin.team_name}</span>
        <button
          type="button"
          className="puzzle__colors"
          aria-expanded={picking}
          onClick={() => setPicking(!picking)}
        >
          <span className="swatch__chip swatch__chip--small" style={chip(colors)} aria-hidden="true" />
          Colors
        </button>
      </div>
      {picking && (
        <Swatches value={puzzle.skin.colors} onPick={onColors} />
      )}

      <h2 id="puzzle-heading" className="problem__instruction">
        {puzzle.instructions}
      </h2>

      {state.puzzle.template === "spot_the_error" && (
        <SpotTheError state={{ ...state, puzzle: state.puzzle }} onMove={move} actions={actions} />
      )}
      {state.puzzle.template === "missing_step" && (
        <MissingStep state={{ ...state, puzzle: state.puzzle }} onMove={move} actions={actions} />
      )}
      {state.puzzle.template === "balance" && (
        <BalanceScale state={{ ...state, puzzle: state.puzzle }} onMove={move} actions={actions} />
      )}
      {state.puzzle.template === "worked_example" && (
        <WorkedExample state={{ ...state, puzzle: state.puzzle }} onMove={move} actions={actions} />
      )}

      <p className={`problem__feedback${fb ? ` problem__feedback--${fb.tone}` : ""}`} role="status">
        {fb?.text ?? ""}
      </p>
    </section>
  );
}

function feedback(p: PuzzleState): { text: string; tone: "good" | "warm" } | null {
  if (p.done) {
    if (p.explained) return { text: "Keep going when you're ready.", tone: "good" };
    // A worked example the student only read isn't something they solved.
    const well = p.puzzle.template === "worked_example" ? "Nice work!" : "Solved!";
    return { text: `${well} Answer Platy in the chat, or keep going.`, tone: "good" };
  }
  const last = p.last;
  if (!last) return null;
  if (last.outcome === "unreadable") return { text: "Platy couldn't read that one.", tone: "warm" };
  if (last.outcome === "incorrect") {
    return last.check === "move"
      ? { text: "That move doesn't work on both sides. Platy asked about it in the chat.", tone: "warm" }
      : { text: "Not yet. Platy asked you about it in the chat.", tone: "warm" };
  }
  // An accepted scale move says what the scale shows now, for anyone who can't see it.
  if (last.check === "move") return p.pans ? { text: `Now ${pansLatex(p.pans)}.`, tone: "good" } : null;
  return { text: "That's right!", tone: "good" };
}
