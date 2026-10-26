import { combatRandom } from './combat-events';
import type { CombatRisk } from './combat-director';
import type { RegionBounds } from './region-collision';

/**
 * Scenery, not combat: a battle on the skyline, jets crossing high, rocket
 * salvos passing overhead and anti-aircraft fire into the night. Nothing here
 * can hurt anyone, mark the map or raise a banner, so none of it needs
 * balancing. Each client runs its own director, seeded and pure; nothing is
 * sent between peers. Everything that lands, lands outside the district.
 */

export type AmbientKind = 'skyline' | 'flyby' | 'rockets' | 'flak';
export const AMBIENT_KINDS: readonly AmbientKind[] = ['skyline', 'flyby', 'rockets', 'flak'];
export interface AmbientPoint { x: number; y: number; z: number }
export interface AmbientEvent {
  id: number; kind: AmbientKind; start: number; duration: number; seed: number;
  /** The fight, the flak site or the rocket launcher; for a flyby, the point of closest approach. */
  at: AmbientPoint;
  /** Direction of travel or of the fight's axis, as a yaw: forward is (-sin, -cos). */
  heading: number;
}
/** Seconds between two of a kind, by district risk. A busier district has a busier sky. */
export const AMBIENT_PACE: Readonly<Record<CombatRisk, Readonly<Record<AmbientKind, readonly [number, number]>>>> = {
  low: { skyline: [70, 140], flyby: [60, 120], rockets: [150, 260], flak: [80, 150] },
  medium: { skyline: [40, 90], flyby: [45, 90], rockets: [90, 170], flak: [50, 100] },
  high: { skyline: [25, 60], flyby: [30, 70], rockets: [60, 120], flak: [35, 70] },
};
/** How many of a kind may run at once. */
const AMBIENT_LIMIT: Readonly<Record<AmbientKind, number>> = { skyline: 2, flyby: 1, rockets: 1, flak: 1 };
/** A kind that is due but cannot run (flak by day, jets during a real air raid) looks again after this long. */
const RETRY = 10;
/** Where things happen, from whoever is watching: far enough to read as elsewhere, near enough to draw (the camera sees 800 m). */
export const AMBIENT_RANGE: Readonly<Record<'skyline' | 'flak', readonly [number, number]>> = { skyline: [280, 520], flak: [220, 460] };
/** Distance kept between the district's edge and anything that lands or fires from the ground. */
export const AMBIENT_MARGIN = 50;
export const FLYBY = { speed: 170, reach: 900, height: [110, 170] as const, pass: [60, 260] as const, wing: { back: 35, side: 28, up: 5 } } as const;
export const ROCKETS = { speed: 230, span: 1600, apex: [200, 280] as const, pass: [140, 320] as const, back: [380, 650] as const, count: [6, 12] as const, ripple: .35, burn: .75 } as const;
export const SPEED_OF_SOUND = 343;

const between = (random: () => number, [low, high]: readonly [number, number]) => low + random() * (high - low);
const forward = (heading: number) => ({ x: -Math.sin(heading), z: -Math.cos(heading) });

/** How far one can go from `from` along `bearing` before leaving the bounds; 0 from outside them. */
export function exitDistance(from: { x: number; z: number }, bearing: number, bounds: RegionBounds) {
  if (from.x < bounds.minX || from.x > bounds.maxX || from.z < bounds.minZ || from.z > bounds.maxZ) return 0;
  const { x: dx, z: dz } = forward(bearing);
  const tx = dx > 1e-9 ? (bounds.maxX - from.x) / dx : dx < -1e-9 ? (bounds.minX - from.x) / dx : Infinity;
  const tz = dz > 1e-9 ? (bounds.maxZ - from.z) / dz : dz < -1e-9 ? (bounds.minZ - from.z) / dz : Infinity;
  return Math.min(tx, tz);
}
export const outside = (p: { x: number; z: number }, bounds: RegionBounds, margin = 0) =>
  p.x < bounds.minX - margin || p.x > bounds.maxX + margin || p.z < bounds.minZ - margin || p.z > bounds.maxZ + margin;
