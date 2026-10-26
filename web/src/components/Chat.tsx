import { type Ref, useEffect, useRef, useState } from "react";
import { MathText } from "../math/MathText";
import { type ChatMessage, platyIsTyping } from "../session/state";

interface Props {
  messages: ChatMessage[];
  /** A new page is showing (R-17); its note is on the problem card, and the chat waits quietly. */
  resetNote: string | null;
  /** An overlay is up. */
  disabled: boolean;
  /**
   * The server isn't ready for a message: a puzzle move is being graded, or the next problem
   * is on its way. Typing still works; sending waits.
   */
  hold: boolean;
  inputRef?: Ref<HTMLInputElement>;
  onSay: (text: string) => void;
}

export function Chat({ messages, resetNote, disabled, hold, inputRef, onSay }: Props) {
  const [draft, setDraft] = useState("");
  const end = useRef<HTMLDivElement>(null);
  const waiting = platyIsTyping(messages, resetNote);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [messages, waiting]);

  const send = (text: string) => {
    const t = text.trim();
    if (!t || disabled || hold) return;
    onSay(t);
    setDraft("");
  };

  return (
    <section className="card chat" aria-label="Chat with Platy">
      <div className="chat__log" role="log" aria-live="polite">
        {messages.map((m, i) => (
          <div
            key={m.id}
            className={`bubble bubble--${m.from}${i < messages.length - 3 ? " bubble--older" : ""}`}
          >
            {m.from === "tutor" ? <MathText text={m.text} /> : m.text}
          </div>
        ))}
        {waiting && (
          <div className="bubble bubble--tutor bubble--typing" aria-label="Platy is thinking">
            <span />
            <span />
            <span />
          </div>
        )}
        <div ref={end} />
      </div>

      <form
        className="chat__composer"
        onSubmit={(e) => {
          e.preventDefault();
          send(draft);
        }}
      >
        <button type="button" className="chip" disabled={disabled} aria-disabled={hold || undefined} onClick={() => send("I'm stuck")}>
          I'm stuck
        </button>
        <label htmlFor="say" className="visually-hidden">
          Message Platy
        </label>
        <input
          ref={inputRef}
          id="say"
          className="chat__field"
          value={draft}
          placeholder="Tell Platy your thinking"
          autoComplete="off"
          disabled={disabled}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button type="submit" className="btn btn--primary" disabled={disabled || !draft.trim()} aria-disabled={hold || undefined}>
          Send
        </button>
      </form>
    </section>
  );
}
