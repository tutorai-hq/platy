import { childMathToLatex } from "../math/latex";
import { Tex } from "../math/MathText";
import type { Problem } from "../protocol";
import type { SetupState } from "../session/state";
import { problemLabel } from "./ProblemCard";

interface Props {
  problem: Problem;
  setup: SetupState;
  onSetup: (problemId: string, text: string) => void;
  onHint: (problemId: string) => void;
}

/** Said on the card when a choice was turned down; the tutor's question about it is in the chat. */
const REJECTED = "Not that one. Platy's question about it is in the chat.";

// A story problem's first part (R-37): the story, then the equation that says the same thing.
// The browser grades nothing. The server's verdict marks a wrong choice where it is, and its
// hint is about the story, never the equation (R-02). Once the setup is right the problem comes
// again with its equation, and the StepSolver takes over with the story kept above the lines.
export function StoryCard({ problem, setup, onSetup, onHint }: Props) {
  const story = problem.story ?? { text: "", choices: [] };
  const busy = setup.pending !== null;
  const turnedDown = setup.rejected.length > 0 && !busy;
  return (
    <section className="card problem story" aria-labelledby="problem-heading">
      <p className="problem__count">{problemLabel(problem)}</p>
      <p className="story__text">{story.text}</p>
      <h2 id="problem-heading" className="problem__instruction">
        {problem.instruction}
      </h2>

      <div className="story__choices" role="group" aria-labelledby="problem-heading">
        {story.choices.map((choice) => {
          const rejected = setup.rejected.includes(choice);
          const pending = setup.pending === choice;
          return (
            <button
              key={choice}
              type="button"
              className={`story__choice${rejected ? " story__choice--rejected" : ""}${pending ? " story__choice--pending" : ""}`}
              aria-disabled={busy || undefined}
              aria-describedby={rejected ? "story-why" : undefined}
              onClick={() => {
                if (!busy) onSetup(problem.problem_id, choice);
              }}
            >
              <Tex latex={childMathToLatex(choice)} />
              <span className="story__mark" aria-hidden="true">
                {pending ? "…" : rejected ? "?" : ""}
              </span>
            </button>
          );
        })}
      </div>

      {/* The mark's words, announced when they appear; the hint itself is the tutor's (R-02). */}
      <p id="story-why" className="story__why" role="status">
        {turnedDown ? REJECTED : ""}
      </p>

      <div className="problem__actions dock-bottom">
        <button type="button" className="btn btn--quiet" onClick={() => onHint(problem.problem_id)}>
          I need a hint
        </button>
      </div>
    </section>
  );
}