/**
 * The first distance, from `start` on, along `bearing` at which a point is
 * clear of the district by the margin. A shallow way out crosses the edge
 * slowly, so it steps out rather than adding the margin to the exit.
 */
export function clearDistance(from: { x: number; z: number }, bearing: number, bounds: RegionBounds, start: number) {
  const { x, z } = forward(bearing);
  let distance = Math.max(start, exitDistance(from, bearing, bounds));
  for (let step = 0; step < 200 && !outside({ x: from.x + x * distance, z: from.z + z * distance }, bounds, AMBIENT_MARGIN); step++) distance += 10;
  return distance;
}

/**
 * A point on the ground `range` metres from the listener and clear of the
 * district by the margin. Tries a few bearings; when the district is too big
 * for the range, the nearest clear point along the last one.
 */
export function farPoint(random: () => number, listener: { x: number; z: number }, bounds: RegionBounds, range: readonly [number, number], prefer?: number) {
  let bearing = 0, distance = 0;
  for (let attempt = 0; attempt < 8; attempt++) {
    // A preferred bearing is tried first, give or take; then anywhere.
    bearing = attempt === 0 && prefer !== undefined ? prefer + (random() - .5) * .5 : random() * Math.PI * 2;
    distance = clearDistance(listener, bearing, bounds, between(random, range));
    if (distance <= range[1]) break;
  }
  const { x, z } = forward(bearing);
  return { x: listener.x + x * distance, z: listener.z + z * distance };
}

export interface AmbientView {
  now: number;
  listener: AmbientPoint;
  bounds: RegionBounds;
  /** 0 by day, 1 at night: flak only comes out after dark. */
  night: number;
  /** A real air raid is on: jets and rockets would read as part of it, so they wait. */
  quiet?: boolean;
}

export function createAmbientDirector(options: { seed: number; risk: CombatRisk }) {
  const random = combatRandom(options.seed), pace = AMBIENT_PACE[options.risk];
  const due = new Map<AmbientKind, number>();
  let active: AmbientEvent[] = [], serial = 0, origin: number | null = null;

  /**
   * Where and which way a new one goes. With `facing` (a yaw) it is called in
   * ahead of someone: the fight or the flak out in front of them, the jets and
   * rockets crossing their view a few hundred metres off.
   */
  function place(kind: AmbientKind, view: AmbientView, facing?: number): AmbientEvent {
    const seed = Math.floor(random() * 2 ** 32), side = random() < .5 ? -1 : 1, { listener, bounds } = view;
    const crossing = facing !== undefined && (kind === 'flyby' || kind === 'rockets');
    const heading = crossing ? facing + side * Math.PI / 2 : random() * Math.PI * 2;
    const base = { id: ++serial, kind, start: view.now, seed, heading };
    if (kind === 'skyline' || kind === 'flak') {
      const spot = farPoint(random, listener, bounds, AMBIENT_RANGE[kind], facing);
      return { ...base, at: { ...spot, y: 0 }, duration: kind === 'skyline' ? between(random, [30, 45]) : between(random, [20, 35]) };
    }
    // Turned a quarter from the facing, the line across the track points back at the viewer, so ahead is the other side.
    const along = forward(heading), across = { x: along.z, z: -along.x }, ahead = (range: readonly [number, number]) => crossing ? -side * between(random, range) : side * between(random, range);
    if (kind === 'flyby') {
      // Called in ahead, the pass crosses 20–30° up: over a downtown roofline, under the top of the view.
      const pass = ahead(crossing ? [250, 290] : FLYBY.pass);
      return { ...base, at: { x: listener.x + across.x * pass, y: listener.y + between(random, crossing ? [105, 125] : FLYBY.height), z: listener.z + across.z * pass }, duration: FLYBY.reach * 2 / FLYBY.speed + 2 };
    }
    // Rockets: launched from beyond the edge, behind the listener's line, and gone over the far horizon.
    const pass = ahead(crossing ? [250, 400] : ROCKETS.pass), line = { x: listener.x + across.x * pass, z: listener.z + across.z * pass };
    // Past the usual reach when the district is that big: the launcher stays off the map either way.
    const back = clearDistance(line, heading + Math.PI, bounds, between(random, ROCKETS.back));
    return { ...base, at: { x: line.x - along.x * back, y: 0, z: line.z - along.z * back }, duration: ROCKETS.count[1] * ROCKETS.ripple + ROCKETS.span / ROCKETS.speed + 2 };
  }

  return {
    /** Starts whatever is due and drops what has finished. Returns what began this step. */
    step(view: AmbientView): AmbientEvent[] {
      if (origin === null) {
        origin = view.now;
        // The first of each kind comes within its first gap, so a short visit still sees something.
        for (const kind of AMBIENT_KINDS) due.set(kind, view.now + between(random, [8, pace[kind][0]]));
      }
      active = active.filter(e => view.now < e.start + e.duration);
      const started: AmbientEvent[] = [];
      for (const kind of AMBIENT_KINDS) {
        if (view.now < due.get(kind)!) continue;
        const blocked = (kind === 'flak' && view.night < .5) || ((kind === 'flyby' || kind === 'rockets') && view.quiet)
          || active.filter(e => e.kind === kind).length >= AMBIENT_LIMIT[kind];
        if (blocked) { due.set(kind, view.now + RETRY); continue; }
        const event = place(kind, view); active.push(event); started.push(event);
        due.set(kind, view.now + between(random, pace[kind]));
      }
      return started;
    },
    /** Calls one in now, whatever the hour, ahead of `facing` when given: the debug panel's way to see it. */
    force(kind: AmbientKind, view: AmbientView, facing?: number) { const event = place(kind, view, facing); active.push(event); return event; },
    get active(): readonly AmbientEvent[] { return active; },
    reset() { active = []; due.clear(); origin = null; },
  };
}

