import { physicalWeaponFamilies, primaryWeaponFamily } from '../game/weapon-modes';
import { useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { FpsHud } from '../game/fps-engine';
import { FPS_WEAPONS } from '../game/fps-rules';
import { tapProps } from './touch-tap';
import './fps-weapon-slider.css';

/** How far a thumb travels across the strip before it counts as a swipe rather than a tap. */
const SWIPE_PX = 24;

/**
 * The carried weapons as a strip in the top-right corner, in slot order, the
 * one in hand lit. A thumb taps a weapon to draw it or swipes across the strip
 * to step to the next one (left) or the previous one (right), the way many
 * mobile shooters do, with or without the other thumb on the stick. With a
 * mouse it is the reading of keys 1–3. On touch only the weapon in hand shows,
 * its outline (scripts/weapon-outlines.mjs) and name between two arrows; swiping
 * across it still steps.
 */
export default function FpsWeaponSlider({ hud, names, canSwitch, onSwitch }: { hud: FpsHud; names: readonly string[]; canSwitch: boolean; onSwitch: (family: number) => void }) {
  const swipe = useRef<{ id: number; x: number; swiped: boolean } | null>(null);
  const carried = physicalWeaponFamilies(hud.carriedWeapons), active = primaryWeaponFamily(hud.weapon);
  if (carried.length < 2) return null;
  const at = Math.max(0, carried.indexOf(active));
  const step = (by: number) => { if (canSwitch) onSwitch(carried[(at + by + carried.length) % carried.length]); };
  const neighbour = (by: number) => carried[(at + by + carried.length) % carried.length];
  // An arrow answers on touch-down, so it must not also start a swipe.
  const arrow = (by: number) => { const tap = tapProps(() => step(by)); return { ...tap, onPointerDown: (event: ReactPointerEvent<HTMLElement>) => { event.stopPropagation(); tap.onPointerDown(event); } }; };
  return <div className="fps-weapon-slider" role="group" aria-label="Weapons" data-testid="weapon-slider" style={{ '--slot': at, '--slots': carried.length } as React.CSSProperties}
    onPointerDown={event => { swipe.current = { id: event.pointerId, x: event.clientX, swiped: false }; }}
    onPointerMove={event => {
      const drag = swipe.current;
      if (!drag || drag.id !== event.pointerId || drag.swiped || Math.abs(event.clientX - drag.x) < SWIPE_PX) return;
      drag.swiped = true; step(event.clientX < drag.x ? 1 : -1);
    }}
    onPointerUp={event => { if (swipe.current?.id === event.pointerId) swipe.current = null; }}
    onPointerCancel={() => { swipe.current = null; }}>
    <div className="fps-weapon-current">
      <button type="button" className="fps-weapon-step" disabled={!canSwitch} aria-label={`Previous weapon: ${names[neighbour(-1)]}`} {...arrow(-1)}><ChevronLeft size={15} aria-hidden="true" /></button>
      <div key={active} className="fps-weapon-now" data-weapon={active}>
        <img src={`${import.meta.env.BASE_URL}images/weapon-outlines/${FPS_WEAPONS[active].id}.webp`} alt="" draggable={false} />
        <span>{names[active]}</span>
      </div>
      <button type="button" className="fps-weapon-step" disabled={!canSwitch} aria-label={`Next weapon: ${names[neighbour(1)]}`} {...arrow(1)}><ChevronRight size={15} aria-hidden="true" /></button>
    </div>
    <i className="fps-weapon-slider-thumb" aria-hidden="true" />
    {carried.map((family, slot) => <button key={family} type="button" className="fps-weapon-slot" aria-pressed={family === active} disabled={!canSwitch}
      // A finger lifted without swiping draws this weapon. Lift, not click: a phone sends no click for a
      // second finger, and the left thumb is usually on the stick. The click is for the keyboard.
      onPointerUp={event => { const drag = swipe.current; if (drag?.id !== event.pointerId) return; swipe.current = null; if (!drag.swiped && family !== hud.weapon) onSwitch(family); }}
      onClick={event => { if (event.detail === 0 && family !== hud.weapon) onSwitch(family); }}>
      <kbd>{slot + 1}</kbd><span>{names[family]}</span>
    </button>)}
  </div>;
}
