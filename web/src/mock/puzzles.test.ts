import { describe, expect, it } from "vitest";
import { PALETTE } from "../content/palette";
import type { PuzzleMove, PuzzleTemplate, Skin } from "../content/types";
import { isOneOf, type Level, LEVELS, seeded, type WorkingSpotInstance } from "./generate";
import { bareNumber, hasSolution, near } from "./grade";
import {
  type Fade, gradeMove, INTERESTS, ITEMS, line, type LivePuzzle, newItemPuzzle, newPuzzle, nextHint, REPAIRS, SKINS, skinFor,
  toWire, WALKTHROUGH, WORKED_FADES,
} from "./puzzles";
import { checkStep } from "./steps";
import { firstWrong, isNumeralText, numeralsIn, sameExpression, unbracketed, workOut } from "./working";

const TEMPLATES: PuzzleTemplate[] = ["spot_the_error", "missing_step", "balance", "worked_example"];
const FADES: Fade[] = [0, 1, 2];
const skin = SKINS.soccer;

/** A lesson puzzle of a template: the spot-the-error one is on an equation, never a worked-out expression. */
type Lesson<T extends PuzzleTemplate> = Exclude<Extract<LivePuzzle, { template: T }>, { n: WorkingSpotInstance }>;

function live<T extends PuzzleTemplate>(template: T, seed = 1, fade: Fade = 0) {
  return newPuzzle(template, seeded(seed), `${template}-1`, fade) as Lesson<T>;
}

/** Grades a move and records its outcome, the way the mock server does. */
function play(p: LivePuzzle, move: PuzzleMove) {
  const v = gradeMove(p, move, skin);
  if (v) {
    p.outcomes[v.check] = v.outcome;
    if (v.pans && p.template === "balance") p.pans = v.pans;
  }
  return v;
}

// Nicknames of real pro teams (NFL, NBA, MLB, NHL, MLS, WNBA, Premier League) and common club
// words. A skin's team may share none.
const REAL_TEAMS = `cardinals falcons ravens bills panthers bears bengals browns cowboys broncos lions packers
  texans colts jaguars chiefs raiders chargers rams dolphins vikings patriots saints giants jets eagles steelers
  49ers seahawks buccaneers titans commanders hawks celtics nets hornets bulls cavaliers mavericks nuggets pistons
  warriors rockets pacers clippers lakers grizzlies heat bucks timberwolves pelicans knicks thunder magic 76ers suns
  blazers kings spurs raptors jazz wizards diamondbacks braves orioles sox cubs reds guardians rockies tigers astros
  royals angels dodgers marlins brewers twins mets yankees athletics phillies pirates padres mariners rays rangers
  jays nationals ducks bruins sabres flames hurricanes blackhawks avalanche jackets stars wings oilers wild
  canadiens predators devils islanders senators flyers penguins sharks kraken blues lightning leafs canucks knights
  capitals mammoth galaxy sounders timbers whitecaps earthquakes dynamo rapids revolution herons aces dream fever
  liberty lynx mercury mystics sparks storm valkyries sky sun tempo union crew fire united city inter
  foxes gunners toffees magpies hammers villans villa cherries bees seagulls clarets cottagers wolves citizens
  canaries owls blades potters baggies cats forest palace rovers wanderers albion athletic county`.split(/\s+/);

describe("interest skins", () => {
  it("fills every slot, with Platy's own colors and made-up teams (R-38)", () => {
    for (const interest of INTERESTS) {
      const s: Skin = SKINS[interest];
      expect(s.interest).toBe(interest);
      expect(PALETTE[s.colors]).toBeDefined();
      expect(s.player_names).toHaveLength(3);
      for (const word of Object.values(s.words)) expect(word.trim()).not.toBe("");
      const words = s.team_name.toLowerCase().split(/\s+/);
      expect(words.filter((w) => REAL_TEAMS.includes(w)), s.team_name).toEqual([]);
    }
  });

  it("names each team so it reads after 'the'", () => {
    for (const interest of INTERESTS) {
      const intro = line(live("spot_the_error"), SKINS[interest], (i) => i.intro);
      expect(intro).not.toMatch(/\bthe team\b/i);
    }
  });

  it("lets the student's color pick replace the interest's default", () => {
    expect(skinFor("gaming", null).colors).toBe("purple_black");
    expect(skinFor("gaming", "green_gold")).toEqual({ ...SKINS.gaming, colors: "green_gold" });
  });
});

describe("puzzle items", () => {
  it("fills every line of text for every skin, with no slot left over", () => {
    const walkthrough = [...WALKTHROUGH.reasons, WALKTHROUGH.why, ...WALKTHROUGH.choices.map((c) => c.text)];
    for (const item of [...TEMPLATES.map((t) => ITEMS[t]), ...WORKED_FADES]) {
      const template = item.template;
      const texts = [
        item.intro, item.instructions, item.reflection, item.thanks, ...item.hints,
        ...Object.values(item.replies), ...Object.values(item.asks).flatMap((a) => [a.ask, a.nudge]),
        ...(template === "worked_example" ? walkthrough : []),
      ];
      for (const interest of INTERESTS) {
        const p = live(template);
        for (const t of texts) {
          const filled = line(p, SKINS[interest], () => t!, { g: 2 });
          expect(filled, t).not.toMatch(/\{\w+\}/);
        }
      }
    }
  });

  it("keeps the math when the skin changes, so a new look never changes the problem", () => {
    const p = live("balance");
    const a = toWire(p, SKINS.soccer);
    const b = toWire(p, SKINS.gaming);
    expect(b.instance_id).toBe(a.instance_id);
    expect(b.equation).toBe(a.equation);
    expect(b.instructions).not.toBe(a.instructions);
  });

  it("says one ball, not one balls", () => {
    const p = live("balance");
    p.n = { ...p.n, b: 1 };
    p.hints = 2;
    expect(nextHint(p, skin)).toContain("Take 1 ball off both sides");
  });

  it("has three hints, none of which gives the answer (R-02)", () => {
    for (const template of TEMPLATES) {
      for (const fade of template === "worked_example" ? FADES : [0 as const]) {
        for (let seed = 1; seed <= 50; seed++) {
          const p = live(template, seed, fade);
          for (let i = 0; i < 3; i++, p.hints++) expect(nextHint(p, skin)).not.toContain(`x = ${p.n.answer}`);
          expect(nextHint(p, skin)).toBeNull();
        }
      }
    }
  });
});