// --- Timelines: pure from the event, so a frame can ask "what is happening at age t" ---

export interface SkylineFlash { time: number; x: number; y: number; z: number; size: number }
/** `arc`: how high the stream bows above its straight line; a lofted one clears the rooftops between. */
export interface SkylineBurst { time: number; from: AmbientPoint; to: AmbientPoint; rounds: number; colour: 'red' | 'green'; arc: number }
/** A signal or illumination flare: fired up to `peak`, then drifting down still burning. */
export interface SkylineFlare { time: number; x: number; z: number; peak: number; colour: 'white' | 'red' | 'green' }
export interface SkylineTimeline { flashes: SkylineFlash[]; bursts: SkylineBurst[]; flares: SkylineFlare[] }
export const FLARE = { rise: 1.6, fall: 4, life: 14 } as const;
/** Flash sizes, in metres: small arms and grenades, a heavier gun or rocket, and the odd big one that leaves a column of smoke. */
export const SKYLINE_SIZE = { small: [5, 9] as const, large: [16, 26] as const, huge: 44 } as const;

/**
 * A fight somewhere else: two lines a hundred metres apart trade tracer
 * across the fight's axis, with flashes scattered along it. Activity swells in
 * the middle and tails off. A downtown skyline hides the street, so some of it
 * is meant to show over the roofs: lofted streams, flares and the smoke.
 */
