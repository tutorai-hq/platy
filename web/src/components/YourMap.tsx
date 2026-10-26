import { type CSSProperties, useEffect, useRef, useState } from "react";
import words from "../content/map.json";
import {
  EDGES, edgePath, encouragement, H, LAYOUT, mapStates, NODES, type NodeState, type NodeView, STATE_WORDS, STATES, todayNodes, W,
} from "../content/map";
import type { SkillReport } from "../protocol";

// "Your map" (R-13): the whole skill map, drawn from skill_map.json, with what moved today, what's
// due for review and what unlocks next. Its only input is the session's mastery report; nothing
// is saved, and it goes when the next session starts. Every word on it comes from content/map.json.

/** The states that carry their words on the box; the others show by their look alone. */
const TAGGED: readonly NodeState[] = ["unlocked_today", "next", "due"];

/** A skill name in lines of about 17 characters, to fit its box at 14px. */
function lines(name: string): string[] {
  const out: string[] = [];
  for (const word of name.split(" ")) {
    const last = out.at(-1);
    if (last !== undefined && (last + " " + word).length <= 17) out[out.length - 1] = `${last} ${word}`;
    else out.push(word);
  }
  return out;
}

/** What a practiced skill's badge says: the gain in words, or that it was practiced (a drop is the primer changing its mind). */
function badge(v: NodeView): { text: string; label: string } {
  const delta = Math.round((v.after - v.before) * 100);
  if (delta > 0) return { text: words.badge.gain.replace("{n}", String(delta)), label: words.badge.gain_label.replace("{n}", String(delta)) };
  return { text: words.badge.practiced, label: words.badge.practiced };
}

interface Props {
  report: readonly SkillReport[];
  solved?: number;
  firstTry?: number | null;
}

