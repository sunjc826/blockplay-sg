import { MessageSquare } from 'lucide-react';
import type { FpsEngine, FpsHud } from '../game/fps-engine';
import { CALLOUT_PAGES, type PlayerCallout } from '../game/player-callouts';
import { tapProps } from './touch-tap';
import './fps-callouts.css';

/** Pixels from the wheel's centre to the middle of each slot. */
const RADIUS = 118;

/** The second line on an order's slot: whether it can be carried out now. */
function orderHint(callout: PlayerCallout, status: FpsHud['orderStatus']) {
  if (!callout.order) return null;
  if (callout.order === 'reinforce') return !status || status.reinforce === 'none' ? 'Not here' : status.reinforce === 'ready' ? 'Ready' : `${status.reinforce} s`;
  return status?.allies ? 'Order' : 'No allies';
}

/**
 * The callout wheel. With a captured mouse it is steered by the mouse from the
 * centre (Y held); with a touchscreen or a free pointer its slots are buttons.
 * Orders, which move allies, are drawn apart from talk, which does not.
 */
export default function FpsCalloutWheel({ hud, engine }: { hud: FpsHud; engine: FpsEngine | null }) {
  const wheel = hud.calloutWheel;
  if (!wheel || hud.phase !== 'playing') return null;
  const page = CALLOUT_PAGES[wheel.page], orders = page.callouts.some(callout => callout.order), allies = hud.orderStatus?.allies ?? 0;
  return <div className="fps-callout-wheel" role="dialog" aria-label={`Callout wheel, ${page.name}`} data-page={page.id} data-orders={orders || undefined}>
    <div className="fps-callout-ring">
      {page.callouts.map((callout, i) => {
        const angle = i / page.callouts.length * Math.PI * 2, hint = orderHint(callout, hud.orderStatus);
        const idle = !!callout.order && (callout.order === 'reinforce' ? hint !== 'Ready' : !allies);
        return <button key={callout.id} type="button" className="fps-callout-slot" data-selected={wheel.slot === i || undefined} aria-pressed={wheel.slot === i}
          data-order={callout.order} data-idle={idle || undefined} aria-label={callout.order ? `Order: ${callout.label}, ${hint}` : callout.label}
          style={{ left: `calc(50% + ${(Math.sin(angle) * RADIUS).toFixed(1)}px)`, top: `calc(50% - ${(Math.cos(angle) * RADIUS).toFixed(1)}px)` }}
          {...tapProps(() => engine?.sendCallout(callout.id))}>
          <kbd>{i + 1}</kbd><span>{callout.label}{hint && <small>{hint}</small>}</span>
        </button>;
      })}
      <div className="fps-callout-hub">
        <div role="group" aria-label="Callout pages">
          {CALLOUT_PAGES.map((p, i) => <button key={p.id} type="button" aria-pressed={i === wheel.page} data-orders={p.callouts.some(c => c.order) || undefined} {...tapProps(() => engine?.setCalloutPage(i))}>{p.name}</button>)}
        </div>
        <p className="fps-callout-kind">{orders ? `Allies act on these · ${allies} in range` : 'Talk only · nobody acts on it'}</p>
        <small>{hud.inputMode === 'touch' ? 'Tap to say it' : hud.locked ? 'Point · release Y · Tab page' : 'Click to say it · Tab page'}</small>
        <button type="button" className="fps-callout-close" aria-label="Close callout wheel" {...tapProps(() => engine?.closeCalloutWheel())}>×</button>
      </div>
    </div>
  </div>;
}

/** The last few things said nearby, newest at the bottom. */
export function FpsChatter({ hud }: { hud: FpsHud }) {
  if (!hud.chatter.length || hud.phase !== 'playing') return null;
  return <div className="fps-chatter" aria-hidden="true">
    {hud.chatter.map(line => <p key={line.id} data-tone={line.tone}><b>{line.source}</b> {line.text}</p>)}
  </div>;
}

/** The touch chip that opens the wheel, beside the menu chip. */
export function CalloutChip({ hud, engine }: { hud: FpsHud; engine: FpsEngine | null }) {
  return <button type="button" className="touch-chip touch-callout" data-touch-action="callout" aria-label="Callouts" title="Callouts" aria-pressed={!!hud.calloutWheel}
    {...tapProps(() => engine?.toggleCalloutWheel())}><MessageSquare size={16} /></button>;
}
