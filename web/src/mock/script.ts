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
  /** "steps": solved one checked line at a time (R-48). Answer box otherwise. */
  format?: "steps";
  /** The letter the answer is for: x when absent, null for a value to work out (R-18). */
  variable?: string | null;
  solutions: number[];
  intro: string[];
  hints: string[];
  /** After the first wrong answer: ask for reasoning instead of correcting (R-03). */
  askWhy: string;
  /** Reply once the child explains their thinking. */
  afterWhy: string;
  /** Reply to the second wrong answer. */
  secondMiss: string;
  /** A right-but-incomplete answer. `{root}` is the solution the student typed (R-06). */
  partial?: string;
  /** Said after `correct` on a clean first try (no miss, no partial), or otherwise. */
  firstTry?: string;
  afterMiss?: string;
  /**
   * Wrong answers that point at one specific slip, with a reply that names it. A slip with a
   * repair puzzle sends the child there first, once (the content library's repair role).
   */
  misconceptions: { value: number; reply: string; repair?: PuzzleTemplate }[];
  correct: string[];
}

export const OPENING = "Hi, I'm Platy! Today we're solving equations, one at a time.";

/**
 * The demo opens with these (R-48): the student writes one line at a time and each line is
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
      "$x$ is multiplied by $2$, then $5$ is added. Undo the last thing first.",
      "Start with the $+5$. What could you do to both sides to make it disappear?",
      "Now $x$ is still multiplied by $2$. What undoes that?",
    ],
    askWhy: "That line doesn't follow from the one above yet. What did you do to each side?",
    afterWhy: "Thanks. Whatever you do to one side, do the same to the other, then try that line again.",
    secondMiss: "Look at the marked line next to the one above it. Which side changed in a different way?",
    misconceptions: [],
    correct: ["Yes, $x = 6$, and every line on the way checks out.", "Check it: $2(6) + 5 = 17$. It works."],
  },
  {
    problem_id: "s2",
    skill_id: "two_step_equations",
    prompt: "3x - 4 = 11",
    instruction: "Solve it one line at a time",
    format: "steps",
    solutions: [5],
    intro: ["New problem, same idea. This one has a minus."],
    hints: [
      "$x$ is multiplied by $3$, then $4$ is taken away. Undo the last thing first.",
      "To undo $-4$, what do you do to both sides?",
      "Now undo the $\\times 3$ on both sides.",
    ],
    askWhy: "Hmm, that line doesn't match the one above. What did you do with the $-4$?",
    afterWhy: "Got it. Taking away $4$ is undone by adding $4$ to both sides, so try the line again.",
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
      "$x$ is multiplied by $3$, then $5$ is added. Undo those in reverse order.",
      "Start by subtracting $5$ from both sides. What's left?",
      "You should have $3x = 15$. Now divide both sides by $3$.",
    ],
    askWhy: "Not quite yet, and that's okay. Can you tell me what you did first?",
    afterWhy: "Thanks. To get $3x$ by itself, what happens if you subtract $5$ from both sides?",
    secondMiss: "Try it step by step: $3x + 5 - 5 = 20 - 5$, so $3x = 15$. What's $x$?",
    misconceptions: [
      { value: 15, reply: "$3x = 15$ is right. One more step: $x$ is still multiplied by $3$." },
      {
        value: 25 / 3,
        reply: "I think the $5$ got added to both sides. To undo $+5$, we subtract $5$ instead.",
        repair: "spot_the_error",
      },
    ],
    correct: ["Yes, $x = 5$. You undid the $+5$, then the $\\times 3$.", "Check it: $3(5) + 5 = 20$. It works."],
  },
  {
    problem_id: "p2",
    skill_id: "distributive_property",
    prompt: "2(x - 3) = 10",
    instruction: "Solve for x",
    solutions: [8],
    intro: ["New problem. This one has parentheses."],
    hints: [
      "You can share the $2$ across the parentheses, or divide both sides by $2$ first. Either works.",
      "Dividing both sides by $2$ gives $x - 3 = 5$.",
      "$x - 3 = 5$. What do you add to both sides?",
    ],
    askWhy: "Hmm, not yet. How did you deal with the parentheses?",
    afterWhy: "The $2$ multiplies everything inside, so $2(x - 3)$ means $2x - 6$. What do you get now?",
    secondMiss: "Let's try dividing first: $2(x - 3) = 10$ becomes $x - 3 = 5$. Now what's $x$?",
    misconceptions: [
      { value: 6.5, reply: "I think the $2$ only got multiplied by the $x$. It multiplies the $-3$ too." },
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
    afterWhy: "$x^2$ means $x \\cdot x$. Which number times itself is $49$?",
    secondMiss: "Think of the times tables: which number times itself makes $49$?",
    partial: "Yes, ${root}$ works. Which other number, times itself, makes $49$?",
    misconceptions: [
      { value: 24.5, reply: "Careful: $x^2$ means $x \\cdot x$, not $2 \\cdot x$." },
    ],
    correct: ["Both! $x = 7$ or $x = -7$, because $(-7)^2 = 49$ too."],
    firstTry: "Lots of people miss the negative one. You didn't.",
    afterMiss: "That's both answers.",
  },
];

/** The easier problem the tutor pivots to after a pause (R-21, first rung). */
export const CONFIDENCE_BUILDER: ScriptedProblem = {
  problem_id: "warmup",
  skill_id: "one_step_equations",
  prompt: "x + 4 = 9",
  instruction: "Solve for x",
  solutions: [5],
  intro: ["Let's do a quick one first."],
  hints: ["What number plus $4$ makes $9$?", "Subtract $4$ from both sides."],
  askWhy: "Almost. What did you do with the $4$?",
  afterWhy: "Thanks! To undo $+4$, subtract $4$ from both sides.",
  secondMiss: "Try $9 - 4$.",
  misconceptions: [{ value: 13, reply: "Looks like the $4$ got added. To undo $+4$, we subtract it." }],
  correct: ["Yes, $x = 5$. Now back to the one from before."],
};

