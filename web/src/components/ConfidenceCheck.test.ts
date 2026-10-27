import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { calibrationLine, choiceText, LEVELS, levelText, REASON_CODES, STEP_CODES, WORDS } from "../content/confidence";
import table from "../content/confidence.json";
import type { Problem } from "../protocol";
import type { ConfidenceCheck as Check } from "../session/state";
import { ConfidenceCheck } from "./ConfidenceCheck";
import { ProblemCard } from "./ProblemCard";
import { StepSolver } from "./StepSolver";

// R-30: the metacognition beat, on the card where the answer was. Every word on it comes from
// content/confidence.json; the server's codes pick them, and a code that isn't there shows nothing.

const unescape = (html: string) => html.replace(/&#x27;/g, "'");
const render = (check: Check) => unescape(renderToStaticMarkup(createElement(ConfidenceCheck, { check, busy: false, onAnswer: () => {} })));
const howSure: Check = { problem_id: "g1", kind: "how_sure", choices: [...REASON_CODES] };
const keyStep: Check = { problem_id: "s2", kind: "key_step", choices: [...STEP_CODES] };
const buttons = (html: string) => [...html.matchAll(/<button[^>]*>([^<]*)<\/button>/g)].map((m) => m[1]);
const problem: Problem = {
  problem_id: "g1", skill_id: "two_step_equations", prompt: "4x + 3 = 19", instruction: "Solve for x", format: "answer",
  kind: "practice", position: 1, total: 2,
};

describe("the confidence check (R-30)", () => {
  it("asks how sure with three equal taps, and no reasons until one is chosen", () => {
    const html = render(howSure);
    expect(html).toContain(WORDS.how_sure.ask);
    expect(buttons(html)).toEqual(["Guessing", "Fairly sure", "Certain"]);
    expect(buttons(html)).toEqual(LEVELS.map(levelText));
    expect(html.match(/role="radio"/g)).toHaveLength(3);
    expect(html).not.toContain('aria-checked="true"');
    expect(html).not.toContain("disabled");
    expect(html).not.toContain(WORDS.how_sure.why);
    for (const code of REASON_CODES) expect(html).not.toContain(choiceText("how_sure", code)!);
  });

  it("never says whether the answer was right (R-02)", () => {
    for (const html of [render(howSure), render(keyStep)]) expect(html).not.toMatch(/\b(right|wrong|correct|yes)\b/i);
  });

  it("asks for the key step from the server's codes, in the table's words, with a way to pass", () => {
    const html = render(keyStep);
    expect(html).toContain(WORDS.key_step.ask);
    expect(buttons(html)).toEqual([...STEP_CODES.map((c) => choiceText("key_step", c)), WORDS.key_step.skip]);
    expect(html).not.toContain(WORDS.how_sure.ask);
  });

  it("shows nothing for a code it doesn't know, and keeps step codes and reason codes apart", () => {
    const html = render({ ...keyStep, choices: ["undo_first", "canary_code", "check_back"] });
    expect(buttons(html)).toEqual([choiceText("key_step", "undo_first"), choiceText("key_step", "check_back"), WORDS.key_step.skip]);
    expect(html).not.toContain("canary");
    expect(choiceText("how_sure", "canary_code")).toBeNull();
    expect(choiceText("key_step", "checked_back")).toBeNull();
    expect(choiceText("how_sure", "undo_first")).toBeNull();
  });

  it("has a map line for every level and either verdict, each naming the level they said", () => {
    for (const level of LEVELS) {
      for (const right of [true, false]) {
        const line = calibrationLine(level, right);
        expect(line).toBe(table.calibration[right ? "right" : "wrong"][String(level) as "1" | "2" | "3"]);
        expect(line.toLowerCase()).toContain(levelText(level).toLowerCase());
      }
    }
  });

  it("takes the place of the answer buttons on the card, and locks the box", () => {
    const card = (confidence: Check | null) =>
      renderToStaticMarkup(
        createElement(ProblemCard, { problem, feedback: null, onAnswer: () => {}, onHint: () => {}, nextUp: null, onNext: () => {}, confidence, onConfidence: () => {} }),
      );
    const html = card(howSure);
    expect(html).toContain(WORDS.how_sure.ask);
    expect(html).not.toContain("Check my answer");
    expect(html).toMatch(/<input[^>]*disabled/);
    // A check about another problem isn't this card's.
    expect(card({ ...howSure, problem_id: "other" })).toContain("Check my answer");
  });

  it("takes the place of the line box on a step-by-step card, with the last line waiting unmarked", () => {
    const steps = { problem_id: "g1", lines: ["4x = 16"], pending: "x = 4", marked: null, solved: false };
    const solver = (confidence: Check | null) =>
      renderToStaticMarkup(
        createElement(StepSolver, {
          problem: { ...problem, format: "steps" }, steps, onStep: () => {}, onHint: () => {}, nextUp: null, onNext: () => {}, confidence, onConfidence: () => {},
        }),
      );
    const html = solver(howSure);
    expect(html).toContain(WORDS.how_sure.ask);
    expect(html).toContain('aria-label="Your line"');
    expect(html).not.toContain("…");
    expect(html).not.toMatch(/<input/);
    expect(solver(null)).toContain('aria-label="Checking this line"');
  });
});
