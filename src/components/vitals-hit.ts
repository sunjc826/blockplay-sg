import { useEffect, useRef, type RefObject } from 'react';
import { hitTracker, nextHitPulse, type HitPulse, type HitWeight } from '../game/hud-motion';

/** The parts a gauge offers to the hit animation; any may be missing, such as an armor track with no armor. */
export type HitParts = {
  /** Shaken on a real hit. */
  frame?: HitElement;
  /** A layer that is invisible at rest and flashes up on every hit, light ones included. */
  flash?: HitElement;
  /** Swell vertically and blink to `blink` before easing back to their own colour. */
  bars?: HitElement[];
  digits?: HitElement;
};
type HitElement = RefObject<HTMLElement | null>;
type Gauge = { parts: HitParts; blink: string; glow: string };

const STRENGTH: Record<HitWeight, number> = { light: 0, hard: 1, heavy: 1.8 };
const FLASH: Record<HitWeight, { peak: number; ms: number }> = { light: { peak: .45, ms: 260 }, hard: { peak: .85, ms: 400 }, heavy: { peak: 1, ms: 560 } };

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

function play(ref: HitElement | undefined, keyframes: Keyframe[], options: KeyframeAnimationOptions) {
  const el = ref?.current;
  // jsdom and very old engines have no Web Animations; the bars still trail on their CSS transitions there.
  if (el && typeof el.animate === 'function') el.animate(keyframes, options);
}

/**
 * Plays one hit on a gauge. These are Web Animations rather than CSS classes
 * so that each hit restarts from the top, however soon it follows the last,
 * and so they layer over the critical band's own pulse instead of replacing
 * it. Reduced motion keeps the flash and colour, which do not move anything.
 */
export function playHit({ parts, blink, glow }: Gauge, { weight }: HitPulse, shake: 'x' | 'y') {
  const strength = STRENGTH[weight], flash = FLASH[weight], still = reducedMotion();
  play(parts.flash, [{ opacity: flash.peak }, { opacity: 0 }], { duration: flash.ms, easing: 'ease-out' });
  // Partial keyframes ease back to whatever the stylesheet says now, so a band change mid-hit is honoured.
  play(parts.digits, [{ color: blink, textShadow: `0 0 ${6 + 4 * strength}px ${glow}`, offset: 0 }], { duration: flash.ms, easing: 'ease-out' });
  for (const bar of parts.bars ?? []) play(bar, [{ backgroundColor: blink, offset: 0 }], { duration: flash.ms * .8, easing: 'ease-out' });
  if (still) return;
  for (const bar of parts.bars ?? []) play(bar, [{ scale: `1 ${1.5 + 1.1 * strength}` }, { scale: '1 1' }], { duration: 220 + 80 * strength, easing: 'cubic-bezier(.2,.8,.3,1)' });
  if (!strength) return;
  play(parts.digits, [{ scale: `${1 + .16 * strength}` }, { scale: '1' }], { duration: 300, easing: 'cubic-bezier(.2,.8,.3,1)' });
  const step = (a: number) => shake === 'x' ? `${a * strength}px 0` : `${a * .4 * strength}px ${a * strength}px`;
  play(parts.frame, [0, -3, 2.4, -1.4, .6, 0].map(a => ({ translate: step(a) })), { duration: 280 + 40 * strength, easing: 'ease-out' });
}

/**
 * Watches health and armor and plays a hit on whichever gauge lost something.
 * Runs as an effect, so a dropped frame or a re-render never plays one twice,
 * and the first values it sees are a baseline rather than a hit.
 */
export function useVitalsHit(health: number, armor: number, maxHealth: number, gauges: { health: Gauge; armor: Gauge }, shake: 'x' | 'y') {
  const tracker = useRef(hitTracker(health, armor));
  const latest = useRef(gauges);
  latest.current = gauges;
  useEffect(() => {
    const next = nextHitPulse(tracker.current, health, armor, maxHealth, performance.now());
    tracker.current = next.tracker;
    if (!next.pulse) return;
    // Armor soaking the whole hit shakes the armor gauge alone; anything through it shakes health.
    if (next.pulse.health) playHit(latest.current.health, next.pulse, shake);
    if (next.pulse.armor) playHit(latest.current.armor, next.pulse.health ? { ...next.pulse, weight: 'light' } : next.pulse, shake);
  }, [health, armor, maxHealth, shake]);
}
