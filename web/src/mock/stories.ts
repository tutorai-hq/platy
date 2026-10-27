import { PROBE_EQUATIONS } from "../content/catalog";
import data from "../content/stories.json";
import type { Skin } from "../content/types";
import { isOneOf, type Level, type Rng } from "./generate";
import { hasSolution, near, sameLine, sides } from "./grade";

type Side = NonNullable<ReturnType<typeof sides>>[0];
import { fill } from "./puzzles";
import { confirmProblem, type ScriptedProblem, STORY_INSTRUCTION, STORY_INTRO } from "./script";

// Story problems (R-37): a short story in the student's interest that turns into a two-step
// equation. The templates are data (content/stories.json); this picks the numbers, writes the
// equation and the wrong setups beside it, and grades the setup by equivalence. The server
// would do the same from the same file. Everything here is fake content (P-13).

/** The equation a story claims, with a and b the story's two numbers and c its total. */
export type StoryForm = "ax + b = c" | "ax - b = c" | "bx + a = c" | "bx - a = c";
const FORMS: readonly StoryForm[] = ["ax + b = c", "ax - b = c", "bx + a = c", "bx - a = c"];

export interface StoryTemplate {
  id: string;
  form: StoryForm;
  /** What x counts: "games", "weeks". */
  unknown: string;
  text: string;
  /** About the story, never the equation (R-02). */
  hints: [string, string];
  /** Wrong setups offered beside the right one, each with the story question for picking it. */
  slips: { form: StoryForm; hint: string }[];
}

function load(raw: unknown): StoryTemplate[] {
  const file = raw as { schema_version?: unknown; stories?: unknown };
  if (file.schema_version !== 1 || !Array.isArray(file.stories)) throw new Error("stories.json: unexpected shape");
  for (const s of file.stories as StoryTemplate[]) {
    const strings = [s.id, s.text, s.unknown, ...s.hints].every((v) => typeof v === "string" && v.length > 0);
    if (!strings || !FORMS.includes(s.form) || s.hints.length !== 2 || !Array.isArray(s.slips) || s.slips.length < 1) {
      throw new Error("stories.json: a story is missing a field");
    }
    for (const slip of s.slips) {
      if (!FORMS.includes(slip.form) || slip.form === s.form || typeof slip.hint !== "string") throw new Error(`stories.json: ${s.id} has a bad slip`);
    }
  }
  return file.stories as StoryTemplate[];
}

export const STORIES: readonly StoryTemplate[] = load(data);

/** The catalog id of a story template. */
export const storyItemId = (template: string): string => `story-${template}`;

export interface StoryInstance {
  template: string;
  level: Level;
  a: number;
  b: number;
  c: number;
  answer: number;
  /** The equation the story claims, in the step solver's notation ("4x + 3 = 19"). */
  equation: string;
  /** The equations offered, shuffled: the right one and the template's slips. */
  choices: string[];
  /** The story question to ask for each wrong choice, by its text (slots still in). */
  slipHints: Record<string, string>;
}

const int = (rng: Rng, lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1));

/** An equation of a form, written the way the step solver shows it. */
export function equationOf(form: StoryForm, a: number, b: number, c: number): string {
  switch (form) {
    case "ax + b = c":
      return `${a}x + ${b} = ${c}`;
    case "ax - b = c":
      return `${a}x - ${b} = ${c}`;
    case "bx + a = c":
      return `${b}x + ${a} = ${c}`;
    case "bx - a = c":
      return `${b}x - ${a} = ${c}`;
  }
}

/**
 * Numbers for a story at a level: a the amount each time, b the one-off amount, c the total, and
 * x a whole count of at least 2. Level 1 keeps everything to 12 a time and 120 in all; level 2 goes
 * further. No number in the story is the answer, so it can't be copied (R-02), and a and b differ,
 * so the swapped setup is a different equation.
 */