export function skylineTimeline(event: AmbientEvent): SkylineTimeline {
  const random = combatRandom(event.seed), along = forward(event.heading), across = { x: along.z, z: -along.x };
  const at = (forwardBy: number, sideBy: number, y: number): AmbientPoint => ({ x: event.at.x + along.x * forwardBy + across.x * sideBy, y, z: event.at.z + along.z * forwardBy + across.z * sideBy });
  const flashes: SkylineFlash[] = [], bursts: SkylineBurst[] = [], flares: SkylineFlare[] = [];
  const busy = (t: number) => .35 + .65 * Math.sin(Math.PI * Math.min(1, t / event.duration));
  for (let t = 1 + random(); t < event.duration - 1; t += (.4 + random() * 1.6) / busy(t)) {
    const roll = random(), size = roll > .88 ? SKYLINE_SIZE.huge : roll > .65 ? between(random, SKYLINE_SIZE.large) : between(random, SKYLINE_SIZE.small);
    flashes.push({ time: t, ...at((random() - .5) * 120, (random() - .5) * 50, 3 + random() * (size > 30 ? 6 : 24)), size });
  }
  for (let t = 1.5 + random(); t < event.duration - 1; t += (1 + random() * 2.2) / busy(t)) {
    const west = random() < .5, lane = (random() - .5) * 90, lofted = random() < .35;
    const from = at(lane, west ? -45 : 45, 6 + random() * 14), to = at(lane + (random() - .5) * 30, west ? 45 : -45, 4 + random() * 14);
    bursts.push({ time: t, from, to, rounds: 4 + Math.floor(random() * 5), colour: west ? 'red' : 'green', arc: lofted ? between(random, [40, 110]) : 2 + random() * 4 });
  }
  const colours = ['white', 'red', 'green'] as const;
  for (let t = 2 + random() * 6; t < event.duration - 4; t += between(random, [7, 14])) {
    const spot = at((random() - .5) * 100, (random() - .5) * 60, 0);
    flares.push({ time: t, x: spot.x, z: spot.z, peak: between(random, [120, 190]), colour: colours[Math.floor(random() * 3)] });
  }
  return { flashes, bursts, flares };
}
/** A flare `since` seconds after it was fired: its height, and how bright it burns (0 once out). */
export function flarePose(flare: SkylineFlare, since: number) {
  if (since < 0 || since > FLARE.life) return { y: 0, bright: 0 };
  const climb = Math.min(1, since / FLARE.rise), y = 5 + (flare.peak - 5) * (1 - (1 - climb) * (1 - climb)) - Math.max(0, since - FLARE.rise) * FLARE.fall;
  return { y, bright: Math.min(1, since * 3) * Math.min(1, (FLARE.life - since) / 2) };
}

export interface FlybyPose { x: number; y: number; z: number; yaw: number; visible: boolean }
/** Where jet `wing` (0 the lead, 1 the wingman) is `age` seconds into the pass. */
export function flybyPose(event: AmbientEvent, age: number, wing = 0): FlybyPose {
  const along = forward(event.heading), across = { x: along.z, z: -along.x }, { back, side, up } = FLYBY.wing;
  const travelled = age * FLYBY.speed - FLYBY.reach - wing * back, offset = wing * side;
  return {
    x: event.at.x + along.x * travelled + across.x * offset, y: event.at.y + wing * up, z: event.at.z + along.z * travelled + across.z * offset,
    yaw: event.heading, visible: age >= 0 && Math.abs(travelled) <= FLYBY.reach,
  };
}
/**
 * The pass as heard: sound left the jet a moment ago, so it comes from behind
 * where the jet is now. Solved for the moment of emission, a few iterations
 * being plenty at these speeds. Returns the distance to that point, Infinity
 * when no sound from the pass has arrived.
 */
export function flybyHeard(event: AmbientEvent, age: number, listener: AmbientPoint) {
  let emitted = age, distance = Infinity;
  for (let i = 0; i < 4; i++) {
    const pose = flybyPose(event, emitted);
    distance = Math.hypot(pose.x - listener.x, pose.y - listener.y, pose.z - listener.z);
    emitted = age - distance / SPEED_OF_SOUND;
  }
  return flybyPose(event, emitted).visible ? distance : Infinity;
}

export interface Rocket { launch: number; side: number; apex: number }
export function rocketTimeline(event: AmbientEvent): Rocket[] {
  const random = combatRandom(event.seed), count = Math.round(between(random, ROCKETS.count)), apex = between(random, ROCKETS.apex);
  return Array.from({ length: count }, (_, i) => ({ launch: .8 + i * ROCKETS.ripple + random() * .12, side: (random() - .5) * 20, apex: apex * (.92 + random() * .16) }));
}
/** A rocket `age` seconds into the event: a parabola from the launcher to over the far horizon, and the way it points. */
export function rocketPose(event: AmbientEvent, rocket: Rocket, age: number) {
  const along = forward(event.heading), across = { x: along.z, z: -along.x };
  const flown = (age - rocket.launch) * ROCKETS.speed, u = flown / ROCKETS.span;
  const x = event.at.x + along.x * flown + across.x * rocket.side, z = event.at.z + along.z * flown + across.z * rocket.side;
  const y = event.at.y + 4 * rocket.apex * u * (1 - u), climb = 4 * rocket.apex * (1 - 2 * u) / ROCKETS.span;
  const length = Math.hypot(1, climb);
  return { x, y, z, direction: { x: along.x / length, y: climb / length, z: along.z / length }, flying: u >= 0 && u <= 1, burning: u >= 0 && u <= ROCKETS.burn };
}

