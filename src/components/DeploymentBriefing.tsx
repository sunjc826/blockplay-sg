import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import { briefingGlyph, type BriefingInfo, type BriefingTime } from '../game/deployment-briefing';

const LINE_NAMES = ['header', 'location', 'time', 'weather'];

export function briefingLines({ location, respawn, time, weather, operation = 'EXPEDITION' }: { operation?: string; location: string; respawn: boolean; time: string; weather: string }) {
  return [respawn ? 'OPERATOR / REDEPLOYMENT' : `${operation} / INSERTION`, `LOCATION  ${location.toUpperCase()}, SINGAPORE`, `TIME      ${time} SGT`, `WEATHER   ${weather.toUpperCase()}`];
}

/**
 * The HUD only publishes ten times a second, which would type in clumps. Letters
 * are written straight to the DOM each frame from the engine's clock instead.
 */
export default function DeploymentBriefing({ location, respawn, time, weather, reduced, clock, operation }: BriefingInfo & { operation?: string; location: string; clock: () => BriefingTime | null }) {
  const lines = briefingLines({ location, respawn, time, weather, operation }), text = lines.join('\n');
  const root = useRef<HTMLDivElement>(null), latestClock = useRef(clock);
  useLayoutEffect(() => { latestClock.current = clock; });
  useLayoutEffect(() => {
    const letters = lines.flatMap((line, l) => [...line].map((char, i) => ({ char, l, i, el: root.current!.querySelector<HTMLElement>(`[data-line="${LINE_NAMES[l]}"] [data-i="${i}"]`)!, text: char, opacity: -1, glow: -1 })));
    const draw = () => {
      const time = latestClock.current();
      if (!time) return;
      for (const letter of letters) {
        const glyph = briefingGlyph(letter.char, letter.l, letter.i, time, reduced);
        const opacity = Math.round(glyph.opacity * 50) / 50, glow = Math.round(glyph.glow * 20) / 20;
        if (glyph.text !== letter.text) { letter.el.textContent = glyph.text; letter.text = glyph.text; }
        if (opacity !== letter.opacity) { letter.el.style.opacity = String(opacity); letter.opacity = opacity; }
        if (glow !== letter.glow) {
          letter.el.style.color = `rgb(${204 + 51 * glow},255,${204 + 51 * glow})`;
          letter.el.style.textShadow = `0 0 ${3 + 9 * glow}px rgba(${76 + 124 * glow},${153 + 102 * glow},${76 + 124 * glow},${.8 + .2 * glow}),0 1px 3px #000`;
          letter.glow = glow;
        }
      }
    };
    draw();
    let frame = requestAnimationFrame(function loop() { draw(); frame = requestAnimationFrame(loop); });
    return () => cancelAnimationFrame(frame);
  }, [text, reduced]);
  return <div ref={root} className="deployment-briefing" role="status" aria-label={lines.join('. ')}>
    {lines.map((line, l) => <div className="deployment-briefing-line" data-line={LINE_NAMES[l]} key={`${l}:${line}`} aria-hidden="true">
      {[...line].map((char, i) => <span data-i={i} key={i}>{char}</span>)}
    </div>)}
  </div>;
}

type Stage = 'descent' | 'ready';
const STATUS: Record<Stage, string> = { descent: 'Closing on entry point', ready: 'Ready your weapon' };

/** Letterbox and feed. `intro` ends on landing, and the feed and bars then leave over the first moments of play. */
export function DeploymentOverlay({ location, intro, briefing, clock, children, operation }: {
  operation?: string; location: string; intro: { stage: Stage; fade: number } | null; briefing: BriefingInfo | null; clock: () => BriefingTime | null; children?: ReactNode;
}) {
  const status = useRef<Stage>('descent');
  useEffect(() => { if (intro) status.current = intro.stage; }, [intro]);
  return <div className="expedition-intro" data-stage={intro?.stage ?? 'out'}>
    <div className="expedition-intro-shade" />
    <div className="expedition-intro-fade" style={{ opacity: intro?.fade ?? 0 }} />
    {briefing && <div className="expedition-intro-caption">
      <DeploymentBriefing operation={operation} location={location} clock={clock} {...briefing} />
      <strong>{STATUS[intro?.stage ?? status.current]}</strong>
    </div>}
    {children}
  </div>;
}