describe("spot the error grading", () => {
  it("walks find, fix, finish to solved", () => {
    const p = live("spot_the_error");
    const { a, b, c, answer } = p.n;
    expect(play(p, { check: "found_error", line: 0 })).toMatchObject({ outcome: "correct", solved: false });
    expect(play(p, { check: "fixed_step", text: `${a}x = ${c + b}` })).toMatchObject({ outcome: "correct" });
    const done = play(p, { check: "final_answer", text: `x = ${answer}` });
    expect(done).toMatchObject({ outcome: "correct", solved: true });
    expect(done?.reply).toContain(`x = ${answer}`);
  });

  it("asks about the tapped line instead of saying which is wrong (R-03)", () => {
    const p = live("spot_the_error");
    const v = play(p, { check: "found_error", line: 1 });
    expect(v).toMatchObject({ outcome: "incorrect", ask: ITEMS.spot_the_error.asks.wrong_line });
  });

  it("won't take the problem copied out, or an equivalent line that isn't the step", () => {
    const p = live("spot_the_error");
    const { a, b, c } = p.n;
    play(p, { check: "found_error", line: 0 });
    expect(play(p, { check: "fixed_step", text: `${a}x - ${b} = ${c}` })?.outcome).toBe("incorrect");
    expect(play(p, { check: "fixed_step", text: `${a}x + 1 = ${c + b + 1}` })?.outcome).toBe("incorrect");
    expect(play(p, { check: "fixed_step", text: `${a}x = ${c} + ${b}` })?.outcome).toBe("correct");
  });

  it("treats taking b away a second time as the same slip", () => {
    const p = live("spot_the_error");
    const { a, b, c } = p.n;
    play(p, { check: "found_error", line: 0 });
    expect(play(p, { check: "fixed_step", text: `${a}x - ${b} - ${b} = ${c} - ${b}` })?.ask?.ask).toContain("What did your line do to the");
    // The problem copied out isn't "where it ends up", so it gets the plain question.
    expect(play(p, { check: "fixed_step", text: `${a}x - ${b} = ${c}` })?.ask?.ask).toBe("How did you get that line from the problem above it?");
  });

  it("spots the same slip again, and a line that skips ahead", () => {
    const p = live("spot_the_error");
    const { a, b, c, answer } = p.n;
    play(p, { check: "found_error", line: 0 });
    const again = play(p, { check: "fixed_step", text: `${a}x = ${c - b}` });
    expect(again?.ask?.ask).toContain(`What did your line do to the $${b}$`);
    expect(play(p, { check: "fixed_step", text: `x = ${answer}` })?.ask?.ask).toContain("before dividing");
    expect(play(p, { check: "fixed_step", text: "x + 1 =" })).toMatchObject({ outcome: "unreadable" });
  });

  it("never grades a step out of order", () => {
    const p = live("spot_the_error");
    expect(gradeMove(p, { check: "fixed_step", text: "2x = 16" }, skin)).toBeNull();
    expect(gradeMove(p, { check: "missing_line", text: "2x = 16" }, skin)).toBeNull();
  });

  it("asks for x on its own when the final answer is a true line that isn't finished", () => {
    const p = live("spot_the_error");
    const { a, b, c, answer } = p.n;
    play(p, { check: "found_error", line: 0 });
    play(p, { check: "fixed_step", text: `${a}x = ${c + b}` });
    const v = play(p, { check: "final_answer", text: `${a}x = ${c + b}` });
    expect(v).toMatchObject({ outcome: "incorrect", ask: { ask: "That line's true. What does x equal?" } });
    expect(play(p, { check: "final_answer", text: `${answer} = x` })).toMatchObject({ outcome: "correct", solved: true });
  });

  it("takes x on its own in any form, the way the item's equivalent_to check says", () => {
    for (const form of ["x = N", "N = x", "1x = N", "N = 1x", "x + 0 = N", "(x) = N", "x/1 = N", "X = N", "N"]) {
      const p = live("spot_the_error");
      const { a, b, c, answer } = p.n;
      play(p, { check: "found_error", line: 0 });
      play(p, { check: "fixed_step", text: `${a}x = ${c + b}` });
      expect(play(p, { check: "final_answer", text: form.replace("N", String(answer)) }), form).toMatchObject({ outcome: "correct", solved: true });
    }
  });

  it("won't take another letter for x", () => {
    const p = live("spot_the_error");
    const { a, b, c, answer } = p.n;
    play(p, { check: "found_error", line: 0 });
    play(p, { check: "fixed_step", text: `${a}x = ${c + b}` });
    expect(play(p, { check: "final_answer", text: `y = ${answer}` })?.outcome).toBe("unreadable");
  });

  it("reads the whole line, not just the part before a stray symbol", () => {
    const p = live("spot_the_error");
    const { a, b, c, answer } = p.n;
    play(p, { check: "found_error", line: 0 });
    for (const junk of [") - 5", " ] 3", " # 3", " % 3"]) {
      expect(play(p, { check: "fixed_step", text: `${a}x = ${c + b}${junk}` })?.outcome, junk).toBe("unreadable");
    }
    play(p, { check: "fixed_step", text: `${a}x = ${c + b}` });
    expect(play(p, { check: "final_answer", text: `x = ${answer * 2} : 2` })?.outcome).toBe("unreadable");
  });

  it("notices when the final answer is the old line's answer", () => {
    const p = live("spot_the_error");
    const { a, b, c } = p.n;
    play(p, { check: "found_error", line: 0 });
    play(p, { check: "fixed_step", text: `${c + b} = ${a}x` });
    const old = Number(p.n.lines[1]!.split("=")[1]);
    expect(play(p, { check: "final_answer", text: String(old) })?.ask).toEqual(
      expect.objectContaining({ ask: expect.stringContaining("old line") }),
    );
  });
});

