import { applyMove, isSolved } from "../content/balance";
import { balanceStage, missingStage, type Outcomes, spotStage, workedStage } from "../content/progress";
import type {
  CheckId, CheckOutcome, PaletteId, Pans, Puzzle, PuzzleMove, PuzzleTemplate, Skin, WorkedExamplePuzzle,
} from "../content/types";
import {
  balance, type BalanceInstance, isOneOf, lastStep, type Level, type MissingInstance, missingStep, oneStepBalance, type Rng,
  type SpotInstance, spotTheError, type WorkedInstance, workedExample,
} from "./generate";
import { bareNumber, hasSolution, readable, sameLine } from "./grade";

// Mock-only puzzle items, interest skins and grading. They stand in for the server (R-37,
// R-38): pick an item, generate an instance, resolve the skin, grade each move, and pick the
// tutor's ask-first line for a miss (R-03). Item text follows content/prompts/puzzle-v1.md;
// the spot-the-error item is content/prompts/examples/lin2-undo-sign-spot-error.json.
// Everything here is fake content (P-13).

export type Interest = "soccer" | "football" | "gaming" | "neutral";

export const INTERESTS: Interest[] = ["soccer", "football", "gaming", "neutral"];

// Made-up teams in real-looking colors. Never a real team's name, logo or players (R-38).
export const SKINS: Record<Interest, Skin> = {
  soccer: {
    interest: "soccer", colors: "teal_silver", team_name: "Harbor Puffins", emblem: "wave",
    player_names: ["Ade", "Lucía", "Kenji"],
    words: { container: "kit bag", containers: "kit bags", unit: "ball", units: "balls" },
  },
  football: {
    interest: "football", colors: "orange_navy", team_name: "Canyon Meteors", emblem: "star",
    player_names: ["Marcus", "Priya", "Diego"],
    words: { container: "crate", containers: "crates", unit: "football", units: "footballs" },
  },
  gaming: {
    interest: "gaming", colors: "purple_black", team_name: "Pixel Pandas", emblem: "bolt",
    player_names: ["Rin", "Sam", "Zoe"],
    words: { container: "loot chest", containers: "loot chests", unit: "coin", units: "coins" },
  },
  neutral: {
    interest: "neutral", colors: "blue_red", team_name: "Platy Squad", emblem: "shield",
    player_names: ["Maya", "Omar", "Lena"],
    words: { container: "bag", containers: "bags", unit: "block", units: "blocks" },
  },
};

/** The interest's skin with the student's own picks on top. */
export function skinFor(interest: Interest, colors: PaletteId | null): Skin {
  return colors ? { ...SKINS[interest], colors } : SKINS[interest];
}

export interface Ask {
  /** One kind question that gets the student to explain, without naming the slip. */
  ask: string;
  /** For after they explain: points at the fix without giving it. */
  nudge: string;
}

export interface Item {
  item_id: string;
  template: PuzzleTemplate;
  skill_id: string;
  /** The tutor's line as the puzzle opens. */
  intro: string;
  instructions: string;
  /** Graduated; the tutor never gives one before a first try (R-02). */
  hints: [string, string, string];
  /** Tutor lines after a correct check, by check id. */
  replies: Partial<Record<CheckId, string>>;
  asks: Record<string, Ask>;
  /** R-30: asked once the puzzle is solved. */
  reflection: string;
  thanks: string;
}