/** `lead` is the burst's length on its first round, 0 on the rest: one sound per burst. */
export interface FlakRound { time: number; from: AmbientPoint; direction: AmbientPoint; flight: number; burst: boolean; lead: number }
export const FLAK = { speed: 180, flight: [1.8, 2.6] as const, guns: [2, 3] as const, gap: [1.2, 2.5] as const, rounds: [6, 10] as const, interval: .07, burst: .3 } as const;
/**
 * Two or three guns hosing tracer into the dark, each sweeping its own arc of
 * sky. Some rounds end in an airburst. `aim` is where the searchlights look.
 */
export function flakTimeline(event: AmbientEvent): { rounds: FlakRound[]; aim: AmbientPoint } {
  const random = combatRandom(event.seed), guns = Math.round(between(random, FLAK.guns)), rounds: FlakRound[] = [];
  const along = forward(event.heading), across = { x: along.z, z: -along.x };
  for (let gun = 0; gun < guns; gun++) {
    const offset = (gun - (guns - 1) / 2) * 40, from = { x: event.at.x + across.x * offset, y: event.at.y + 2, z: event.at.z + across.z * offset };
    const sweep = random() * Math.PI * 2, rate = .15 + random() * .2;
    for (let t = .5 + random() * 2; t < event.duration - 3; t += between(random, FLAK.gap)) {
      const count = Math.round(between(random, FLAK.rounds));
      const yaw = event.heading + Math.sin(sweep + t * rate) * .9, pitch = 1 + Math.sin(sweep * 1.7 + t * rate * .6) * .25;
      for (let n = 0; n < count; n++) {
        const wobble = (random() - .5) * .04;
        const horizontal = Math.cos(pitch + wobble), dx = -Math.sin(yaw + wobble) * horizontal, dz = -Math.cos(yaw + wobble) * horizontal;
        rounds.push({ time: t + n * FLAK.interval, from, direction: { x: dx, y: Math.sin(pitch + wobble), z: dz }, flight: between(random, FLAK.flight), burst: random() < FLAK.burst, lead: n ? 0 : count });
      }
    }
  }
  rounds.sort((a, b) => a.time - b.time);
  return { rounds, aim: { x: event.at.x + along.x * 60, y: 320, z: event.at.z + along.z * 60 } };
}
/** A flak round's position `since` seconds after it was fired; tracer climbs and droops a little as it slows. */
export function flakPose(round: FlakRound, since: number): AmbientPoint {
  const s = FLAK.speed * since;
  return { x: round.from.x + round.direction.x * s, y: round.from.y + round.direction.y * s - 4.9 * since * since, z: round.from.z + round.direction.z * s };
}

/** Searchlight sites round the district, out past its edge, and the way each sweeps. Fixed per seed. */
export function searchlightSites(bounds: RegionBounds, seed: number, count = 4) {
  const random = combatRandom(seed), cx = (bounds.minX + bounds.maxX) / 2, cz = (bounds.minZ + bounds.maxZ) / 2;
  const hx = (bounds.maxX - bounds.minX) / 2 + 90, hz = (bounds.maxZ - bounds.minZ) / 2 + 90;
  return Array.from({ length: count }, (_, i) => {
    const angle = (i + random() * .6) / count * Math.PI * 2;
    // Onto the rectangle grown by 90 m, so every site is outside the district however long it is.
    const scale = 1 / Math.max(Math.abs(Math.cos(angle)) / hx, Math.abs(Math.sin(angle)) / hz);
    return { x: cx + Math.cos(angle) * scale, z: cz + Math.sin(angle) * scale, phase: random() * Math.PI * 2, rate: .05 + random() * .05, pitch: 1.05 + random() * .3 };
  });
}
