import katex from "katex";
import { useLayoutEffect, useMemo, useRef } from "react";
import { slipHint } from "../content/slips";
import { Tex } from "../math/MathText";
import { childMathToLatex } from "../math/latex";
import { type Equation, equationTerms, planStep, type Side, type TermRef, termLatex } from "../math/terms";
import type { Level } from "../content/confidence";
import type { Problem } from "../protocol";
import type { ConfidenceCheck as Check, StepsState } from "../session/state";
import { ConfidenceCheck } from "./ConfidenceCheck";
import { Mascot } from "./Mascot";
import { NextUp } from "./NextUp";
import { problemLabel } from "./ProblemCard";
import { LineEntry } from "./puzzles/LineEntry";

interface Props {
  problem: Problem;
  steps: StepsState;
  onStep: (problemId: string, line: number, text: string) => void;
  onHint: (problemId: string) => void;
  /** The label of the button to what's next, while the server waits for the student. */
  nextUp: string | null;
  onNext: () => void;
  /** The confidence check on this card (R-30): it takes the place of the line box. */
  confidence?: Check | null;
  onConfidence?: (problemId: string, level: Level | null, reason: string | null) => void;
  /** A story problem's words (R-37), kept in view while its equation is solved. */
  story?: string | null;
}

const MARKS = {
  invalid: "This line doesn't follow from the one above. Find the slip and fix it.",
  unreadable: "Platy couldn't read this one. Write it as an equation with x.",
};
/** On an expression to work out, a line is numbers and operations, not an equation. */
const MARK_UNREADABLE_VALUE = "Platy couldn't read this one. Write it with numbers and signs.";
/** While a detour waits for the tap, the line is marked but not to be fixed yet (R-01). */
const MARK_BEFORE_DETOUR = "This line doesn't follow from the one above.";

// Motion (R-48): when a line is accepted, it's built from the line above. Terms that stay
// slide down into place, a term that crosses the equals sign flies over and flips its sign,
// and terms that were worked out fade together. Under 600 ms, and only a quick fade with
// prefers-reduced-motion. The math is the server's verdict; this only draws it.
const SLIDE_MS = 420;
const ARRIVE_DELAY_MS = 260;
const ARRIVE_MS = 260;
const GHOST_MS = 480;
const EASE = "cubic-bezier(0.2, 0.7, 0.2, 1)";

// Step-by-step solving (R-48): the student writes one line at a time under the problem. Each
// line is checked before the next one opens, and a wrong line is marked where it is.
export function StepSolver({ problem, steps, onStep, onHint, nextUp, onNext, confidence = null, onConfidence, story = null }: Props) {
  const rows = [problem.prompt, ...steps.lines];
  const check = confidence?.problem_id === problem.problem_id ? confidence : null;
  const card = useRef<HTMLElement>(null);
  const shown = useRef(rows.length);

  useLayoutEffect(() => {
    const added = rows.length - shown.current;
    shown.current = rows.length;
    if (added !== 1 || !card.current) return;
    animateLine(card.current, rows.length - 1, rows[rows.length - 2]!, rows[rows.length - 1]!);
  });

  const solved = steps.solved;
  const busy = steps.pending !== null;
  const next = steps.lines.length + 1;
  const marked = steps.marked;
  const hint = marked?.slip ? slipHint(marked.slip) : null;
  // An equation is solved in steps with x; an expression (no equals sign) is worked out.
  const solving = problem.prompt.includes("=");

  return (
    <section
      ref={card}
      className={`card problem stepsolver${solved ? " problem--solved" : ""}`}
      aria-labelledby="problem-heading"
    >
      <p className="problem__count">{problemLabel(problem)}</p>
      {story !== null && <p className="story__text story__text--quiet">{story}</p>}
      <h2 id="problem-heading" className="problem__instruction">
        {problem.instruction}
      </h2>

      <ol className="ladder" aria-label="Your solution so far">
        {rows.map((text, i) => (
          <Row key={i} index={i} text={text} last={solved && i === rows.length - 1} />
        ))}
        {(marked || busy) && (
          // While the confidence check waits, the line waits with it, unmarked: the verdict comes after (R-30).
          <li className={`ladder__row ladder__row--${busy ? "pending" : "marked"}`} aria-label={busy ? (check ? "Your line" : "Checking this line") : "Line to fix"}>
            <LineMath text={busy ? steps.pending! : marked!.text} />
            <span className="ladder__mark" aria-hidden="true">
              {busy ? (check ? "" : "…") : "?"}
            </span>
          </li>
        )}
      </ol>

      {/* The mark's words sit with the line, and are announced when they appear. */}
      <div className="ladder__why" role="status">
        {/* A known slip names the mistake on its line, never the fix (R-40, R-02). */}
        {marked && !busy && (
          hint ? <p className="ladder__slip">{hint}</p>
          : <p>{nextUp !== null && marked.result === "invalid" ? MARK_BEFORE_DETOUR : marked.result === "unreadable" && !solving ? MARK_UNREADABLE_VALUE : MARKS[marked.result]}</p>
        )}
      </div>

      {/* A marked line stays on screen, with its words, until the student taps on (R-01). */}
      {solved && (
        <div className="stepsolver__done">
          <Mascot size={56} mood="happy" />
          <p>Every line checks out.</p>
        </div>
      )}
      {check !== null ? (
        <ConfidenceCheck key={check.kind} check={check} busy={false} onAnswer={(level, reason) => onConfidence?.(problem.problem_id, level, reason)} />
      ) : nextUp !== null ? (
        <NextUp label={nextUp} onNext={onNext} />
      ) : solved ? null : (
        <LineEntry
          key={next}
          id="step"
          prompt={next === 1 ? "Write your first step" : "Write your next line"}
          placeholder={solving ? "One step, as an equation" : "One step of the working"}
          button="Check this line"
          busy={busy}
          autoFocus={next > 1 || "laptop"}
          onSubmit={(text) => onStep(problem.problem_id, next, text)}
        >
          <button type="button" className="btn btn--quiet" onClick={() => onHint(problem.problem_id)}>
            I need a hint
          </button>
        </LineEntry>
      )}
    </section>
  );
}