// A worked example (R-37) teaches a new step. The primer fades it as mastery grows, handing the
// student one more step each time, last step first (backward fading). Each fade is the same
// item with its own lines; this first one is all watching, then a "why" (R-03).
const watch: Item = {
  item_id: "lin2-worked-example",
  template: "worked_example",
  skill_id: "two_step_equations",
  intro: "Here's how {player} from the {team} solves a two-step equation. Read it a step at a time.",
  instructions: "Read each step, then say why the first one works.",
  hints: [
    "What does the problem do to x? First it's multiplied by ${a}$, then ${b}$ is added.",
    "Undoing goes in reverse, like taking off your shoes before your socks. What gets undone first?",
    "Line 1 has no $+ {b}$ left in it. What took it away, and why?",
  ],
  replies: {
    why: "Right. Subtracting ${b}$ undoes the $+ {b}$, then dividing by ${a}$ undoes the times ${a}$.",
    first_step: "Yes. Now the last line.",
    final_answer: "That's it, $x = {answer}$. Check: ${a} \\cdot {answer} + {b} = {c}$.",
  },
  asks: {
    always_subtract: {
      ask: "What if it were ${a}x - {b}$ instead? Would you still subtract ${b}$ first?",
      nudge: "Each step undoes something the problem does to x. What does the $+ {b}$ do, and what undoes it?",
    },
    wrong_part: {
      ask: "Look at line 1. Is the ${a}$ still there after subtracting?",
      nudge: "Subtracting changed the $+ {b}$, not the ${a}$. What happened to the ${b}$?",
    },
    same_op: {
      ask: "The equation adds ${b}$ to ${a}x$. What did your line do to the ${b}$?",
      nudge: "Adding ${b}$ again doesn't undo it. What does?",
    },
    skipped: {
      ask: "That's true, but it's where the solution ends up. What does the line look like right after the first move?",
      nudge: "The first line still has ${a}x$ in it.",
    },
    other: {
      ask: "How did you get that from the problem?",
      nudge: "What has to happen to the ${b}$ before you can divide?",
    },
    not_alone: {
      ask: "That line's true. What's x on its own?",
      nudge: "What's still being done to $x$ in that line?",
    },
    subtracted_a: {
      ask: "How did you get rid of the ${a}$ in ${a}x$?",
      nudge: "${a}x$ means ${a}$ times x. What undoes times?",
    },
    final_other: {
      ask: "How did you get that from line 1?",
      nudge: "What's still being done to $x$ in line 1?",
    },
  },
  reflection: "In your own words: in a problem like this, what do you undo first, and why?",
  thanks: "Thanks. Next, {player} starts one and you write the last line.",
};

