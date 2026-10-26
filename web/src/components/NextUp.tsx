// The one way on when the server has a next step ready (`next_up`): a detour such as a quick
// check waits for this tap, so the student has read why before the screen changes (R-01).
export function NextUp({ label, onNext }: { label: string; onNext: () => void }) {
  return (
    <div className="next-up dock-bottom">
      <button type="button" className="btn btn--primary btn--big" onClick={onNext} autoFocus>
        {label} <span aria-hidden="true">→</span>
      </button>
    </div>
  );
}