function Row({ index, text, last }: { index: number; text: string; last: boolean }) {
  return (
    <li className={`ladder__row${index === 0 ? " ladder__row--problem" : ""}${last ? " ladder__row--solved" : ""}`} data-row={index}>
      <LineMath text={text} />
      <span className="ladder__mark" aria-hidden="true">
        {index > 0 ? "✓" : ""}
      </span>
    </li>
  );
}

/** A line aligned on its equals sign, one span per term so the motion can find each one. */
function LineMath({ text }: { text: string }) {
  // Streamed chat replies re-render the card many times a second; parse each line once.
  const eq = useMemo(() => equationTerms(text), [text]);
  if (!eq) {
    return (
      <span className="ladder__whole">
        <Tex latex={childMathToLatex(text)} />
      </span>
    );
  }
  return (
    <>
      <SideTerms eq={eq} side="left" />
      <span className="ladder__eq" data-eq>
        <Tex latex="=" />
      </span>
      <SideTerms eq={eq} side="right" />
    </>
  );
}

function SideTerms({ eq, side }: { eq: Equation; side: Side }) {
  return (
    <span className={`ladder__side ladder__side--${side}`} data-side={side}>
      {eq[side].map((t, i) => (
        <span key={i} className="ladder__term" data-term={`${side}:${i}`}>
          {/* The sign between terms is its own piece, so it gets the space a binary + or − has. */}
          {i > 0 && <Tex className="ladder__op" latex={t.sign < 0 ? "-" : "+"} />}
          <Tex latex={i === 0 ? termLatex(t, true) : t.body} />
        </span>
      ))}
    </span>
  );
}