function storyNumbers(form: StoryForm, level: Level, rng: Rng): Pick<StoryInstance, "a" | "b" | "c" | "answer"> | null {
  const big = level >= 2;
  const a = int(rng, 2, big ? 12 : 9);
  const answer = int(rng, 2, big ? 20 : 12);
  const b = int(rng, 1, big ? 40 : 12);
  const c = form === "ax + b = c" ? a * answer + b : a * answer - b;
  if (c <= 0 || a === b || [a, b, c].includes(answer)) return null;
  return { a, b, c, answer };
}

/** A story from a template at a level. Its equation is never a lesson problem (`avoid`) or a probe (R-01). */
export function newStory(template: StoryTemplate, level: Level, rng: Rng, avoid: readonly string[] = []): StoryInstance {
  for (let i = 0; i < 10_000; i++) {
    const n = storyNumbers(template.form, level, rng);
    if (!n) continue;
    const equation = equationOf(template.form, n.a, n.b, n.c);
    if (isOneOf(equation, avoid) || isOneOf(equation, PROBE_EQUATIONS)) continue;
    const slips = template.slips.map((s) => ({ text: equationOf(s.form, n.a, n.b, n.c), hint: s.hint }));
    // A slip that comes out as the same equation (it can't, with a and b different) would be no slip.
    if (slips.some((s) => isOneOf(s.text, [equation]))) continue;
    const choices = [equation, ...slips.map((s) => s.text)];
    for (let k = choices.length - 1; k > 0; k--) {
      const j = int(rng, 0, k);
      [choices[k], choices[j]] = [choices[j]!, choices[k]!];
    }
    return {
      template: template.id, level, ...n, equation, choices,
      slipHints: Object.fromEntries(slips.map((s) => [s.text, s.hint])),
    };
  }
  throw new Error(`no story numbers fit ${template.id}`);
}

export function templateOf(story: StoryInstance): StoryTemplate {
  const t = STORIES.find((s) => s.id === story.template);
  if (!t) throw new Error(`no story template ${story.template}`);
  return t;
}

/** The slots a story's text fills from: the skin's words and the instance's numbers. */
function storyVars(story: StoryInstance, skin: Skin): Record<string, string | number> {
  const { a, b, c } = story;
  return { ...skin.words, team: skin.team_name, player: skin.player_names[0] ?? "", a, b, c };
}

/** The story as the student reads it, in their interest's words (R-38). */
export function storyText(story: StoryInstance, skin: Skin): string {
  return fill(templateOf(story).text, storyVars(story, skin));
}

/** A hint or ask from the template, filled for this story and skin. */
export function storyLine(story: StoryInstance, skin: Skin, text: string): string {
  return fill(text, storyVars(story, skin));
}

/**
 * The student's setup, graded by equivalence: any equation with the story's solution counts,
 * however it's written, except the solution itself. The server's check would run on sympy.
 */
export function gradeSetup(text: string, story: StoryInstance): "correct" | "incorrect" | "unreadable" {
  const s = sides(text);
  if (!s) return "unreadable";
  // "x = 4" is the answer, not what the story says.
  const solution = (l: Side, r: Side) => near(l.slope, 1) && near(l.constant, 0) && near(r.slope, 0) && near(r.constant, story.answer);
  if (solution(s[0], s[1]) || solution(s[1], s[0])) return "incorrect";
  return hasSolution(text, story.answer) ? "correct" : "incorrect";
}

/** The story question for a wrong setup, when it matches one of the template's slips; the text may be any equivalent form. */
export function slipHintFor(text: string, story: StoryInstance): string | null {
  for (const [choice, hint] of Object.entries(story.slipHints)) if (sameLine(text, choice)) return hint;
  return null;
}

/**
 * The story as a problem in the lesson: the setup first, then the equation solved line by line
 * (R-48). The prompt is the equation, which the server sends only once the setup is right.
 */
export function storyProblem(problem_id: string, story: StoryInstance): ScriptedProblem {
  const t = templateOf(story);
  const base = confirmProblem(problem_id, "two_step_equations", story.equation, story.answer, String(story.answer));
  return {
    ...base,
    format: "story",
    instruction: STORY_INSTRUCTION,
    intro: [STORY_INTRO],
    correct: [`Yes, $x = ${story.answer}$: ${story.answer} ${t.unknown}. Every line checks out.`],
    story,
  };
}
