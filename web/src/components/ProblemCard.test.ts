import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Problem } from "../protocol";
import { Chat } from "./Chat";
import { ProblemCard, problemLabel } from "./ProblemCard";

// Teen test 2026-10-26: a quick check was labelled "Warm-up", and its verdict vanished before the
// student read it (R-01).

const problem = (kind: Problem["kind"], position = 0): Problem => ({
  problem_id: "q", skill_id: "one_step_equations", prompt: "x - 8 = -3", instruction: "Solve for x",
  format: "answer", kind, position, total: 5,
});

const render = (p: Problem, feedback: "incorrect" | null, nextUp: string | null) =>
  renderToStaticMarkup(createElement(ProblemCard, { problem: p, feedback, onAnswer: () => {}, onHint: () => {}, nextUp, onNext: () => {} }));

describe("problem card", () => {
  it("names a quick check, a warm-up and a lesson problem for what they are", () => {
    expect(problemLabel(problem("probe"))).toBe("Quick check");
    expect(problemLabel(problem("warmup"))).toBe("Warm-up");
    expect(problemLabel(problem("practice", 2))).toBe("Problem 2 of 5");
  });

  it("swaps the answer buttons for the way on while the server waits, and locks the box", () => {
    const html = render(problem("probe"), null, "Next quick check");
    expect(html).toContain("Next quick check");
    expect(html).not.toContain("Check my answer");
    expect(html).toMatch(/<input[^>]*disabled/);
    expect(render(problem("practice", 1), null, null)).toContain("Check my answer");
  });

  it("shows the new-page note once, on the card, with one mascot (R-17)", () => {
    const card = renderToStaticMarkup(
      createElement(ProblemCard, { problem: null, feedback: null, onAnswer: () => {}, onHint: () => {}, note: "Next one coming up.", nextUp: null, onNext: () => {} }),
    );
    expect(card).toContain("Next one coming up.");
    expect(card.match(/<svg/g)).toHaveLength(1);
    const chat = renderToStaticMarkup(
      createElement(Chat, { messages: [], resetNote: "Next one coming up.", disabled: false, hold: true, onSay: () => {} }),
    );
    expect(chat).not.toContain("Next one coming up.");
    expect(chat).not.toContain("<svg");
  });
});
