import { masteryRows, primerText } from "../content/primer";
import type { PrimerView } from "../session/state";

/**
 * The demo primer view (R-42): what the primer believes and why, for adults watching a demo.
 * It takes the primer's codes and numbers only, never the session's messages or input, and every
 * word comes from the fixed table in content/primer.json.
 */
export function PrimerPanel({ primer }: { primer: PrimerView | null }) {
  const state = primer?.state;
  const hypothesis = state?.hypothesis ? primerText("hypotheses", state.hypothesis.code, state.hypothesis.skill_id) : null;
  const probing = state?.move.code === "probe" ? state.move.skill_id : null;
  const moves = (primer?.log ?? []).flatMap(({ seq, move }) => {
    const label = primerText("moves", move.code, move.skill_id);
    const reason = primerText("reasons", move.reason, move.skill_id);
    return label && reason ? [{ seq, label, reason }] : [];
  });

  return (
    <aside className="primer" aria-label="What Platy is thinking (demo)">
      <h2 className="primer__title">What Platy is thinking</h2>

      <section className="primer__block">
        <h3 className="primer__heading">Hypothesis</h3>
        <p className={`primer__hypothesis${hypothesis ? "" : " primer__hypothesis--none"}`}>
          {hypothesis ?? "None yet. Watching the first lines."}
        </p>
      </section>

      <section className="primer__block">
        <h3 className="primer__heading">Mastery on this path</h3>
        <ul className="primer__mastery">
          {state &&
            masteryRows(state).map((row) => (
              <li key={row.skill_id} className={`primer__skill${row.skill_id === probing ? " primer__skill--probed" : ""}`}>
                {/* Keyed by the move count, so the pulse plays once for each new probe. */}
                {row.skill_id === probing && <span key={primer?.seq} className="primer__pulse" aria-hidden="true" />}
                <span className="primer__name">{row.name}</span>
                <span className="primer__p">{Math.round(row.p * 100)}%</span>
                <span className="primer__bar" aria-hidden="true">
                  <span className="primer__fill" style={{ transform: `scaleX(${row.p})` }} />
                </span>
              </li>
            ))}
        </ul>
      </section>

      <section className="primer__block">
        <h3 className="primer__heading">Moves, newest first</h3>
        <ol className="primer__moves" aria-live="polite">
          {moves.map((m, i) => (
            <li key={m.seq} className={`primer__move${i === 0 ? " primer__move--latest" : ""}`}>
              <span className="primer__label">{m.label}</span>
              <span className="primer__reason">{m.reason}</span>
            </li>
          ))}
        </ol>
      </section>
    </aside>
  );
}
