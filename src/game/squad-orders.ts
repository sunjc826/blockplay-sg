import type { BotRankId } from './arena-ranks';

/**
 * Orders a player gives the friendly soldiers around them from the callout
 * wheel's Orders page. Unlike every other callout these change what the bots
 * do: the host (arena-rules) gives each ally in range a standing order, which
 * steers its feet until it is done or runs out, while its eyes and trigger keep
 * working, so an ally on its way to you still shoots back.
 *
 * - **gather**: allies make for a ring round the caller and keep to it.
 * - **move**: allies make for a ring round the point the caller aimed at and hold it.
 * - **hold**: allies stop where they stand and stay there.
 * - **focus**: allies go after the enemy nearest the point the caller aimed at.
 * - **scatter**: allies run outward from the caller, then go back to what they were doing.
 * - **reinforce**: HQ sends a transport with a fresh fireteam, who gather on the caller.
 */
export const ORDER_KINDS = ['gather', 'move', 'hold', 'focus', 'scatter', 'reinforce'] as const;
export type OrderKind = typeof ORDER_KINDS[number];
/** An order that steers feet; `focus` and `reinforce` work otherwise. */
export type MovementOrderKind = Extract<OrderKind, 'gather' | 'move' | 'hold' | 'scatter'>;

export const ORDER_TUNING = {
  /** Allies within this many metres of the caller take an order. */
  range: 60,
  /** At most this many take one, nearest first. */
  most: 8,
  gather: { seconds: 40, ring: 3.5, slack: 2.5 },
  move: { seconds: 45, ring: 3, slack: 2 },
  hold: { seconds: 45, slack: 1.2 },
  scatter: { seconds: 7, distance: 16, slack: 2, pace: 1.3 },
  /** A focus target must be this near the point aimed at. */
  focus: { seconds: 30, reach: 25 },
  /** Seconds between one player's transports, and soldiers in each. */
  reinforce: { cooldown: 150, squad: 4, drop: 90, follow: 40 },
};

export interface Plane { x: number; z: number }
export interface StandingOrder {
  kind: MovementOrderKind;
  /** The player who gave it; gather follows them. */
  by: string;
  until: number;
  /** Where to be; for gather, the offset from the caller instead. */
  goal: Plane;
  slack: number;
}

/** Slot `slot` of `count` on a ring round `center`, so a squad spreads out rather than stacking on one spot. */
export function ringPoint(center: Plane, slot: number, count: number, radius: number): Plane {
  const angle = slot / Math.max(1, count) * Math.PI * 2;
  return { x: center.x + Math.sin(angle) * radius, z: center.z + Math.cos(angle) * radius };
}
/** A point `distance` out from `from`, directly away from `caller` (turned by `turn` radians so a squad fans out). */
export function scatterPoint(from: Plane, caller: Plane, distance: number, turn = 0): Plane {
  let dx = from.x - caller.x, dz = from.z - caller.z;
  const length = Math.hypot(dx, dz);
  if (length < .01) { dx = Math.sin(turn); dz = Math.cos(turn); } else { dx /= length; dz /= length; }
  const cos = Math.cos(turn), sin = Math.sin(turn);
  return { x: from.x + (dx * cos - dz * sin) * distance, z: from.z + (dx * sin + dz * cos) * distance };
}
/**
 * Gives one ally of `count` its standing order. `caller` is where the player
 * stands, `at` where they aimed and `from` where the ally stands now.
 */
export function standingOrder(kind: MovementOrderKind, by: string, now: number, slot: number, count: number, caller: Plane, from: Plane, at?: Plane): StandingOrder {
  if (kind === 'gather') return { kind, by, until: now + ORDER_TUNING.gather.seconds, goal: ringPoint({ x: 0, z: 0 }, slot, count, ORDER_TUNING.gather.ring), slack: ORDER_TUNING.gather.slack };
  if (kind === 'move') return { kind, by, until: now + ORDER_TUNING.move.seconds, goal: ringPoint(at ?? caller, slot, count, ORDER_TUNING.move.ring), slack: ORDER_TUNING.move.slack };
  if (kind === 'hold') return { kind, by, until: now + ORDER_TUNING.hold.seconds, goal: { x: from.x, z: from.z }, slack: ORDER_TUNING.hold.slack };
  // Fanned out by slot, so two allies side by side do not run the same way.
  const turn = (slot - (count - 1) / 2) * .5;
  return { kind, by, until: now + ORDER_TUNING.scatter.seconds, goal: scatterPoint(from, caller, ORDER_TUNING.scatter.distance, turn), slack: ORDER_TUNING.scatter.slack };
}
/** Where an ordered ally should be: a gather's goal travels with the caller. */
export const orderGoal = (order: StandingOrder, caller?: Plane): Plane =>
  order.kind === 'gather' ? { x: (caller?.x ?? 0) + order.goal.x, z: (caller?.z ?? 0) + order.goal.z } : order.goal;
/** The step toward `goal` this tick, or null once within the order's slack. */
export function orderStep(from: Plane, goal: Plane, slack: number, speed: number, dt: number) {
  const dx = goal.x - from.x, dz = goal.z - from.z, d = Math.hypot(dx, dz);
  if (d <= slack) return null;
  const stride = Math.min(d, speed * dt);
  return { dx: dx / d * stride, dz: dz / d * stride };
}

/** What an ally says on taking an order, by its rank. */
export const ORDER_ACKS: Readonly<Record<OrderKind, Readonly<Record<BotRankId, readonly string[]>>>> = {
  gather: {
    recruit: ['Coming! Wait for me!', 'On you, on you!'],
    regular: ['Moving to you.', 'Copy, forming up on you.'],
    veteran: ['Section, on him! Move!', 'Forming up. Eyes out.'],
  },
  move: {
    recruit: ['Going there now!', 'Okay, okay, moving!'],
    regular: ['Moving to that position.', 'Copy, taking that spot.'],
    veteran: ['Bounding up. Cover each other!', 'Moving. Watch the flanks.'],
  },
  hold: {
    recruit: ['Holding! I think…', 'Okay, I stay here.'],
    regular: ['Holding position.', 'Copy, holding.'],
    veteran: ['Holding. Nobody anyhow move.', 'Line holds here.'],
  },
  focus: {
    recruit: ['That one? Okay, shooting!', 'Targeting him!'],
    regular: ['Engaging your target.', 'Copy, focusing fire.'],
    veteran: ['All guns on that one!', 'Section, rapid fire on that target!'],
  },
  scatter: {
    recruit: ['Run! Spread out!', 'Scatter, scatter!'],
    regular: ['Spreading out!', 'Breaking up, go!'],
    veteran: ['Spread out, don’t bunch!', 'Split up! Find cover!'],
  },
  reinforce: {
    recruit: ['Reporting for duty! Where are they?'],
    regular: ['Fireteam on the ground. On you.'],
    veteran: ['Reinforcements in. Point me at them.'],
  },
};