export const CLOSING = "That's all of them. You kept going to the end, and that matters most.";
/** The button after the closing line; the map waits for it, or comes by itself after a moment. */
export const SEE_MAP = "See my map";

export const NO_ANSWERS = "I won't give the answer, because working it out is how you learn it. Want a hint instead?";

/** For a message Platy can't place: neutral, never praise (R-06, teen test 2026-10-26). */
export const NUDGES = ["What would you try first?", "Try your idea in the answer box, and I'll check it."];
/** One warm redirect for a message with no math in it; after that, the nudges. */
export const OFF_TOPIC = "Let's keep this about the problem. What's the first thing you'd do to it?";

// Step-by-step lines (R-48).
export const STEP_UNREADABLE = "I couldn't read that line. Write it as an equation with x, like the line above.";
/** On an expression to work out, where a line is numbers and operations, not an equation. */
export const STEP_UNREADABLE_VALUE = "I couldn't read that line. Write it with numbers and signs, like the line above.";
export const STEP_IN_LINES = "Write it as the next line in your solution, so I can check each step.";

export const UNREADABLE = "Hmm, I couldn't read that as a number. Try something like x = 4.";

export const OUT_OF_HINTS = "That's all my hints for this one. Try it, and I'll check what you write.";

/** The first rung of the de-escalation ladder (R-21), before the pause is suggested. */
export const TAKE_A_BREATH = "This one's hard. Let's pause for a moment.";

// Puzzle turns (R-37). The items' own lines are in mock/puzzles.ts.
export const REPAIR_LEAD =
  "I think I know what happened there. Let's look at someone else's work first, then come back to this one.";
