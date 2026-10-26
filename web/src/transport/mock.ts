import type { PaletteId, PuzzleMove, PuzzleTemplate } from "../content/types";
import { checkAnswer, matchesValue, readAnswer } from "../mock/answers";
import { SLIPS, slipRepair } from "../content/slips";
import { DEMO_NODES, type DemoNode, isOneOf, type Level, problemSession, seeded } from "../mock/generate";
import { MockPrimer, PROBE_BELOW } from "../mock/primer";
import { detectSlip } from "../mock/slips";
import { checkStep } from "../mock/steps";
import {
  type Fade, gradeMove, INTERESTS, type Interest, itemFor, type LivePuzzle, line, newItemPuzzle, newPuzzle, nextHint, skinFor,
  toWire,
} from "../mock/puzzles";
import {
  BACK_TO_IT, CLOSING, CONFIDENCE_BUILDER, confirmProblem, DEMO_LEAD, EXPLAIN_FIRST, LESSON, NO_ANSWERS, NO_ANSWERS_TRY_FIRST, NUDGES, OPENING,
  OUT_OF_HINTS, PREREQS_SOLID, PROBE_DEEPER, PROBE_LEAD, PROBE_THANKS, probeProblem, PUZZLE_NUDGE,
  PUZZLE_UNREADABLE, REPAIR_LEAD, SAFETY_RESOURCES, type ScriptedProblem, SHOW_ONE, STEP_IN_LINES,
  STEP_LESSON, STEP_REPAIR_LEAD, STEP_UNREADABLE, TAKE_A_BREATH, TRY_FIRST, UNREADABLE,
} from "../mock/script";
import type { ClientEvent, ServerEvent, SessionMode } from "../protocol";
import type { DemoTrigger, TutorTransport } from "./types";

export interface MockTiming {
  /** Pause before the tutor starts a reply. */
  thinkMs: number;
  /** Pause between streamed words. */
  wordMs: number;
  /** How long the "nice, fresh page" moment lasts before the next problem. */
  resetMs: number;
}

export const DEMO_TIMING: MockTiming = { thinkMs: 550, wordMs: 35, resetMs: 1600 };

// Plays the role of Platy's server, in the browser, from a fixed script. Nothing the child
// types is stored: it is read once to pick the scripted reply and then dropped (P-1). The one
// exception is a step-by-step problem's accepted lines, held in memory for the current problem
// only and dropped at its end or any reset (R-39, A-4).
export class MockTransport implements TutorTransport {
  readonly kind = "mock";
  private emit: (e: ServerEvent) => void = () => {};
  private queue: Promise<void> = Promise.resolve();
  private closed = false;
  private nextMessage = 1;

  private order: ScriptedProblem[];
  private index = 0;
  private current: ScriptedProblem | null = null;
  private misses = 0;
  private hintsUsed = 0;
  private awaitingWhy = false;
  private paused = false;
  private pivoted = false;
  private solved = 0;
  private nudge = 0;
  /** The accepted lines of a step-by-step problem (R-39), dropped with the problem. */
  private stepLines: string[] = [];

  // Puzzles (R-37). While one runs, `current` is null and `returnTo` holds the problem to go
  // back to. The skin's interest and the child's color pick last for the session (R-38).
  private puzzle: LivePuzzle | null = null;
  private returnTo: ScriptedProblem | null = null;
  private puzzles = 0;
  private interest: Interest = "soccer";
  private colors: PaletteId | null = null;
  private puzzleNudge: string | null = null;
  private reflecting = false;
  private repaired = false;
  /** The running puzzle repairs a step slip, so a fresh problem follows it. */
  private confirm = false;

  // Generated problems (R-41): seeded, never repeated in the session. The primer would set the
  // level from mastery; the demo stays at level 1.
  private readonly level: Level = 1;
  private readonly problems: ReturnType<typeof problemSession>;
  private generated = 0;

