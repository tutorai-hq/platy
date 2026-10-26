import { useCallback, useRef, useState } from "react";
import { AgeCheck } from "./components/AgeCheck";
import { Chat } from "./components/Chat";
import { Mascot } from "./components/Mascot";
import { OverlayPanel } from "./components/Overlays";
import { PrimerPanel } from "./components/PrimerPanel";
import { ProblemCard } from "./components/ProblemCard";
import { PuzzlePlayer } from "./components/PuzzlePlayer";
import { StepSolver } from "./components/StepSolver";
import { TestRunner } from "./components/TestRunner";
import { YourMap } from "./components/YourMap";
import { latestTutorLine, TutorLine } from "./session/tutorLine";
import { useTutorSession } from "./session/useTutorSession";
import { usesMock } from "./transport";
import type { DemoTrigger } from "./transport/types";

export function App() {
  const s = useTutorSession();
  const { phase } = s.state;
  const chatInput = useRef<HTMLInputElement>(null);
  // A solved puzzle's reflection question arrives in the chat, so that's where focus goes next.
  const focusChat = useCallback(() => chatInput.current?.focus(), []);
  // The age check comes first (R-36), and only its yes/no is kept, in memory (P-15). A "no" holds
  // for the rest of the visit, so a different answer can't be tried straight away.
  const [age, setAge] = useState<"ask" | "ok" | "under">("ask");
  // The demo flag for the primer view (R-42): off until the demo menu turns it on, and only with
  // the scripted mock, so a real session never shows it.
  const [primerView, setPrimerView] = useState(false);
  const showPrimer = s.isMock && primerView;
  // The pre and post test (R-26) for a test session: before practice, or after it from the end screen.
  const [test, setTest] = useState<"pre" | "post" | null>(null);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <Mascot size={40} />
          <span className="brand__name">Platy</span>
        </div>
        {/* The demo menu sits in the header, off the content (R-27): it covered buttons there. Off
            the session it holds the test-session entries (R-26), for the adult running it. */}
        {age === "ok" && usesMock() && (phase === "live" || !test) && (
          <DemoControls
            live={phase === "live"}
            onTrigger={s.demo}
            primerView={primerView}
            onPrimerView={setPrimerView}
            extra={
              phase === "welcome" ? [{ label: "Start the pre-test", run: () => setTest("pre") }]
              : phase === "ended" ? [{ label: "Start the post-test", run: () => setTest("post") }]
              : []
            }
          />
        )}
        {phase === "live" && (
          <button type="button" className="btn btn--quiet btn--small" onClick={s.end}>
            End session
          </button>
        )}
      </header>

      {age === "ask" && (
        <Screen title="When were you born?" mascot="calm">
          <p>Platy uses this to check your age, and doesn't save your birthday.</p>
          <AgeCheck onAnswer={(ok) => setAge(ok ? "ok" : "under")} />
        </Screen>
      )}

      {age === "under" && (
        <Screen title="Thanks for stopping by" mascot="calm">
          <p>Platy is made for students 13 and older, so it can't start a session for you. Nothing you entered was saved.</p>
        </Screen>
      )}

      {/* Every session screen sits behind the age check, not just the welcome screen. */}
      {age === "ok" && (
        <>
          {(phase === "welcome" || phase === "ended") && test && (
            <main className="screen screen--test">
              <TestRunner key={test} form={test} onDone={() => setTest(null)} />
            </main>
          )}

          {phase === "welcome" && !test && (
            <Screen title="Ready to practice?" mascot="calm">
              <p>Today: solving equations, one line at a time, and you can ask for hints whenever you want.</p>
              <button type="button" className="btn btn--primary btn--big" onClick={s.start} autoFocus>
                Start practice
              </button>
            </Screen>
          )}

          {phase === "live" && (
            <TutorLine.Provider value={latestTutorLine(s.state.messages)}>
              <main className={`session${showPrimer ? " session--primer" : ""}`}>
                {s.state.puzzle ? (
                  <PuzzlePlayer
                    key={s.state.puzzle.puzzle.instance_id}
                    state={s.state.puzzle}
                    moving={s.state.moving}
                    onSolved={focusChat}
                    onMove={s.puzzleMove}
                    onHint={s.puzzleHint}
                    onNext={s.puzzleNext}
                    onColors={s.pickColors}
                  />
                ) : s.state.problem && s.state.steps?.problem_id === s.state.problem.problem_id ? (
                  <StepSolver
                    key={s.state.problem.problem_id}
                    problem={s.state.problem}
                    steps={s.state.steps}
                    onStep={s.step}
                    onHint={s.hint}
                    nextUp={s.state.nextUp}
                    onNext={s.next}
                  />
                ) : (
                  <ProblemCard
                    problem={s.state.problem}
                    feedback={s.state.feedback}
                    onAnswer={s.answer}
                    onHint={s.hint}
                    note={s.state.resetNote}
                    nextUp={s.state.nextUp}
                    onNext={s.next}
                  />
                )}
                <Chat
                  messages={s.state.messages}
                  resetNote={s.state.resetNote}
                  disabled={s.state.overlay !== null}
                  hold={
                    s.state.moving ||
                    (s.state.puzzle !== null && s.state.puzzle.pending !== null) ||
                    (s.state.steps !== null && s.state.steps.pending !== null)
                  }
                  inputRef={chatInput}
                  onSay={s.say}
                />
                {showPrimer && <PrimerPanel primer={s.state.primer} />}
                {s.state.overlay && (
                  <OverlayPanel overlay={s.state.overlay} onResume={s.resume} onBreak={s.takeBreak} onClose={s.closeOverlay} />
                )}
              </main>
            </TutorLine.Provider>
          )}

          {phase === "ended" && !test && s.state.map && (
            <main className="screen screen--map">
              <div className="screen__inner">
                <h1>Your map</h1>
                <YourMap report={s.state.map} solved={s.state.solved} firstTry={s.state.firstTry} />
                <button type="button" className="btn btn--primary btn--big" onClick={s.start} autoFocus>
                  Practice again
                </button>
              </div>
            </main>
          )}

          {phase === "ended" && !test && !s.state.map && (
            <Screen title="Nice session!" mascot="happy">
              <p>
                You solved {s.state.solved} {s.state.solved === 1 ? "problem" : "problems"} today.
              </p>
              <button type="button" className="btn btn--primary btn--big" onClick={s.start} autoFocus>
                Practice again
              </button>
            </Screen>
          )}

          {phase === "error" && (
            <Screen title="Platy lost the connection" mascot="calm">
              <p>Nothing from this session was saved, so you'll start on a fresh page.</p>
              <button type="button" className="btn btn--primary btn--big" onClick={s.restart} autoFocus>
                Start again
              </button>
              <p className="screen__code">Code: {s.state.errorCode}</p>
            </Screen>
          )}
        </>
      )}
    </div>
  );
}