describe("missing step grading", () => {
  it("won't take the first line copied into the gap", () => {
    for (let seed = 1; seed <= 50; seed++) {
      const p = live("missing_step", seed);
      const { a, b, c } = p.n;
      expect(play(p, { check: "missing_line", text: `${a}x + ${b} = ${c}` })?.outcome).toBe("incorrect");
      expect(play(p, { check: "missing_line", text: `${a}x + ${b + 1} = ${c + 1}` })?.outcome).toBe("incorrect");
    }
  });

  it("accepts the missing line with its sides swapped", () => {
    const p = live("missing_step");
    const { a, b, c } = p.n;
    expect(play(p, { check: "missing_line", text: `${c - b} = ${a}x` })).toMatchObject({ outcome: "correct", solved: true });
  });

  it("asks about adding instead of subtracting, and about skipping ahead", () => {
    const p = live("missing_step");
    const { a, b, c, answer } = p.n;
    expect(play(p, { check: "missing_line", text: `${a}x = ${c + b}` })?.ask?.ask).toContain(`adds $${b}$`);
    expect(play(p, { check: "missing_line", text: `x = ${answer}` })?.ask?.ask).toContain("where the solution ends up");
    expect(play(p, { check: "missing_line", text: String(answer) })?.ask?.ask).toContain("where the solution ends up");
    expect(play(p, { check: "missing_line", text: `${a}x = 1` })?.ask?.ask).toContain("from the problem");
  });
});

describe("balance grading", () => {
  it("refuses splitting first and asks about the loose units", () => {
    const p = live("balance");
    const v = play(p, { check: "move", move: { op: "split", groups: p.n.a } });
    expect(v?.outcome).toBe("incorrect");
    expect(v?.ask?.ask).toBe(`What happens to the loose balls if you split both sides into $${p.n.a}$ groups?`);
    expect(p.pans).toEqual(p.n.start);
  });

  it("asks about the x-containers when they're what won't split", () => {
    const p = live("balance");
    play(p, { check: "move", move: { op: "remove_units", n: p.n.b } });
    const v = play(p, { check: "move", move: { op: "split", groups: p.n.a + 1 } });
    expect(v?.ask?.ask).toBe(`How many kit bags would go in each group if you split both sides into $${p.n.a + 1}$ groups?`);
    expect(v?.ask?.nudge).not.toContain("take away");
  });

  it("solves in two moves and then takes no more", () => {
    const p = live("balance");
    expect(play(p, { check: "move", move: { op: "remove_units", n: p.n.b } })).toMatchObject({ outcome: "correct", solved: false });
    const done = play(p, { check: "move", move: { op: "split", groups: p.n.a } });
    expect(done).toMatchObject({ check: "move", outcome: "correct", solved: true });
    expect(done?.reply).toContain(`$x = ${p.n.answer}$`);
    p.outcomes.solved = "correct";
    expect(gradeMove(p, { check: "move", move: { op: "start_over" } }, skin)).toBeNull();
  });
});

