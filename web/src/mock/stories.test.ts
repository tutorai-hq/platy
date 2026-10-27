import { describe, expect, it } from "vitest";
import { descriptorFor, PROBE_EQUATIONS } from "../content/catalog";
import { isOneOf, type Level, seeded } from "../mock/generate";
import { hasSolution } from "../mock/grade";
import { INTERESTS, SKINS } from "../mock/puzzles";
import { LESSON, STEP_LESSON } from "../mock/script";
import { checkStep } from "../mock/steps";
import { numeralsIn } from "../mock/working";
import { equationOf, gradeSetup, newStory, slipHintFor, STORIES, storyItemId, storyLine, storyProblem, storyText } from "./stories";

// R-37 acceptance: across every story template × interest × level 1–2 × 50 seeds, the story's
// numbers give the equation the template claims, the equation verifies with the mock checker,
// the answer is a clean whole number that makes sense in the story, no story text contains the
// answer, and the reading level stays at or under grade 7.

/** A simple syllable count: vowel groups, less a silent e; a numeral reads as its digits plus one ("28" is "twenty-eight"). */
function syllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (w === "") return 0;
  if (/^\d+$/.test(w)) return w.length + 1;
  let n = (w.match(/[aeiouy]+/g) ?? []).length;
  if (/[^aeiouyl]e$/.test(w) && n > 1) n--;
  return Math.max(1, n);
}

/** Flesch–Kincaid grade level, from the usual formula and the count above. */
function gradeLevel(text: string): number {
  const sentences = text.split(/[.?!]+(?:\s|$)/).filter((s) => s.trim() !== "");
  const words = text.split(/\s+/).filter((w) => /[a-z0-9]/i.test(w));
  const syl = words.reduce((n, w) => n + syllables(w), 0);
  return 0.39 * (words.length / sentences.length) + 11.8 * (syl / words.length) - 15.59;
}

const LEVELS: Level[] = [1, 2];
const SEEDS = Array.from({ length: 50 }, (_, i) => 1000 + i);
const LESSON_PROMPTS = [...STEP_LESSON, ...LESSON].map((p) => p.prompt);

