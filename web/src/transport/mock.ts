import { skillOf, templateOf } from "../content/catalog";
import { pickTeachItem } from "../mock/teach";
import { REASON_CODES, STEP_CODES } from "../content/confidence";
import type { PaletteId, PuzzleMove, PuzzleTemplate } from "../content/types";
import { answerExample, checkAnswer, matchesValue, readAnswer } from "../mock/answers";
import { SLIPS, slipRepair } from "../content/slips";
import { clashes, DEMO_NODES, type DemoNode, type Level, problemSession, seeded } from "../mock/generate";
import { MockPrimer, PROBE_BELOW } from "../mock/primer";
import { detectSlip } from "../mock/slips";
import { checkStep } from "../mock/steps";
import {
  type Fade, gradeMove, INTERESTS, type Interest, itemFor, type LivePuzzle, line, newItemPuzzle, newPuzzle, nextHint, problemOf,
  skinFor, toWire, worksOut,
} from "../mock/puzzles";
import {
  BACK_TO_IT, CLOSING, CONFIDENCE_ASK, CONFIDENCE_ASK_LATE, CONFIDENCE_CHAT, CONFIDENCE_REPLIES, DETOUR_BACK, DETOUR_PROBE, DETOUR_PROBE_DEEPER, DETOUR_PUZZLE, DETOUR_TEACH, NEXT_PROBLEM, CONFIDENCE_BUILDER, confirmProblem, DEMO_LEAD, EXPLAIN_FIRST, KEEP_GOING_READY, KEY_STEP_ASK, KEY_STEP_CHAT, KEY_STEP_REPLIES, KEY_STEP_REPLY_NONE, LESSON, NO_ANSWERS, NO_ANSWERS_TRY_FIRST, NUDGES, OFF_TOPIC, OPENING,
  OUT_OF_HINTS, PREREQS_SOLID, PROBE_ASK, PROBE_DEEPER, PROBE_LEAD, PROBE_THANKS, probeProblem, PUZZLE_NUDGE,
  PUZZLE_UNREADABLE, PUZZLE_UNREADABLE_VALUE, REPAIR_LEAD, SAFETY_RESOURCES, type ScriptedProblem, SEE_MAP, SHOW_ONE, STEP_IN_LINES,
  STEP_LESSON, STEP_REPAIR_LEAD, STEP_UNREADABLE, STEP_UNREADABLE_VALUE, SWITCH_ANGLE, TAKE_A_BREATH, TRY_FIRST, UNREADABLE,
} from "../mock/script";
import type { ClientEvent, ServerEvent, SessionMode } from "../protocol";
import type { DemoTrigger, TutorTransport } from "./types";

export interface MockTiming {
  /** Pause before the tutor starts a reply. */
  thinkMs: number;
  /** Pause between streamed words. */
  wordMs: number;
  /** How long the new-page moment lasts before what comes next. */
  resetMs: number;
  /**
   * A solved problem waits for the "Next problem" tap, and the closing line for "See my map"
   * (R-17). Nothing moves on by itself (teen test 2026-10-26: a timer took the button away
   * mid-read). Unset moves on at once, with no button, for tests.
   */
  wait?: boolean;
}

