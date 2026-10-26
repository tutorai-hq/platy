import { describe, expect, it } from "vitest";
import type { PuzzleMove } from "../content/types";
import type { ClientEvent, PrimerState, ServerEvent } from "../protocol";
import skillMap from "../../../src/platy/skills/data/skill_map.json";
import { PRIMER_CODES, primerText, skillName } from "../content/primer";
import { isOneOf } from "../mock/generate";
import { EXPLAIN_FIRST, LESSON, STEP_LESSON } from "../mock/script";
import { MockTransport } from "./mock";

const FAST = { thinkMs: 0, wordMs: 0, resetMs: 0 };

// The answer-box lesson by default, so its problem ids stay p1 to p3; the demo itself opens
// with STEP_LESSON (R-39).
function harness(lesson = LESSON, seed?: number) {
  const events: ServerEvent[] = [];
  const t = new MockTransport(FAST, seed, lesson);
  void t.start("tutoring", (e) => events.push(e));
  const settle = () => t.whenIdle();
  const send = async (e: ClientEvent) => {
    t.send(e);
    await settle();
  };
  // Full tutor replies, joined from streamed deltas, since `from`.
  const said = (from = 0) => {
    const byId = new Map<string, string>();
    for (const e of events.slice(from)) {
      if (e.type === "tutor_message") byId.set(e.message_id, (byId.get(e.message_id) ?? "") + e.delta);
    }
    return [...byId.values()];
  };
  const problems = () => events.filter((e) => e.type === "problem").map((e) => e.problem_id);
  // The student taps the button to a detour the tutor has ready (`next_up`, R-01).
  const cont = () => send({ type: "continue" });
  return { t, events, settle, send, said, problems, cont };
}