describe("story problems (R-37)", () => {
  it("has four to six templates on two-step equations, each with a catalog descriptor in the apply role", () => {
    expect(STORIES.length).toBeGreaterThanOrEqual(4);
    expect(STORIES.length).toBeLessThanOrEqual(6);
    expect(new Set(STORIES.map((t) => t.id)).size).toBe(STORIES.length);
    for (const t of STORIES) {
      const d = descriptorFor(storyItemId(t.id));
      expect(d, t.id).toMatchObject({ format: "story", template: null, role: "apply", angle: "story", skills: { primary: "two_step_equations" } });
    }
  });

  it("gives, for every template × interest × level × seed, a story whose numbers make its equation, with a clean whole answer, in grade-7 words", () => {
    for (const t of STORIES) {
      for (const level of LEVELS) {
        for (const seed of SEEDS) {
          const story = newStory(t, level, seeded(seed), LESSON_PROMPTS);
          const tag = `${t.id} L${level} seed ${seed}: ${story.equation}`;
          const { a, b, c, answer } = story;
          // The numbers give the equation the template claims, and nothing else.
          expect(story.equation, tag).toBe(equationOf(t.form, a, b, c));
          expect(t.form === "ax + b = c" ? a * answer + b : a * answer - b, tag).toBe(c);
          expect([a, b, c].every((n) => Number.isInteger(n) && n > 0), tag).toBe(true);
          // The checker agrees, and the step solver finishes on the answer.
          expect(hasSolution(story.equation, answer), tag).toBe(true);
          expect(checkStep(story.equation, `x = ${answer}`), tag).toBe("solved");
          // A whole count of games, weeks or bags, at least 2, so the story isn't about one of them.
          expect(Number.isInteger(answer) && answer >= 2, tag).toBe(true);
          // Never a lesson problem or a probe equation (R-01, R-02).
          expect(isOneOf(story.equation, [...LESSON_PROMPTS, ...PROBE_EQUATIONS]), tag).toBe(false);
          // Three equations to choose from, exactly one of them right, all different.
          expect(story.choices, tag).toHaveLength(3);
          expect(new Set(story.choices).size, tag).toBe(3);
          expect(story.choices.filter((e) => gradeSetup(e, story) === "correct"), tag).toEqual([story.equation]);
          for (const e of story.choices) if (e !== story.equation) expect(slipHintFor(e, story), tag).toBe(story.slipHints[e]);
          for (const interest of INTERESTS) {
            const skin = SKINS[interest];
            const text = storyText(story, skin);
            const where = `${tag} (${interest})`;
            // Two or three sentences, every slot filled, and no equation in the story.
            expect(text.split(/[.?!]+(?:\s|$)/).filter((s) => s.trim() !== "").length, where).toBeGreaterThanOrEqual(2);
            expect(text.split(/[.?!]+(?:\s|$)/).filter((s) => s.trim() !== "").length, where).toBeLessThanOrEqual(3);
            expect(text, where).not.toMatch(/[{}=]/);
            expect([skin.team_name, skin.player_names[0]!].some((name) => text.includes(name)), where).toBe(true);
            // The answer is in no number of the story.
            expect(numeralsIn(text), where).not.toContain(answer);
            expect(gradeLevel(text), where).toBeLessThanOrEqual(7);
            // The hints and the asks for a wrong setup are about the story: filled, and never an equation.
            for (const line of [...t.hints, ...t.slips.map((s) => s.hint)].map((l) => storyLine(story, skin, l))) {
              expect(line, where).not.toMatch(/[{}=]/);
              expect(gradeLevel(line), where).toBeLessThanOrEqual(7);
            }
          }
        }
      }
    }
  });

  it("is seeded, and level 2 uses bigger numbers than level 1", () => {
    const t = STORIES[0]!;
    expect(newStory(t, 1, seeded(7))).toEqual(newStory(t, 1, seeded(7)));
    const big = (level: Level) => Math.max(...SEEDS.map((s) => newStory(t, level, seeded(s)).c));
    expect(big(2)).toBeGreaterThan(big(1));
    for (const seed of SEEDS) {
      const s = newStory(t, 1, seeded(seed));
      expect(s.a).toBeLessThanOrEqual(9);
      expect(s.b).toBeLessThanOrEqual(12);
      expect(s.answer).toBeLessThanOrEqual(12);
    }
  });

  it("grades the setup by equivalence, never by string, and never takes the answer itself", () => {
    const story = { ...newStory(STORIES[0]!, 1, seeded(3)) };
    const { a, b, c, answer } = story;
    expect(story.equation).toBe(`${a}x + ${b} = ${c}`);
    expect(gradeSetup(`${c} = ${a}x + ${b}`, story)).toBe("correct");
    expect(gradeSetup(`${b} + ${a}x = ${c}`, story)).toBe("correct");
    expect(gradeSetup(`${a}*x + ${b} = ${c}`, story)).toBe("correct");
    expect(gradeSetup(`${a}x = ${c - b}`, story)).toBe("correct");
    expect(gradeSetup(`x = ${answer}`, story)).toBe("incorrect");
    expect(gradeSetup(`${answer} = x`, story)).toBe("incorrect");
    expect(gradeSetup(`${a}x - ${b} = ${c}`, story)).toBe("incorrect");
    expect(gradeSetup(`${b}x + ${a} = ${c}`, story)).toBe("incorrect");
    expect(gradeSetup("the team wins", story)).toBe("unreadable");
    expect(gradeSetup(`${a}x + ${b}`, story)).toBe("unreadable");
    // A wrong setup written another way still finds its story question.
    expect(slipHintFor(`${c} = ${a}x - ${b}`, story)).toBe(STORIES[0]!.slips[0]!.hint);
    expect(slipHintFor(`${a}x + ${b + 1} = ${c}`, story)).toBeNull();
  });

  it("builds a step-by-step problem on two-step equations whose prompt is the equation and whose last line names the count", () => {
    const story = newStory(STORIES.find((t) => t.form === "ax - b = c")!, 2, seeded(11));
    const p = storyProblem("st1", story);
    expect(p).toMatchObject({ problem_id: "st1", skill_id: "two_step_equations", format: "story", prompt: story.equation, solutions: [story.answer], story });
    expect(p.correct[0]).toContain(`${story.answer} weeks`);
    expect(p.correct[0]).toContain(`x = ${story.answer}`);
    // Solving hints are the step solver's, about undoing; the story's own hints come before the setup.
    expect(p.hints[0]).toContain("Undo the last thing first");
  });

  it("keeps the math when the skin changes (R-38)", () => {
    const story = newStory(STORIES[0]!, 1, seeded(5));
    const soccer = storyText(story, SKINS.soccer);
    const gaming = storyText(story, SKINS.gaming);
    expect(soccer).not.toBe(gaming);
    expect(numeralsIn(soccer)).toEqual(numeralsIn(gaming));
    expect(gaming).toContain(SKINS.gaming.team_name);
  });
});