// What a chat message is about, for the mock's routing only. The real tutor reads the message.
const WANTS_ANSWER = /\b(gimme|give me|tell me|what'?s|whats)\b.*\banswer\b|\banswer\b.*\b(pls|plz|please|now)\b|just tell me/i;
const MATHY = /\d|[=+\-*/^×÷]|\b(add|subtract|minus|plus|times|divide|multiply|sides?|undo|move|equation|solve|step|number|answer|x|first|then|get)\b/i;

export const DEMO_TIMING: MockTiming = { thinkMs: 550, wordMs: 35, resetMs: 700, wait: true };

// Plays the role of Platy's server, in the browser, from a fixed script. Nothing the child
// types is stored: it is read once to pick the scripted reply and then dropped (P-1). The one
// exception is a step-by-step problem's accepted lines, held in memory for the current problem
// only and dropped at its end or any reset (R-48, A-4).
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
  /** Right-but-incomplete answers on this problem; a clean first try has none (R-06). */
  private partials = 0;
  /** Problems solved with no miss and no partial, for the map's closing line. */
  private firstTry = 0;
  /** The problem came back after a detour, so solving it now isn't a first try (R-06). */
  private returned = false;
  /** The one warm redirect for an off-topic message on this problem has been said. */
  private redirected = false;
  private paused = false;
  private pivoted = false;
  private solved = 0;
  private nudge = 0;
  /** The accepted lines of a step-by-step problem (R-48), dropped with the problem. */
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
  /** The student answered the reflection question, and Platy has thanked them for it. */
  private thanked = false;
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
  /** The angles already used to teach each skill this session, so a retry takes a different one (R-05). */
  private readonly anglesTried = new Map<string, string[]>();
  /** The skill last taught and the problem it went back to: a miss there means the explanation didn't land. */
  private lastTaught: { node: string; origin: ScriptedProblem } | null = null;
  /**
   * A detour that waits for the student's tap (`next_up`, then `continue`), so they read why before
   * the screen changes (R-01). Answers and lines wait too; the chat stays open.
   */
  private next: (() => Promise<void>) | null = null;

  // The metacognition beat (R-30), once per session: how sure, before confirming the right answer
  // on the problem after a detour, or, if the session gets to its end without one, one beat before
  // the closing line (the key step, after a reteach). `beat` holds what finishes once it's answered.
  private beat: { kind: "how_sure" | "key_step"; problem: ScriptedProblem; finish: () => Promise<void> } | null = null;
  private beatDone = false;
  /** A worked example taught a gap this session, so the final beat asks for its key step. */
  private retaught = false;
  private lastPractice: ScriptedProblem | null = null;
  private lastSolved: ScriptedProblem | null = null;

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
          if (this.beat) await this.skipBeat();
          else if (this.next) await this.take();
          else if (this.probe) await this.leaveProbe();
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
        this.end();
        return;
      case "resume":
        if (!this.paused) return;
        this.paused = false;
        await this.pivot();
        return;
      case "continue":
        await this.take();
        return;
      case "hint_requested":
        if (p && !this.next && !this.beat) await this.hint(p);
        return;
      case "answer":
        if (this.next || this.beat) return;
        // A step-by-step problem is solved in lines; the answer alone never counts (R-48).
        if (p && event.problem_id === p.problem_id && p.format !== "steps") await this.answer(p, event.text);
        return;
      case "step":
        if (this.next || this.beat) return;
        if (p?.format === "steps" && event.problem_id === p.problem_id) await this.step(p, event.line, event.text);
        return;
      case "child_message":
        // During the beat, what they say stays theirs (memory only); the tap is what moves on.
        if (this.beat) await this.say(this.beat.kind === "how_sure" ? CONFIDENCE_CHAT : KEY_STEP_CHAT);
        else if (this.puzzle) await this.puzzleChat(this.puzzle, event.text);
        else await this.chat(p, event.text);
        return;
      case "confidence":
        if (this.beat && event.problem_id === this.beat.problem.problem_id) await this.confidence(event.level, event.reason);
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
    } else if (WANTS_ANSWER.test(text)) {
      await this.say(NO_ANSWERS);
    } else if (/\b(idk|i don'?t know|stuck|confused|hint|help)\b/i.test(text)) {
      await this.hint(p);
    } else if (readAnswer(text)) {
      // A child who types the answer into the chat gets it checked, not redirected. On a
      // step-by-step problem it belongs in the next line instead (R-48).
      if (p.format === "steps") await this.say(STEP_IN_LINES);
      else await this.answer(p, text);
    } else if (!MATHY.test(text) && !this.redirected) {
      // Off topic: one warm redirect, then the plain nudges (the real tutor's rule is R-39's).
      this.redirected = true;
      await this.say(OFF_TOPIC);
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
    if (result === "correct" && this.beatDue(p)) {
      // How sure, before the verdict (R-30). The verdict and the rest follow the answer to it.
      this.primer.observe(p.skill_id, true);
      await this.askConfidence("how_sure", p, CONFIDENCE_ASK, async () => {
        this.out({ type: "answer_result", problem_id: p.problem_id, result });
        this.think("accept_line", "answer_right", p.skill_id);
        await this.solvedLines(p);
        await this.finishProblem();
      });
      return;
    }
    this.out({ type: "answer_result", problem_id: p.problem_id, result });
    if (result === "unreadable") {
      await this.say(UNREADABLE);
      return;
    }
    this.primer.observe(p.skill_id, result === "correct");
    this.think(result === "correct" ? "accept_line" : "mark_line", result === "correct" ? "answer_right" : "answer_wrong", p.skill_id);
    if (result === "correct") {
      await this.solvedLines(p);
      await this.finishProblem();
      return;
    }
    if (result === "partial" && p.partial) {
      // Say the root they typed, not a fixed one (teen test 2026-10-26: "Yes, 7 works" to -7).
      this.partials++;
      const typed = readAnswer(text) ?? [];
      const root = typed.find((v) => p.solutions.some((s) => Math.abs(s - v) < 1e-6)) ?? typed[0];
      await this.say(p.partial.replace("{root}", String(root)));
      return;
    }
    this.misses++;
    const slip = p.misconceptions.find((m) => matchesValue(text, m.value));
    if (slip?.repair && !this.repaired) {
      // A slip with a repair puzzle: work on it there first, then come back (R-37).
      this.repaired = true;
      const template = slip.repair;
      await this.say(REPAIR_LEAD);
      this.offer(DETOUR_PUZZLE, () => this.startPuzzle(template, null));
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
    // On the line that solves the problem after a detour, how sure comes before the verdict (R-30).
    const beat = result === "solved" && this.beatDue(p);
    if (!beat) this.out({ type: "step_result", problem_id: p.problem_id, line, result, ...(slip ? { slip } : {}) });
    switch (result) {
      case "valid":
        // The line's motion is the feedback; the tutor stays quiet so the student keeps going.
        // A fixed line answers the question about the wrong one.
        this.stepLines.push(text);
        this.awaitingWhy = false;
        this.primer.observe(p.skill_id, true);
        this.think("accept_line", "line_valid", p.skill_id);
        return;
      case "solved": {
        this.stepLines.push(text);
        this.awaitingWhy = false;
        this.primer.observe(p.skill_id, true);
        // The fresh problem after a repair is solved: the fix held.
        if (p.problem_id.startsWith("g")) this.primer.hypothesize("fix_holding", p.skill_id);
        const confirm = async () => {
          if (beat) this.out({ type: "step_result", problem_id: p.problem_id, line, result });
          this.think("accept_line", "solved", p.skill_id);
          await this.solvedLines(p);
          await this.finishProblem();
        };
        if (beat) await this.askConfidence("how_sure", p, CONFIDENCE_ASK, confirm);
        else await confirm();
        return;
      }
      case "unreadable":
        // On an expression to work out (no x), the line is numbers and operations.
        await this.say(p.variable === null ? STEP_UNREADABLE_VALUE : STEP_UNREADABLE);
        return;
      case "invalid": {
        this.misses++;
        // A slip from a prerequisite (R-40) is evidence about that skill, not this one.
        const node = (slip && SLIPS.find((s) => s.id === slip)?.node) || p.skill_id;
        this.primer.observe(node, false);
        this.think("mark_line", slip ? "slip_matched" : "line_invalid", node);
        const repair = slip ? slipRepair(slip) : null;
        const item = repair ? itemFor(repair) : null;
        const player = item ? templateOf(item.item_id) : null;
        const below = PROBE_BELOW[p.skill_id];
        // Back on the problem after a skill was taught, and still missing it: an angle not tried yet, if there is one.
        const taught = this.lastTaught;
        const retry = taught && taught.origin === p && pickTeachItem(taught.node, this.anglesTried.get(taught.node) ?? []) ? taught.node : null;
        if (below && !this.probed) {
          // The first miss: find out what's underneath before teaching anything (R-01).
          this.probed = true;
          await this.say(PROBE_LEAD);
          this.offer(DETOUR_PROBE, () => this.startProbe(p, [below]));
        } else if (item && player && !this.repaired) {
          // A slip with a repair puzzle: work on that move there first, then a fresh problem (R-37).
          this.repaired = true;
          this.confirm = true;
          this.think("repair", "slip_repair", node);
          // The puzzle never uses a line of this solution ("2x = 12" under "2x + 5 = 17"), or it
          // would walk the student to this problem's answer (R-02).
          const lines = [...this.stepLines];
          await this.say(STEP_REPAIR_LEAD);
          this.offer(DETOUR_PUZZLE, () => this.startPuzzle(player, null, item.item_id, lines));
        } else if (retry !== null) {
          // The explanation didn't land: the same skill again, from a different angle (R-05).
          await this.say(SWITCH_ANGLE);
          this.offer(DETOUR_TEACH, () => this.teachGap(p, retry));
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
    const skill = this.current?.skill_id ?? (this.puzzle ? skillOf(this.puzzle.item.item_id) : undefined);
    if (skill) this.think("pause", "three_misses", skill);
    await this.say(TAKE_A_BREATH);
    this.out({ type: "pause_suggested" });
  }

  private async pivot(): Promise<void> {
    this.pivoted = true;
    this.next = null;
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
    // A pause during the beat drops it unanswered; the session still owes one before it closes.
    this.beat = null;
    if (this.probe || this.gap) this.primer.dropHypothesis();
    this.probe = null;
    this.gap = null;
    this.reflecting = false;
    this.thanked = false;
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
    this.next = null;
    this.index++;
    this.current = null;
    this.probe = null;
    this.lastTaught = null;
    this.stepLines = [];
    const next = this.order[this.index];
    if (next) this.think("pose_problem", "path_next", next.skill_id);
    if (!next) {
      await this.closeSession();
      return;
    }
    // Hard reset at the end of a problem (R-17); the next problem starts on a clean page. The
    // solved card stays, with its check line, until "Next problem" is tapped.
    const go = async () => {
      this.out({ type: "reset", reason: "problem_end" });
      await this.sleep(this.timing.resetMs);
      await this.present(next);
    };
    if (this.timing.wait) this.offer(NEXT_PROBLEM, go);
    else await go();
  }

  /** Show a problem. `back` means the student is returning to it after a detour, not starting it. */
  private async present(p: ScriptedProblem, intro = p.intro, back = false): Promise<void> {
    this.current = p;
    this.stepLines = [];
    this.misses = 0;
    this.partials = 0;
    this.returned = back;
    this.redirected = false;
    this.hintsUsed = 0;
    this.awaitingWhy = false;
    const lessonOnly = this.order.filter((q) => q !== CONFIDENCE_BUILDER);
    const position = lessonOnly.indexOf(p) + 1;
    const kind = this.probe?.problem === p ? "probe" : p === CONFIDENCE_BUILDER ? "warmup" : "practice";
    if (kind === "practice") this.lastPractice = p;
    this.out({
      type: "problem",
      problem_id: p.problem_id,
      skill_id: p.skill_id,
      prompt: p.prompt,
      instruction: p.instruction,
      format: p.format ?? "answer",
      kind,
      answer_example: answerExample(p.variable === undefined ? "x" : p.variable, p.solutions),
      position, // 0 for the confidence builder, which isn't one of the lesson's problems
      total: lessonOnly.length,
    });
    // The problem shows first, so there's no wait on an empty card while the intro streams.
    for (const text of intro) await this.say(text);
  }

  private skin() {
    return skinFor(this.interest, this.colors);
  }

  /**
   * `item` picks a specific item, such as a slip's repair; otherwise the template's own. `lead` is
   * said first, unless it was said already, before the student tapped on to the puzzle.
   */
  private async startPuzzle(template: PuzzleTemplate, lead: string | null, item?: string, avoid: readonly string[] = []): Promise<void> {
    if (!this.puzzle) this.returnTo = this.current;
    this.current = null;
    this.stepLines = []; // the reset below clears them from the screen too
    this.awaitingWhy = false;
    this.puzzleNudge = null;
    this.reflecting = false;
    this.thanked = false;
    if (lead) await this.say(lead);
    this.out({ type: "topic_switch", label: template === "worked_example" ? "Worked example" : "Quick puzzle" });
    this.out({ type: "reset", reason: "topic_switch" });
    await this.sleep(this.timing.resetMs);
    await this.showPuzzle(template, 0, item, avoid);
  }

  /** `avoid` lists lines a repair must not use, on top of the lesson's problems (R-02). */
  private async showPuzzle(template: PuzzleTemplate, fade: Fade = 0, item?: string, avoid: readonly string[] = []): Promise<void> {
    this.puzzles++;
    const rng = seeded(this.seed + this.puzzles);
    const id = `${template}-${this.puzzles}`;
    const live = item ? newItemPuzzle(item, rng, id, this.level, [...this.lessonPrompts(), ...avoid], fade) : newPuzzle(template, rng, id, fade);
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
      await this.say(worksOut(live) ? PUZZLE_UNREADABLE_VALUE : PUZZLE_UNREADABLE);
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
        const skill = skillOf(live.item.item_id);
        this.primer.observe(skill, true);
        this.think(this.confirm ? "repair" : "teach", "puzzle_solved", skill);
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
      // Answer their "why", then stay: the reply and their own words stay on screen until they
      // tap Keep going (R-03). Teen test 2026-10-26: moving on at once wiped both.
      if (this.thanked) {
        await this.say(KEEP_GOING_READY);
      } else {
        this.thanked = true;
        await this.say(line(live, this.skin(), (i) => i.thanks));
      }
    } else if (this.puzzleNudge) {
      const nudge = this.puzzleNudge;
      this.puzzleNudge = null;
      await this.say(nudge);
    } else if (WANTS_ANSWER.test(text)) {
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
    this.thanked = false;
    this.puzzleNudge = null;
    await this.sleep(this.timing.resetMs);
    this.out({ type: "reset", reason: "problem_end" });
    await this.sleep(this.timing.resetMs);
    // A worked example fades one step at a time before the lesson picks up again (R-37).
    if (live.template === "worked_example" && live.fade < 2) {
      await this.showPuzzle("worked_example", (live.fade + 1) as Fade, live.item.item_id);
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
    if (this.gap) {
      this.primer.taught(this.gap);
      this.retaught = true;
      // A miss on the problem it goes back to means this explanation didn't land (R-05).
      if (back) this.lastTaught = { node: this.gap, origin: back };
    }
    if (back) this.think("pose_problem", this.gap ? "gap_taught" : "back_to_problem", back.skill_id);
    this.gap = null;
    const next = back ?? this.order[this.index];
    if (!next) {
      await this.closeSession();
      return;
    }
    await this.present(next, back ? [BACK_TO_IT] : next.intro, back !== null);
  }

  /** The lines for a solved problem. The first-try line is true only on a clean first try (R-06). */
  private async solvedLines(p: ScriptedProblem): Promise<void> {
    this.solved++;
    this.lastSolved = p;
    const clean = this.misses === 0 && this.partials === 0 && !this.returned;
    if (clean) this.firstTry++;
    for (const line of p.correct) await this.say(line);
    const extra = clean ? p.firstTry : p.afterMiss;
    if (extra) await this.say(extra);
  }

  /**
   * The closing line finishes before the map takes the screen (teen test 2026-10-26: it was cut
   * off mid-sentence), and the map waits for the See my map tap.
   */
  private async closeSession(): Promise<void> {
    // A session that gets here without its beat has one now, about the problem still on screen:
    // the key step after a reteach, or how sure they were about the last one solved (R-30).
    const p = this.lastPractice;
    if (!this.beatDone && !this.beat && p && (this.retaught || this.lastSolved === p)) {
      const kind = this.retaught ? "key_step" : "how_sure";
      await this.askConfidence(kind, p, kind === "key_step" ? KEY_STEP_ASK : CONFIDENCE_ASK_LATE, () => this.closingLine());
      return;
    }
    await this.closingLine();
  }

  /** The closing line, then the map (behind its tap when the demo waits). */
  private async closingLine(): Promise<void> {
    await this.say(CLOSING);
    if (this.timing.wait) this.offer(SEE_MAP, async () => this.end());
    else this.end();
  }

  /**
   * The beat lands on the first right answer after a detour: the fresh problem that checks a
   * repair held, or the problem the student came back to after a quick check or a worked
   * example. That is where knowing how sure they are says the most. Once per session, and never
   * on a quick check or the warm-up.
   */
  private beatDue(p: ScriptedProblem): boolean {
    if (this.beatDone || this.beat !== null || p === CONFIDENCE_BUILDER || this.probe?.problem === p) return false;
    return this.returned || p.problem_id.startsWith("g");
  }

  /** Ask, and hold `finish` (the verdict and what follows it) for the answer. */
  private async askConfidence(kind: "how_sure" | "key_step", p: ScriptedProblem, ask: string, finish: () => Promise<void>): Promise<void> {
    this.beat = { kind, problem: p, finish };
    this.think("check_confidence", kind === "how_sure" ? "calibrate" : "key_step", p.skill_id);
    // The check shows on the card first; the words stream beside it. Codes only (R-30).
    this.out({ type: "confidence_check", problem_id: p.problem_id, kind, choices: [...(kind === "how_sure" ? REASON_CODES : STEP_CODES)] });
    await this.say(ask);
  }

  /** The student's answer to the beat. The browser's events aren't trusted: an unknown code counts as none. */
  private async confidence(level: 1 | 2 | 3 | null, reason: string | null): Promise<void> {
    const beat = this.beat!;
    this.beat = null;
    this.beatDone = true;
    const skill = beat.problem.skill_id;
    if (beat.kind === "how_sure") {
      const l = level !== null && ([1, 2, 3] as number[]).includes(level) ? level : null;
      const r = reason !== null && REASON_CODES.includes(reason) ? (reason as keyof typeof CONFIDENCE_REPLIES.reason) : null;
      if (l !== null) this.think("check_confidence", l === 3 ? "calibrated" : "underconfident", skill);
      // The reason gets the reply; a level alone (a guess, or "rather not say") gets the level's.
      const reply = r !== null ? CONFIDENCE_REPLIES.reason[r] : l !== null ? CONFIDENCE_REPLIES.level[l] : null;
      if (reply) await this.say(reply);
    } else {
      this.think("check_confidence", "key_step_noted", skill);
      await this.say((reason !== null && KEY_STEP_REPLIES[reason]) || KEY_STEP_REPLY_NONE);
    }
    await beat.finish();
  }

  /** The demo's skip during the beat: on without an answer, and the session's beat counts as had. */
  private async skipBeat(): Promise<void> {
    const beat = this.beat!;
    this.beat = null;
    this.beatDone = true;
    await beat.finish();
  }

  private end(): void {
    this.out({ type: "session_end", solved: this.solved, first_try: this.firstTry, map: this.primer.report() });
    this.closed = true;
  }

  /** The primer's state after a move, for the demo primer view (R-42). Codes and numbers only. */
  private think(move: string, reason: string, skill_id: string): void {
    this.out({ type: "primer_state", ...this.primer.after(move, reason, skill_id) });
  }

  /** Wait for the student's tap before `go` (R-01, R-17): the button's label says where it leads. */
  private offer(label: string, go: () => Promise<void>): void {
    this.next = go;
    this.out({ type: "next_up", label });
  }

  private async take(): Promise<void> {
    const go = this.next;
    this.next = null;
    if (go) await go();
  }

  /** Probe the last skill in `chain`, one level further down the path than the one before it (R-01). */
  private async startProbe(origin: ScriptedProblem, chain: string[]): Promise<void> {
    const node = chain.at(-1)!;
    const problem = probeProblem(node);
    this.probe = { origin, chain, problem };
    this.primer.hypothesize("suspects_gap", node);
    this.think("probe", chain.length === 1 ? "probe_prerequisite" : "probe_deeper", node);
    await this.newPage("topic_switch", "Quick check");
    await this.present(problem, [PROBE_ASK]);
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
    // The verdict stays on the card until the student taps on to what it led to (R-01).
    if (!right) {
      const below = PROBE_BELOW[node];
      // Probing goes at most two levels down; the deepest miss is the gap.
      if (below && chain.length < 2) {
        await this.say(PROBE_DEEPER);
        this.offer(DETOUR_PROBE_DEEPER, () => this.startProbe(origin, [...chain, below]));
      } else {
        await this.say(SHOW_ONE);
        this.offer(DETOUR_TEACH, () => this.teachGap(origin, node));
      }
      return;
    }
    this.think("probe", "probe_passed", node);
    if (chain.length > 1) {
      // This level is solid, so the gap is the one above it.
      const gap = chain.at(-2)!;
      await this.say(SHOW_ONE);
      this.offer(DETOUR_TEACH, () => this.teachGap(origin, gap));
      return;
    }
    this.primer.hypothesize("gap_in_skill", origin.skill_id);
    this.think("pose_problem", "prereqs_solid", origin.skill_id);
    await this.say(PREREQS_SOLID);
    this.offer(DETOUR_BACK, async () => {
      this.probe = null;
      await this.newPage("problem_end");
      await this.present(origin, [BACK_TO_IT], true);
    });
  }

  /** Skipping a probe goes back to the problem it came from, not past it. */
  private async leaveProbe(): Promise<void> {
    const origin = this.probe!.origin;
    this.probe = null;
    this.primer.dropHypothesis();
    this.think("pose_problem", "back_to_problem", origin.skill_id);
    await this.newPage("problem_end");
    await this.present(origin, [BACK_TO_IT], true);
  }

  /**
   * Teach the gap, then go back to the problem that showed it. The first time it's the skill's
   * worked example; a second time on the same skill takes an angle not tried yet (R-05).
   */
  private async teachGap(origin: ScriptedProblem, gap: string): Promise<void> {
    this.probe = null;
    this.gap = gap;
    this.lastTaught = null;
    const tried = this.anglesTried.get(gap) ?? [];
    const item = pickTeachItem(gap, tried) ?? pickTeachItem(gap, []);
    if (item) this.anglesTried.set(gap, [...tried, item.angle]);
    this.primer.hypothesize("gap_found", gap);
    this.think("teach", tried.length === 0 ? "gap_found" : "switch_angle", gap);
    this.current = origin; // the explanation returns here
    if (item) await this.startPuzzle(item.template, null, item.id);
    else await this.startPuzzle("worked_example", null);
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
    const avoid = [...this.lessonPrompts(), ...(repair ? [problemOf(repair)] : [])];
    let g = this.problems.next(node, this.level);
    while (clashes(g.prompt, avoid)) g = this.problems.next(node, this.level);
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
