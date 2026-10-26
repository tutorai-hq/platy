import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TutorLine } from "../session/tutorLine";
import { MathInput } from "./MathInput";

// Teen test 2026-10-26: on a phone the docked keypad covered the chat, and testers missed what
// Platy said (R-27).

const box = () => createElement(MathInput, { id: "a", label: "Your answer", value: "", onChange: () => {}, onSubmit: () => {} });

describe("math keypad dock (R-27)", () => {
  it("carries Platy's newest line above the keys, hidden from screen readers (the chat reads it)", () => {
    const html = renderToStaticMarkup(createElement(TutorLine.Provider, { value: "What do you do to both sides?" }, box()));
    expect(html).toMatch(/<div class="keypad-dock__tutor" aria-hidden="true">.*What do you do to both sides\?/);
    expect(html.indexOf("keypad-dock__tutor")).toBeLessThan(html.indexOf('class="keypad"'));
  });

  it("has no line to show outside a session", () => {
    expect(renderToStaticMarkup(box())).not.toContain("keypad-dock__tutor");
  });
});
