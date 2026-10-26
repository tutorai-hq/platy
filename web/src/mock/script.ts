// Scripted tutor turns for the demo. The wording follows the pedagogy rules the real tutor
// will be held to: no answer on the first miss (R-02), ask for the child's reasoning (R-03),
// short replies with one idea each (R-06), and a pivot when a child keeps missing (R-21).
// Everything here is fake content; no real child data is involved (P-13).

import skillMap from "../../../src/platy/skills/data/skill_map.json";
import type { PuzzleTemplate } from "../content/types";
import type { SafetyResource } from "../protocol";

export interface ScriptedProblem {
  problem_id: string;
  skill_id: string;
  prompt: string;
  instruction: string;
  /** "steps": solved one checked line at a time (R-39). Answer box otherwise. */
  format?: "steps";
  solutions: number[];
  intro: string[];
  hints: string[];
  /** After the first wrong answer: ask for reasoning instead of correcting (R-03). */
  askWhy: string;
  /** Reply once the child explains their thinking. */
  afterWhy: string;
  /** Reply to the second wrong answer. */
  secondMiss: string;
  partial?: string;
  /**
   * Wrong answers that point at one specific slip, with a reply that names it. A slip with a
   * repair puzzle sends the child there first, once (the content library's repair role).
   */
  misconceptions: { value: number; reply: string; repair?: PuzzleTemplate }[];
  correct: string[];
}

export const OPENING = "Hi, I'm Platy! Today we're solving equations, one at a time.";

/**
 * The demo opens with these (R-39): the student writes one line at a time and each line is
 * checked before the next opens. The hints name the move, never the next line (R-02).
 */
export const STEP_LESSON: ScriptedProblem[] = [
  {
    problem_id: "s1",
    skill_id: "two_step_equations",
    prompt: "2x + 5 = 17",
    instruction: "Solve it one line at a time",
    format: "steps",
    solutions: [6],
    intro: ["Let's solve this one line by line. Write your first step under the equation, and I'll check each line as you go."],
    hints: [
      "What's happening to $x$? It's multiplied by $2$, then $5$ is added. We undo those in reverse order.",
      "Start with the $+5$. What could you do to both sides to make it disappear?",
      "Now $x$ is still multiplied by $2$. What undoes that?",
    ],
    askWhy: "That line doesn't follow from the one above yet. What did you do to each side?",
    afterWhy: "Thanks. Whatever you do to one side, do exactly the same to the other. Try that line again.",
    secondMiss: "Look at the marked line next to the one above it. Which side changed in a different way?",
    misconceptions: [],
    correct: ["Yes! $x = 6$, and every line on the way checks out.", "Check it: $2(6) + 5 = 17$. It works."],
  },
  {
    problem_id: "s2",
    skill_id: "two_step_equations",
    prompt: "3x - 4 = 11",
    instruction: "Solve it one line at a time",
    format: "steps",
    solutions: [5],
    intro: ["Fresh page. Same idea, and this one has a minus."],
    hints: [
      "$x$ is multiplied by $3$, then $4$ is taken away. Undo the last thing first.",
      "To undo $-4$, what do you do to both sides?",
      "Now undo the $\\times 3$ on both sides.",
    ],
    askWhy: "Hmm, that line doesn't match the one above. What did you do with the $-4$?",
    afterWhy: "Got it. Taking away $4$ is undone by adding $4$, to both sides. Try the line again.",
    secondMiss: "Compare the marked line with the one above it. What happened to the $-4$ on each side?",
    misconceptions: [],
    correct: ["That's it, $x = 5$!", "Check: $3(5) - 4 = 11$."],
  },
];