describe("worked example", () => {
  const wire = (p: LivePuzzle) => {
    const w = toWire(p, skin);
    if (w.template !== "worked_example") throw new Error("expected a worked example");
    return w;
  };

  it("hands the student one more step at each fade, and never sends a step they have to write", () => {
    for (let seed = 1; seed <= 50; seed++) {
      const [watch, finish, solo] = FADES.map((fade) => wire(live("worked_example", seed, fade)));
      const { a, b, c, answer } = live("worked_example", seed).n;
      expect(watch!.steps).toEqual([
        { latex: `${a}x = ${c - b}`, reason: `Subtract $${b}$ from both sides.` },
        { latex: `x = ${answer}`, reason: `Divide both sides by $${a}$.` },
      ]);
      expect(watch!.why?.choices).toHaveLength(3);
      // Backward fading: the last step goes to the student first, then the first one too.
      expect(finish!.steps).toEqual([watch!.steps[0], null]);
      expect(solo!.steps).toEqual([null, null]);
      expect(finish!.why).toBeNull();
      expect(solo!.why).toBeNull();
      // A step the student writes isn't on the wire, and nor is the answer (R-02).
      expect(JSON.stringify(finish)).not.toContain(`x = ${answer}`);
      expect(JSON.stringify(solo)).not.toContain(`${a}x = ${c - b}`);
      expect(JSON.stringify(solo)).not.toContain(`x = ${answer}`);
    }
  });

  it("asks why the first step works, and asks back about a wrong reason (R-03)", () => {
    const p = live("worked_example");
    const { a, b } = p.n;
    const at = (k: number) => p.n.order.indexOf(k);
    expect(wire(p).why?.choices[at(0)]).toBe(`It undoes the $+ ${b}$, so only $${a}x$ is left.`);
    expect(play(p, { check: "why", choice: at(1) })?.ask?.ask).toContain(`$${a}x - ${b}$`);
    expect(play(p, { check: "why", choice: at(2) })).toMatchObject({ outcome: "incorrect", ask: { ask: expect.stringContaining("still there") } });
    // The browser's moves aren't trusted: a choice that isn't on screen isn't graded.
    for (const choice of [3, -1, 0.5]) expect(play(p, { check: "why", choice })).toBeNull();
    expect(play(p, { check: "why", choice: at(0) })).toMatchObject({ outcome: "correct", solved: true });
  });

  it("takes the first step either way round, and asks about adding or skipping ahead", () => {
    const p = live("worked_example", 1, 2);
    const { a, b, c, answer } = p.n;
    expect(play(p, { check: "final_answer", text: `x = ${answer}` })).toBeNull();
    expect(play(p, { check: "why", choice: 0 })).toBeNull();
    expect(play(p, { check: "first_step", text: `${a}x = ${c + b}` })?.ask?.ask).toContain(`adds $${b}$`);
    expect(play(p, { check: "first_step", text: `x = ${answer}` })?.ask?.ask).toContain("right after the first move");
    expect(play(p, { check: "first_step", text: String(answer) })?.ask?.ask).toContain("right after the first move");
    expect(play(p, { check: "first_step", text: `${a}x = 1` })?.ask?.ask).toContain("from the problem");
    expect(play(p, { check: "first_step", text: "x +" })?.outcome).toBe("unreadable");
    // Dividing first is a fine path, just a harder one.
    expect(play(live("worked_example", 1, 2), { check: "first_step", text: `x + ${b}/${a} = ${c}/${a}` })?.outcome).toBe("correct");
    expect(play(p, { check: "first_step", text: `${c - b} = ${a}x` })).toMatchObject({ outcome: "correct", solved: false });
    expect(play(p, { check: "final_answer", text: String(answer) })).toMatchObject({ outcome: "correct", solved: true });
  });

  it("asks about subtracting the number in front of x, and about a line that isn't finished", () => {
    const p = live("worked_example", 1, 1);
    const { a, b, c, answer } = p.n;
    // The first step is shown, so it's not the student's to write.
    expect(play(p, { check: "first_step", text: `${a}x = ${c - b}` })).toBeNull();
    expect(play(p, { check: "final_answer", text: `x = ${c - b - a}` })?.ask?.ask).toContain("get rid of the");
    expect(play(p, { check: "final_answer", text: String(c - b - a) })?.ask?.ask).toContain("get rid of the");
    expect(play(p, { check: "final_answer", text: `${a}x = ${c - b}` })?.ask?.ask).toBe("That line's true. What does x equal?");
    const done = play(p, { check: "final_answer", text: `x = ${answer}` });
    expect(done).toMatchObject({ outcome: "correct", solved: true });
    expect(done?.reply).toContain(`$x = ${answer}$`);
  });
});

