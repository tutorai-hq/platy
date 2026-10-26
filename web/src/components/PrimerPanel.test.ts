import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PRIMER_CODES, primerText } from "../content/primer";
import type { ServerEvent } from "../protocol";
import { initialState, reducer, type SessionState } from "../session/state";
import { PrimerPanel } from "./PrimerPanel";

// R-42: the demo primer view shows the primer's codes and numbers, in words from a fixed table,
// and never the session's chat or the student's input.

const run = (events: ServerEvent[], s: SessionState = reducer(initialState, { type: "started" })) =>
  events.reduce((acc, event) => reducer(acc, { type: "server", event }), s);

const probe: ServerEvent = {
  type: "primer_state",
  mastery: [
    { skill_id: "two_step_equations", p: 0.31 },
    { skill_id: "one_step_equations", p: 0.42 },
  ],
  hypothesis: { code: "suspects_gap", skill_id: "inverse_operations" },
  move: { code: "probe", reason: "probe_deeper", skill_id: "inverse_operations" },
};

const render = (s: SessionState) => renderToStaticMarkup(createElement(PrimerPanel, { primer: s.primer }));

describe("PrimerPanel (R-42)", () => {
  it("shows mastery per skill, the hypothesis and the reason for the latest move", () => {
    const html = render(run([probe]));
    expect(html).toContain("Two-step equations");
    expect(html).toContain("31%");
    expect(html).toContain("Suspects a gap in inverse operations. Probing.");
    expect(html).toContain("Missed that too. Checking one level deeper: inverse operations.");
    expect(html).toContain("Probe");
  });

  it("never renders the chat, the student's lines or answers", () => {
    let s = reducer(initialState, { type: "started" });
    s = reducer(s, { type: "child_said", id: "k1", text: "canary-chat my name is Sam" });
    s = run(
      [
        { type: "tutor_message", message_id: "t1", delta: "canary-tutor reply", done: true },
        { type: "problem", problem_id: "s1", skill_id: "two_step_equations", prompt: "2x + 5 = 17", instruction: "Solve", format: "steps", position: 1, total: 2 },
      ],
      s,
    );
    s = reducer(s, { type: "step_sent", text: "canary-line = 3" });
    s = run([{ type: "step_result", problem_id: "s1", line: 1, result: "invalid" }, probe], s);
    // The panel only ever gets the primer view, and it holds none of this.
    expect(JSON.stringify(s.primer)).not.toMatch(/canary|Sam|2x \+ 5/);
    expect(render(s)).not.toMatch(/canary|Sam|2x \+ 5|Solve/);
  });

  it("shows nothing for a code or skill it doesn't know, rather than the text it was sent", () => {
    const html = render(
      run([
        {
          type: "primer_state",
          mastery: [
            { skill_id: "canary skill name", p: 0.5 },
            { skill_id: "two_step_equations", p: 7 },
          ],
          hypothesis: { code: "canary hypothesis text", skill_id: "two_step_equations" },
          move: { code: "probe", reason: "canary reason text", skill_id: "two_step_equations" },
        },
      ]),
    );
    expect(html).not.toContain("canary");
    expect(html).toContain("100%"); // clamped
    expect(html).toContain("None yet.");
  });

  it("has words for every code, and every {skill} line fills in", () => {
    for (const code of PRIMER_CODES.moves) expect(primerText("moves", code, "two_step_equations")).toBeTruthy();
    for (const code of PRIMER_CODES.reasons) {
      expect(primerText("reasons", code, "inverse_operations"), code).toMatch(/^[A-Z].*\.$/);
      expect(primerText("reasons", code, "inverse_operations")).not.toContain("{");
    }
    for (const code of PRIMER_CODES.hypotheses) expect(primerText("hypotheses", code, "inverse_operations")).toMatch(/^[A-Z]/);
    expect(primerText("reasons", "path_start", "not_a_skill")).toBeNull();
    expect(primerText("reasons", "constructor", "two_step_equations")).toBeNull();
  });
});