// Text fills from {name} slots: the skin's words and the instance's numbers. LaTeX in here
// avoids braces so it can't be mistaken for a slot.
export const ITEMS: Record<PuzzleTemplate, Item> = {
  spot_the_error: {
    item_id: "lin2-undo-sign-spot-error",
    template: "spot_the_error",
    skill_id: "two_step_equations",
    intro: "{player} from the {team} solved this one, but something went wrong. Let's find it.",
    instructions: "One line in this solution is wrong. Tap it, then write what it should say.",
    hints: [
      "Go line by line. For each line, ask: does this undo what's being done to $x$?",
      "Look at how the 'minus' part was handled. What's the opposite of taking something away?",
      "To undo a subtraction, add the same amount to both sides. Which line didn't do that?",
    ],
    replies: {
      found_error: "Good eye. What should that line say instead?",
      fixed_step: "Yes. Now finish the problem from your line.",
      final_answer: "That's it, $x = {answer}$. Check: ${a} \\cdot {answer} - {b} = {c}$.",
    },
    asks: {
      wrong_line: {
        ask: "What does that line do to both sides, and does it follow from the line just above it?",
        nudge: "Check each line against the one before it, starting from the problem. Where does it stop following?",
      },
      same_op: {
        ask: "The equation takes ${b}$ away from ${a}x$. What did your line do to the ${b}$?",
        nudge: "Taking ${b}$ away a second time doesn't undo it. Think about what would put it back.",
      },
      skipped: {
        ask: "That's where it ends up. What does this line look like right after the first move, before dividing?",
        nudge: "This line still has ${a}x$ on one side.",
      },
      fix_other: {
        ask: "How did you get that line from the problem above it?",
        nudge: "Look at what happens to the ${b}$. What undoes taking it away?",
      },
      old_answer: {
        ask: "That's what the old line gave. Does it still follow from your fixed line?",
        nudge: "Start from your fixed line. What's still being done to $x$?",
      },
      final_other: {
        ask: "How did you get that from your fixed line?",
        nudge: "What's still being done to $x$ in your fixed line?",
      },
      not_alone: {
        ask: "That line's true. What's x on its own?",
        nudge: "What's still being done to $x$ in that line?",
      },
    },
    reflection: "What made you suspect that line? Where would you start looking next time?",
    thanks: "Thanks. Checking each line against the one above it catches a lot of slips.",
  },
  missing_step: {
    item_id: "lin2-missing-step",
    template: "missing_step",
    skill_id: "two_step_equations",
    intro: "{player} solved this for the {team}, but a line went missing.",
    instructions: "One line of {player}'s solution is missing. Write the line that goes in the gap.",
    hints: [
      "Look at the problem and the last line. What has to happen to get from one to the other?",
      "Before you can divide, the ${b}$ has to go. What undoes adding it?",
      "Subtract ${b}$ from both sides. What line does that leave?",
    ],
    replies: {
      missing_line: "Yes, that's the missing step. Then dividing by ${a}$ gives $x = {answer}$.",
    },
    asks: {
      same_op: {
        ask: "The equation adds ${b}$ to ${a}x$. What did your line do to the ${b}$?",
        nudge: "Adding ${b}$ again doesn't undo it. What does?",
      },
      skipped: {
        ask: "That's true, but it's where the solution ends up. What does the line look like right after the first move?",
        nudge: "The missing line still has ${a}x$ in it.",
      },
      other: {
        ask: "How did you get that from the problem?",
        nudge: "What has to happen to the ${b}$ before you can divide?",
      },
    },
    reflection: "How did you work out what was missing? Would that help on a problem with no gaps?",
    thanks: "Thanks. Thinking about what has to happen between two lines is how you plan a solution.",
  },
  balance: {
    item_id: "lin2-balance",
    template: "balance",
    skill_id: "two_step_equations",
    intro: "This one's a balance scale. Every {container} holds the same number of {units}. How many?",
    instructions: "Get one {container} alone without tipping the scale.",
    hints: [
      "What's on the side with the {containers}, besides the {containers}?",
      "Take away the loose {units} first, from both sides so it stays level.",
      "Take {b_units} off both sides, then split what's left.",
    ],
    replies: {
      solved: "Level, and one {container} is alone. Each {container} holds {answer_units}, so $x = {answer}$.",
    },
    asks: {
      uneven_units: {
        ask: "What happens to the loose {units} if you split both sides into ${g}$ groups?",
        nudge: "A split only works if everything shares out evenly. Is there something to take away first?",
      },
      uneven_x: {
        ask: "How many {containers} would go in each group if you split both sides into ${g}$ groups?",
        nudge: "Try a number of groups that shares the {containers} out evenly.",
      },
      too_many: {
        ask: "How many loose {units} are on each side right now?",
        nudge: "You can only take away {units} that are on both sides.",
      },
      nothing: {
        ask: "What would you like to do to both sides?",
        nudge: "Try taking some {units} off, or splitting both sides into groups.",
      },
    },
    reflection: "Why did you take the {units} off before splitting? Would the other order have worked?",
    thanks: "Thanks. Undo the adding first, then the multiplying: it works the same way on paper.",
  },
  worked_example: watch,
};