// R-37: repair items for the slips that had none (R-40), on the existing players. Numbers come
// from the problem generators (R-41) at the student's level.
describe("repair items", () => {
  const repair = <T extends PuzzleTemplate>(id: string, seed = 1, level: Level = 1, avoid?: readonly string[]) =>
    newItemPuzzle(id, seeded(seed), `${id}-1`, level, avoid) as Extract<LivePuzzle, { template: T }>;

  it("fills every line of text for every skin, and no hint gives the puzzle's answer (R-02)", () => {
    for (const item of Object.values(REPAIRS)) {
      const texts = [
        item.intro, item.instructions, item.reflection, item.thanks, ...item.hints,
        ...Object.values(item.replies), ...Object.values(item.asks).flatMap((a) => [a.ask, a.nudge]),
      ];
      for (let seed = 1; seed <= 30; seed++) {
        const p = repair(item.item_id, seed);
        for (const interest of INTERESTS) {
          for (const t of texts) expect(line(p, SKINS[interest], () => t!, { g: 2 }), t).not.toMatch(/\{\w+\}/);
        }
        for (let i = 0; i < 3; i++, p.hints++) expect(nextHint(p, skin)).not.toContain(`x = ${p.n.answer}`);
      }
    }
  });

  it("never shows a problem from the lesson, so a puzzle can't walk through its steps (R-02)", () => {
    // The plain balance puzzle draws 2x + 5 = 17 about once in 60, so 400 seeds would find it.
    const lesson = ["2x + 5 = 17", "3x - 4 = 11", "x + 4 = 9"];
    const ids = [...Object.keys(REPAIRS), ...Object.values(ITEMS).map((i) => i.item_id)];
    for (const id of ids) {
      for (let seed = 1; seed <= 400; seed++) {
        const p = repair(id, seed, 1, lesson);
        expect(isOneOf(p.n.latex, lesson), `${id} ${seed}: ${p.n.latex}`).toBe(false);
      }
    }
  });

  describe("two-step coefficient (missing last line)", () => {
    it("shows the first step and leaves the last line for the student", () => {
      for (let seed = 1; seed <= 50; seed++) {
        const p = repair<"missing_step">("repair-two-step-coefficient", seed);
        const { a, b, c, answer } = p.n;
        expect(p.template).toBe("missing_step");
        expect(p.n.linesLatex).toEqual([`${a}x = ${c - b}`, null]);
        expect(hasSolution(p.n.equation, answer)).toBe(true);
        // No number on screen is the answer, so it can't be copied ("3x - 5" shows a 5).
        expect([a, Math.abs(b), c, c - b]).not.toContain(answer);
      }
    });

    it("asks about subtracting the number in front of x, and about a line that isn't finished", () => {
      const p = repair<"missing_step">("repair-two-step-coefficient");
      const { a, b, c, answer } = p.n;
      expect(play(p, { check: "missing_line", text: `x = ${c - b - a}` })?.ask?.ask).toContain(`get rid of the $${a}$`);
      expect(play(p, { check: "missing_line", text: `${a}x = ${c - b}` })?.ask?.ask).toContain("What does x equal?");
      expect(play(p, { check: "missing_line", text: `x = ${answer}` })).toMatchObject({ outcome: "correct", solved: true });
    });

    it("takes its numbers from the two-step generator at the student's level", () => {
      const negatives = Array.from({ length: 100 }, (_, i) => repair<"missing_step">("repair-two-step-coefficient", i + 1, 2).n)
        .filter((n) => [n.a, n.b, n.c, n.answer].some((v) => v < 0));
      expect(negatives.length).toBeGreaterThan(0);
      // Level 1: small positive numbers ("- 4" there is a subtraction, not a negative number).
      for (let seed = 1; seed <= 100; seed++) {
        const { a, c, answer } = repair<"missing_step">("repair-two-step-coefficient", seed, 1).n;
        expect([a, c, answer].every((v) => v > 0)).toBe(true);
      }
    });
  });

  describe("inverse operations (balance scale)", () => {
    it("undoes adding by taking the units off: one move, then x is alone", () => {
      for (let seed = 1; seed <= 50; seed++) {
        const p = repair<"balance">("repair-inverse-undo", seed);
        expect(p.n.start.left.x).toBe(1);
        expect(p.n.answer).not.toBe(p.n.b);
        expect(p.n.start.right.units).toBeLessThanOrEqual(30);
        expect(play(p, { check: "move", move: { op: "remove_units", n: p.n.b } })).toMatchObject({ outcome: "correct", solved: true });
      }
    });

    it("undoes multiplying by splitting: one move, then x is alone", () => {
      for (let seed = 1; seed <= 50; seed++) {
        const p = repair<"balance">("repair-inverse-divide", seed);
        expect(p.n.start.left).toEqual({ x: p.n.a, units: 0 });
        expect(p.n.answer).not.toBe(p.n.a);
        expect(p.n.start.right.units).toBeLessThanOrEqual(30);
        expect(play(p, { check: "move", move: { op: "split", groups: p.n.a } })).toMatchObject({ outcome: "correct", solved: true });
      }
    });

    it("asks about a split that won't share out, without saying what to do", () => {
      const p = repair<"balance">("repair-inverse-divide");
      const v = play(p, { check: "move", move: { op: "split", groups: p.n.a + 1 } });
      expect(v?.outcome).toBe("incorrect");
      expect(v?.ask?.ask).toContain(`$${p.n.a + 1}$ groups`);
    });
  });

  // The one-step slips (R-40). The scale takes "ax = c"; the other forms are one-line items.
  describe("one-step coefficient (balance scale)", () => {
    it("shows a times-x scale with nothing loose on its side: one split, then x is alone", () => {
      for (let seed = 1; seed <= 50; seed++) {
        const p = repair<"balance">("repair-one-step-coefficient", seed);
        expect(p.item.skill_id).toBe("one_step_equations");
        expect(p.n.start.left).toEqual({ x: p.n.a, units: 0 });
        expect(p.n.answer).not.toBe(p.n.a);
        expect(p.n.start.right.units).toBeLessThanOrEqual(30);
        expect(play(p, { check: "move", move: { op: "split", groups: p.n.a } })).toMatchObject({ outcome: "correct", solved: true });
      }
    });

    it("asks what undoes times when the student tries to take the number away", () => {
      const p = repair<"balance">("repair-one-step-coefficient");
      const v = play(p, { check: "move", move: { op: "remove_units", n: p.n.a } });
      expect(v?.outcome).toBe("incorrect");
      expect(v?.ask?.nudge).toContain("what undoes times");
      expect(play(p, { check: "move", move: { op: "split", groups: p.n.a + 1 } })?.ask?.ask).toContain(`$${p.n.a + 1}$ groups`);
    });
  });

  describe("one-step multiply (the one line)", () => {
    it("shows x divided by a number and leaves the line for the student", () => {
      for (const level of LEVELS) {
        for (let seed = 1; seed <= 50; seed++) {
          const p = repair<"missing_step">("repair-one-step-multiply", seed, level);
          const m = /^x\/(\d+) = (-?\d+)$/.exec(p.n.equation);
          expect(m, p.n.equation).not.toBeNull();
          const [k, c] = [Number(m![1]), Number(m![2])];
          expect(p.n.linesLatex).toEqual([null]);
          expect(p.n.answer).toBe(k * c);
          expect([k, c]).not.toContain(p.n.answer);
          expect(line(p, skin, (i) => i.instructions)).toContain(`divided by $${k}$`);
        }
      }
    });

    it("asks about dividing again, and about a line that isn't finished", () => {
      const p = repair<"missing_step">("repair-one-step-multiply");
      const { c, answer } = p.n;
      const k = Math.round(1 / p.n.a);
      expect(play(p, { check: "missing_line", text: `x = ${c / k}` })?.ask?.ask).toContain("What did your line do to it?");
      expect(play(p, { check: "missing_line", text: String(c / k) })?.ask?.ask).toContain("What did your line do to it?");
      expect(play(p, { check: "missing_line", text: `x/${k} = ${c}` })?.ask?.ask).toBe("That line's true. What does x equal?");
      const done = play(p, { check: "missing_line", text: `x = ${answer}` });
      expect(done).toMatchObject({ outcome: "correct", solved: true });
      expect(done?.reply).toContain(`$x = ${answer}$`);
    });

    it("has negatives at level 2 and small positive numbers at level 1", () => {
      const level2 = Array.from({ length: 100 }, (_, i) => repair<"missing_step">("repair-one-step-multiply", i + 1, 2).n);
      expect(level2.some((n) => n.c < 0)).toBe(true);
      for (let seed = 1; seed <= 100; seed++) {
        const { c, answer } = repair<"missing_step">("repair-one-step-multiply", seed, 1).n;
        expect(c > 0 && answer > 0).toBe(true);
      }
    });
  });

  describe("one-step sign (the one line)", () => {
    it("shows a negative number times x, and never the answer", () => {
      for (const level of LEVELS) {
        for (let seed = 1; seed <= 50; seed++) {
          const p = repair<"missing_step">("repair-one-step-sign", seed, level);
          expect(p.n.equation).toMatch(/^-\d+x = -?\d+$/);
          expect(p.n.linesLatex).toEqual([null]);
          expect(hasSolution(p.n.equation, p.n.answer)).toBe(true);
          expect([p.n.a, -p.n.a, p.n.c, -p.n.c]).not.toContain(p.n.answer);
        }
      }
    });

    it("asks about the sign when the answer lost it", () => {
      const p = repair<"missing_step">("repair-one-step-sign");
      const { answer } = p.n;
      expect(play(p, { check: "missing_line", text: `x = ${-answer}` })?.ask?.ask).toContain("sign and all");
      expect(play(p, { check: "missing_line", text: String(-answer) })?.ask?.ask).toContain("sign and all");
      const done = play(p, { check: "missing_line", text: `x = ${answer}` });
      expect(done).toMatchObject({ outcome: "correct", solved: true });
      expect(done?.reply).toContain("sign and all");
    });
  });

  describe("one-step direction (the one line)", () => {
    it("shows x plus or minus a number, and says which way to undo it", () => {
      for (const level of LEVELS) {
        for (let seed = 1; seed <= 50; seed++) {
          const p = repair<"missing_step">("repair-one-step-direction", seed, level);
          const m = /^x ([+-]) (\d+) = (-?\d+)$/.exec(p.n.equation);
          expect(m, p.n.equation).not.toBeNull();
          const instructions = line(p, skin, (i) => i.instructions);
          expect(instructions).toContain(m![1] === "+" ? "added to x" : "taken away from x");
          expect(instructions).toContain(`$${m![2]}$`);
          expect(p.n.linesLatex).toEqual([null]);
          expect(hasSolution(p.n.equation, p.n.answer)).toBe(true);
          expect([Number(m![2]), Number(m![3])]).not.toContain(p.n.answer);
        }
      }
    });

    it("asks about doing it again instead of undoing it", () => {
      const p = repair<"missing_step">("repair-one-step-direction");
      const { b, c, answer } = p.n;
      expect(play(p, { check: "missing_line", text: `x = ${c + b}` })?.ask?.ask).toContain("What did your line do");
      expect(play(p, { check: "missing_line", text: `x = ${answer}` })).toMatchObject({ outcome: "correct", solved: true });
      p.hints = 2;
      expect(nextHint(p, skin)).toMatch(b > 0 ? /^Take \$\d+\$ away from both sides/ : /^Add \$\d+\$ to both sides/);
    });

    it("has negatives at level 2 and small positive numbers at level 1", () => {
      const level2 = Array.from({ length: 100 }, (_, i) => repair<"missing_step">("repair-one-step-direction", i + 1, 2).n);
      expect(level2.some((n) => n.c < 0 || n.answer < 0)).toBe(true);
      for (let seed = 1; seed <= 100; seed++) {
        const { c, answer } = repair<"missing_step">("repair-one-step-direction", seed, 1).n;
        expect(c > 0 && answer > 0).toBe(true);
      }
    });
  });

  // The integer and order slips (R-40): worked-out expressions, not equations. The wrong line is
  // the first that no longer comes to the problem's value (working.ts), never a planted index.
  const working = (id: string, seed = 1, level: Level = 1, avoid?: readonly string[]) => {
    const p = repair<"spot_the_error">(id, seed, level, avoid);
    if (p.n.kind !== "working") throw new Error(`${id}: expected a worked-out expression`);
    return p as Extract<LivePuzzle, { n: WorkingSpotInstance }>;
  };
  const seedWhere = (id: string, ok: (n: WorkingSpotInstance) => boolean) => {
    for (let seed = 1; seed <= 200; seed++) {
      const p = working(id, seed);
      if (ok(p.n)) return p;
    }
    throw new Error(`${id}: no seed fits`);
  };
  const aboveOf = (n: WorkingSpotInstance) => (n.wrong === 0 ? n.expression : n.lines[n.wrong - 1]!);
  const WORKED = ["repair-integer-signs", "repair-order-precedence", "repair-order-brackets"];

  describe("worked-out expressions (spot the error on a value)", () => {
    it("shows lines that follow from the wrong one, never the last line wrong, and never the answer (R-02)", () => {
      for (const id of WORKED) {
        for (const level of LEVELS) {
          for (let seed = 1; seed <= 50; seed++) {
            const p = working(id, seed, level);
            const { expression, lines, wrong, fix, answer } = p.n;
            const at = `${id} L${level} seed ${seed}: ${expression}`;
            expect(bareNumber(expression), at).toBeCloseTo(answer, 9);
            expect(firstWrong(expression, lines), at).toBe(wrong);
            expect(wrong, at).toBeLessThan(lines.length - 1);
            expect(isNumeralText(lines.at(-1)!), at).toBe(true);
            expect(p.n.linesLatex, at).toHaveLength(lines.length);
            // One slip: the lines after it follow from the wrong value.
            const slipped = bareNumber(lines[wrong]!)!;
            for (const l of lines.slice(wrong + 1)) expect(bareNumber(l), at).toBeCloseTo(slipped, 9);
            // The fix is a right next line from the line above, not that line again.
            expect(["valid", "solved"], at).toContain(checkStep(aboveOf(p.n), fix));
            expect(sameExpression(fix, aboveOf(p.n)), at).toBe(false);
            // No number on screen is the answer, so it can't be copied.
            expect(numeralsIn([expression, ...lines].join(" ")), at).not.toContain(Math.abs(answer));
          }
        }
      }
    });

    it("walks find, fix, finish to the value, graded by what the lines come to (R-37)", () => {
      for (const id of WORKED) {
        const p = working(id);
        const { wrong, fix, answer } = p.n;
        expect(play(p, { check: "found_error", line: wrong })).toMatchObject({ outcome: "correct", solved: false });
        expect(play(p, { check: "fixed_step", text: fix })).toMatchObject({ outcome: "correct", solved: false });
        const done = play(p, { check: "final_answer", text: String(answer) });
        expect(done).toMatchObject({ outcome: "correct", solved: true });
        expect(done?.reply).toContain(`$${answer}$`);
        expect(gradeMove(p, { check: "final_answer", text: String(answer) }, skin)).toBeNull();
      }
    });

    it("asks about the tapped line instead of saying which is wrong (R-03)", () => {
      for (const id of WORKED) {
        const p = working(id);
        const other = p.n.wrong === 0 ? 1 : 0;
        const v = play(p, { check: "found_error", line: other });
        expect(v).toMatchObject({ outcome: "incorrect", ask: REPAIRS[id]!.asks.wrong_line });
        expect(v?.ask?.ask).not.toMatch(/\d/);
      }
    });

    it("takes any right next line as the fix, and asks about skipping, copying, the same slip and the rest", () => {
      const id = "repair-integer-signs";
      const asks = REPAIRS[id]!.asks;
      const p = seedWhere(id, (n) => !isNumeralText(n.fix) && n.answer !== 0 && !near(bareNumber(n.lines.at(-1)!)!, -n.answer));
      const { wrong, lines, fix, answer, fixSlips } = p.n;
      const above = aboveOf(p.n);
      play(p, { check: "found_error", line: wrong });
      expect(play(p, { check: "fixed_step", text: String(answer) })?.ask).toEqual(asks.skipped);
      expect(play(p, { check: "fixed_step", text: above })?.ask).toEqual(asks.copied);
      expect(play(p, { check: "fixed_step", text: lines[wrong]! })?.ask).toEqual(asks.sign);
      expect(play(p, { check: "fixed_step", text: String(fixSlips[0]!.value) })?.ask).toEqual(asks.sign);
      expect(play(p, { check: "fixed_step", text: `${above} + 1000` })?.ask).toEqual(asks.fix_other);
      expect(play(p, { check: "fixed_step", text: "x = 3" })?.outcome).toBe("unreadable");
      expect(play(p, { check: "fixed_step", text: "" })?.outcome).toBe("unreadable");
      // Any line that comes to the value counts, written the way they like.
      expect(play(p, { check: "fixed_step", text: `(${fix})` })).toMatchObject({ outcome: "correct", solved: false });
      // The finish is one number: a true line that isn't finished, the old lines' answer and the lost sign get asks.
      expect(play(p, { check: "final_answer", text: fix })?.ask).toEqual(asks.not_done);
      expect(play(p, { check: "final_answer", text: lines.at(-1)! })?.ask).toEqual(asks.old_answer);
      expect(play(p, { check: "final_answer", text: String(-answer) })?.ask).toEqual(asks.sign_lost);
      expect(play(p, { check: "final_answer", text: String(answer + 1000) })?.ask).toEqual(asks.final_other);
      expect(play(p, { check: "final_answer", text: "x = 5" })?.outcome).toBe("unreadable");
      expect(play(p, { check: "final_answer", text: String(answer) })).toMatchObject({ outcome: "correct", solved: true });
    });

    it("plants the sign slip on a product or quotient of signed numbers (integer signs)", () => {
      for (let seed = 1; seed <= 50; seed++) {
        const p = working("repair-integer-signs", seed);
        expect(p.item.skill_id).toBe("integer_arithmetic");
        const { expression, lines, wrong, fixSlips } = p.n;
        expect(aboveOf(p.n)).toMatch(/[*/]/);
        expect(fixSlips).toEqual([{ value: bareNumber(lines[wrong]!), key: "sign" }]);
        // Level 3 numbers at every level, so there's a signed product or quotient to get wrong.
        expect(expression).toMatch(/-/);
      }
    });

    it("works the problem left to right for the precedence slip, and skips the brackets for the brackets slip", () => {
      for (const level of LEVELS) {
        for (let seed = 1; seed <= 50; seed++) {
          const p = working("repair-order-precedence", seed, level);
          expect(p.item.skill_id).toBe("order_of_operations");
          expect(p.n.lines).toEqual(workOut(p.n.expression, "left_to_right")!.lines);
          expect(p.n.fixSlips[0]!.key).toBe("left_first");
          const q = working("repair-order-brackets", seed, level);
          expect(q.item.skill_id).toBe("order_of_operations");
          expect(q.n.expression).toContain("(");
          expect(q.n.lines).toEqual(workOut(unbracketed(q.n.expression), "usual")!.lines);
          // Skipping the brackets goes wrong on the first line.
          expect(q.n.wrong).toBe(0);
          expect(q.n.fixSlips[0]!.key).toBe("bracket");
        }
      }
    });

    it("gives no hint with a number in it, so none can hold the answer (R-02)", () => {
      for (const id of WORKED) {
        for (let seed = 1; seed <= 20; seed++) {
          const p = working(id, seed);
          for (let i = 0; i < 3; i++, p.hints++) expect(nextHint(p, skin)).not.toMatch(/\d/);
          expect(nextHint(p, skin)).toBeNull();
        }
      }
    });
  });

  describe("integer subtraction (the middle line)", () => {
    const id = "repair-integer-subtraction";

    it("shows a three-number sum with its middle line missing, and the last number taken away", () => {
      for (const level of LEVELS) {
        for (let seed = 1; seed <= 50; seed++) {
          const p = repair<"missing_step">(id, seed, level);
          const at = `L${level} seed ${seed}: ${p.n.equation}`;
          expect(p.item.skill_id).toBe("integer_arithmetic");
          const m = /^(-?\d+) ([+-]) (\d+) - (\d+)$/.exec(p.n.equation);
          expect(m, at).not.toBeNull();
          expect(p.n.blank, at).toBe("working");
          expect(p.n.linesLatex[0], at).toBeNull();
          expect(p.n.linesLatex, at).toHaveLength(2);
          expect(p.n.expected, at).toMatch(/^-?\d+ - \d+$/);
          expect(bareNumber(p.n.expected), at).toBe(p.n.answer);
          expect(bareNumber(p.n.equation), at).toBe(p.n.answer);
          expect(numeralsIn(p.n.equation), at).not.toContain(Math.abs(p.n.answer));
          expect(line(p, skin, (i) => i.instructions), at).toContain(`$${m![1]} ${m![2]} ${m![3]}$`);
          for (let i = 0; i < 3; i++, p.hints++) expect(nextHint(p, skin), at).not.toContain(`$${p.n.answer}$`);
        }
      }
    });

    it("takes the middle line in either order, and asks about a plus for the minus, skipping and copying", () => {
      const asks = REPAIRS[id]!.asks;
      const p = repair<"missing_step">(id);
      const { equation, expected, answer } = p.n;
      const [mid, n3] = expected.split(" - ").map(Number) as [number, number];
      const plus = play(p, { check: "missing_line", text: `${mid} + ${n3}` });
      expect(plus?.ask?.ask).toBe(`Look at the sign in front of the $${n3}$. Does it add it on, or take it away?`);
      expect(plus?.ask?.nudge).toBe(asks.plus_for_minus!.nudge);
      expect(play(p, { check: "missing_line", text: String(answer) })?.ask?.ask).toBe(asks.skipped!.ask);
      expect(play(p, { check: "missing_line", text: equation })?.ask?.ask).toBe(asks.copied!.ask);
      expect(play(p, { check: "missing_line", text: `${expected} - 1000` })?.ask?.ask).toBe(asks.other!.ask);
      expect(play(p, { check: "missing_line", text: "x - 3" })?.outcome).toBe("unreadable");
      const done = play(p, { check: "missing_line", text: `${-n3} + (${mid})` });
      expect(done).toMatchObject({ outcome: "correct", solved: true });
      expect(done?.reply).toContain(`$${answer}$`);
    });

    it("asks about the first minus read as a plus when there are two", () => {
      const asks = REPAIRS[id]!.asks;
      for (let seed = 1; seed <= 200; seed++) {
        const p = repair<"missing_step">(id, seed, 2);
        const m = /^(-?\d+) - (\d+) - (\d+)$/.exec(p.n.equation);
        if (!m) continue;
        const [n1, n2, n3] = m.slice(1).map(Number) as [number, number, number];
        if (!p.n.slips?.some((s) => s.key === "first_plus" && s.value === n1 + n2 - n3)) continue;
        const v = play(p, { check: "missing_line", text: `${n1 + n2} - ${n3}` });
        expect(v?.ask?.ask).toBe(`What does $${n1} - ${n2}$ make? Look at the sign between those two numbers.`);
        expect(v?.ask?.nudge).toBe(asks.first_plus!.nudge);
        return;
      }
      throw new Error("no sum with two minuses in 200 seeds");
    });

    it("has negatives at level 2 and small positive numbers at level 1", () => {
      const level2 = Array.from({ length: 100 }, (_, i) => repair<"missing_step">(id, i + 1, 2).n);
      expect(level2.some((n) => n.a < 0 || n.answer < 0)).toBe(true);
      for (let seed = 1; seed <= 100; seed++) {
        const { a, answer } = repair<"missing_step">(id, seed, 1).n;
        expect(a > 0 && answer >= 0).toBe(true);
      }
    });
  });
});
