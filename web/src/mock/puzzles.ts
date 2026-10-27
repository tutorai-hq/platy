import { applyMove, isSolved } from "../content/balance";
import { balanceStage, missingStage, type Outcomes, spotStage, workedStage } from "../content/progress";
import type {
  CheckId, CheckOutcome, PaletteId, Pans, Puzzle, PuzzleMove, PuzzleTemplate, Skin, WorkedExamplePuzzle,
} from "../content/types";
import {
  balance, type BalanceInstance, isOneOf, lastStep, type Level, type MissingInstance, missingStep, oneStepBalance, oneStepLine,
  orderChain, type Rng, signChain, type SpotInstance, spotTheError, sumLine, type WorkedInstance, workedExample, type WorkingSpotInstance,
} from "./generate";
import { bareNumber, hasSolution, near, readable, sameLine } from "./grade";
import { isNumeralText, sameExpression, sameSum } from "./working";

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
      ask: "That line's true. What does x equal?",
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
  thanks: "Thanks, undoing the $+ {b}$ first is the step I asked about. Next, {player} starts one and you write the last line.",
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
        ask: "That line's true. What does x equal?",
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
    intro: "This one's a balance scale, and every {container} holds the same number of {units}. How many?",
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

// The asks shared by the items that spot an error in a worked-out expression (the integer and
// order repairs), where the puzzle finishes on the value, not on x.
const WORKING_ASKS: Record<string, Ask> = {
  wrong_line: {
    ask: "What does that line do to the one above it, and does it still come to the same thing?",
    nudge: "Check each line against the one above, starting from the problem. Where does the value change?",
  },
  skipped: {
    ask: "That's where it ends up. What does this line look like with just one more step done?",
    nudge: "Do one operation from the line above, and leave the rest as it is.",
  },
  copied: {
    ask: "That's the line above again. What's the next step from it?",
    nudge: "Work out one operation from the line above, and write what's left.",
  },
  fix_other: {
    ask: "How did you get that from the line above?",
    nudge: "Only one step was wrong in that line. What should it have come to?",
  },
  old_answer: {
    ask: "That's what the old lines gave. Does it still follow from your fixed line?",
    nudge: "Start from your fixed line and work down again, one operation at a time.",
  },
  sign_lost: {
    ask: "Is the result above zero or below it? Go through the signs once more.",
    nudge: "Keep the sign with each number as you go. What's the sign of the last step?",
  },
  not_done: {
    ask: "That's true. What does it come to?",
    nudge: "Work out what's left in that line, and write the one number.",
  },
  final_other: {
    ask: "How did you get that from your fixed line?",
    nudge: "Work down from your fixed line, one operation at a time.",
  },
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
    instructions: "Line 1 is right. Write the last line, with x alone on one side.",
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
        ask: "That line's true. What does x equal?",
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
    intro: "A balance scale with {containers} on one side and loose {units} on the other, every {container} holding the same. How many {units} in each?",
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
  // multiplied_instead_of_divided and coefficient_subtracted: "ax = c" on the scale, where the
  // only move that works is the split. The scale can't draw a negative number in front of x
  // or an x that's divided, so those two slips have their own items below.
  "repair-one-step-coefficient": {
    item_id: "repair-one-step-coefficient",
    template: "balance",
    skill_id: "one_step_equations",
    intro: "A balance scale: {containers} on one side, loose {units} on the other. Every {container} holds the same number of {units}.",
    instructions: "Get one {container} alone without tipping the scale.",
    hints: [
      "How many {containers} are on the scale? That's the number next to x, and it multiplies x.",
      "There's nothing loose to take away on the {containers} side. What else can you do to both sides?",
      "Split both sides into ${a}$ equal groups.",
    ],
    replies: {
      solved: "Level, and one {container} is alone: it holds {answer_units}, so $x = {answer}$. Dividing by ${a}$ undid the times ${a}$.",
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
        nudge: "There are none to take away there. The {containers} stand for a number times x, so what undoes times?",
      },
      nothing: {
        ask: "What would you like to do to both sides?",
        nudge: "Try splitting both sides into equal groups.",
      },
    },
    reflection: "The number next to x multiplies it. How did you undo that on the scale, and why on both sides?",
    thanks: "Thanks. A number next to x multiplies it, so dividing is what undoes it, on both sides.",
  },
  // divided_instead_of_multiplied: x/k = c, and the student writes the one line.
  "repair-one-step-multiply": {
    item_id: "repair-one-step-multiply",
    template: "missing_step",
    skill_id: "one_step_equations",
    intro: "{player} from the {team} wrote this one down and stopped. Finish it.",
    instructions: "Here x is divided by ${k}$. Write the line with x alone on one side.",
    hints: [
      "What's being done to x in the problem?",
      "x is divided by ${k}$. What's the opposite of dividing?",
      "Multiply both sides by ${k}$. What's left?",
    ],
    replies: {
      missing_line: "Yes, $x = {answer}$. Multiplying by ${k}$ undid the dividing.",
    },
    asks: {
      divided_again: {
        ask: "The problem divides x by ${k}$. What did your line do to it?",
        nudge: "Dividing again doesn't undo dividing. What does?",
      },
      not_alone: {
        ask: "That line's true. What does x equal?",
        nudge: "What's still being done to $x$ in that line?",
      },
      final_other: {
        ask: "How did you get that from the problem?",
        nudge: "What's being done to $x$ in the problem, and what undoes it?",
      },
    },
    reflection: "x was divided by a number. How did you undo that, and how could you check your answer?",
    thanks: "Thanks. Dividing is undone by multiplying, and putting the answer back in checks it.",
  },
  // coefficient_sign_dropped: -ax = c, and the sign has to come along.
  "repair-one-step-sign": {
    item_id: "repair-one-step-sign",
    template: "missing_step",
    skill_id: "one_step_equations",
    intro: "{player} from the {team} got stuck on the sign in this one. Finish it.",
    instructions: "Look at the number next to x, sign and all. Write the line with x alone on one side.",
    hints: [
      "What's being done to x, including the sign?",
      "x is multiplied by ${a}$, a negative number. What undoes that?",
      "Divide both sides by ${a}$, and keep the sign. What's left?",
    ],
    replies: {
      missing_line: "Yes, $x = {answer}$. Dividing by ${a}$ undid the times ${a}$, sign and all.",
    },
    asks: {
      sign_dropped: {
        ask: "What number is x multiplied by here, sign and all?",
        nudge: "The sign is part of that number. Does dividing by it change the sign of the answer?",
      },
      not_alone: {
        ask: "That line's true. What does x equal?",
        nudge: "What's still being done to $x$ in that line?",
      },
      final_other: {
        ask: "How did you get that from the problem?",
        nudge: "What's being done to $x$ in the problem, and what undoes it?",
      },
    },
    reflection: "The number next to x had a minus sign. What did that change about the answer?",
    thanks: "Thanks. The sign belongs to the number next to x, so it comes along when you divide.",
  },
  // add_subtract_wrong_direction: x + b = c or x - b = c, with the instructions naming which
  // way to undo, and the student writing the one line.
  "repair-one-step-direction": {
    item_id: "repair-one-step-direction",
    template: "missing_step",
    skill_id: "one_step_equations",
    intro: "{player} from the {team} wrote this one down and stopped. Finish it.",
    instructions: "Here ${b_abs}$ is {done}. Undo that on both sides, then write the line with x alone.",
    hints: [
      "What's being done to x in the problem?",
      "${b_abs}$ is {done}. What's the opposite of that?",
      "{undo_move} both sides. What's left?",
    ],
    replies: {
      missing_line: "Yes, $x = {answer}$. That undid the {done_noun}.",
    },
    asks: {
      same_op: {
        ask: "The problem has ${b_abs}$ {done}. What did your line do with that ${b_abs}$?",
        nudge: "Doing the same thing again doesn't undo it. What's the opposite?",
      },
      not_alone: {
        ask: "That line's true. What does x equal?",
        nudge: "What's still being done to $x$ in that line?",
      },
      final_other: {
        ask: "How did you get that from the problem?",
        nudge: "What's being done to $x$ in the problem, and what undoes it?",
      },
    },
    reflection: "How did you decide whether to add or take away? Would the other way have worked?",
    thanks: "Thanks. Undo means do the opposite: take away what was added, or add back what was taken away.",
  },
  // negative_times_negative_negative, integer_sign_dropped and order_sign_dropped: products of
  // signed numbers worked out, one with its sign wrong, and the lines after it following from it.
  "repair-integer-signs": {
    item_id: "repair-integer-signs",
    template: "spot_the_error",
    skill_id: "integer_arithmetic",
    intro: "{player} from the {team} worked this out, but a sign went wrong somewhere. Let's find it.",
    instructions: "One line of this working is wrong. Tap it, then write what it should say.",
    hints: [
      "Check each line against the one above it. Does it still come to the same thing?",
      "Look at the lines where two numbers are multiplied or divided. What sign should each result have?",
      "Two negatives multiplied or divided make a positive, and one negative makes a negative. Which line breaks that?",
    ],
    replies: {
      found_error: "Yes, that's the one. What should it say?",
      fixed_step: "Right. Now finish it from your line.",
      final_answer: "That's it, ${answer}$. The sign came along the whole way.",
    },
    asks: {
      ...WORKING_ASKS,
      sign: {
        ask: "Look at the two numbers that were multiplied or divided there, signs and all. What sign should the result have?",
        nudge: "Two negatives make a positive, and one negative makes a negative. Which is it here?",
      },
    },
    reflection: "Where did the sign go wrong, and how could you catch that next time?",
    thanks: "Thanks. Checking the sign of each product or quotient as you go catches this one.",
  },
  // subtraction_treated_as_addition: "n1 ± n2 - n3" with its middle line missing, so the last
  // number has to be taken away, not added on.
  "repair-integer-subtraction": {
    item_id: "repair-integer-subtraction",
    template: "missing_step",
    skill_id: "integer_arithmetic",
    intro: "{player} from the {team} worked this out, but the middle line went missing.",
    instructions: "Write line 1: what ${first}$ makes, with the last number still to take away.",
    hints: [
      "Start with the first two numbers. What does ${first}$ make?",
      "Now look at the sign in front of the ${c_abs}$. Is it added on, or taken away?",
      "Write what ${first}$ makes, then keep the minus and the ${c_abs}$ after it.",
    ],
    replies: {
      missing_line: "Yes. ${first}$ makes ${mid}$, and taking away ${c_abs}$ leaves ${answer}$.",
    },
    asks: {
      plus_for_minus: {
        ask: "Look at the sign in front of the ${c_abs}$. Does it add it on, or take it away?",
        nudge: "A minus between two numbers takes the second one away, even when the first is negative.",
      },
      first_plus: {
        ask: "What does ${first}$ make? Look at the sign between those two numbers.",
        nudge: "The first minus takes the second number away. What's left before the last number?",
      },
      skipped: {
        ask: "That's where it ends up. What does the line look like with just the first two numbers worked out?",
        nudge: "Work out ${first}$, and leave the last number as it is.",
      },
      copied: {
        ask: "That's the problem again. What do the first two numbers make?",
        nudge: "Work out ${first}$, then write the last number after it.",
      },
      other: {
        ask: "How did you get that from the problem?",
        nudge: "Work out ${first}$ first, and keep what comes after it.",
      },
    },
    reflection: "How did you keep track of the minus signs in this one?",
    thanks: "Thanks. A minus between numbers takes the next number away, whatever the running total is.",
  },
  // left_to_right_ignoring_precedence: the problem worked strictly left to right, wrong from the
  // line where that first changes the value.
  "repair-order-precedence": {
    item_id: "repair-order-precedence",
    template: "spot_the_error",
    skill_id: "order_of_operations",
    intro: "{player} from the {team} worked this out, but one line went wrong. Let's find it.",
    instructions: "One line of this working is wrong. Tap it, then write what it should say.",
    hints: [
      "Check each line against the one above it. Does it still come to the same thing?",
      "Which operations come first: multiplying and dividing, or adding and taking away?",
      "Multiplying and dividing come before adding and taking away, even when they come later in the line. Which line broke that?",
    ],
    replies: {
      found_error: "Yes, that's the one. What should it say?",
      fixed_step: "Right. Now finish it from your line.",
      final_answer: "That's it, ${answer}$. Multiplying and dividing first, then adding and taking away.",
    },
    asks: {
      ...WORKING_ASKS,
      left_first: {
        ask: "Which operation did you do first in that line, and why that one?",
        nudge: "Being on the left doesn't make an operation first. Which kind of operation comes first?",
      },
    },
    reflection: "Which operation did you do first, and how did you decide?",
    thanks: "Thanks. Deciding what comes first before you start is the whole skill here.",
  },
  // brackets_ignored: the problem worked with its brackets skipped, wrong from the first line.
  "repair-order-brackets": {
    item_id: "repair-order-brackets",
    template: "spot_the_error",
    skill_id: "order_of_operations",
    intro: "{player} from the {team} worked this out, but one line went wrong. Let's find it.",
    instructions: "One line of this working is wrong. Tap it, then write what it should say.",
    hints: [
      "Check each line against the one above it. Does it still come to the same thing?",
      "Look at the brackets in the problem. What's inside them, and when does that get worked out?",
      "Brackets come first: work out what's inside them before anything else. Which line skipped that?",
    ],
    replies: {
      found_error: "Yes, that's the one. What should it say?",
      fixed_step: "Right. Now finish it from your line.",
      final_answer: "That's it, ${answer}$. Brackets first, then the rest in the usual order.",
    },
    asks: {
      ...WORKING_ASKS,
      bracket: {
        ask: "Which part did you work out first there, and why that one?",
        nudge: "Brackets are there to say what comes first. What's inside them?",
      },
    },
    reflection: "What did the brackets change about the order? How do you spot them when you're going fast?",
    thanks: "Thanks. Brackets first, every time, then the usual order.",
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
    thanks: "Thanks, dividing by ${a}$ undoes the times ${a}$. Next you write every step yourself.",
  },
  {
    ...watch,
    intro: "Now you write every step, the way {player} did.",
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
    { text: "It undoes the $+ {b}$, so only ${a}x$ is left.", ask: null },
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
  | (LiveBase & { template: "spot_the_error"; n: WorkingSpotInstance })
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
    case "repair-inverse-divide":
    case "repair-one-step-coefficient": {
      const n = oneStepBalance(rng, item_id === "repair-inverse-undo" ? "shift" : "split", avoid);
      return { ...base, item: item!, template: "balance", n, pans: n.start };
    }
    case "repair-one-step-multiply":
      return { ...base, item: item!, template: "missing_step", n: oneStepLine(rng, "multiply", level, avoid) };
    case "repair-one-step-sign":
      return { ...base, item: item!, template: "missing_step", n: oneStepLine(rng, "sign", level, avoid) };
    case "repair-one-step-direction":
      return { ...base, item: item!, template: "missing_step", n: oneStepLine(rng, "direction", level, avoid) };
    case "repair-integer-signs":
      return { ...base, item: item!, template: "spot_the_error", n: signChain(rng, avoid) };
    case "repair-integer-subtraction":
      return { ...base, item: item!, template: "missing_step", n: sumLine(rng, level, avoid) };
    case "repair-order-precedence":
      return { ...base, item: item!, template: "spot_the_error", n: orderChain(rng, "precedence", level, avoid) };
    case "repair-order-brackets":
      return { ...base, item: item!, template: "spot_the_error", n: orderChain(rng, "brackets", level, avoid) };
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
  const { answer } = live.n;
  const w = skin.words;
  const v: Vars = { ...w, team: skin.team_name, player: skin.player_names[0] ?? "", answer };
  v.answer_units = `${answer} ${answer === 1 ? w.unit : w.units}`;
  // A worked-out expression has no a, b and c.
  if ("a" in live.n) {
    const { a, b, c } = live.n;
    Object.assign(v, { a, b, c, b_units: `${b} ${b === 1 ? w.unit : w.units}` });
  }
  // An instance's own words, like which way to undo (the one-step repairs) or what to work out first.
  return "vars" in live.n ? { ...v, ...live.n.vars } : v;
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
  /** A graded line: "correct", "unreadable" or the key of the ask to use. */
  const verdict = (check: CheckId, key: string, solves: boolean): Verdict =>
    key === "correct" ? pass(check, solves) : key === "unreadable" ? unreadable(check) : miss(check, key);

  switch (live.template) {
    case "spot_the_error": {
      const n = live.n;
      const stage = spotStage(live.outcomes);
      if (n.kind === "working") {
        // The wrong line was found by working the lines out, never by where the slip was planted;
        // the fix is any right next line; the finish is the value itself.
        if (move.check === "found_error" && stage === "find") {
          return move.line === n.wrong ? pass("found_error") : miss("found_error", "wrong_line");
        }
        if (move.check === "fixed_step" && stage === "fix") return verdict("fixed_step", workingFix(move.text, n), false);
        if (move.check === "final_answer" && stage === "finish") return verdict("final_answer", workingFinal(move.text, n.answer, n.slips), true);
        return null;
      }
      if (move.check === "found_error" && stage === "find") {
        // The wrong line, the way the server would find it: the first that no longer has the solution.
        const wrong = n.lines.findIndex((l) => !hasSolution(l, n.answer));
        return move.line === wrong ? pass("found_error") : miss("found_error", "wrong_line");
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
        const key = finalAnswer(move.text, n.answer, [{ value: wrong, key: "old_answer" }]);
        return key === "correct" ? pass("final_answer", true) : key === "unreadable" ? unreadable("final_answer") : miss("final_answer", key);
      }
      return null;
    }
    case "missing_step": {
      const n = live.n;
      if (move.check !== "missing_line" || missingStage(live.outcomes) !== "fill") return null;
      // The last line blank: x alone, with the instance's known wrong lines to ask about (by
      // default, taking the a away instead of dividing by it).
      const key = n.blank === "last"
        ? finalAnswer(move.text, n.answer, n.slips ?? [{ value: n.c - n.b - n.a, key: "subtracted_a" }])
        : n.blank === "working" ? workingLine(move.text, n) : firstMove(move.text, n);
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
        const key = finalAnswer(move.text, n.answer, [{ value: n.c - n.b - n.a, key: "subtracted_a" }]);
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
 * "1x = 12" are x alone, and a bare number counts too. Another true line isn't finished yet
 * ("not_alone"), and a known wrong value names its slip's ask.
 */
function finalAnswer(text: string, answer: number, slips: { value: number; key: string }[]): string {
  const slipKey = (is: (value: number) => boolean) => slips.find((s) => is(s.value))?.key ?? "final_other";
  if (readable(text)) {
    if (sameLine(text, `x = ${answer}`)) return "correct";
    if (hasSolution(text, answer)) return "not_alone";
    return slipKey((v) => hasSolution(text, v));
  }
  const value = bareNumber(text);
  if (value === null) return "unreadable";
  const is = (k: number) => Math.abs(value - k) < 1e-9;
  if (is(answer)) return "correct";
  return slipKey(is);
}

/** The ask for a known wrong value, or null. */
function keyOf(value: number, slips: readonly { value: number; key: string }[]): string | null {
  return slips.find((s) => near(s.value, value))?.key ?? null;
}

/** A line written with its value, "20 - 18 = 2": the line, when the value is right for it. */
function lineOf(text: string): string {
  const parts = text.split("=");
  if (parts.length !== 2) return text;
  const [p, q] = parts as [string, string];
  const [line, value] = isNumeralText(q) ? [p, q] : isNumeralText(p) ? [q, p] : [null, null];
  if (line === null || value === null) return text;
  const v = bareNumber(line);
  const w = bareNumber(value);
  return v !== null && w !== null && near(v, w) ? line.trim() : text;
}

/**
 * The fix for a wrong line of working: any right next line from the line above it. The value by
 * itself skips the step, the line above copied isn't a step, and the same slip again gets its ask.
 */
function workingFix(text: string, n: WorkingSpotInstance): string {
  const line = lineOf(text);
  const value = bareNumber(line);
  if (value === null) return "unreadable";
  if (isNumeralText(line)) return near(value, n.answer) ? "skipped" : keyOf(value, n.fixSlips) ?? "fix_other";
  if (sameExpression(line, n.wrong === 0 ? n.expression : n.lines[n.wrong - 1]!)) return "copied";
  if (near(value, n.answer)) return "correct";
  return keyOf(value, n.fixSlips) ?? "fix_other";
}

/** A worked-out expression's answer: the one number, not a line that still comes to it. */
function workingFinal(text: string, answer: number, slips: readonly { value: number; key: string }[]): string {
  const value = bareNumber(text);
  if (value === null) return "unreadable";
  if (!isNumeralText(text)) return near(value, answer) ? "not_done" : keyOf(value, slips) ?? "final_other";
  return near(value, answer) ? "correct" : keyOf(value, slips) ?? "final_other";
}

/** The middle line of a sum: the first two numbers made one, the last one still taken away. */
function workingLine(text: string, n: MissingInstance): string {
  const line = lineOf(text);
  const value = bareNumber(line);
  if (value === null) return "unreadable";
  const slips = n.slips ?? [];
  if (isNumeralText(line)) return near(value, n.answer) ? "skipped" : keyOf(value, slips) ?? "other";
  if (sameExpression(line, n.equation)) return "copied";
  if (sameSum(line, n.expected)) return "correct";
  return keyOf(value, slips) ?? "other";
}

/** The next hint, or null when they're used up. */
export function nextHint(live: LivePuzzle, skin: Skin): string | null {
  const hint = live.item.hints[live.hints];
  return hint === undefined ? null : line(live, skin, () => hint);
}

/** The puzzle works an expression out (the integer and order repairs): its lines are numbers, not x. */
export function worksOut(live: LivePuzzle): boolean {
  return (live.template === "spot_the_error" && live.n.kind === "working") || (live.template === "missing_step" && live.n.blank === "working");
}

/** The puzzle's problem in checker syntax, so a fresh problem can stay away from it (R-41). */
export function problemOf(live: LivePuzzle): string {
  switch (live.template) {
    case "spot_the_error":
      return live.n.kind === "working" ? live.n.expression : live.n.equation;
    case "missing_step":
    case "worked_example":
      return live.n.equation;
    case "balance":
      return live.n.latex;
  }
}
