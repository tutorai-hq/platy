import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TestQuestion } from "../components/TestRunner";
import { DEMO_NODES, isOneOf, verifyProblem } from "./generate";
import { gradeTestAnswer, POST_TEST, PRE_TEST, scoreTest, TEST_LEVEL } from "./pretest";

// R-26: the learning-gain test (Michael, 2026-10-22). 10 questions on the 5 demo skills, two per
// skill, generated at level 2, with a different seed for the pre and post forms, so the items
// are related but not identical (A-10).

describe("pre and post test (R-26)", () => {
  it("has 10 questions on each form, two per demo skill, at level 2", () => {
    for (const form of [PRE_TEST, POST_TEST]) {
      expect(form).toHaveLength(10);
      for (const node of DEMO_NODES) expect(form.filter((q) => q.node === node), node).toHaveLength(2);
      for (const q of form) expect(q.level).toBe(TEST_LEVEL);
      expect(TEST_LEVEL).toBe(2);
    }
  });

  it("shares no problem between the forms, or within one", () => {
    const all = [...PRE_TEST, ...POST_TEST].map((q) => q.prompt);
    expect(new Set(all).size).toBe(all.length);
    for (const q of POST_TEST) expect(isOneOf(q.prompt, PRE_TEST.map((p) => p.prompt)), q.prompt).toBe(false);
  });

  it("asks the same kind of question in each slot, with new numbers of the same size", () => {
    const shape = (prompt: string) => prompt.replace(/\d/g, "#");
    PRE_TEST.forEach((pre, i) => {
      const post = POST_TEST[i]!;
      expect(post.node).toBe(pre.node);
      expect(shape(post.prompt), `${pre.prompt} / ${post.prompt}`).toBe(shape(pre.prompt));
    });
  });

  it("grades both forms with the same checker", () => {
    for (const q of [...PRE_TEST, ...POST_TEST]) {
      expect(verifyProblem(q), q.prompt).toBe(true);
      expect(gradeTestAnswer(q, q.answerText), q.prompt).toBe(true);
      expect(gradeTestAnswer(q, String(q.answer + 1)), q.prompt).toBe(false);
      expect(gradeTestAnswer(q, ""), q.prompt).toBe(false);
      expect(gradeTestAnswer(q, "no idea"), q.prompt).toBe(false);
    }
    // The way a student would write it counts too.
    const eq = PRE_TEST.find((q) => q.node === "two_step_equations")!;
    expect(gradeTestAnswer(eq, `x = ${eq.answerText}`)).toBe(true);
    const undo = PRE_TEST.find((q) => q.node === "inverse_operations")!;
    expect(gradeTestAnswer(undo, `b = ${undo.answerText}`)).toBe(true);
  });

  it("counts only a finished number, never the question retyped or half-worked", () => {
    const q = (node: string, i = 0) => PRE_TEST.filter((p) => p.node === node)[i]!;
    for (const p of PRE_TEST) {
      expect(gradeTestAnswer(p, p.prompt), p.prompt).toBe(false);
      expect(gradeTestAnswer(p, p.answerText.replace("-", "\u2212")), p.prompt).toBe(true);
      expect(gradeTestAnswer(p, ` ${p.answerText} `), p.prompt).toBe(true);
    }
    const arith = q("order_of_operations");
    expect(gradeTestAnswer(arith, `${arith.answer + 10} - 10`)).toBe(false);
    const eq = q("two_step_equations");
    expect(gradeTestAnswer(eq, `${eq.answer * 8}/8`)).toBe(false);
    expect(gradeTestAnswer(eq, `${eq.answerText} = x`)).toBe(true);
    expect(gradeTestAnswer(eq, `${eq.answer}.0000001`)).toBe(false);
    expect(gradeTestAnswer(eq, "(".repeat(5000))).toBe(false);
  });

  it("scores per skill and in total, keeping no answers", () => {
    const right = PRE_TEST.map((q, i) => (i % 3 === 0 ? q.answerText : "0.123"));
    const score = scoreTest(PRE_TEST, right);
    expect(score.total).toBe(PRE_TEST.length);
    expect(score.correct).toBe(PRE_TEST.filter((_, i) => i % 3 === 0).length);
    expect(score.bySkill.map((s) => s.skill_id)).toEqual([...new Set(PRE_TEST.map((q) => q.node))]);
    expect(score.bySkill.reduce((n, s) => n + s.correct, 0)).toBe(score.correct);
    // Numbers and skill ids only: nothing the student typed.
    expect(JSON.stringify(score)).not.toContain("0.123");
  });

  it("shows no hints and no feedback while the test runs", () => {
    const forms = [PRE_TEST, POST_TEST];
    for (const form of forms) {
      form.forEach((problem, index) => {
        const draft = index % 2 === 0 ? problem.answerText : "123456";
        const html = renderToStaticMarkup(
          createElement(TestQuestion, { problem, index, total: form.length, draft, onDraft() {}, onNext() {}, onSkip() {} }),
        );
        // The words on screen, not the markup (the answer box turns autoCorrect off).
        const text = html.replace(/<[^>]*>/g, " ");
        expect(text).not.toMatch(/\b(hints?|that.s right|wrong|not yet|correct|incorrect|try again)\b/i);
        expect(html).toContain(`Question ${index + 1} of 10`);
      });
    }
  });
});