// Repair items (R-37) for slips that had none (R-40), on the existing players. Each works on one
// move: the slip's own, on fresh numbers.
export const REPAIRS: Record<string, Item> = {
  // coefficient_subtracted_after_constant: the b came off, then the a was taken away.
  "repair-two-step-coefficient": {
    item_id: "repair-two-step-coefficient",
    template: "missing_step",
    skill_id: "two_step_equations",
    intro: "{player} from the {team} got halfway through this one. Can you finish it?",
    instructions: "Line 1 is right. Write the last line, with x on its own.",
    hints: [
      "In line 1, what's being done to $x$?",
      "${a}x$ means ${a}$ times x. What undoes times?",
      "Divide both sides of line 1 by ${a}$. What's left?",
    ],
    replies: {
      missing_line: "Yes, $x = {answer}$. Dividing by ${a}$ undoes the times ${a}$.",
    },
    asks: {
      subtracted_a: {
        ask: "How did you get rid of the ${a}$ in ${a}x$?",
        nudge: "${a}x$ means ${a}$ times x. Does taking ${a}$ away undo times?",
      },
      not_alone: {
        ask: "That line's true. What's x on its own?",
        nudge: "What's still being done to $x$ in that line?",
      },
      final_other: {
        ask: "How did you get that from line 1?",
        nudge: "What's still being done to $x$ in line 1, and what undoes it?",
      },
    },
    reflection: "What does the number right next to x do to it, and how do you undo that?",
    thanks: "Thanks. A number touching x multiplies it, so dividing is what undoes it.",
  },
  // undo_with_same_operation: adding was "undone" by adding again.
  "repair-inverse-undo": {
    item_id: "repair-inverse-undo",
    template: "balance",
    skill_id: "inverse_operations",
    intro: "A balance scale: one {container} plus some loose {units} on one side. How many {units} are in the {container}?",
    instructions: "Get the {container} alone without tipping the scale.",
    hints: [
      "What's sitting with the {container}, on its side of the scale?",
      "The loose {units} were added to the {container}. What undoes adding?",
      "Take {b_units} off both sides.",
    ],
    replies: {
      solved: "Level, and the {container} is alone: it holds {answer_units}, so $x = {answer}$. Taking away undid the adding.",
    },
    asks: {
      uneven_x: {
        ask: "How many {containers} would go in each group if you split both sides into ${g}$ groups?",
        nudge: "There's only one {container}. What else is on its side that you could take away?",
      },
      uneven_units: {
        ask: "What happens to the loose {units} if you split both sides into ${g}$ groups?",
        nudge: "Is there something to take away instead?",
      },
      too_many: {
        ask: "How many loose {units} are on each side right now?",
        nudge: "You can only take away {units} that are on both sides.",
      },
      nothing: {
        ask: "What would you like to do to both sides?",
        nudge: "Try taking some {units} off both sides.",
      },
    },
    reflection: "The {units} were added to the {container}. How did you undo that, and why from both sides?",
    thanks: "Thanks. Adding is undone by taking away, the same amount from both sides.",
  },
  // undo_scale_by_repeating and undo_scale_with_negative: multiplying undone the wrong way.
  "repair-inverse-divide": {
    item_id: "repair-inverse-divide",
    template: "balance",
    skill_id: "inverse_operations",
    intro: "A balance scale: {containers} on one side, loose {units} on the other. Every {container} holds the same. How many {units} in each?",
    instructions: "Get one {container} alone without tipping the scale.",
    hints: [
      "How many {containers} are there? That's the number x is multiplied by.",
      "The {containers} stand for ${a}$ times x. What undoes times?",
      "Split both sides into ${a}$ equal groups.",
    ],
    replies: {
      solved: "Level, and one {container} is alone: it holds {answer_units}, so $x = {answer}$. Splitting undid the times.",
    },
    asks: {
      uneven_x: {
        ask: "How many {containers} would go in each group if you split both sides into ${g}$ groups?",
        nudge: "Try a number of groups that shares the {containers} out evenly.",
      },
      uneven_units: {
        ask: "What happens to the loose {units} if you split both sides into ${g}$ groups?",
        nudge: "A split has to share both sides out evenly. How many {containers} are there?",
      },
      too_many: {
        ask: "How many loose {units} are on the side with the {containers}?",
        nudge: "There are no loose {units} there to take away. What else could you do to both sides?",
      },
      nothing: {
        ask: "What would you like to do to both sides?",
        nudge: "Try splitting both sides into equal groups.",
      },
    },
    reflection: "The {containers} stood for a number times x. How did you undo the times, and why does the scale stay level?",
    thanks: "Thanks. Multiplying is undone by dividing, the same on both sides.",
  },
};

/** Any item a slip can point at, by id. */
export function itemFor(item_id: string): Item | null {
  return [...Object.values(ITEMS), ...Object.values(REPAIRS)].find((i) => i.item_id === item_id) ?? null;
}

export type Fade = 0 | 1 | 2;

/** The worked example at each fade: everything shown, then the last step theirs, then both. */
export const WORKED_FADES: [Item, Item, Item] = [
  watch,
  {
    ...watch,
    intro: "{player} started this one. You finish it.",
    instructions: "{player} did the first step. Write the last line.",
    hints: [
      "What's still being done to x in line 1?",
      "${a}x$ means ${a}$ times x. What undoes times?",
      "Divide both sides of line 1 by ${a}$. What's left?",
    ],
    reflection: "How did you know to divide by ${a}$ for the last line?",
    thanks: "Thanks. Next one's all yours, every step.",
  },
  {
    ...watch,
    intro: "This one's all yours. Write it a step at a time, the way {player} did.",
    instructions: "Solve it one step at a time.",
    hints: [
      "What does the problem do to x, and in what order?",
      "Undo the adding first. What takes away the $+ {b}$?",
      "Subtract ${b}$ from both sides, then divide by ${a}$.",
    ],
    reflection: "Which step was easiest to write yourself, and which one do you want more practice on?",
    thanks: "Thanks. Knowing which step to practice is how you get faster.",
  },
];

