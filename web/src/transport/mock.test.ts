import { describe, expect, it } from "vitest";
import type { PuzzleMove } from "../content/types";
import type { ClientEvent, ServerEvent } from "../protocol";
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
  return { t, events, settle, send, said, problems };
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
    expect(h.events.at(-1)).toEqual({ type: "session_end", solved: 3 });
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
      expect(h.events).toContainEqual({ type: "puzzle_done", instance_id: id });
      expect(h.problems()).toEqual(["p1", "p1"]);
      expect(h.said().join(" ")).toContain("back to the one from before");
      expect(results(h)).toEqual([["found_error", "correct"], ["fixed_step", "correct"], ["final_answer", "correct"]]);
    });

    it("repairs a slip only once, then names it", async () => {
      const h = harness();
      await h.settle();
      await h.send({ type: "answer", problem_id: "p1", text: "25/3" });
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
    const results = (h: ReturnType<typeof harness>) =>
      h.events.filter((e) => e.type === "step_result").map((e) => (e.type === "step_result" ? e.result : null));

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
      const h = steps();
      await h.settle();
      const mark = h.events.length;
      await h.send({ type: "step", problem_id: "s1", line: 1, text: "2x = 99" });
      expect(results(h)).toEqual(["invalid"]);
      const reply = h.said(mark).join(" ");
      expect(reply).not.toMatch(/2x = 12|x = 6/);
      // The wrong line isn't kept: the next try is still line 1, checked against the problem.
      await h.send({ type: "step", problem_id: "s1", line: 1, text: "2x = 12" });
      expect(results(h)).toEqual(["invalid", "valid"]);
    });

    it("forgets its question about a wrong line once the student fixes the line", async () => {
      const h = steps();
      await h.settle();
      await h.send({ type: "step", problem_id: "s1", line: 1, text: "2x = 99" });
      await h.send({ type: "step", problem_id: "s1", line: 1, text: "2x = 12" });
      const mark = h.events.length;
      await h.send({ type: "child_message", text: "help" });
      expect(h.said(mark).join(" ")).toBe(STEP_LESSON[0]!.hints[0]);
    });

    it("names the slip a wrong line matches, and none for a correct or unknown one (R-40)", async () => {
      const h = steps();
      await h.settle();
      await h.send({ type: "step", problem_id: "s1", line: 1, text: "2x = 99" });
      await h.send({ type: "step", problem_id: "s1", line: 1, text: "2x = 12" });
      // Line 2: a one-step slip on a two-step problem, the gap one level down. Its repair item
      // isn't built yet, so the hint on the line is all that happens.
      await h.send({ type: "step", problem_id: "s1", line: 2, text: "x = 10" });
      const slips = h.events.filter((e) => e.type === "step_result").map((e) => (e.type === "step_result" ? (e.slip ?? null) : null));
      expect(slips).toEqual([null, null, "coefficient_subtracted"]);
      expect(h.events.some((e) => e.type === "puzzle")).toBe(false);
    });

    it("sends a slip on 2x + 5 = 17 to its repair puzzle, then confirms the fix on a fresh problem (R-37, R-41)", async () => {
      const h = steps();
      await h.settle();
      await h.send({ type: "step", problem_id: "s1", line: 1, text: "2x = 22" });
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
      expect(h.problems()).toEqual(["s1", fresh.problem_id, "s2"]);
    });

    // Seeds where the fresh problem once came out as s2 (4208) or as the repair puzzle (4144).
    it("never confirms the fix on a problem from the lesson or on the repair puzzle itself (R-41)", async () => {
      const lesson = STEP_LESSON.map((p) => p.prompt);
      for (const seed of [4208, 4144, 5786, 11628, ...Array.from({ length: 20 }, (_, i) => i + 1)]) {
        const h = harness(STEP_LESSON, seed);
        await h.settle();
        await h.send({ type: "step", problem_id: "s1", line: 1, text: "2x = 22" });
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
      const h = steps();
      await h.settle();
      await h.send({ type: "step", problem_id: "s1", line: 1, text: "2x = 22" });
      h.t.demo("pause");
      await h.settle();
      await h.send({ type: "resume" });
      await h.send({ type: "answer", problem_id: "warmup", text: "5" });
      expect(h.problems()).toEqual(["s1", "warmup", "g1"]);
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
      const h = steps();
      await h.settle();
      for (const text of ["2x = 99", "2x = 17", "x = 13"]) await h.send({ type: "step", problem_id: "s1", line: 1, text });
      expect(h.events.at(-1)).toEqual({ type: "pause_suggested" });
    });
  });
});