function animateLine(root: HTMLElement, rowIndex: number, prevText: string, nextText: string): void {
  const row = root.querySelector<HTMLElement>(`[data-row="${rowIndex}"]`);
  const above = root.querySelector<HTMLElement>(`[data-row="${rowIndex - 1}"]`);
  if (!row || !above || typeof row.animate !== "function") return;

  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
    row.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 150 });
    return;
  }

  const prev = equationTerms(prevText);
  const next = equationTerms(nextText);
  if (!prev || !next) {
    row.animate([{ opacity: 0, transform: "translateY(-8px)" }, { opacity: 1, transform: "none" }], { duration: ARRIVE_MS, easing: EASE });
    return;
  }
  const plan = planStep(prev, next);
  const term = (el: HTMLElement, ref: TermRef) => el.querySelector<HTMLElement>(`[data-term="${ref.side}:${ref.index}"]`);

  // Kept terms and the equals sign slide down from where they were in the line above.
  const slide = (to: HTMLElement | null, from: HTMLElement | null) => {
    if (!to || !from) return;
    const a = from.getBoundingClientRect();
    const b = to.getBoundingClientRect();
    to.animate([{ transform: `translate(${a.left - b.left}px, ${a.top - b.top}px)` }, { transform: "none" }], {
      duration: SLIDE_MS,
      easing: EASE,
    });
  };
  const keptHere = new Set<string>();
  for (const k of plan.kept) {
    slide(term(row, k.to), term(above, k.from));
    keptHere.add(`${k.to.side}:${k.to.index}`);
  }
  slide(row.querySelector<HTMLElement>("[data-eq]"), above.querySelector<HTMLElement>("[data-eq]"));

  // New terms (worked-out values, a move written out) arrive once the others have moved.
  const motion = plan.motion;
  const dropIn = new Set(motion.kind === "write" ? motion.added.map((r) => `${r.side}:${r.index}`) : []);
  for (const el of row.querySelectorAll<HTMLElement>("[data-term]")) {
    const id = el.dataset.term!;
    if (keptHere.has(id)) continue;
    const from = dropIn.has(id) ? "translateY(-10px) scale(0.7)" : "translateY(4px)";
    el.animate([{ opacity: 0, transform: from }, { opacity: 1, transform: "none" }], {
      duration: ARRIVE_MS,
      delay: dropIn.has(id) ? 120 : ARRIVE_DELAY_MS,
      easing: EASE,
      fill: "backwards",
    });
  }

  if (motion.kind === "combine") {
    // The worked-out terms of the line above dim together, then come back as history.
    for (const ref of motion.gone) {
      term(above, ref)?.animate([{ opacity: 1 }, { opacity: 0.25, offset: 0.5 }, { opacity: 1 }], { duration: 560, easing: "ease-in-out" });
    }
  }

  if (motion.kind === "move" || motion.kind === "scale") {
    const source = term(above, motion.source);
    // It lands beside the far side's outermost term, where it gets worked into the new value.
    const far = row.querySelectorAll<HTMLElement>(`[data-term^="${motion.to}:"]`);
    const target = (motion.to === "right" ? far[far.length - 1] : far[0]) ?? null;
    if (!source || !target) return;
    source.animate([{ color: "var(--river)" }, { color: "var(--river)", offset: 0.6 }, { color: "inherit" }], { duration: GHOST_MS });
    flyGhost(root, source, target, motion.to, motion.before, motion.after);
  }
}

/** A copy of the moving term that flies across the equals sign, flipping on the way. */
function flyGhost(root: HTMLElement, source: HTMLElement, target: HTMLElement, to: Side, before: string, after: string): void {
  const box = root.getBoundingClientRect();
  const a = source.getBoundingClientRect();
  const b = target.getBoundingClientRect();
  const ghost = document.createElement("span");
  ghost.className = "ladder__ghost";
  ghost.setAttribute("aria-hidden", "true");
  for (const [latex, cls] of [[before, "before"], [after, "after"]] as const) {
    const part = document.createElement("span");
    part.className = `ladder__ghost-${cls}`;
    // Same KaTeX settings as <Tex>: trust stays false.
    part.innerHTML = katex.renderToString(latex, { throwOnError: false, strict: "ignore" });
    ghost.append(part);
  }
  root.append(ghost);
  // The card scrolls on a phone; the ghost lives in its content, so count the scroll in.
  const startX = a.left - box.left + root.scrollLeft;
  const startY = a.top - box.top + root.scrollTop;
  const w = ghost.getBoundingClientRect().width;
  const endX = (to === "right" ? b.right - box.left + 6 : b.left - box.left - w - 6) + root.scrollLeft;
  const endY = b.top - box.top + root.scrollTop;
  const lift = Math.min(startY, endY) - 18;
  const move = ghost.animate(
    [
      { transform: `translate(${startX}px, ${startY}px)`, opacity: 1 },
      { transform: `translate(${(startX + endX) / 2}px, ${lift}px)`, opacity: 1, offset: 0.45 },
      { transform: `translate(${endX}px, ${endY}px)`, opacity: 1, offset: 0.8 },
      { transform: `translate(${endX}px, ${endY}px)`, opacity: 0 },
    ],
    { duration: GHOST_MS, easing: "ease-in-out" },
  );
  const flip = { duration: GHOST_MS, easing: "linear" } as const;
  ghost.firstElementChild?.animate([{ opacity: 1 }, { opacity: 1, offset: 0.35 }, { opacity: 0, offset: 0.55 }, { opacity: 0 }], flip);
  ghost.lastElementChild?.animate([{ opacity: 0 }, { opacity: 0, offset: 0.35 }, { opacity: 1, offset: 0.55 }, { opacity: 1 }], flip);
  const done = () => ghost.remove();
  move.onfinish = done;
  move.oncancel = done;
}