export const LESSON: ScriptedProblem[] = [
  {
    problem_id: "p1",
    skill_id: "two_step_equations",
    prompt: "3x + 5 = 20",
    instruction: "Solve for x",
    solutions: [5],
    intro: ["Here's the first one. Take your time, and type your answer in the box when you're ready."],
    hints: [
      "What's happening to $x$? It gets multiplied by $3$, then $5$ is added. We undo those in reverse order.",
      "Start by subtracting $5$ from both sides. What's left?",
      "You should have $3x = 15$. Now divide both sides by $3$.",
    ],
    askWhy: "Not quite yet, and that's okay. Can you tell me what you did first?",
    afterWhy: "Thanks for walking me through it. Here's a nudge: get $3x$ by itself first. What happens if you subtract $5$ from both sides?",
    secondMiss: "Close. Try it step by step: $3x + 5 - 5 = 20 - 5$, so $3x = 15$. What's $x$?",
    misconceptions: [
      { value: 15, reply: "So close! $3x = 15$ is right. One more step: $x$ is still being multiplied by $3$." },
      {
        value: 25 / 3,
        reply: "I think the $5$ got added to both sides. To undo $+5$, we subtract $5$ instead.",
        repair: "spot_the_error",
      },
    ],
    correct: ["Yes! $x = 5$. You undid the $+5$, then the $\\times 3$.", "Check it: $3(5) + 5 = 20$. It works."],
  },
  {
    problem_id: "p2",
    skill_id: "distributive_property",
    prompt: "2(x - 3) = 10",
    instruction: "Solve for x",
    solutions: [8],
    intro: ["Fresh page. This one has parentheses."],
    hints: [
      "You can share the $2$ across the parentheses, or divide both sides by $2$ first. Either works.",
      "Dividing both sides by $2$ gives $x - 3 = 5$.",
      "$x - 3 = 5$. What do you add to both sides?",
    ],
    askWhy: "Hmm, not yet. How did you deal with the parentheses?",
    afterWhy: "Got it. Remember the $2$ multiplies everything inside: $2(x - 3)$ means $2x - 6$. What do you get now?",
    secondMiss: "Let's try dividing first: $2(x - 3) = 10$ becomes $x - 3 = 5$. Now what's $x$?",
    misconceptions: [
      { value: 6.5, reply: "Close! I think the $2$ only got multiplied by the $x$. It multiplies the $-3$ too." },
      { value: 2, reply: "It looks like the $3$ got subtracted instead of added. To undo $-3$, we add $3$." },
    ],
    correct: ["That's it, $x = 8$!", "Check: $2(8 - 3) = 2 \\cdot 5 = 10$."],
  },
  {
    problem_id: "p3",
    skill_id: "alg1.quadratic.square_root",
    prompt: "x^2 = 49",
    instruction: "Find every x that works",
    solutions: [7, -7],
    intro: ["Last one, and it has an exponent. The $x^2$ button helps you type it."],
    hints: [
      "What number times itself makes $49$?",
      "$7 \\cdot 7 = 49$. Is there a negative number that works too?",
      "Both $7$ and $-7$ square to $49$. You can type 7, -7.",
    ],
    askWhy: "Not quite. What does $x^2$ mean to you?",
    afterWhy: "Right idea to think about it. $x^2$ means $x \\cdot x$. Which number times itself is $49$?",
    secondMiss: "Think of the times tables: which number times itself makes $49$?",
    partial: "Yes, $7$ works! There's one more number that squares to $49$. Can you find it?",
    misconceptions: [
      { value: 24.5, reply: "Careful: $x^2$ means $x \\cdot x$, not $2 \\cdot x$." },
    ],
    correct: ["Both! $x = 7$ or $x = -7$, because $(-7)^2 = 49$ too.", "Lots of people miss the negative one. You didn't."],
  },
];

/** The easier problem the tutor pivots to after a pause (R-21, first rung). */
export const CONFIDENCE_BUILDER: ScriptedProblem = {
  problem_id: "warmup",
  skill_id: "one_step_equations",
  prompt: "x + 4 = 9",
  instruction: "Solve for x",
  solutions: [5],
  intro: ["Let's do a quick one to get our groove back."],
  hints: ["What number plus $4$ makes $9$?", "Subtract $4$ from both sides."],
  askWhy: "Almost. What did you do with the $4$?",
  afterWhy: "Thanks! To undo $+4$, subtract $4$ from both sides.",
  secondMiss: "Try $9 - 4$.",
  misconceptions: [{ value: 13, reply: "Looks like the $4$ got added. To undo $+4$, we subtract it." }],
  correct: ["Nice, $x = 5$. Now let's go back to the one from before. You've got this."],
};

export const CLOSING = "That's all of them. You stuck with it, and that's what counts. See you next time!";

export const NO_ANSWERS =
  "I won't just hand it over, because working it out is what makes it stick. But I'll help. Want a hint?";

export const NUDGES = [
  "Good thinking. What would you try first?",
  "I like that you're working through it. Try your idea in the answer box.",
];

// Step-by-step lines (R-39).
export const STEP_UNREADABLE = "I couldn't read that line. Write it as an equation with x, like the line above.";
export const STEP_IN_LINES = "Write it as the next line in your solution, so I can check each step.";

export const UNREADABLE = "Hmm, I couldn't read that as a number. Try something like x = 4.";

export const OUT_OF_HINTS = "That's all my hints for this one. Give it a try, I'm right here.";

/** The first rung of the de-escalation ladder (R-21), before the pause is suggested. */
export const TAKE_A_BREATH = "This one's being stubborn. Let's take a breath.";

// Puzzle turns (R-37). The items' own lines are in mock/puzzles.ts.
export const REPAIR_LEAD =
  "I have a hunch about what happened there. Let's look at someone else's work first, then come back to this one.";
