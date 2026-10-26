import { type ReactNode, useState } from "react";
import { MathInput } from "../MathInput";

interface Props {
  id: string;
  /** Says what to write; shown above the box. */
  prompt: string;
  placeholder: string;
  button: string;
  onSubmit: (text: string) => void;
  /** A move is waiting for its verdict; the box stays editable but can't send. */
  busy: boolean;
  /** Take focus on mount: the box replaced the control the child just used. */
  autoFocus?: boolean;
  /** More buttons for the same row, like the hint. */
  children?: ReactNode;
}

// One line of math for a puzzle to grade. The draft stays after a miss so it can be edited.
export function LineEntry({ id, prompt, placeholder, button, onSubmit, busy, autoFocus, children }: Props) {
  const [draft, setDraft] = useState("");
  const submit = () => {
    if (draft.trim() && !busy) onSubmit(draft.trim());
  };
  return (
    <>
      <p className="puzzle__ask" id={`${id}-ask`}>
        {prompt}
      </p>
      <MathInput
        id={id}
        label={prompt}
        value={draft}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onChange={setDraft}
        onSubmit={submit}
      />
      <div className="problem__actions dock-bottom">
        <button
          type="button"
          className="btn btn--primary"
          onClick={submit}
          disabled={!draft.trim()}
          aria-disabled={busy || undefined}
        >
          {button}
        </button>
        {children}
      </div>
    </>
  );
}