  // The primer's beliefs for the demo primer view (R-42), codes and numbers only. The first
  // unexplained miss on a step problem starts probing down the path (R-01): `probe` holds the
  // problem it came from and the skills checked so far, and `gap` the skill being taught.
  private readonly primer = new MockPrimer();
  private probe: { origin: ScriptedProblem; chain: string[]; problem: ScriptedProblem } | null = null;
  private probed = false;
  private gap: string | null = null;

  constructor(
    private readonly timing: MockTiming = DEMO_TIMING,
    private readonly seed = 20261018,
    lesson: ScriptedProblem[] = [...STEP_LESSON, ...LESSON],
  ) {
    this.order = [...lesson];
    this.problems = problemSession(seed);
  }

  async start(_mode: SessionMode, onEvent: (event: ServerEvent) => void): Promise<void> {
    this.emit = onEvent;
    this.run(async () => {
      await this.say(OPENING);
      this.think("pose_problem", "path_start", this.order[0]!.skill_id);
      await this.present(this.order[0]!);
    });
  }

  send(event: ClientEvent): void {
    this.run(() => this.handle(event));
  }

  close(): void {
    this.closed = true;
  }

  /** Resolves once every queued tutor turn has played out. Used by tests. */
  whenIdle(): Promise<void> {
    return this.queue;
  }

  demo(trigger: DemoTrigger): void {
    this.run(async () => {
      switch (trigger) {
        case "pause":
          this.paused = true;
          this.out({ type: "pause_suggested" });
          return;
        case "safety":
          this.out({ type: "safety_escalation", resources: SAFETY_RESOURCES });
          return;
        case "error":
          this.out({ type: "error", code: "demo_gateway_timeout" });
          this.closed = true;
          return;
        case "skip":
          if (this.probe) await this.leaveProbe();
          else if (this.puzzle) await this.finishPuzzle();
          else if (this.current) await this.finishProblem();
          return;
        case "interest":
          this.interest = INTERESTS[(INTERESTS.indexOf(this.interest) + 1) % INTERESTS.length]!;
          this.reskin();
          return;
        default:
          await this.startPuzzle(trigger, trigger === "worked_example" ? SHOW_ONE : DEMO_LEAD);
      }
    });
  }

  // Tutor turns run one at a time, in order, so streamed replies never interleave.
  private run(step: () => Promise<void>): void {
    this.queue = this.queue.then(() => (this.closed ? undefined : step()));
  }

  private out(event: ServerEvent): void {
    if (!this.closed) this.emit(event);
  }

  private async handle(event: ClientEvent): Promise<void> {
    const p = this.current;
    switch (event.type) {
      case "end_session":
        this.out({ type: "session_end", solved: this.solved, map: this.primer.report() });
        this.closed = true;
        return;
      case "resume":
        if (!this.paused) return;
        this.paused = false;
        await this.pivot();
        return;
      case "hint_requested":
        if (p) await this.hint(p);
        return;
      case "answer":
        // A step-by-step problem is solved in lines; the answer alone never counts (R-39).
        if (p && event.problem_id === p.problem_id && p.format !== "steps") await this.answer(p, event.text);
        return;
      case "step":
        if (p?.format === "steps" && event.problem_id === p.problem_id) await this.step(p, event.line, event.text);
        return;
      case "child_message":
        if (this.puzzle) await this.puzzleChat(this.puzzle, event.text);
        else await this.chat(p, event.text);
        return;
      case "puzzle_move":
        if (this.puzzle?.instance_id === event.instance_id) await this.puzzleMove(this.puzzle, event.move);
        return;
      case "puzzle_hint":
        if (this.puzzle?.instance_id === event.instance_id) await this.puzzleHint(this.puzzle);
        return;
      case "puzzle_next":
        if (this.puzzle?.instance_id === event.instance_id && this.reflecting) await this.finishPuzzle();
        return;
      case "slot_pick":
        this.colors = event.colors;
        this.reskin();
        return;
    }
  }