describe("MockTransport", () => {
  it("opens with a greeting and the first problem", async () => {
    const h = harness();
    await h.settle();
    expect(h.said()[0]).toContain("I'm Platy");
    expect(h.problems()).toEqual(["p1"]);
  });

  it("asks for reasoning on the first miss instead of giving the answer (R-02, R-03)", async () => {
    const h = harness();
    await h.settle();
    const mark = h.events.length;
    await h.send({ type: "answer", problem_id: "p1", text: "x = 4" });
    expect(h.events[mark]).toEqual({ type: "answer_result", problem_id: "p1", result: "incorrect" });
    const reply = h.said(mark).join(" ");
    expect(reply).toContain("what you did first");
    expect(reply).not.toContain("x = 5");
  });

  it("names a specific slip when the wrong answer shows one", async () => {
    const h = harness();
    await h.settle();
    const mark = h.events.length;
    await h.send({ type: "answer", problem_id: "p1", text: "15" });
    expect(h.said(mark).join(" ")).toContain("$3x = 15$ is right");
  });

  it("won't hand over the answer when asked", async () => {
    const h = harness();
    await h.settle();
    const mark = h.events.length;
    await h.send({ type: "child_message", text: "just tell me the answer" });
    expect(h.said(mark).join(" ")).toContain("won't just hand it over");
  });

  it("resets and moves on after a correct answer (R-17)", async () => {
    const h = harness();
    await h.settle();
    await h.send({ type: "answer", problem_id: "p1", text: "x=5" });
    expect(h.events).toContainEqual({ type: "reset", reason: "problem_end" });
    expect(h.problems()).toEqual(["p1", "p2"]);
  });

  it("suggests a pause after three misses, then pivots to an easier problem (R-21)", async () => {
    const h = harness();
    await h.settle();
    for (const text of ["1", "2", "3"]) await h.send({ type: "answer", problem_id: "p1", text });
    expect(h.events.at(-1)).toEqual({ type: "pause_suggested" });
    await h.send({ type: "resume" });
    expect(h.events).toContainEqual({ type: "reset", reason: "topic_switch" });
    expect(h.problems()).toEqual(["p1", "warmup"]);
    await h.send({ type: "answer", problem_id: "warmup", text: "5" });
    expect(h.problems()).toEqual(["p1", "warmup", "p1"]);
  });

  it("adds the warm-up only once when a pause comes during the warm-up", async () => {
    const h = harness();
    await h.settle();
    h.t.demo("pause");
    await h.send({ type: "resume" });
    h.t.demo("pause");
    await h.send({ type: "resume" });
    expect(h.problems()).toEqual(["p1", "warmup", "warmup"]);
    await h.send({ type: "answer", problem_id: "warmup", text: "5" });
    expect(h.problems()).toEqual(["p1", "warmup", "warmup", "p1"]);
  });

  it("takes a partial answer to x^2 = 49 and asks for the other root", async () => {
    const h = harness();
    await h.settle();
    await h.send({ type: "answer", problem_id: "p1", text: "5" });
    await h.send({ type: "answer", problem_id: "p2", text: "8" });
    const mark = h.events.length;
    await h.send({ type: "answer", problem_id: "p3", text: "7" });
    expect(h.said(mark).join(" ")).toContain("one more number");
    await h.send({ type: "answer", problem_id: "p3", text: "7 or -7" });
    expect(h.events.at(-1)).toMatchObject({ type: "session_end", solved: 3 });
  });

  describe("puzzles (R-37)", () => {
    const puzzlesIn = (h: ReturnType<typeof harness>) =>
      h.events.flatMap((e) => (e.type === "puzzle" ? [e.puzzle] : []));
    const results = (h: ReturnType<typeof harness>, from = 0) =>
      h.events.slice(from).flatMap((e) => (e.type === "puzzle_result" ? [[e.check, e.outcome]] : []));
    // The numbers of a spot-the-error instance, read back from what the child sees.
    const spotNumbers = (equation: string) => {
      const [a, b, c] = (equation.match(/^(\d+)x - (\d+) = (\d+)$/) ?? []).slice(1).map(Number) as [number, number, number];
      return { a, b, c, answer: (c + b) / a };
    };

    it("sends a slip with a repair puzzle there first, then back to the problem", async () => {
      const h = harness();
      await h.settle();
      await h.send({ type: "answer", problem_id: "p1", text: "25/3" });
      expect(h.said().join(" ")).toContain("I have a hunch");
      await h.cont();
      expect(h.events).toContainEqual({ type: "topic_switch", label: "Quick puzzle" });
      const [puzzle] = puzzlesIn(h);
      if (puzzle?.template !== "spot_the_error") throw new Error("expected spot the error");
      const { a, b, c, answer } = spotNumbers(puzzle.equation);
      const id = puzzle.instance_id;
      await h.send({ type: "puzzle_move", instance_id: id, move: { check: "found_error", line: 0 } });
      await h.send({ type: "puzzle_move", instance_id: id, move: { check: "fixed_step", text: `${a}x = ${c + b}` } });
      const mark = h.events.length;
      await h.send({ type: "puzzle_move", instance_id: id, move: { check: "final_answer", text: String(answer) } });
      expect(h.said(mark).join(" ")).toContain("What made you suspect that line?");
      await h.send({ type: "child_message", text: "the minus looked off" });
      await h.send({ type: "puzzle_next", instance_id: id });
      expect(h.events).toContainEqual({ type: "puzzle_done", instance_id: id });
      expect(h.problems()).toEqual(["p1", "p1"]);
      expect(h.said().join(" ")).toContain("back to the one from before");
      expect(results(h)).toEqual([["found_error", "correct"], ["fixed_step", "correct"], ["final_answer", "correct"]]);
    });

    it("repairs a slip only once, then names it", async () => {
      const h = harness();
      await h.settle();
      await h.send({ type: "answer", problem_id: "p1", text: "25/3" });
      await h.cont();
      h.t.demo("skip");
      await h.settle();
      const mark = h.events.length;
      await h.send({ type: "answer", problem_id: "p1", text: "25/3" });
      expect(h.said(mark).join(" ")).toContain("the $5$ got added to both sides");
      expect(puzzlesIn(h)).toHaveLength(1);
    });

    it("asks first after a miss, and nudges only once the child explains (R-03)", async () => {
      const h = harness();
      await h.settle();
      h.t.demo("spot_the_error");
      await h.settle();
      const id = puzzlesIn(h)[0]!.instance_id;
      let mark = h.events.length;
      await h.send({ type: "puzzle_move", instance_id: id, move: { check: "found_error", line: 1 } });
      expect(results(h, mark)).toEqual([["found_error", "incorrect"]]);
      expect(h.said(mark)).toEqual(["What does that line do to both sides, and does it follow from the line just above it?"]);
      mark = h.events.length;
      await h.send({ type: "child_message", text: "it divides by 2" });
      expect(h.said(mark).join(" ")).toContain("Check each line against the one before it");
    });

    it("gives no hint before a first try (R-02)", async () => {
      const h = harness();
      await h.settle();
      h.t.demo("missing_step");
      await h.settle();
      const id = puzzlesIn(h)[0]!.instance_id;
      let mark = h.events.length;
      await h.send({ type: "puzzle_hint", instance_id: id });
      expect(h.said(mark).join(" ")).toContain("one try first");
      await h.send({ type: "puzzle_move", instance_id: id, move: { check: "missing_line", text: "x = 0" } });
      await h.send({ type: "child_message", text: "I guessed" });
      mark = h.events.length;
      await h.send({ type: "puzzle_hint", instance_id: id });
      expect(h.said(mark).join(" ")).toContain("the problem and the last line");
    });

    it("changes the skin without touching the math or the progress (R-38)", async () => {
      const h = harness();
      await h.settle();
      h.t.demo("balance");
      await h.settle();
      const first = puzzlesIn(h)[0]!;
      if (first.template !== "balance") throw new Error("expected balance");
      const { left } = first.start;
      await h.send({ type: "puzzle_move", instance_id: first.instance_id, move: { check: "move", move: { op: "remove_units", n: left.units } } });
      h.t.demo("interest");
      await h.settle();
      await h.send({ type: "slot_pick", colors: "green_gold" });
      const [, football, picked] = puzzlesIn(h);
      expect(football).toMatchObject({ instance_id: first.instance_id, equation: first.equation });
      expect(football?.skin.interest).toBe("football");
      expect(picked?.skin).toMatchObject({ interest: "football", colors: "green_gold" });
      // The scale picks up where it was: the loose units are already gone.
      const mark = h.events.length;
      await h.send({ type: "puzzle_move", instance_id: first.instance_id, move: { check: "move", move: { op: "split", groups: left.x } } });
      expect(results(h, mark)).toEqual([["move", "correct"], ["solved", "correct"]]);
    });

    it("refuses a scale move that can't be done to both pans, and asks about it", async () => {
      const h = harness();
      await h.settle();
      h.t.demo("balance");
      await h.settle();
      const p = puzzlesIn(h)[0]!;
      if (p.template !== "balance") throw new Error("expected balance");
      const mark = h.events.length;
      await h.send({ type: "puzzle_move", instance_id: p.instance_id, move: { check: "move", move: { op: "split", groups: p.start.left.x } } });
      expect(results(h, mark)).toEqual([["move", "incorrect"]]);
      expect(h.said(mark).join(" ")).toContain("What happens to the loose balls");
    });

    it("drops the puzzle when a pause leads to the warm-up, and tutors normally after", async () => {
      const h = harness();
      await h.settle();
      h.t.demo("balance");
      await h.settle();
      h.t.demo("pause");
      await h.settle();
      await h.send({ type: "resume" });
      expect(h.problems()).toEqual(["p1", "warmup"]);
      let mark = h.events.length;
      await h.send({ type: "child_message", text: "help" });
      expect(h.said(mark).join(" ")).toContain("What number plus $4$ makes $9$?");
      await h.send({ type: "answer", problem_id: "warmup", text: "5" });
      expect(h.problems()).toEqual(["p1", "warmup", "p1"]);
      mark = h.events.length;
      await h.send({ type: "child_message", text: "help" });
      expect(h.said(mark).join(" ")).toContain("What's happening to $x$?");
    });

    it("doesn't count an unreadable line as a first try", async () => {
      const h = harness();
      await h.settle();
      h.t.demo("missing_step");
      await h.settle();
      const id = puzzlesIn(h)[0]!.instance_id;
      await h.send({ type: "puzzle_move", instance_id: id, move: { check: "missing_line", text: "?" } });
      const mark = h.events.length;
      await h.send({ type: "puzzle_hint", instance_id: id });
      expect(h.said(mark).join(" ")).toContain("one try first");
    });

    it("won't offer a hint it can't give yet when asked for the answer before a try", async () => {
      const h = harness();
      await h.settle();
      h.t.demo("spot_the_error");
      await h.settle();
      const mark = h.events.length;
      await h.send({ type: "child_message", text: "just tell me the answer" });
      const reply = h.said(mark).join(" ");
      expect(reply).toContain("one try first");
      expect(reply).not.toContain("Want a hint?");
    });

    it("waits for the child's explanation before giving a hint after a miss (R-03)", async () => {
      const h = harness();
      await h.settle();
      h.t.demo("spot_the_error");
      await h.settle();
      const id = puzzlesIn(h)[0]!.instance_id;
      await h.send({ type: "puzzle_move", instance_id: id, move: { check: "found_error", line: 1 } });
      let mark = h.events.length;
      await h.send({ type: "puzzle_hint", instance_id: id });
      await h.send({ type: "puzzle_hint", instance_id: id });
      expect(h.said(mark)).toEqual([EXPLAIN_FIRST, EXPLAIN_FIRST]);
      await h.send({ type: "child_message", text: "it divides by the number" });
      mark = h.events.length;
      await h.send({ type: "puzzle_hint", instance_id: id });
      expect(h.said(mark).join(" ")).toContain("Go line by line");
    });

    it("suggests a pause after three misses on a puzzle, as on a problem (R-21)", async () => {
      const h = harness();
      await h.settle();
      h.t.demo("missing_step");
      await h.settle();
      const id = puzzlesIn(h)[0]!.instance_id;
      for (const text of ["x = 0", "x = 100", "x = 101"]) {
        await h.send({ type: "puzzle_move", instance_id: id, move: { check: "missing_line", text } });
        if (!h.events.some((e) => e.type === "pause_suggested")) await h.send({ type: "child_message", text: "I guessed" });
      }
      expect(h.events.filter((e) => e.type === "pause_suggested")).toHaveLength(1);
      await h.send({ type: "resume" });
      expect(h.problems()).toEqual(["p1", "warmup"]);
    });

    it("gives no hint once the puzzle is solved, while the reflection question waits", async () => {
      const h = harness();
      await h.settle();
      h.t.demo("balance");
      await h.settle();
      const p = puzzlesIn(h)[0]!;
      if (p.template !== "balance") throw new Error("expected balance");
      await h.send({ type: "puzzle_move", instance_id: p.instance_id, move: { check: "move", move: { op: "remove_units", n: p.start.left.units } } });
      await h.send({ type: "puzzle_move", instance_id: p.instance_id, move: { check: "move", move: { op: "split", groups: p.start.left.x } } });
      const mark = h.events.length;
      await h.send({ type: "puzzle_hint", instance_id: p.instance_id });
      expect(h.said(mark)).toEqual([]);
    });

    it("fades a worked example from watching to writing every step, then goes back (R-37)", async () => {
      const h = harness();
      await h.settle();
      h.t.demo("worked_example");
      await h.settle();
      expect(h.events).toContainEqual({ type: "topic_switch", label: "Worked example" });
      const latest = () => {
        const p = puzzlesIn(h).at(-1);
        if (p?.template !== "worked_example") throw new Error("expected a worked example");
        const [a, b, c] = (p.equation.match(/^(\d+)x \+ (\d+) = (\d+)$/) ?? []).slice(1).map(Number) as [number, number, number];
        return { p, a, b, c, answer: (c - b) / a };
      };
      const move = (id: string, m: PuzzleMove) => h.send({ type: "puzzle_move", instance_id: id, move: m });

      const watch = latest().p;
      expect(watch.steps.every((s) => s !== null)).toBe(true);
      await move(watch.instance_id, { check: "why", choice: watch.why!.choices.findIndex((t) => t.startsWith("It undoes")) });
      await h.send({ type: "puzzle_next", instance_id: watch.instance_id });
      expect(h.events).toContainEqual({ type: "puzzle_done", instance_id: watch.instance_id });

      const finish = latest();
      expect(finish.p.steps.map((s) => s !== null)).toEqual([true, false]);
      await move(finish.p.instance_id, { check: "final_answer", text: `x = ${finish.answer}` });
      await h.send({ type: "child_message", text: "ready" });
      await h.send({ type: "puzzle_next", instance_id: finish.p.instance_id });

      const solo = latest();
      expect(solo.p.steps).toEqual([null, null]);
      await move(solo.p.instance_id, { check: "first_step", text: `${solo.a}x = ${solo.c - solo.b}` });
      const mark = h.events.length;
      await move(solo.p.instance_id, { check: "final_answer", text: String(solo.answer) });
      expect(h.said(mark).join(" ")).toContain("Which step");
      await h.send({ type: "puzzle_next", instance_id: solo.p.instance_id });
      expect(new Set(puzzlesIn(h).map((p) => p.instance_id)).size).toBe(3);
      expect(h.problems()).toEqual(["p1", "p1"]);
    });

    it("moves on from a finished puzzle when the child taps keep going", async () => {
      const h = harness();
      await h.settle();
      h.t.demo("balance");
      await h.settle();
      const p = puzzlesIn(h)[0]!;
      if (p.template !== "balance") throw new Error("expected balance");
      const id = p.instance_id;
      await h.send({ type: "puzzle_next", instance_id: id });
      expect(h.events).not.toContainEqual({ type: "puzzle_done", instance_id: id });
      await h.send({ type: "puzzle_move", instance_id: id, move: { check: "move", move: { op: "remove_units", n: p.start.left.units } } });
      await h.send({ type: "puzzle_move", instance_id: id, move: { check: "move", move: { op: "split", groups: p.start.left.x } } });
      await h.send({ type: "puzzle_next", instance_id: id });
      expect(h.events).toContainEqual({ type: "puzzle_done", instance_id: id });
      expect(h.problems()).toEqual(["p1", "p1"]);
    });
  });

  describe("self-explanation (R-03, teen test 2026-10-26)", () => {
    // A tester answered "what do you undo first, and why?" and the screen moved on at once,
    // wiping their words and Platy's reply.
    const explained = async () => {
      const h = harness();
      await h.settle();
      h.t.demo("worked_example");
      await h.settle();
      const p = h.events.flatMap((e) => (e.type === "puzzle" ? [e.puzzle] : []))[0]!;
      if (p.template !== "worked_example") throw new Error("expected a worked example");
      const b = /\+ (\d+) =/.exec(p.equation)![1]!;
      await h.send({ type: "puzzle_move", instance_id: p.instance_id, move: { check: "why", choice: p.why!.choices.findIndex((t) => t.startsWith("It undoes")) } });
      expect(h.said().join(" ")).toContain("In your own words");
      return { h, id: p.instance_id, b };
    };

    it("answers the student's why, naming the step it asked about, and stays on the puzzle", async () => {
      const { h, b } = await explained();
      const mark = h.events.length;
      await h.send({ type: "child_message", text: "you do the plus first becuse it is alone" });
      expect(h.said(mark)).toEqual([`Thanks. Undoing the $+ ${b}$ first is the step I asked about. Next, Ade starts one and you write the last line.`]);
      expect(h.events.slice(mark).map((e) => e.type)).not.toContain("reset");
      expect(h.events.slice(mark).map((e) => e.type)).not.toContain("puzzle_done");
    });

    it("moves on only when the student taps Keep going", async () => {
      const { h, id } = await explained();
      await h.send({ type: "child_message", text: "because it's added last" });
      let mark = h.events.length;
      await h.send({ type: "child_message", text: "ok" });
      expect(h.said(mark)).toEqual(["Tap Keep going when you're ready."]);
      mark = h.events.length;
      await h.send({ type: "puzzle_next", instance_id: id });
      expect(h.events.slice(mark)).toContainEqual({ type: "puzzle_done", instance_id: id });
    });
  });

  it("goes quiet once closed", async () => {
    const h = harness();
    await h.settle();
    h.t.close();
    const mark = h.events.length;
    await h.send({ type: "hint_requested", problem_id: "p1" });
    expect(h.events.length).toBe(mark);
  });

  describe("step-by-step problems (R-39)", () => {
    const steps = () => harness(STEP_LESSON);
    const results = (h: ReturnType<typeof harness>, from = 0) =>
      h.events.slice(from).filter((e) => e.type === "step_result").map((e) => (e.type === "step_result" ? e.result : null));
    // The first miss on a two-step problem starts probing (R-01); passing the first probe leads
    // straight back. The tests below start from there, with `from` marking the events after it.
    const probed = async (seed?: number) => {
      const h = harness(STEP_LESSON, seed);
      await h.settle();
      await h.send({ type: "step", problem_id: "s1", line: 1, text: "2x = 99" });
      await h.cont();
      await h.send({ type: "answer", problem_id: "one_step_equations.1", text: "5" });
      await h.cont();
      expect(h.problems()).toEqual(["s1", "one_step_equations.1", "s1"]);
      return Object.assign(h, { from: h.events.length });
    };

    it("opens the demo with step-by-step problems", async () => {
      const demo = new MockTransport(FAST);
      const events: ServerEvent[] = [];
      void demo.start("tutoring", (e) => events.push(e));
      await demo.whenIdle();
      expect(events.find((e) => e.type === "problem")).toMatchObject({ problem_id: "s1", prompt: "2x + 5 = 17", format: "steps" });
    });

    it("checks each line against the one above, and finishes on a solved line", async () => {
      const h = steps();
      await h.settle();
      await h.send({ type: "step", problem_id: "s1", line: 1, text: "2x = 12" });
      await h.send({ type: "step", problem_id: "s1", line: 2, text: "x = 6" });
      expect(results(h)).toEqual(["valid", "solved"]);
      expect(h.events).toContainEqual({ type: "reset", reason: "problem_end" });
      expect(h.problems()).toEqual(["s1", "s2"]);
    });

    it("accepts a skipped-but-valid line", async () => {
      const h = steps();
      await h.settle();
      await h.send({ type: "step", problem_id: "s1", line: 1, text: "x = 6" });
      expect(results(h)).toEqual(["solved"]);
    });

    // A wrong line that matches no slip, so no repair puzzle takes over (that's tested below).
    it("marks a wrong line, asks what happened, and never gives the next line (R-02, R-03)", async () => {
      const h = await probed();
      const mark = h.events.length;
      await h.send({ type: "step", problem_id: "s1", line: 1, text: "2x = 99" });
      expect(results(h, mark)).toEqual(["invalid"]);
      const reply = h.said(mark).join(" ");
      expect(reply).toBe(STEP_LESSON[0]!.askWhy);
      expect(reply).not.toMatch(/2x = 12|x = 6/);
      // The wrong line isn't kept: the next try is still line 1, checked against the problem.
      await h.send({ type: "step", problem_id: "s1", line: 1, text: "2x = 12" });
      expect(results(h, mark)).toEqual(["invalid", "valid"]);
    });

    it("forgets its question about a wrong line once the student fixes the line", async () => {
      const h = await probed();
      await h.send({ type: "step", problem_id: "s1", line: 1, text: "2x = 99" });
      await h.send({ type: "step", problem_id: "s1", line: 1, text: "2x = 12" });
      const mark = h.events.length;
      await h.send({ type: "child_message", text: "help" });
      expect(h.said(mark).join(" ")).toBe(STEP_LESSON[0]!.hints[0]);
    });

    it("names the slip a wrong line matches, and none for a correct or unknown one (R-40)", async () => {
      const h = await probed();
      await h.send({ type: "step", problem_id: "s1", line: 1, text: "2x = 99" });
      await h.send({ type: "step", problem_id: "s1", line: 1, text: "2x = 12" });
      // Line 2: a one-step slip on a two-step problem, the gap one level down. Its repair item
      // isn't built yet, so the hint on the line is all that happens.
      await h.send({ type: "step", problem_id: "s1", line: 2, text: "x = 10" });
      const slips = h.events.slice(h.from).filter((e) => e.type === "step_result").map((e) => (e.type === "step_result" ? (e.slip ?? null) : null));
      expect(slips).toEqual([null, null, "coefficient_subtracted"]);
      expect(h.events.some((e) => e.type === "puzzle")).toBe(false);
    });

    it("sends a slip on 2x + 5 = 17 to its repair puzzle, then confirms the fix on a fresh problem (R-37, R-41)", async () => {
      const h = await probed();
      await h.send({ type: "step", problem_id: "s1", line: 1, text: "2x = 22" });
      await h.cont();
      expect(h.events.filter((e) => e.type === "step_result").at(-1)).toMatchObject({ slip: "constant_moved_without_undoing" });
      expect(h.events).toContainEqual({ type: "topic_switch", label: "Quick puzzle" });
      const puzzle = h.events.flatMap((e) => (e.type === "puzzle" ? [e.puzzle] : []))[0];
      if (puzzle?.template !== "spot_the_error") throw new Error("expected the spot-the-error repair");
      expect(puzzle.item_id).toBe("lin2-undo-sign-spot-error");
      const [a, b, c] = (/^(\d+)x - (\d+) = (\d+)$/.exec(puzzle.equation) ?? []).slice(1).map(Number) as [number, number, number];
      const id = puzzle.instance_id;
      await h.send({ type: "puzzle_move", instance_id: id, move: { check: "found_error", line: 0 } });
      await h.send({ type: "puzzle_move", instance_id: id, move: { check: "fixed_step", text: `${a}x = ${c + b}` } });
      await h.send({ type: "puzzle_move", instance_id: id, move: { check: "final_answer", text: String((c + b) / a) } });
      await h.send({ type: "child_message", text: "the minus sign" });
      await h.send({ type: "puzzle_next", instance_id: id });

      // Not back to 2x + 5 = 17: a fresh generated problem of the same kind takes its place.
      const fresh = h.events.filter((e) => e.type === "problem").at(-1);
      if (fresh?.type !== "problem") throw new Error("expected a problem");
      expect(fresh).toMatchObject({ skill_id: "two_step_equations", format: "steps", position: 1 });
      expect(fresh.problem_id).not.toBe("s1");
      expect(fresh.prompt).not.toBe("2x + 5 = 17");
      expect(h.said().join(" ")).toContain("fresh one");
      const [, ca, sign, cb, cc] = /^(-?\d+)x ([+-]) (\d+) = (-?\d+)$/.exec(fresh.prompt) ?? [];
      const answer = (Number(cc) - (sign === "-" ? -1 : 1) * Number(cb)) / Number(ca);
      await h.send({ type: "step", problem_id: fresh.problem_id, line: 1, text: `x = ${answer}` });
      expect(results(h).at(-1)).toBe("solved");
      expect(h.problems()).toEqual(["s1", "one_step_equations.1", "s1", fresh.problem_id, "s2"]);
    });

    // Seeds where the fresh problem once came out as s2 (4208) or as the repair puzzle (4144).
    it("never confirms the fix on a problem from the lesson or on the repair puzzle itself (R-41)", async () => {
      const lesson = STEP_LESSON.map((p) => p.prompt);
      for (const seed of [4208, 4144, 5786, 11628, ...Array.from({ length: 20 }, (_, i) => i + 1)]) {
        const h = await probed(seed);
        await h.send({ type: "step", problem_id: "s1", line: 1, text: "2x = 22" });
        await h.cont();
        const puzzle = h.events.flatMap((e) => (e.type === "puzzle" ? [e.puzzle] : []))[0];
        if (puzzle?.template !== "spot_the_error") throw new Error("expected the spot-the-error repair");
        expect(isOneOf(puzzle.equation, lesson), `${seed}: ${puzzle.equation}`).toBe(false);
        h.t.demo("skip");
        await h.settle();
        const fresh = h.events.filter((e) => e.type === "problem").at(-1);
        if (fresh?.type !== "problem") throw new Error("expected a problem");
        expect(fresh.problem_id).toBe("g1");
        expect(isOneOf(fresh.prompt, [...lesson, puzzle.equation]), `${seed}: ${fresh.prompt}`).toBe(false);
      }
    });

    it("still brings a fresh problem, not the slipped one, after a pause during the repair (R-02, R-21)", async () => {
      const h = await probed();
      await h.send({ type: "step", problem_id: "s1", line: 1, text: "2x = 22" });
      await h.cont();
      h.t.demo("pause");
      await h.settle();
      await h.send({ type: "resume" });
      await h.send({ type: "answer", problem_id: "warmup", text: "5" });
      expect(h.problems()).toEqual(["s1", "one_step_equations.1", "s1", "warmup", "g1"]);
      const fresh = h.events.filter((e) => e.type === "problem").at(-1);
      expect(fresh).toMatchObject({ skill_id: "two_step_equations", format: "steps" });
    });

    it("ignores a line out of order or for another problem", async () => {
      const h = steps();
      await h.settle();
      await h.send({ type: "step", problem_id: "s1", line: 2, text: "x = 6" });
      await h.send({ type: "step", problem_id: "p1", line: 1, text: "x = 6" });
      expect(results(h)).toEqual([]);
    });

    it("says so for an unreadable line", async () => {
      const h = steps();
      await h.settle();
      const mark = h.events.length;
      await h.send({ type: "step", problem_id: "s1", line: 1, text: "6" });
      expect(results(h)).toEqual(["unreadable"]);
      expect(h.said(mark).join(" ")).toContain("couldn't read that line");
    });

    it("doesn't take a typed answer in place of the lines", async () => {
      const h = steps();
      await h.settle();
      await h.send({ type: "answer", problem_id: "s1", text: "x = 6" });
      expect(h.events.some((e) => e.type === "answer_result")).toBe(false);
      expect(h.problems()).toEqual(["s1"]);
    });

    it("suggests a pause after three wrong lines (R-21)", async () => {
      const h = await probed();
      for (const text of ["2x = 99", "2x = 17", "x = 13"]) await h.send({ type: "step", problem_id: "s1", line: 1, text });
      expect(h.events.at(-1)).toEqual({ type: "pause_suggested" });
    });
  });

  // Teen test 2026-10-26: two "fresh page" cards and 3 to 6 seconds with nothing to tap between
  // problems. Now the solved card stays with a "Next problem" button that also moves on by itself.
  describe("the moment between problems (R-17, teen test 2026-10-26)", () => {
    const timed = (nextMs: number) => {
      const events: ServerEvent[] = [];
      const t = new MockTransport({ ...FAST, nextMs }, undefined, LESSON);
      void t.start("tutoring", (e) => events.push(e));
      return { t, events };
    };

    it("keeps the solved problem on screen with a Next button, and moves on when it's tapped", async () => {
      const { t, events } = timed(60_000);
      await t.whenIdle();
      t.send({ type: "answer", problem_id: "p1", text: "x = 5" });
      await t.whenIdle();
      expect(events.at(-1)).toEqual({ type: "next_up", label: "Next problem" });
      expect(events.some((e) => e.type === "reset")).toBe(false);
      t.send({ type: "continue" });
      await t.whenIdle();
      const reset = events.findIndex((e) => e.type === "reset");
      expect(events[reset]).toEqual({ type: "reset", reason: "problem_end" });
      expect(events.slice(reset).find((e) => e.type === "problem")).toMatchObject({ problem_id: "p2" });
    });

    it("moves on by itself after a moment", async () => {
      const { t, events } = timed(5);
      await t.whenIdle();
      t.send({ type: "answer", problem_id: "p1", text: "x = 5" });
      await t.whenIdle();
      await new Promise((r) => setTimeout(r, 30));
      await t.whenIdle();
      expect(events.filter((e) => e.type === "problem").map((e) => (e.type === "problem" ? e.problem_id : ""))).toEqual(["p1", "p2"]);
      // A late tap after it moved on does nothing.
      t.send({ type: "continue" });
      await t.whenIdle();
      expect(events.filter((e) => e.type === "reset")).toHaveLength(1);
    });

    it("shows the next problem before its intro streams, so the card never waits empty", async () => {
      const h = harness(STEP_LESSON);
      await h.settle();
      const problem = h.events.findIndex((e) => e.type === "problem");
      const intro = h.events.findIndex((e) => e.type === "tutor_message" && e.delta.startsWith("Let's"));
      expect(problem).toBeGreaterThan(-1);
      expect(problem).toBeLessThan(intro);
    });
  });

  // Teen test 2026-10-26: a probe swapped in with no reason and no verdict read as "I failed and
  // it's hiding it". Each detour now says why and waits for the student's tap (R-01).
  describe("probe flow (R-01, teen test 2026-10-26)", () => {
    const after = (h: ReturnType<typeof harness>, mark: number) => h.events.slice(mark);

    it("says why and waits for a tap before the first quick check", async () => {
      const h = harness(STEP_LESSON);
      await h.settle();
      const mark = h.events.length;
      await h.send({ type: "step", problem_id: "s1", line: 1, text: "2x = 99" });
      expect(h.said(mark).join(" ")).toContain("one quick check on something underneath");
      expect(after(h, mark).at(-1)).toEqual({ type: "next_up", label: "Quick check" });
      // Nothing changes on screen until the tap: the marked line and its words stay.
      expect(after(h, mark).some((e) => e.type === "reset" || e.type === "problem")).toBe(false);
      // Lines and answers wait; the chat still gets a reply.
      await h.send({ type: "step", problem_id: "s1", line: 1, text: "2x = 12" });
      expect(after(h, mark).filter((e) => e.type === "step_result")).toHaveLength(1);
      const chat = h.events.length;
      await h.send({ type: "child_message", text: "help" });
      expect(h.said(chat)).toHaveLength(1);
      expect(h.problems()).toEqual(["s1"]);

      await h.cont();
      const probe = h.events.filter((e) => e.type === "problem").at(-1);
      expect(probe).toMatchObject({ problem_id: "one_step_equations.1", kind: "probe" });
    });

    it("shows each quick check's verdict and waits, then says where the tap leads", async () => {
      const h = harness(STEP_LESSON);
      await h.settle();
      await h.send({ type: "step", problem_id: "s1", line: 1, text: "2x = 99" });
      await h.cont();
      let mark = h.events.length;
      await h.send({ type: "answer", problem_id: "one_step_equations.1", text: "-11" });
      expect(after(h, mark)[0]).toEqual({ type: "answer_result", problem_id: "one_step_equations.1", result: "incorrect" });
      expect(after(h, mark).at(-1)).toEqual({ type: "next_up", label: "Next quick check" });
      expect(after(h, mark).some((e) => e.type === "reset")).toBe(false);
      // A second answer while it waits isn't graded again.
      await h.send({ type: "answer", problem_id: "one_step_equations.1", text: "5" });
      expect(after(h, mark).filter((e) => e.type === "answer_result")).toHaveLength(1);

      await h.cont();
      mark = h.events.length;
      await h.send({ type: "answer", problem_id: "inverse_operations.1", text: "-4" });
      expect(after(h, mark).at(-1)).toEqual({ type: "next_up", label: "Show me how" });
      await h.cont();
      expect(h.events.some((e) => e.type === "puzzle" && e.puzzle.template === "worked_example")).toBe(true);
    });

    it("leads back to the problem with its own button when the basics are solid", async () => {
      const h = harness(STEP_LESSON);
      await h.settle();
      await h.send({ type: "step", problem_id: "s1", line: 1, text: "2x = 99" });
      await h.cont();
      const mark = h.events.length;
      await h.send({ type: "answer", problem_id: "one_step_equations.1", text: "5" });
      expect(after(h, mark)[0]).toMatchObject({ type: "answer_result", result: "correct" });
      expect(after(h, mark).at(-1)).toEqual({ type: "next_up", label: "Back to my problem" });
      await h.cont();
      expect(h.events.filter((e) => e.type === "problem").at(-1)).toMatchObject({ problem_id: "s1", kind: "practice" });
    });

    it("says why and waits before a repair puzzle too", async () => {
      const h = harness();
      await h.settle();
      const mark = h.events.length;
      await h.send({ type: "answer", problem_id: "p1", text: "25/3" });
      expect(after(h, mark).at(-1)).toEqual({ type: "next_up", label: "Quick puzzle" });
      expect(after(h, mark).some((e) => e.type === "puzzle")).toBe(false);
      await h.cont();
      expect(h.events.some((e) => e.type === "puzzle")).toBe(true);
    });

    it("labels the warm-up after a pause as a warm-up", async () => {
      const h = harness();
      await h.settle();
      h.t.demo("pause");
      await h.settle();
      await h.send({ type: "resume" });
      expect(h.events.filter((e) => e.type === "problem").at(-1)).toMatchObject({ problem_id: "warmup", kind: "warmup" });
    });
  });

  // R-42 with R-01: the demo arc the primer view narrates, in codes and numbers only.
  describe("primer view (R-42)", () => {
    const primerStates = (h: ReturnType<typeof harness>, from = 0) =>
      h.events.slice(from).flatMap((e) => (e.type === "primer_state" ? [e as PrimerState] : []));
    const moves = (h: ReturnType<typeof harness>, from = 0) =>
      primerStates(h, from).map((s) => `${s.move.code}:${s.move.reason}:${s.move.skill_id}`);
    const p = (s: PrimerState | undefined, skill: string) => s?.mastery.find((m) => m.skill_id === skill)?.p ?? NaN;

    it("plays the demo arc: miss, probe two levels down, find the gap, teach it, repair a slip, confirm the fix", async () => {
      const h = harness(STEP_LESSON);
      await h.settle();
      expect(moves(h)).toEqual(["pose_problem:path_start:two_step_equations"]);

      // Miss 2x + 5 = 17 with no known slip: probe one-step equations first (R-01).
      let mark = h.events.length;
      await h.send({ type: "step", problem_id: "s1", line: 1, text: "2x = 99" });
      await h.cont();
      expect(moves(h, mark)).toEqual([
        "mark_line:line_invalid:two_step_equations",
        "probe:probe_prerequisite:one_step_equations",
      ]);
      expect(primerStates(h).at(-1)?.hypothesis).toEqual({ code: "suspects_gap", skill_id: "one_step_equations" });
      expect(h.problems()).toEqual(["s1", "one_step_equations.1"]);

      // A miss there too: one level deeper, inverse operations.
      mark = h.events.length;
      const before = primerStates(h).at(-1);
      await h.send({ type: "answer", problem_id: "one_step_equations.1", text: "-11" });
      await h.cont();
      expect(p(primerStates(h).at(-1), "one_step_equations")).toBeLessThan(p(before, "one_step_equations"));
      expect(moves(h, mark)).toEqual(["probe:probe_deeper:inverse_operations"]);
      expect(h.problems().at(-1)).toBe("inverse_operations.1");

      // And there: that's the gap. Teach it with a worked example.
      mark = h.events.length;
      await h.send({ type: "answer", problem_id: "inverse_operations.1", text: "-4" });
      await h.cont();
      expect(moves(h, mark)).toEqual(["teach:gap_found:inverse_operations"]);
      expect(primerStates(h).at(-1)?.hypothesis).toEqual({ code: "gap_found", skill_id: "inverse_operations" });
      expect(h.events.slice(mark).some((e) => e.type === "puzzle" && e.puzzle.template === "worked_example")).toBe(true);

      // Through the fades, then back to the problem that showed the gap.
      for (let i = 0; i < 3; i++) {
        h.t.demo("skip");
        await h.settle();
      }
      expect(moves(h).at(-1)).toBe("pose_problem:gap_taught:two_step_equations");
      expect(h.problems().at(-1)).toBe("s1");

      // A slip on one line: the repair puzzle, then a fresh problem to confirm the fix.
      mark = h.events.length;
      await h.send({ type: "step", problem_id: "s1", line: 1, text: "2x = 22" });
      await h.cont();
      expect(moves(h, mark)).toEqual(["mark_line:slip_matched:two_step_equations", "repair:slip_repair:two_step_equations"]);
      h.t.demo("skip");
      await h.settle();
      expect(moves(h).at(-1)).toBe("pose_problem:fix_check:two_step_equations");
      const fresh = h.events.filter((e) => e.type === "problem").at(-1);
      if (fresh?.type !== "problem") throw new Error("expected a problem");
      const [, ca, sign, cb, cc] = /^(-?\d+)x ([+-]) (\d+) = (-?\d+)$/.exec(fresh.prompt) ?? [];
      const answer = (Number(cc) - (sign === "-" ? -1 : 1) * Number(cb)) / Number(ca);
      await h.send({ type: "step", problem_id: fresh.problem_id, line: 1, text: `x = ${answer}` });
      expect(primerStates(h).at(-1)?.hypothesis).toEqual({ code: "fix_holding", skill_id: "two_step_equations" });
    });

    it("finds the gap one level down when the deeper probe passes", async () => {
      const h = harness(STEP_LESSON);
      await h.settle();
      await h.send({ type: "step", problem_id: "s1", line: 1, text: "2x = 99" });
      await h.cont();
      await h.send({ type: "answer", problem_id: "one_step_equations.1", text: "-11" });
      await h.cont();
      const mark = h.events.length;
      await h.send({ type: "answer", problem_id: "inverse_operations.1", text: "4" });
      await h.cont();
      expect(moves(h, mark)).toEqual(["probe:probe_passed:inverse_operations", "teach:gap_found:one_step_equations"]);
    });

    it("goes back to the problem, with no stale hypothesis, when a probe is skipped or paused", async () => {
      for (const leave of ["skip", "pause"] as const) {
        const h = harness(STEP_LESSON);
        await h.settle();
        await h.send({ type: "step", problem_id: "s1", line: 1, text: "2x = 99" });
        await h.cont();
        h.t.demo(leave);
        await h.settle();
        if (leave === "pause") {
          await h.send({ type: "resume" });
          await h.send({ type: "answer", problem_id: "warmup", text: "5" });
        }
        expect(h.problems().at(-1), leave).toBe("s1");
        expect(primerStates(h).at(-1)?.hypothesis, leave).toBeNull();
      }
    });

    it("ends with every skill's mastery for Your map, numbers only (R-13)", async () => {
      const h = harness(STEP_LESSON);
      await h.settle();
      await h.send({ type: "step", problem_id: "s1", line: 1, text: "2x = 99" });
      await h.cont();
      await h.send({ type: "answer", problem_id: "one_step_equations.1", text: "-11" });
      await h.send({ type: "end_session" });
      const end = h.events.at(-1);
      if (end?.type !== "session_end" || !end.map) throw new Error("expected a map");
      expect(end.map.map((s) => s.skill_id).sort()).toEqual(skillMap.nodes.map((n) => n.id).sort());
      const one = end.map.find((s) => s.skill_id === "one_step_equations")!;
      expect(one.after).toBeLessThan(one.before);
      expect(end.map.find((s) => s.skill_id === "order_of_operations")?.due).toBe(true);
      expect(end.map.find((s) => s.skill_id === "multi_step_equations")).toMatchObject({ before: 0.1, after: 0.1, due: false });
    });

    it("sends only codes from the text table, known skills and numbers, never what the student wrote", async () => {
      const h = harness(STEP_LESSON);
      await h.settle();
      await h.send({ type: "child_message", text: "canary-7731 my name is Sam" });
      await h.send({ type: "step", problem_id: "s1", line: 1, text: "2x = 99" });
      await h.cont();
      await h.send({ type: "answer", problem_id: "one_step_equations.1", text: "-11" });
      await h.cont();
      await h.send({ type: "child_message", text: "canary-7731 i hate this" });
      await h.send({ type: "answer", problem_id: "inverse_operations.1", text: "-4" });
      await h.cont();
      const states = primerStates(h);
      expect(states.length).toBeGreaterThan(4);
      for (const s of states) {
        expect(JSON.stringify(s)).not.toMatch(/canary|Sam|2x = 99|-11/);
        expect(PRIMER_CODES.moves).toContain(s.move.code);
        expect(primerText("reasons", s.move.reason, s.move.skill_id), s.move.reason).not.toBeNull();
        if (s.hypothesis) expect(primerText("hypotheses", s.hypothesis.code, s.hypothesis.skill_id)).not.toBeNull();
        for (const m of s.mastery) {
          expect(skillName(m.skill_id)).not.toBeNull();
          expect(m.p).toBeGreaterThanOrEqual(0);
          expect(m.p).toBeLessThanOrEqual(1);
        }
      }
    });
  });
});