/** What a worked example says about its own lines: the move each makes, and why the first works. */
export const WALKTHROUGH: { reasons: string[]; why: string; choices: { text: string; ask: string | null }[] } = {
  reasons: ["Subtract ${b}$ from both sides.", "Divide both sides by ${a}$."],
  why: "Why does {player} subtract ${b}$ first?",
  // The right reason, then two wrong ones the tutor asks back about. The instance shuffles them.
  choices: [
    { text: "It undoes the $+ {b}$, so ${a}x$ is left on its own.", ask: null },
    { text: "You always subtract before you divide.", ask: "always_subtract" },
    { text: "It gets rid of the ${a}$ in front of $x$.", ask: "wrong_part" },
  ],
};

interface LiveBase {
  item: Item;
  instance_id: string;
  outcomes: Outcomes;
  /** False until the first real attempt, so no hint comes before a try (R-02). */
  tried: boolean;
  hints: number;
  /** Incorrect checks so far, for the de-escalation ladder (R-21). */
  misses: number;
}

/** A puzzle the mock server is running: its numbers stay put when the skin changes. */
export type LivePuzzle =
  | (LiveBase & { template: "spot_the_error"; n: SpotInstance })
  | (LiveBase & { template: "missing_step"; n: MissingInstance })
  | (LiveBase & { template: "balance"; n: BalanceInstance; pans: Pans })
  | (LiveBase & { template: "worked_example"; n: WorkedInstance; fade: Fade });

/** The fade only applies to a worked example; the primer would set it from mastery. */
export function newPuzzle(template: PuzzleTemplate, rng: Rng, instance_id: string, fade: Fade = 0): LivePuzzle {
  const base = { item: ITEMS[template], instance_id, outcomes: {}, tried: false, hints: 0, misses: 0 };
  switch (template) {
    case "spot_the_error":
      return { ...base, template, n: spotTheError(rng) };
    case "missing_step":
      return { ...base, template, n: missingStep(rng) };
    case "balance": {
      const n = balance(rng);
      return { ...base, template, n, pans: n.start };
    }
    case "worked_example":
      return { ...base, item: WORKED_FADES[fade], template, n: workedExample(rng), fade };
  }
}

/**
 * A puzzle for an item, by id. Repair items take their numbers from the generators at the
 * student's level. No item uses a problem from the student's lesson (`avoid`), so a puzzle can't
 * walk through one they still have to solve (R-02).
 */
export function newItemPuzzle(
  item_id: string,
  rng: Rng,
  instance_id: string,
  level: Level = 1,
  avoid: readonly string[] = [],
): LivePuzzle {
  const base = { instance_id, outcomes: {}, tried: false, hints: 0, misses: 0 };
  const item = REPAIRS[item_id];
  switch (item_id) {
    case "repair-two-step-coefficient":
      return { ...base, item: item!, template: "missing_step", n: lastStep(rng, level, avoid) };
    case "repair-inverse-undo":
    case "repair-inverse-divide": {
      const n = oneStepBalance(rng, item_id === "repair-inverse-undo" ? "shift" : "split", avoid);
      return { ...base, item: item!, template: "balance", n, pans: n.start };
    }
  }
  const template = (Object.keys(ITEMS) as PuzzleTemplate[]).find((t) => ITEMS[t].item_id === item_id);
  if (!template) throw new Error(`no item ${item_id}`);
  for (;;) {
    const live = newPuzzle(template, rng, instance_id);
    if (!isOneOf(live.n.latex, avoid)) return live;
  }
}

type Vars = Record<string, string | number>;

function vars(live: LivePuzzle, skin: Skin): Vars {
  const { a, b, c, answer } = live.n;
  const w = skin.words;
  const v: Vars = { ...w, team: skin.team_name, player: skin.player_names[0] ?? "", a, b, c, answer };
  v.answer_units = `${answer} ${answer === 1 ? w.unit : w.units}`;
  v.b_units = `${b} ${b === 1 ? w.unit : w.units}`;
  return v;
}

export function fill(text: string, v: Vars): string {
  return text.replace(/\{(\w+)\}/g, (slot, key: string) => (key in v ? String(v[key]) : slot));
}

