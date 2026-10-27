import { useState } from "react";
import { choiceText, type Level, LEVELS, levelText, WORDS } from "../content/confidence";
import type { ConfidenceCheck as Check } from "../session/state";

interface Props {
  check: Check;
  /** The answer is on its way to the server; the taps hold without dropping focus. */
  busy: boolean;
  onAnswer: (level: Level | null, reason: string | null) => void;
}

/**
 * The metacognition beat (R-30), on the card where the answer was. A how_sure check is one scale
 * with three places on it, equal in weight so there's no "better" end to tap; then, unless it
 * was a guess, what made them sure, from the server's codes. A key_step check is one pick. Every
 * word comes from content/confidence.json, and only codes go back.
 */
export function ConfidenceCheck({ check, busy, onAnswer }: Props) {
  const [level, setLevel] = useState<Level | null>(null);
  const choices = check.choices.flatMap((code) => {
    const text = choiceText(check.kind, code);
    return text === null ? [] : [{ code, text }];
  });
  const pick = (l: Level | null, reason: string | null) => {
    if (!busy) onAnswer(l, reason);
  };

  if (check.kind === "key_step") {
    return (
      <div className="sure" role="group" aria-labelledby="sure-ask">
        <p id="sure-ask" className="sure__ask">
          {WORDS.key_step.ask}
        </p>
        <Choices choices={choices} skip={WORDS.key_step.skip} busy={busy} onPick={(code) => pick(null, code)} />
      </div>
    );
  }

  const asking = level === null ? WORDS.how_sure.ask : WORDS.how_sure.why;
  return (
    <div className="sure" role="group" aria-labelledby="sure-ask">
      <p id="sure-ask" className="sure__ask">
        {asking}
      </p>
      <div className="sure__scale" role="radiogroup" aria-label={WORDS.how_sure.ask}>
        {LEVELS.map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={level === n}
            aria-disabled={busy || undefined}
            disabled={level !== null && level !== n}
            className={`sure__level${level === n ? " sure__level--on" : ""}`}
            onClick={() => {
              if (busy || level !== null) return;
              setLevel(n);
              // A guess has no "what made you sure"; it goes as it is.
              if (n === 1) pick(1, null);
            }}
          >
            {levelText(n)}
          </button>
        ))}
      </div>
      {level !== null && level > 1 && (
        <Choices choices={choices} skip={WORDS.how_sure.skip} busy={busy} onPick={(code) => pick(level, code)} />
      )}
    </div>
  );
}

function Choices({
  choices,
  skip,
  busy,
  onPick,
}: {
  choices: { code: string; text: string }[];
  skip: string;
  busy: boolean;
  onPick: (code: string | null) => void;
}) {
  return (
    <div className="sure__choices">
      {choices.map((c, i) => (
        <button key={c.code} type="button" className="btn btn--quiet sure__choice" aria-disabled={busy || undefined} autoFocus={i === 0} onClick={() => onPick(c.code)}>
          {c.text}
        </button>
      ))}
      <button type="button" className="sure__skip" aria-disabled={busy || undefined} onClick={() => onPick(null)}>
        {skip}
      </button>
    </div>
  );
}