function Screen({ title, mascot, children }: { title: string; mascot: "calm" | "happy"; children: React.ReactNode }) {
  return (
    <main className="screen">
      <div className="screen__inner">
        <Mascot size={140} mood={mascot} />
        <h1>{title}</h1>
        {children}
      </div>
    </main>
  );
}

// Only shown with the scripted mock, so a demo can reach every screen on cue. `extra` holds the
// entries for the screen it's on, such as the test session's (R-26); `live` adds the session's.
function DemoControls({
  live,
  onTrigger,
  primerView,
  onPrimerView,
  extra = [],
}: {
  live: boolean;
  onTrigger: (t: DemoTrigger) => void;
  primerView: boolean;
  onPrimerView: (on: boolean) => void;
  extra?: { label: string; run: () => void }[];
}) {
  const [open, setOpen] = useState(false);
  const items: [DemoTrigger, string][] = [
    ["skip", "Skip to next problem"],
    ["spot_the_error", "Puzzle: spot the error"],
    ["missing_step", "Puzzle: missing step"],
    ["balance", "Puzzle: balance scale"],
    ["worked_example", "Worked example (fades step by step)"],
    ["interest", "Switch interest (soccer, football, gaming)"],
    ["pause", "Suggest a pause"],
    ["safety", "Show safety resources"],
    ["error", "Drop the connection"],
  ];
  return (
    <div className="demo">
      {open && (
        <div className="demo__menu" role="menu">
          {extra.map(({ label, run }) => (
            <button
              key={label}
              type="button"
              role="menuitem"
              onClick={() => {
                run();
                setOpen(false);
              }}
            >
              {label}
            </button>
          ))}
          {live && (
          <button
            type="button"
            role="menuitemcheckbox"
            aria-checked={primerView}
            onClick={() => {
              onPrimerView(!primerView);
              setOpen(false);
            }}
          >
            {primerView ? "Hide what Platy is thinking" : "Show what Platy is thinking"}
          </button>
          )}
          {live && items.map(([t, label]) => (
            <button
              key={t}
              type="button"
              role="menuitem"
              onClick={() => {
                onTrigger(t);
                setOpen(false);
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      <button type="button" className="demo__toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        Demo
      </button>
    </div>
  );
}