export const DEMO_LEAD = "Let's try a quick puzzle.";
export const SHOW_ONE = "Let me show you one first. Then you'll take it over, a step at a time.";
export const TRY_FIRST = "Give it one try first, even a guess. Then I'll help.";
export const EXPLAIN_FIRST = "Tell me what you were thinking first, then I'll help.";
export const NO_ANSWERS_TRY_FIRST =
  "I won't just hand it over, because working it out is what makes it stick. Give it one try first, even a guess, and then I'll help.";
export const PUZZLE_UNREADABLE = "I couldn't read that one. Write it as an equation with x, like the lines above.";
export const PUZZLE_NUDGE = "Give it a go in the puzzle. I'm right here if you get stuck.";
export const BACK_TO_IT = "Now back to the one from before. You've got this.";

// A slip on a step-by-step problem (R-39, R-40): a repair puzzle on that one move, then a fresh
// problem of the same kind to check the fix stuck (R-41), in place of the one they slipped on.
export const STEP_REPAIR_LEAD = "I think I know what happened on that line. Let's try that one move in a quick puzzle first.";
export const ONE_MORE = "Now a fresh one, to make sure the fix sticks. Same kind of problem, new numbers.";

/** A generated problem (R-41) as a step-by-step problem, with lines that fit any numbers. */
export function confirmProblem(problem_id: string, skill_id: string, prompt: string, solution: number, answerText: string): ScriptedProblem {
  return {
    problem_id,
    skill_id,
    prompt,
    instruction: "Solve it one line at a time",
    format: "steps",
    solutions: [solution],
    intro: [ONE_MORE],
    hints: [
      "What's being done to $x$, and in what order? Undo the last thing first.",
      "Start with the number added to or taken from the $x$ part. What undoes it, on both sides?",
      "Now $x$ is still multiplied by a number. What undoes that?",
    ],
    askWhy: "That line doesn't follow from the one above yet. What did you do to each side?",
    afterWhy: "Thanks. Whatever you do to one side, do exactly the same to the other. Try that line again.",
    secondMiss: "Look at the marked line next to the one above it. Which side changed in a different way?",
    misconceptions: [],
    correct: [`Yes! $x = ${answerText}$, and every line checks out. That fix stuck.`],
  };
}

export const SAFETY_RESOURCES: SafetyResource[] = [
  { name: "A trusted adult", contact: "A parent, guardian, teacher or school counselor", description: "Someone you know who can help right now." },
  { name: "988 Suicide & Crisis Lifeline", contact: "Call or text 988 (US)", description: "Free and confidential, any time of day." },
  { name: "Crisis Text Line", contact: "Text HOME to 741741 (US)", description: "Text with a trained counselor." },
];

// Probing (R-01): before teaching a miss, the primer checks the prerequisite one level down,
// then one more, with the skill map's own probes. A probe has no hints of its own.
export const PROBE_LEAD = "Before we fix that line, one quick check on something underneath it. Just your best try.";
export const PROBE_DEEPER = "One more quick check, a level further down.";
export const PROBE_THANKS = "Thanks, that tells me a lot.";
export const PREREQS_SOLID = "Those basics are solid, so it's just this one move. Back to the problem.";

/** The skill map's first probe for a node, as an answer-box problem. */
export function probeProblem(skill_id: string): ScriptedProblem {
  const probe = skillMap.nodes.find((n) => n.id === skill_id)?.probes[0];
  if (!probe) throw new Error(`no probe for ${skill_id}`);
  return {
    problem_id: probe.id,
    skill_id,
    prompt: probe.equation.replace(/(\d)\*([a-z])/g, "$1$2").replace(/\*/g, " \\times "),
    instruction: probe.variable === "x" ? "Solve for x" : probe.prompt,
    solutions: [Number(probe.answer)],
    intro: [],
    hints: [],
    askWhy: PROBE_THANKS,
    afterWhy: PROBE_THANKS,
    secondMiss: PROBE_THANKS,
    misconceptions: [],
    correct: [],
  };
}


// The pre and post test (R-26). No hints and no feedback while it runs, so it measures where the
// student is; the score shows only at the end, for the person running the session to write down.
export const TEST_TITLE = "Quick check";
export const TEST_INTRO =
  "10 questions, one at a time. There are no hints this time, and it's fine to skip one you don't know. Just your best try.";
export const TEST_DONE = "All done. Thanks for giving every one a go.";
export const TEST_NOTE = "Platy doesn't keep this score or your answers. Write the score down before you close this screen.";
export const TEST_INSTRUCTIONS: Record<"value" | "undo" | "equation", string> = {
  value: "Work it out",
  undo: "Find the number b that makes this true for every x",
  equation: "Solve for x",
};