export function YourMap({ report, solved = 0, firstTry = null }: Props) {
  const views = mapStates(report);
  const { pos, width, height } = LAYOUT;

  // Today's skills fill in one at a time, foundations first; then the next skill's moment.
  const moved = NODES.filter((n) => views.get(n.id)?.moved).sort((a, b) => a.layer - b.layer).map((n) => n.id);
  const revealAt = 400 + moved.length * 450;

  // On a phone the whole map doesn't fit (teen test 2026-10-26: clipped at the edges), so today's
  // skills come first as a list and the map waits behind "See the whole map". The CSS decides
  // which shows; a laptop always has the map.
  const [whole, setWhole] = useState(false);
  const today = todayNodes(views);
  // The legend explains exactly the looks on screen, built from the same state list as the boxes.
  const shown = STATES.filter((s) => [...views.values()].some((v) => v.state === s));

  // On a narrow screen the map scrolls sideways. Start it where today's work is, but far enough
  // along that the next skill's moment is on screen.
  const scroller = useRef<HTMLDivElement>(null);
  const firstX = moved.length > 0 ? pos.get(moved[0]!)!.x : 0;
  const reveals = NODES.filter((n) => ["next", "unlocked_today"].includes(views.get(n.id)!.state));
  const revealRight = Math.max(0, ...reveals.map((n) => pos.get(n.id)!.x + W));
  useEffect(() => {
    const el = scroller.current;
    if (!el || el.scrollWidth <= el.clientWidth) return;
    const px = (x: number) => ((x + 8) / (width + 16)) * el.scrollWidth;
    el.scrollLeft = Math.max(px(firstX) - 24, px(revealRight) + 24 - el.clientWidth);
  }, [firstX, revealRight, width, whole]);

  return (
    <figure className={`map${whole ? " map--whole" : ""}`}>
      {/* Nothing solved says nothing, rather than "0 problems" over a line about effort. */}
      {solved > 0 && <p className="map__solved">{solved === 1 ? words.solved.one : words.solved.many.replace("{n}", String(solved))}</p>}
      <p className="map__cheer">{encouragement(views, solved, firstTry)}</p>

      {today.length > 0 && (
        <ol className="map__today" aria-label={words.today}>
          {today.map((n) => {
            const v = views.get(n.id)!;
            return (
              <li key={n.id} className={`map-row map-row--${v.state}`} data-today={n.id}>
                <span className="map-row__name">{n.name}</span>
                <span className="map-row__state">
                  {STATE_WORDS[v.state]}
                  {v.moved && v.after > v.before ? `, ${badge(v).text}` : ""}
                </span>
                <span className="map-row__track" aria-hidden="true">
                  <span className="map-row__fill" style={{ "--to": v.after } as CSSProperties} />
                </span>
              </li>
            );
          })}
        </ol>
      )}
      {!whole && (
        <button type="button" className="btn btn--quiet map__whole" onClick={() => setWhole(true)}>
          {words.whole_map}
        </button>
      )}

      <div className="map__scroll" ref={scroller}>
        <svg className="map__svg" viewBox={`-8 -8 ${width + 16} ${height + 16}`} width={width + 16} aria-hidden="true">
          {EDGES.map(({ from, to }) => {
            const a = views.get(from)!;
            // Lit where today's gain carries on into a skill practiced today.
            const lit = a.moved && a.after > a.before && views.get(to)?.moved;
            return (
              <path
                key={`${from}>${to}`}
                data-edge={`${from}>${to}`}
                className={`map__edge${lit ? " map__edge--lit" : ""}`}
                d={edgePath(from, to)}
              />
            );
          })}
          {NODES.map((n) => {
            const v = views.get(n.id)!;
            const { x, y } = pos.get(n.id)!;
            const order = moved.indexOf(n.id);
            const style = {
              "--from": v.before,
              "--to": v.after,
              "--delay": `${order >= 0 ? 400 + order * 450 : v.state === "next" || v.state === "unlocked_today" ? revealAt : 0}ms`,
            } as CSSProperties;
            const tag = TAGGED.includes(v.state) ? STATE_WORDS[v.state] : undefined;
            const delta = Math.round((v.after - v.before) * 100);
            const b = badge(v);
            return (
              <g
                key={n.id}
                data-node={n.id}
                data-state={v.state}
                className={`map-node map-node--${v.state}${v.moved ? " map-node--moved" : ""}${delta > 0 ? " map-node--gained" : ""}`}
                transform={`translate(${x} ${y})`}
                style={style}
              >
                <rect className="map-node__box" width={W} height={H} rx={12} />
                <text className="map-node__name" x={12} y={tag || v.moved ? 18 : 26}>
                  {lines(n.name).map((line, i) => (
                    <tspan key={i} x={12} dy={i === 0 ? 0 : 16}>
                      {line}
                    </tspan>
                  ))}
                </text>
                {tag && (
                  <text className="map-node__tag" x={W - 10} y={H - 14} textAnchor="end">
                    {tag}
                  </text>
                )}
                {v.moved && !tag && (
                  <text className="map-node__delta" x={W - 10} y={H - 14} textAnchor="end" aria-label={b.label}>
                    {b.text}
                  </text>
                )}
                <rect className="map-node__track" x={12} y={H - 9} width={W - 24} height={4} rx={2} />
                <rect className="map-node__fill" x={12} y={H - 9} width={W - 24} height={4} rx={2} />
              </g>
            );
          })}
        </svg>
      </div>
      <ul className="visually-hidden">
        {NODES.map((n) => {
          const v = views.get(n.id)!;
          return (
            <li key={n.id}>
              {n.name}: {STATE_WORDS[v.state]}
              {v.moved ? `, ${Math.round(v.before * 100)}% to ${Math.round(v.after * 100)}% today` : ""}
            </li>
          );
        })}
      </ul>
      <figcaption className="map__legend">
        {shown.map((s) => (
          <span key={s} className={`map__key map__key--${s}`} data-key={s}>
            {STATE_WORDS[s]}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}
