import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Problem } from "../protocol";
import type { SetupState } from "../session/state";
import { StepSolver } from "./StepSolver";
import { StoryCard } from "./StoryCard";

// R-37: a story problem's card shows the story and the equations to choose from, marks what the
// server turned down, and never grades anything itself.

const problem: Problem = {
  problem_id: "st1", skill_id: "two_step_equations", prompt: "", instruction: "Which equation says the same as the story?",
  format: "story", kind: "practice", position: 2, total: 6,
  story: {
    text: "The Harbor Puffins have 7 points so far this season. They win 3 points a game. How many more games until they have 28 points?",
    choices: ["3x + 7 = 28", "3x - 7 = 28", "7x + 3 = 28"],
  },
};
const render = (setup: SetupState) => renderToStaticMarkup(createElement(StoryCard, { problem, setup, onSetup: () => {}, onHint: () => {} }));
const choices = (html: string) => html.match(/class="story__choice(?: [^"]*)?"/g) ?? [];

describe("story card (R-37)", () => {
  it("shows the story, the question and three equations to tap, with no equation as the problem", () => {
    const html = render({ problem_id: "st1", pending: null, rejected: [] });
    expect(html).toContain("Harbor Puffins");
    expect(html).toContain("Problem 2 of 6");
    expect(html).toContain("Which equation says the same as the story?");
    expect(choices(html)).toHaveLength(3);
    expect(html).toContain("katex");
    expect(html).toContain("I need a hint");
    expect(html).not.toContain("ladder");
    expect(html).not.toContain("Not that one.");
  });

  it("marks a turned-down equation where it is, with the words once, and waits on the one that's out", () => {
    const html = render({ problem_id: "st1", pending: null, rejected: ["3x - 7 = 28"] });
    expect(html.match(/story__choice--rejected/g)).toHaveLength(1);
    expect(html.match(/Not that one\./g)).toHaveLength(1);
    const busy = render({ problem_id: "st1", pending: "3x + 7 = 28", rejected: ["3x - 7 = 28"] });
    expect(busy.match(/aria-disabled="true"/g)).toHaveLength(3);
    expect(busy.match(/story__choice--pending/g)).toHaveLength(1);
    expect(busy).not.toContain("Not that one.");
  });

  it("keeps the story above the lines once the equation is chosen", () => {
    const html = renderToStaticMarkup(
      createElement(StepSolver, {
        problem: { ...problem, prompt: "3x + 7 = 28", instruction: "Solve it one line at a time" },
        steps: { problem_id: "st1", lines: [], pending: null, marked: null, solved: false },
        onStep: () => {}, onHint: () => {}, nextUp: null, onNext: () => {}, story: problem.story!.text,
      }),
    );
    expect(html).toContain("story__text--quiet");
    expect(html).toContain("Harbor Puffins");
    expect(html).toContain("ladder");
    expect(html).toContain("Solve it one line at a time");
  });
});