/** What the tutor says, filled for this puzzle and skin. */
export function line(live: LivePuzzle, skin: Skin, pick: (item: Item) => string, extra: Vars = {}): string {
  return fill(pick(live.item), { ...vars(live, skin), ...extra });
}

export function toWire(live: LivePuzzle, skin: Skin): Puzzle {
  const base = {
    item_id: live.item.item_id,
    instance_id: live.instance_id,
    skill_id: live.item.skill_id,
    instructions: line(live, skin, (i) => i.instructions),
    equation: live.n.latex,
    skin,
  };
  switch (live.template) {
    case "spot_the_error":
      return { ...base, template: live.template, lines: live.n.linesLatex };
    case "missing_step":
      return { ...base, template: live.template, lines: live.n.linesLatex };
    case "balance":
      return { ...base, template: live.template, start: live.n.start };
    case "worked_example":
      return { ...base, template: live.template, ...walkthrough(live, skin) };
  }
}

/** A worked example's lines and "why" at its fade. Steps the student writes are left out entirely. */
function walkthrough(live: Extract<LivePuzzle, { template: "worked_example" }>, skin: Skin): Pick<WorkedExamplePuzzle, "steps" | "why"> {
  const say = (text: string) => line(live, skin, () => text);
  const [first, last] = live.n.linesLatex;
  const step = (latex: string, i: number, shown: boolean) => (shown ? { latex, reason: say(WALKTHROUGH.reasons[i]!) } : null);
  return {
    // Backward fading: the last step goes to the student first.
    steps: [step(first, 0, live.fade < 2), step(last, 1, live.fade < 1)],
    why: live.fade === 0
      ? { question: say(WALKTHROUGH.why), choices: live.n.order.map((k) => say(WALKTHROUGH.choices[k]!.text)) }
      : null,
  };
}

export interface Verdict {
  check: CheckId;
  outcome: CheckOutcome;
  /** The tutor's line after a correct check. An ordinary scale move gets none. */
  reply?: string;
  /** The ask-first pair after a miss (R-03). */
  ask?: Ask;
  /** Balance: the pans after an accepted move. */
  pans?: Pans;
  /** The puzzle is finished. */
  solved: boolean;
}

