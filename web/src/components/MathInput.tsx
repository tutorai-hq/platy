import { useContext, useEffect, useRef, useState } from "react";
import { KEYPAD, press, type Key } from "../math/keypad";
import { childMathToLatex } from "../math/latex";
import { MathText, Tex } from "../math/MathText";
import { TutorLine } from "../session/tutorLine";
import { canCheck } from "./answer";

interface Props {
  id: string;
  label: string;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
  /** "laptop": focus on arrival only where there's a mouse, never on a phone (R-18). */
  autoFocus?: boolean | "laptop";
  /** The accessible name of the clear (×) button. */
  clearLabel?: string;
  /** Each change selects the box's text on a laptop, so typing replaces it (R-18). */
  select?: number;
}

// A phone or tablet has no fine pointer. There, focus docks the keypad over the problem.
const onLaptop = () => typeof window !== "undefined" && window.matchMedia?.("(pointer: fine)").matches === true;

export function MathInput({ id, label, value, placeholder, onChange, onSubmit, disabled, autoFocus, clearLabel = "Clear answer", select = 0 }: Props) {
  const input = useRef<HTMLInputElement>(null);
  // On a phone or tablet the keypad stands in for the device keyboard, so the box asks for none
  // (inputMode "none"). "abc" brings the device keyboard back for letters and words; any other key
  // puts it away again. A laptop's own keyboard types either way.
  const [deviceKeyboard, setDeviceKeyboard] = useState(false);
  // On a phone the keypad docks at the bottom of the screen only while the box has focus, the way
  // a keyboard does, so it never pushes the card's own content out of view.
  const [focused, setFocused] = useState(false);
  const refocusing = useRef(false);
  // A box disabled while it has focus (answered with the device keyboard's Enter) gets no blur
  // event, so the keypad would dock again by itself when the next problem re-enables the box.
  useEffect(() => {
    if (disabled) setFocused(false);
  }, [disabled]);
  const latex = childMathToLatex(value);
  const readable = canCheck(value);
  const tutorLine = useContext(TutorLine);

  // A new problem's box takes focus on a laptop, so typing goes straight in (R-18). Never away
  // from the chat box, mid-sentence.
  useEffect(() => {
    const el = input.current;
    if (autoFocus !== "laptop" || !el || !onLaptop() || !free(el)) return;
    el.focus();
  }, [autoFocus]);

  const selected = useRef(select);
  useEffect(() => {
    const el = input.current;
    if (select === selected.current) return;
    selected.current = select;
    if (!el || !onLaptop() || !free(el)) return;
    el.focus();
    el.select();
  }, [select]);

  const tap = (key: Key) => {
    const el = input.current;
    if (!el) return;
    if (key.action.kind === "submit") {
      if (!readable) return;
      // Put the keypad away so the tutor's reply in the chat isn't hidden behind it.
      el.blur();
      onSubmit();
      return;
    }
    const wantKeyboard = key.action.kind === "keyboard";
    if (wantKeyboard !== deviceKeyboard) {
      // Set it now and re-focus inside the tap: a device keyboard only opens or closes from a
      // focus that happens during the tap itself.
      el.inputMode = wantKeyboard ? "text" : "none";
      setDeviceKeyboard(wantKeyboard);
      refocusing.current = true;
      el.blur();
      el.focus();
      refocusing.current = false;
    }
    if (wantKeyboard) return;
    const next = press({ value, start: el.selectionStart ?? value.length, end: el.selectionEnd ?? value.length }, key.action);
    if (next.value !== value) onChange(next.value);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(next.caret, next.caret);
    });
  };

  return (
    // While the device keyboard is up the docked keypad would only sit hidden behind it.
    <div className={`math-input${focused && !disabled && !deviceKeyboard ? " math-input--focused" : ""}`}>
      <label htmlFor={id} className="visually-hidden">
        {label}
      </label>
      <div className="math-input__box">
        <input
          ref={input}
          id={id}
          className="math-input__field"
          value={value}
          placeholder={placeholder}
          disabled={disabled}
          autoFocus={autoFocus === true}
          inputMode={deviceKeyboard ? "text" : "none"}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            if (refocusing.current) return;
            setFocused(false);
            // Leaving the box puts the device keyboard away; next time the keypad comes back.
            setDeviceKeyboard(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && readable) {
              e.preventDefault();
              onSubmit();
            }
          }}
        />
        {/* Clears the box in one tap (R-18). Inside the field, away from the keypad's ⌫. */}
        {value && !disabled && (
          <button
            type="button"
            className="math-input__clear"
            aria-label={clearLabel}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              onChange("");
              input.current?.focus();
            }}
          >
            <span aria-hidden="true">×</span>
          </button>
        )}
      </div>
      <p className="math-preview" aria-live="polite">
        {latex && (
          <>
            {/* Check waits until all of it reads (R-18); the label says why it's waiting. */}
            <span className="math-preview__label">{readable ? "Platy reads:" : "Platy can't read all of this yet:"}</span>{" "}
            <Tex latex={latex} />
          </>
        )}
      </p>
      <div className="keypad-dock">
        {/* On a phone the docked keypad covers the chat, so Platy's newest line sits above it (R-27).
            The chat log already reads it out, so screen readers skip this copy. A tap here leaves
            the box, which puts the keypad away and shows the whole chat. */}
        {tutorLine && (
          <div className="keypad-dock__tutor" aria-hidden="true">
            <MathText text={tutorLine} />
          </div>
        )}
        {/* Out of the Tab order: a keyboard types all of this directly, and 28 stops between the
            box and its Check button would be a slog. Screen readers still reach every key. */}
        <div className="keypad" role="group" aria-label="Math keypad">
          {(["symbols", "numbers"] as const).map((block) => (
            <div key={block} className={`keypad__block keypad__block--${block}`}>
              {KEYPAD[block].map((k) => (
                <button
                  key={k.label}
                  type="button"
                  tabIndex={-1}
                  className={`keypad__key keypad__key--${k.action.kind}${k.tone ? ` keypad__key--${k.tone}` : ""}`}
                  aria-label={k.aria}
                  disabled={disabled}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => tap(k)}
                >
                  {k.label}
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Nothing else has the student's focus: the page, or a control in the same card. */
function free(el: HTMLElement): boolean {
  const at = document.activeElement;
  return !at || at === document.body || el.closest(".problem")?.contains(at) === true;
}