export const DEMO_LEAD = "Let's try a quick puzzle.";
export const SHOW_ONE = "Let me show you one first. Then you do the steps, one at a time.";
export const TRY_FIRST = "Try once first, even a guess. Then I'll help.";
export const EXPLAIN_FIRST = "Tell me what you were thinking first, then I'll help.";
export const NO_ANSWERS_TRY_FIRST =
  "I won't give the answer, because working it out is how you learn it. Try once first, even a guess, and then I'll help.";
export const PUZZLE_UNREADABLE = "I couldn't read that one. Write it as an equation with x, like the lines above.";
/** On a puzzle that works an expression out (the integer and order repairs). */
export const PUZZLE_UNREADABLE_VALUE = "I couldn't read that one. Write it with numbers and signs, like the lines above.";
export const PUZZLE_NUDGE = "Try it in the puzzle. Ask me if you get stuck.";
/** After the student has answered a puzzle's reflection question and been thanked (R-03). */
export const KEEP_GOING_READY = "Tap Keep going when you're ready.";
export const BACK_TO_IT = "Now back to the one from before.";

// A slip on a step-by-step problem (R-48, R-40): a repair puzzle on that one move, then a fresh
// problem of the same kind to check the fix stuck (R-41), in place of the one they slipped on.
export const STEP_REPAIR_LEAD = "I think I know what happened on that line. Let's try that one move in a quick puzzle first.";
export const ONE_MORE = "Now a new one, to check the fix holds. Same kind of problem, new numbers.";

/** A generated problem (R-41) as a step-by-step problem, with lines that fit any numbers. */
export function confirmProblem(problem_id: string, skill_id: string, prompt: string, solution: number, answerText: string): ScriptedProblem {
  // An expression to work out (no equals sign): the lines are its working, not steps in x.
  if (!prompt.includes("=")) {
    return {
      problem_id,
      skill_id,
      prompt,
      instruction: "Work it out one line at a time",
      format: "steps",
      variable: null,
      solutions: [solution],
      intro: [ONE_MORE],
      hints: [
        "What comes first here? Brackets, then multiplying and dividing, then adding and taking away.",
        "Do one operation per line, and keep the sign with each number.",
        "Check each line against the one above it. Does it still come to the same thing?",
      ],
      askWhy: "That line doesn't come to the same thing as the one above yet. What did you work out?",
      afterWhy: "Thanks. One operation at a time, and check each line against the one above, then try that line again.",
      secondMiss: "Look at the marked line next to the one above it. Which part changed in a different way?",
      misconceptions: [],
      correct: [`Yes, $${answerText}$, and every line checks out. The fix held.`],
    };
  }
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
    afterWhy: "Thanks. Whatever you do to one side, do the same to the other, then try that line again.",
    secondMiss: "Look at the marked line next to the one above it. Which side changed in a different way?",
    misconceptions: [],
    correct: [`Yes, $x = ${answerText}$, and every line checks out. The fix held.`],
  };
}

export const SAFETY_RESOURCES: SafetyResource[] = [
  { name: "A trusted adult", contact: "A parent, guardian, teacher or school counselor", description: "Someone you know who can help right now." },
  { name: "988 Suicide & Crisis Lifeline", contact: "Call or text 988 (US)", description: "Free and confidential, any time of day." },
  { name: "Crisis Text Line", contact: "Text HOME to 741741 (US)", description: "Text with a trained counselor." },
];

// Probing (R-01): before teaching a miss, the primer checks the prerequisite one level down,
// then one more, with the skill map's own probes. A probe has no hints of its own.
export const PROBE_LEAD = "Before we fix that line, one quick check on a skill it uses.";
export const PROBE_DEEPER = "One more quick check, on an even simpler skill.";
/** Said on the quick check itself, after the new page. */
export const PROBE_ASK = "Just your best try.";