/** Grades one move. Null when the move doesn't belong to this puzzle or its current stage. */
export function gradeMove(live: LivePuzzle, move: PuzzleMove, skin: Skin): Verdict | null {
  const say = (pick: (item: Item) => string | undefined, extra: Vars = {}) =>
    line(live, skin, (i) => pick(i) ?? "", extra) || undefined;
  const miss = (check: CheckId, key: string, extra: Vars = {}): Verdict => {
    const a = live.item.asks[key]!;
    const ask = { ask: line(live, skin, () => a.ask, extra), nudge: line(live, skin, () => a.nudge, extra) };
    return { check, outcome: "incorrect", ask, solved: false };
  };
  const pass = (check: CheckId, solved = false): Verdict => ({
    check, outcome: "correct", reply: say((i) => i.replies[check]), solved,
  });
  const unreadable = (check: CheckId): Verdict => ({ check, outcome: "unreadable", solved: false });

  switch (live.template) {
    case "spot_the_error": {
      const n = live.n;
      const stage = spotStage(live.outcomes);
      if (move.check === "found_error" && stage === "find") {
        return move.line === 0 ? pass("found_error") : miss("found_error", "wrong_line");
      }
      if (move.check === "fixed_step" && stage === "fix") {
        const t = move.text;
        if (!readable(t)) return unreadable("fixed_step");
        if (sameLine(t, n.fix)) return pass("fixed_step");
        // Taking b away again, whether simplified or written out as "- b - b".
        if (sameLine(t, n.slip) || sameLine(t, `${n.a}*x - ${2 * n.b} = ${n.c - n.b}`)) return miss("fixed_step", "same_op");
        if (sameLine(t, `x = ${n.answer}`)) return miss("fixed_step", "skipped");
        return miss("fixed_step", "fix_other");
      }
      if (move.check === "final_answer" && stage === "finish") {
        const wrong = Number(n.lines[1]!.split("=")[1]);
        const key = finalAnswer(move.text, n.answer, { value: wrong, key: "old_answer" });
        return key === "correct" ? pass("final_answer", true) : key === "unreadable" ? unreadable("final_answer") : miss("final_answer", key);
      }
      return null;
    }
    case "missing_step": {
      const n = live.n;
      if (move.check !== "missing_line" || missingStage(live.outcomes) !== "fill") return null;
      // The last line blank: x on its own, and taking the a away is the slip to ask about.
      const key = n.blank === "last"
        ? finalAnswer(move.text, n.answer, { value: n.c - n.b - n.a, key: "subtracted_a" })
        : firstMove(move.text, n);
      if (key === "correct") return pass("missing_line", true);
      return key === "unreadable" ? unreadable("missing_line") : miss("missing_line", key);
    }
    case "balance": {
      if (move.check !== "move" || balanceStage(live.outcomes) !== "play") return null;
      const r = applyMove(live.pans, live.n.start, move.move);
      if (!r.ok) return miss("move", r.reason, move.move.op === "split" ? { g: move.move.groups } : {});
      if (isSolved(r.pans)) return { ...pass("solved", true), check: "move", pans: r.pans };
      return { check: "move", outcome: "correct", pans: r.pans, solved: false };
    }
    case "worked_example": {
      const n = live.n;
      const shown = walkthrough(live, skin);
      const stage = workedStage(shown, live.outcomes);
      // Solved when this check passing leaves nothing else to do.
      const finishes = (check: CheckId) => workedStage(shown, { ...live.outcomes, [check]: "correct" }) === "done";
      if (move.check === "why" && stage === "why") {
        const k = n.order[move.choice];
        const choice = k === undefined ? undefined : WALKTHROUGH.choices[k];
        if (!choice) return null;
        return choice.ask ? miss("why", choice.ask) : pass("why", finishes("why"));
      }
      if (move.check === "first_step" && stage === "first_step") {
        // Dividing first is a fine path too, just a harder one.
        const key = sameLine(move.text, n.divideFirst) ? "correct" : firstMove(move.text, n);
        if (key === "correct") return pass("first_step", finishes("first_step"));
        return key === "unreadable" ? unreadable("first_step") : miss("first_step", key);
      }
      if (move.check === "final_answer" && stage === "final_answer") {
        // Taking the a away instead of dividing by it: 3x = 15 gives x = 12.
        const key = finalAnswer(move.text, n.answer, { value: n.c - n.b - n.a, key: "subtracted_a" });
        if (key === "correct") return pass("final_answer", finishes("final_answer"));
        return key === "unreadable" ? unreadable("final_answer") : miss("final_answer", key);
      }
      return null;
    }
  }
}

/** The first move on a*x + b = c, which takes the b off both sides. */
function firstMove(text: string, n: MissingInstance): string {
  const value = bareNumber(text);
  // The answer straight away, as a line or a bare number, skips the step being asked for.
  if (sameLine(text, `x = ${n.answer}`) || (value !== null && Math.abs(value - n.answer) < 1e-9)) return "skipped";
  if (!readable(text)) return "unreadable";
  if (sameLine(text, n.expected)) return "correct";
  // Adding b again, simplified or written out as "+ b + b".
  if (sameLine(text, n.slip) || sameLine(text, `${n.a}*x + ${2 * n.b} = ${n.c + n.b}`)) return "same_op";
  return "other";
}

/**
 * A final answer, per the items' equivalent_to x = {answer} check: "x = 12", "12 = x" and
 * "1x = 12" are x on its own, and a bare number counts too. Another true line isn't finished
 * yet ("not_alone"), and a known wrong value names its slip.
 */
function finalAnswer(text: string, answer: number, slip: { value: number; key: string }): string {
  if (readable(text)) {
    if (sameLine(text, `x = ${answer}`)) return "correct";
    if (hasSolution(text, answer)) return "not_alone";
    return hasSolution(text, slip.value) ? slip.key : "final_other";
  }
  const value = bareNumber(text);
  if (value === null) return "unreadable";
  const is = (k: number) => Math.abs(value - k) < 1e-9;
  if (is(answer)) return "correct";
  return is(slip.value) ? slip.key : "final_other";
}

/** The next hint, or null when they're used up. */
export function nextHint(live: LivePuzzle, skin: Skin): string | null {
  const hint = live.item.hints[live.hints];
  return hint === undefined ? null : line(live, skin, () => hint);
}
