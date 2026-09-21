import { useRef } from 'react';
import { NEUTRAL_STICK, STICK_RADIUS, STICK_SPRINT, stickOffset, stickVector, type StickVector } from '../game/touch-controls';

/**
 * One floating thumb stick. The base is planted wherever the thumb lands inside
 * the zone, so the stick finds the player rather than the other way round, and
 * the pointer is captured so a thumb that slides out of the zone mid-turn keeps
 * steering instead of dropping the input.
 *
 * The thumb is moved by writing transforms straight onto the node. React state
 * here would re-render the whole control layer on every touchmove — sixty times
 * a second, over a scene that is already asking for every frame it can get.
 */
export default function TouchStick({ kind, label, disabled = false, onChange }: {
  kind: 'move' | 'look';
  label: string;
  disabled?: boolean;
  onChange: (stick: StickVector) => void;
}) {
  const zone = useRef<HTMLDivElement>(null), base = useRef<HTMLDivElement>(null), thumb = useRef<HTMLDivElement>(null);
  const pointer = useRef<{ id: number; x: number; y: number } | null>(null);

  const draw = (stick: StickVector) => {
    const offset = stickOffset(stick);
    if (thumb.current) thumb.current.style.transform = `translate3d(${offset.x}px, ${offset.y}px, 0)`;
    zone.current?.setAttribute('data-sprint', String(kind === 'move' && stick.magnitude >= STICK_SPRINT));
  };
  const release = (event: React.PointerEvent<HTMLDivElement>) => {
    if (pointer.current?.id !== event.pointerId) return;
    pointer.current = null;
    zone.current?.setAttribute('data-active', 'false');
    draw(NEUTRAL_STICK); onChange(NEUTRAL_STICK);
  };
  return <div
    ref={zone}
    className="touch-stick"
    data-touch-stick={kind}
    data-active="false"
    data-sprint="false"
    data-disabled={disabled || undefined}
    // The buttons below the scene carry the same commands for assistive tech;
    // a bare drag surface has nothing useful to announce.
    aria-hidden="true"
    onPointerDown={event => {
      if (disabled || pointer.current) return;
      event.preventDefault();
      const rect = event.currentTarget.getBoundingClientRect();
      // Keep the planted base far enough inside the zone for the ring to be drawn whole.
      const inset = (value: number, size: number) => size <= (STICK_RADIUS + 8) * 2 ? size / 2 : Math.max(STICK_RADIUS + 8, Math.min(size - STICK_RADIUS - 8, value));
      const x = inset(event.clientX - rect.left, rect.width), y = inset(event.clientY - rect.top, rect.height);
      event.currentTarget.setPointerCapture(event.pointerId);
      pointer.current = { id: event.pointerId, x: rect.left + x, y: rect.top + y };
      if (base.current) { base.current.style.left = `${x}px`; base.current.style.top = `${y}px`; }
      event.currentTarget.setAttribute('data-active', 'true');
      // A touch that landed outside the clamped base already counts as deflection.
      const stick = stickVector(pointer.current.x, pointer.current.y, event.clientX, event.clientY);
      draw(stick); onChange(stick);
    }}
    onPointerMove={event => {
      if (pointer.current?.id !== event.pointerId) return;
      const stick = stickVector(pointer.current.x, pointer.current.y, event.clientX, event.clientY);
      draw(stick); onChange(stick);
    }}
    onPointerUp={release}
    onPointerCancel={release}
    onLostPointerCapture={release}
  >
    <div className="touch-stick-base" ref={base}><i /><div className="touch-stick-thumb" ref={thumb} /></div>
    <span className="touch-stick-label">{label}</span>
  </div>;
}