// The buttons to a detour (`next_up`), so the student reads why before the screen changes (R-01).
export const DETOUR_PROBE = "Quick check";
export const DETOUR_PROBE_DEEPER = "Next quick check";
export const DETOUR_TEACH = "Show me how";
export const DETOUR_BACK = "Back to my problem";
export const DETOUR_PUZZLE = "Quick puzzle";
/** The button on a solved problem; it also moves on by itself after a moment (R-17). */
export const NEXT_PROBLEM = "Next problem";
export const PROBE_THANKS = "Thanks, that tells me a lot.";
export const PREREQS_SOLID = "Those basics are solid, so it's just this one move. Back to the problem.";

// The metacognition beat (R-30), once per session. The verdict waits for the student's answer to
// it, so none of the asks says whether the answer is right (R-02).
export const CONFIDENCE_ASK = "One thing before I check it. How sure are you?";
/** The beat before the session closes, about the last problem, which was confirmed already. */
export const CONFIDENCE_ASK_LATE = "Before we stop, think back to that last one. How sure were you before you checked it?";
export const KEY_STEP_ASK = "One more thing before we stop. Which step was the key one in the example I showed you?";
/** A chat message during the beat: their words are welcome, and the tap is what moves on. */
export const CONFIDENCE_CHAT = "Thanks, that helps. Tap how sure you are, and I'll check it.";
export const KEY_STEP_CHAT = "Thanks. Tap the step you think was the key one.";
/** After a how_sure beat, which only comes on a right answer: by the reason given, else by the level. */
export const CONFIDENCE_REPLIES = {
  level: {
    1: "A guess, and it landed. Next time, check it so you know it's right.",
    2: "Fairly sure, and right. You know this better than you feel.",
    3: "Certain, and right. That's the feeling to trust.",
  },
  reason: {
    checked_back: "Putting it back in to check is the best way to be sure. Keep doing that.",
    each_step: "Checking each line against the one before is exactly how to be sure.",
    like_last_one: "Spotting that it's the same kind helps. Check it once too, so it's more than a pattern.",
    felt_right: "A feeling is a start. Put the answer back in once, so the feeling has proof.",
    not_sure_why: "That's honest. Next time, put the answer back in, and you'll know why.",
  },
} as const;
/** After a key_step beat: reflection, not a quiz, so every pick hears the key step named (R-30). */
export const KEY_STEP_REPLIES: Record<string, string> = {
  undo_first: "Yes. Undoing the added or taken-away number first clears the way to x.",
  undo_times: "Dividing finishes it, and it only works once the added number is gone. The first undo is the key.",
  check_back: "Checking is a strong habit. The step that unlocks it is undoing what was done to x, last thing first.",
  read_problem: "Reading what was done to x is where it starts. Then undo it, last thing first.",
};
export const KEY_STEP_REPLY_NONE = "That's fine. The key step is undoing what was done to x, last thing first.";

/** The skill map's first probe for a node, as an answer-box problem. */
export function probeProblem(skill_id: string): ScriptedProblem {
  const probe = skillMap.nodes.find((n) => n.id === skill_id)?.probes[0];
  if (!probe) throw new Error(`no probe for ${skill_id}`);
  return {
    problem_id: probe.id,
    skill_id,
    prompt: probe.equation.replace(/(\d)\*([a-z])/g, "$1$2").replace(/\*/g, " \\times "),
    instruction: probe.variable === "x" ? "Solve for x" : probe.prompt,
    variable: probe.variable ?? null,
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
/** How long the test takes, from its question count (teen test 2026-10-26: the intro didn't say). */
export const TEST_LENGTH = "{n} questions, about {minutes} minutes.";
export const TEST_INTRO = "One at a time, with no hints, and it's fine to skip one you don't know. Just your best try.";
export const TEST_DONE = "All done. Thanks for giving every one a go.";
export const TEST_NOTE = "Platy doesn't keep this score or your answers. Write the score down before you close this screen.";
export const TEST_INSTRUCTIONS: Record<"value" | "undo" | "equation", string> = {
  value: "Work it out",
  undo: "Find the number b that makes this true for every x",
  equation: "Solve for x",
};
