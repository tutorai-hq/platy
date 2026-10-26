import { useCallback, useRef, useState } from "react";
import { AgeCheck } from "./components/AgeCheck";
import { Chat } from "./components/Chat";
import { Mascot } from "./components/Mascot";
import { OverlayPanel } from "./components/Overlays";
import { PrimerPanel } from "./components/PrimerPanel";
import { ProblemCard } from "./components/ProblemCard";
import { PuzzlePlayer } from "./components/PuzzlePlayer";
import { StepSolver } from "./components/StepSolver";
import { YourMap } from "./components/YourMap";
import { useTutorSession } from "./session/useTutorSession";
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

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <Mascot size={40} />
          <span className="brand__name">Platy</span>
        </div>
        {phase === "live" && (
          <button type="button" className="btn btn--quiet btn--small" onClick={s.end}>
            End session
          </button>
        )}
      </header>

      {age === "ask" && (
        <Screen title="When were you born?" mascot="calm">
          <p>Platy only keeps whether it's for you, not your birthday.</p>
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
          {phase === "welcome" && (
            <Screen title="Ready to practice?" mascot="calm">
              <p>Today: solving equations, one line at a time, and you can ask for hints whenever you want.</p>
              <button type="button" className="btn btn--primary btn--big" onClick={s.start} autoFocus>
                Start practice
              </button>
            </Screen>
          )}

          {phase === "live" && (
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
                />
              ) : (
                <ProblemCard problem={s.state.problem} feedback={s.state.feedback} onAnswer={s.answer} onHint={s.hint} />
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
              {s.isMock && <DemoControls onTrigger={s.demo} primerView={primerView} onPrimerView={setPrimerView} />}
            </main>
          )}

          {phase === "ended" && s.state.map && (
            <main className="screen screen--map">
              <div className="screen__inner">
                <h1>Your map</h1>
                <p>
                  You solved {s.state.solved} {s.state.solved === 1 ? "problem" : "problems"} today.
                </p>
                <YourMap report={s.state.map} />
                <button type="button" className="btn btn--primary btn--big" onClick={s.start} autoFocus>
                  Practice again
                </button>
              </div>
            </main>
          )}

          {phase === "ended" && !s.state.map && (
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

// Only shown with the scripted mock, so a demo can reach every screen on cue.
function DemoControls({
  onTrigger,
  primerView,
  onPrimerView,
}: {
  onTrigger: (t: DemoTrigger) => void;
  primerView: boolean;
  onPrimerView: (on: boolean) => void;
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
          {items.map(([t, label]) => (
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