  private async chat(p: ScriptedProblem | null, text: string): Promise<void> {
    if (!p) return;
    if (this.awaitingWhy) {
      this.awaitingWhy = false;
      await this.say(p.afterWhy);
    } else if (/just tell me|what'?s the answer|give me the answer|tell me the answer/i.test(text)) {
      await this.say(NO_ANSWERS);
    } else if (/\b(idk|i don'?t know|stuck|confused|hint|help)\b/i.test(text)) {
      await this.hint(p);
    } else if (readAnswer(text)) {
      // A child who types the answer into the chat gets it checked, not redirected. On a
      // step-by-step problem it belongs in the next line instead (R-39).
      if (p.format === "steps") await this.say(STEP_IN_LINES);
      else await this.answer(p, text);
    } else {
      await this.say(NUDGES[this.nudge++ % NUDGES.length]!);
    }
  }

  private async hint(p: ScriptedProblem): Promise<void> {
    const hint = p.hints[this.hintsUsed];
    if (hint === undefined) {
      await this.say(OUT_OF_HINTS);
      return;
    }
    this.hintsUsed++;
    await this.say(hint);
  }

  private async answer(p: ScriptedProblem, text: string): Promise<void> {
    if (this.probe?.problem === p) return this.probeAnswer(this.probe, text);
    const result = checkAnswer(text, p.solutions);
    this.out({ type: "answer_result", problem_id: p.problem_id, result });
    if (result === "unreadable") {
      await this.say(UNREADABLE);
      return;
    }
    this.primer.observe(p.skill_id, result === "correct");
    this.think(result === "correct" ? "accept_line" : "mark_line", result === "correct" ? "answer_right" : "answer_wrong", p.skill_id);
    if (result === "correct") {
      this.solved++;
      for (const line of p.correct) await this.say(line);
      await this.finishProblem();
      return;
    }
    if (result === "partial" && p.partial) {
      await this.say(p.partial);
      return;
    }
    this.misses++;
    const slip = p.misconceptions.find((m) => matchesValue(text, m.value));
    if (slip?.repair && !this.repaired) {
      // A slip with a repair puzzle: work on it there first, then come back (R-37).
      this.repaired = true;
      await this.startPuzzle(slip.repair, REPAIR_LEAD);
    } else if (this.misses >= 3 && !this.pivoted) {
      // Third miss on one problem: first rung of the de-escalation ladder (R-21).
      await this.suggestPause();
    } else if (slip) {
      await this.say(slip.reply);
    } else if (this.misses === 1) {
      // Never correct on the first miss; ask for reasoning (R-02, R-03).
      this.awaitingWhy = true;
      await this.say(p.askWhy);
    } else {
      await this.say(p.secondMiss);
    }
  }

  private async step(p: ScriptedProblem, line: number, text: string): Promise<void> {
    if (line !== this.stepLines.length + 1) return;
    const prev = this.stepLines.at(-1) ?? p.prompt;
    const result = checkStep(prev, text);
    // A wrong line that matches a known slip names it, so its hint shows on the line (R-40).
    const slip = result === "invalid" ? detectSlip(p.skill_id, { prev, next: text }) : null;
    this.out({ type: "step_result", problem_id: p.problem_id, line, result, ...(slip ? { slip } : {}) });
    switch (result) {
      case "valid":
        // The line's motion is the feedback; the tutor stays quiet so the student keeps going.
        // A fixed line answers the question about the wrong one.
        this.stepLines.push(text);
        this.awaitingWhy = false;
        this.primer.observe(p.skill_id, true);
        this.think("accept_line", "line_valid", p.skill_id);
        return;
      case "solved":
        this.stepLines.push(text);
        this.awaitingWhy = false;
        this.primer.observe(p.skill_id, true);
        // The fresh problem after a repair is solved: the fix held.
        if (p.problem_id.startsWith("g")) this.primer.hypothesize("fix_holding", p.skill_id);
        this.think("accept_line", "solved", p.skill_id);
        this.solved++;
        for (const reply of p.correct) await this.say(reply);
        await this.finishProblem();
        return;
      case "unreadable":
        await this.say(STEP_UNREADABLE);
        return;
      case "invalid": {
        this.misses++;
        // A slip from a prerequisite (R-40) is evidence about that skill, not this one.
        const node = (slip && SLIPS.find((s) => s.id === slip)?.node) || p.skill_id;
        this.primer.observe(node, false);
        this.think("mark_line", slip ? "slip_matched" : "line_invalid", node);
        const repair = slip ? slipRepair(slip) : null;
        const item = repair ? itemFor(repair) : null;
        const below = PROBE_BELOW[p.skill_id];
        if (below && !this.probed) {
          // The first miss: find out what's underneath before teaching anything (R-01).
          this.probed = true;
          await this.startProbe(p, [below]);
        } else if (item && !this.repaired) {
          // A slip with a repair puzzle: work on that move there first, then a fresh problem (R-37).
          this.repaired = true;
          this.confirm = true;
          this.think("repair", "slip_repair", node);
          await this.startPuzzle(item.template, STEP_REPAIR_LEAD, item.item_id);
        } else if (this.misses >= 3 && !this.pivoted) {
          await this.suggestPause(); // R-21, as for a problem's answers
        } else if (this.misses === 1) {
          // The mark is on the line; the tutor asks first and never writes the line (R-02, R-03).
          this.awaitingWhy = true;
          await this.say(p.askWhy);
        } else {
          await this.say(p.secondMiss);
        }
      }
    }
  }

  private async suggestPause(): Promise<void> {
    this.paused = true;
    const skill = this.current?.skill_id ?? this.puzzle?.item.skill_id;
    if (skill) this.think("pause", "three_misses", skill);
    await this.say(TAKE_A_BREATH);
    this.out({ type: "pause_suggested" });
  }

  private async pivot(): Promise<void> {
    this.pivoted = true;
    // The reset below clears any puzzle on screen, so drop it here too. The lesson picks up
    // where it was after the warm-up.
    // A pause during a repair still never goes back to the problem they slipped on: the repair
    // may have walked through its steps (R-02). The fresh problem waits after the warm-up.
    if (this.confirm && this.returnTo) {
      this.order.splice(this.index, 1, this.freshProblem(this.returnTo, this.puzzle));
    }
    this.puzzle = null;
    this.returnTo = null;
    this.confirm = false;
    if (this.probe || this.gap) this.primer.dropHypothesis();
    this.probe = null;
    this.gap = null;
    this.reflecting = false;
    this.puzzleNudge = null;
    this.stepLines = [];
    this.out({ type: "topic_switch", label: "Quick confidence builder" });
    this.out({ type: "reset", reason: "topic_switch" });
    await this.sleep(this.timing.resetMs);
    // Come back to the problem they were stuck on after the easier one. A pause during the
    // warm-up itself starts it again rather than adding a second one.
    if (this.order[this.index] !== CONFIDENCE_BUILDER) this.order.splice(this.index, 0, CONFIDENCE_BUILDER);
    this.think("warm_up", "confidence", CONFIDENCE_BUILDER.skill_id);
    await this.present(CONFIDENCE_BUILDER);
  }

  private async finishProblem(): Promise<void> {
    this.index++;
    this.current = null;
    this.probe = null;
    this.stepLines = [];
    const next = this.order[this.index];
    if (next) this.think("pose_problem", "path_next", next.skill_id);
    if (!next) {
      await this.say(CLOSING);
      this.out({ type: "session_end", solved: this.solved, map: this.primer.report() });
      this.closed = true;
      return;
    }
    await this.sleep(this.timing.resetMs);
    // Hard reset at the end of a problem (R-17); the next problem starts on a clean page.
    this.out({ type: "reset", reason: "problem_end" });
    await this.sleep(this.timing.resetMs);
    await this.present(next);
  }

  private async present(p: ScriptedProblem, intro = p.intro): Promise<void> {
    this.current = p;
    this.stepLines = [];
    this.misses = 0;
    this.hintsUsed = 0;
    this.awaitingWhy = false;
    const lessonOnly = this.order.filter((q) => q !== CONFIDENCE_BUILDER);
    const position = lessonOnly.indexOf(p) + 1;
    for (const text of intro) await this.say(text);
    this.out({
      type: "problem",
      problem_id: p.problem_id,
      skill_id: p.skill_id,
      prompt: p.prompt,
      instruction: p.instruction,
      format: p.format ?? "answer",
      position, // 0 for the confidence builder, which isn't one of the lesson's problems
      total: lessonOnly.length,
    });
  }

  private skin() {
    return skinFor(this.interest, this.colors);
  }

  /** `item` picks a specific item, such as a slip's repair; otherwise the template's own. */
  private async startPuzzle(template: PuzzleTemplate, lead: string, item?: string): Promise<void> {
    if (!this.puzzle) this.returnTo = this.current;
    this.current = null;
    this.stepLines = []; // the reset below clears them from the screen too
    this.awaitingWhy = false;
    this.puzzleNudge = null;
    this.reflecting = false;
    await this.say(lead);
    this.out({ type: "topic_switch", label: template === "worked_example" ? "Worked example" : "Quick puzzle" });
    this.out({ type: "reset", reason: "topic_switch" });
    await this.sleep(this.timing.resetMs);
    await this.showPuzzle(template, 0, item);
  }

  private async showPuzzle(template: PuzzleTemplate, fade: Fade = 0, item?: string): Promise<void> {
    this.puzzles++;
    const rng = seeded(this.seed + this.puzzles);
    const id = `${template}-${this.puzzles}`;
    const live = item ? newItemPuzzle(item, rng, id, this.level, this.lessonPrompts()) : newPuzzle(template, rng, id, fade);
    this.puzzle = live;
    await this.say(line(live, this.skin(), (i) => i.intro));
    this.out({ type: "puzzle", puzzle: toWire(live, this.skin()) });
  }

  /** Same puzzle, same progress, new look: an interest switch or the child's color pick. */
  private reskin(): void {
    if (this.puzzle) this.out({ type: "puzzle", puzzle: toWire(this.puzzle, this.skin()) });
  }

  private async puzzleMove(live: LivePuzzle, move: PuzzleMove): Promise<void> {
    const skin = this.skin();
    const v = gradeMove(live, move, skin);
    if (!v) return;
    // A first try unlocks hints (R-02). Starting over or an unreadable line isn't one.
    const startOver = move.check === "move" && move.move.op === "start_over";
    if (!startOver && v.outcome !== "unreadable") live.tried = true;
    if (v.outcome === "incorrect") live.misses++;
    live.outcomes[v.check] = v.outcome;
    if (v.pans && live.template === "balance") live.pans = v.pans;
    this.out({ type: "puzzle_result", instance_id: live.instance_id, check: v.check, outcome: v.outcome });
    if (v.solved && live.template === "balance") {
      live.outcomes.solved = "correct";
      this.out({ type: "puzzle_result", instance_id: live.instance_id, check: "solved", outcome: "correct" });
    }
    this.puzzleNudge = null;
    if (v.outcome === "unreadable") {
      await this.say(PUZZLE_UNREADABLE);
    } else if (v.ask && live.misses >= 3 && !this.pivoted) {
      // Third miss on one puzzle: the same first rung as on a problem (R-21).
      await this.suggestPause();
    } else if (v.ask) {
      // A miss: the puzzle stops and the tutor asks first (R-03). The nudge waits for the child.
      this.puzzleNudge = v.ask.nudge;
      await this.say(v.ask.ask);
    } else {
      if (v.reply) await this.say(v.reply);
      if (v.solved) {
        this.primer.observe(live.item.skill_id, true);
        this.think(this.confirm ? "repair" : "teach", "puzzle_solved", live.item.skill_id);
        this.reflecting = true;
        await this.say(line(live, skin, (i) => i.reflection));
      }
    }
  }

  private async puzzleHint(live: LivePuzzle): Promise<void> {
    // Solved: the reflection question is waiting, and there's nothing left to hint at.
    if (this.reflecting) return;
    if (!live.tried) {
      await this.say(TRY_FIRST); // no hint before a first try (R-02)
      return;
    }
    if (this.puzzleNudge) {
      await this.say(EXPLAIN_FIRST); // their explanation of the miss comes first (R-03)
      return;
    }
    const hint = nextHint(live, this.skin());
    if (hint === null) {
      await this.say(OUT_OF_HINTS);
      return;
    }
    live.hints++;
    await this.say(hint);
  }

  private async puzzleChat(live: LivePuzzle, text: string): Promise<void> {
    if (this.reflecting) {
      await this.say(line(live, this.skin(), (i) => i.thanks));
      await this.finishPuzzle();
    } else if (this.puzzleNudge) {
      const nudge = this.puzzleNudge;
      this.puzzleNudge = null;
      await this.say(nudge);
    } else if (/just tell me|what'?s the answer|give me the answer|tell me the answer/i.test(text)) {
      // NO_ANSWERS offers a hint, which can't come before a first try (R-02).
      await this.say(live.tried ? NO_ANSWERS : NO_ANSWERS_TRY_FIRST);
    } else if (/\b(idk|i don'?t know|stuck|confused|hint|help)\b/i.test(text)) {
      await this.puzzleHint(live);
    } else {
      await this.say(PUZZLE_NUDGE);
    }
  }

  private async finishPuzzle(): Promise<void> {
    const live = this.puzzle;
    if (!live) return;
    this.out({ type: "puzzle_done", instance_id: live.instance_id });
    this.puzzle = null;
    this.reflecting = false;
    this.puzzleNudge = null;
    await this.sleep(this.timing.resetMs);
    this.out({ type: "reset", reason: "problem_end" });
    await this.sleep(this.timing.resetMs);
    // A worked example fades one step at a time before the lesson picks up again (R-37).
    if (live.template === "worked_example" && live.fade < 2) {
      await this.showPuzzle("worked_example", (live.fade + 1) as Fade);
      return;
    }
    const back = this.returnTo;
    this.returnTo = null;
    if (this.confirm && back) {
      // The fresh problem takes the place of the one they slipped on (R-41).
      this.confirm = false;
      const fresh = this.freshProblem(back, live);
      this.order.splice(this.index, 1, fresh);
      this.think("pose_problem", "fix_check", fresh.skill_id);
      await this.present(fresh);
      return;
    }
    if (this.gap) this.primer.taught(this.gap);
    if (back) this.think("pose_problem", this.gap ? "gap_taught" : "back_to_problem", back.skill_id);
    this.gap = null;
    const next = back ?? this.order[this.index];
    if (!next) {
      await this.say(CLOSING);
      this.out({ type: "session_end", solved: this.solved, map: this.primer.report() });
      this.closed = true;
      return;
    }
    await this.present(next, back ? [BACK_TO_IT] : next.intro);
  }

  /** The primer's state after a move, for the demo primer view (R-42). Codes and numbers only. */
  private think(move: string, reason: string, skill_id: string): void {
    this.out({ type: "primer_state", ...this.primer.after(move, reason, skill_id) });
  }

  /** Probe the last skill in `chain`, one level further down the path than the one before it (R-01). */
  private async startProbe(origin: ScriptedProblem, chain: string[]): Promise<void> {
    const node = chain.at(-1)!;
    const problem = probeProblem(node);
    this.probe = { origin, chain, problem };
    this.primer.hypothesize("suspects_gap", node);
    this.think("probe", chain.length === 1 ? "probe_prerequisite" : "probe_deeper", node);
    await this.say(chain.length === 1 ? PROBE_LEAD : PROBE_DEEPER);
    await this.newPage("topic_switch", "Quick check");
    await this.present(problem, []);
  }

  private async probeAnswer(probe: NonNullable<MockTransport["probe"]>, text: string): Promise<void> {
    const result = checkAnswer(text, probe.problem.solutions);
    this.out({ type: "answer_result", problem_id: probe.problem.problem_id, result });
    if (result === "unreadable") {
      await this.say(UNREADABLE);
      return;
    }
    const { origin, chain } = probe;
    const node = chain.at(-1)!;
    const right = result === "correct";
    this.primer.observe(node, right);
    await this.say(PROBE_THANKS);
    if (!right) {
      const below = PROBE_BELOW[node];
      // Probing goes at most two levels down; the deepest miss is the gap.
      if (below && chain.length < 2) await this.startProbe(origin, [...chain, below]);
      else await this.teachGap(origin, node);
      return;
    }
    this.think("probe", "probe_passed", node);
    if (chain.length > 1) {
      // This level is solid, so the gap is the one above it.
      await this.teachGap(origin, chain.at(-2)!);
      return;
    }
    this.probe = null;
    this.primer.hypothesize("gap_in_skill", origin.skill_id);
    this.think("pose_problem", "prereqs_solid", origin.skill_id);
    await this.newPage("problem_end");
    await this.present(origin, [PREREQS_SOLID]);
  }

  /** Skipping a probe goes back to the problem it came from, not past it. */
  private async leaveProbe(): Promise<void> {
    const origin = this.probe!.origin;
    this.probe = null;
    this.primer.dropHypothesis();
    this.think("pose_problem", "back_to_problem", origin.skill_id);
    await this.newPage("problem_end");
    await this.present(origin, [BACK_TO_IT]);
  }

  /** Teach the gap with a worked example, then go back to the problem that showed it. */
  private async teachGap(origin: ScriptedProblem, gap: string): Promise<void> {
    this.probe = null;
    this.gap = gap;
    this.primer.hypothesize("gap_found", gap);
    this.think("teach", "gap_found", gap);
    this.current = origin; // the worked example returns here
    await this.startPuzzle("worked_example", SHOW_ONE);
  }

  /** A hard reset between two things on screen (R-17, A-4). */
  private async newPage(reason: "problem_end" | "topic_switch", label?: string): Promise<void> {
    this.current = null;
    this.stepLines = [];
    this.awaitingWhy = false;
    await this.sleep(this.timing.resetMs);
    if (label) this.out({ type: "topic_switch", label });
    this.out({ type: "reset", reason });
    await this.sleep(this.timing.resetMs);
  }

  private lessonPrompts(): string[] {
    return this.order.map((p) => p.prompt);
  }

  /**
   * A generated problem of the same kind as `p`, as a step-by-step problem. It's never a problem
   * in the lesson or the repair puzzle just shown, so it really is fresh.
   */
  private freshProblem(p: ScriptedProblem, repair: LivePuzzle | null): ScriptedProblem {
    const node: DemoNode = DEMO_NODES.find((n) => n === p.skill_id) ?? "two_step_equations";
    const avoid = [...this.lessonPrompts(), ...(repair ? [repair.n.latex] : [])];
    let g = this.problems.next(node, this.level);
    while (isOneOf(g.prompt, avoid)) g = this.problems.next(node, this.level);
    return confirmProblem(`g${++this.generated}`, node, g.prompt, g.answer, g.answerText);
  }

  private async say(text: string): Promise<void> {
    const message_id = `t${this.nextMessage++}`;
    await this.sleep(this.timing.thinkMs);
    // Stream word by word, but keep each $...$ math span whole so it never renders half-typed.
    const words = text.match(/\$[^$]*\$\S*\s*|[^\s$]+\s*/g) ?? [text];
    for (const [i, word] of words.entries()) {
      if (this.closed) return;
      this.out({ type: "tutor_message", message_id, delta: word, done: i === words.length - 1 });
      if (i < words.length - 1) await this.sleep(this.timing.wordMs);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
