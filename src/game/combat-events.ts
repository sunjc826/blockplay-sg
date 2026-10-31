/**
 * Combat events: telegraphed hazards that happen to a match rather than being
 * fought by it: barrages, raids, snipers, gas, a supply drop. See
 * docs/COMBAT-EVENTS.md.
 *
 * A running event is a small descriptor. Its plugin turns that descriptor into
 * a timeline of payloads with a pure function, so whoever renders an event
 * computes exactly the shells the host resolves, from a handful of numbers.
 */
import { SENTOSA_LANDING_SITES } from './naval-landing-sites';
import { getArenaFaction } from './arena-factions';

export interface CombatPlane { x: number; z: number }
export interface CombatVector { x: number; y: number; z: number }
export interface CombatEventDescriptor {
  /** Unique within a match. */
  id: string;
  /** Registry id, e.g. 'artillery'. */
  kind: string;
  /** Drives every random choice in the timeline. */
  seed: number;
  /** Simulation time at which the warning began. */
  start: number;
  target: CombatPlane;
  /** Bearing the munitions travel along, radians, as actor yaw is measured. */
  heading: number;
  /** 0.5 to 2: how much the event throws. */
  intensity: number;
  /** Transports: metres of approach before the drop, along `heading`. */
  reach?: number;
  /** Authored sea route; clients never invent water access from a target. */
  landing?: string;
  /** Transports: how many troops it carries. */
  troops?: number;
  /** Where the event's own people or machine are: a mortar pit, a sniper's perch, a drone's launch point. */
  origin?: CombatPlane;
  /** Metres above sea level: a raid helicopter's orbit, a drone's cruise, a perch's roof. */
  altitude?: number;
  /** Simulation time its live part stopped early: crew killed, raider downed, crate taken. */
  ended?: number;
  outcome?: CombatOutcome;
  /** Supply drops: the actor who opened the crate. */
  claimedBy?: string;
  /** Transports: whose troops; absent means the contractors'. */
  faction?: string;
}
export type CombatOutcome = 'downed' | 'silenced' | 'claimed' | 'secured' | 'detonated' | 'withdrawn';
const OUTCOMES: readonly CombatOutcome[] = ['downed', 'silenced', 'claimed', 'secured', 'detonated', 'withdrawn'];
export interface BlastSpec {
  radius: number; damage: number;
  /** Share of `damage` left at the edge of `radius`. */
  minScale: number;
  /** Multiplier on `damage` against vehicle hulls. */
  vehicleScale: number;
  /** Crouching and lying prone shrink what a body takes. */
  stance: boolean;
  /** Falls from high above, so a roof over a body shelters it even from a burst beside it. */
  overhead?: boolean;
}
export type MunitionKind = 'shell' | 'mortar' | 'bomb' | 'canister';
/** Something fired at the ground: a shell, a mortar bomb, an aircraft's bomb or a gas canister. */
export interface MunitionPayload {
  type: 'munition'; id: number;
  /** Player who called this fire mission; absent for world events. */
  caller?: string;
  /** How it is drawn and heard; a shell when absent. */
  kind?: MunitionKind;
  /** Where it was fired from, when that is on the map: a mortar's tube thumps there. */
  launch?: CombatPlane;
  impact: CombatPlane;
  /** Seconds after `start` that it lands. */
  time: number;
  /** Seconds of visible flight before it lands. */
  flight: number;
  /** Unit direction of travel at impact. */
  descent: CombatVector;
  /** Null for a spotting round, which only marks. */
  blast: BlastSpec | null;
  /** Coloured smoke left where it lands, for spotting rounds. */
  smoke?: string;
}
/** A danger area shown on the ground and the HUD; never hurts anyone. */
export interface MarkerPayload { type: 'marker'; id: number; center: CombatPlane; radius: number; from: number; until: number; colour: string }
/**
 * A vehicle that brings troops in: drives or flies from `entry` to `drop`,
 * waits while they get out, and leaves for `exit`. Times are after `start`.
 */
export interface TransportPayload {
  type: 'transport'; id: number; mode: 'land' | 'air' | 'sea';
  entry: CombatPlane; drop: CombatPlane; exit: CombatPlane;
  /** Appears at `entry`, reaches `drop`, sets off again, and is gone. */
  enter: number; arrive: number; depart: number; leave: number;
  /** Air: cruising height and the hover height troops rope down from. */
  cruise: number; hover: number;
}
/** One troop reaching the ground at `at`; the host brings a waiting bot back here. */
export interface InsertPayload { type: 'insert'; id: number; slot: number; at: CombatPlane; time: number }
/** An aircraft crossing the map in a straight line, `height` metres above the ground. Drawn and heard only. */
export interface FlyerPayload { type: 'flyer'; id: number; model: 'jet' | 'cargo'; from: CombatPlane; to: CombatPlane; height: number; enter: number; leave: number }
/**
 * A raid helicopter's path: in from `entry`, round `center` at `radius` from
 * `arrive` to `leave`, then out to `exit`. Its height is the descriptor's
 * `altitude`; its health and its gunner are the host's live state.
 */
export interface OrbitPayload { type: 'orbit'; id: number; entry: CombatPlane; center: CombatPlane; radius: number; exit: CombatPlane; enter: number; arrive: number; leave: number; gone: number }
/** A supply crate released at `height` over `at`, on the ground at `land`, there until `until` unless someone takes it. */
export interface CratePayload { type: 'crate'; id: number; at: CombatPlane; release: number; land: number; height: number; until: number }
/** Smoke or gas sitting on the ground. `dps` above zero hurts whoever is inside. */
export interface CloudPayload { type: 'cloud'; id: number; center: CombatPlane; radius: number; from: number; until: number; dps: number; colour: string }
/** Radio and map jamming, and the lights going out at night. */
export interface JamPayload { type: 'jam'; id: number; from: number; until: number }
/** How long the event's live part (a crew, a sniper, a drone) lasts if nobody stops it. */
export interface PresencePayload { type: 'presence'; id: number; until: number }
export interface RevealPayload { type: 'reveal'; id: number; center: CombatPlane; radius: number; from: number; until: number; caller: string }
export type CombatPayload = RevealPayload | MunitionPayload | MarkerPayload | TransportPayload | InsertPayload | FlyerPayload | OrbitPayload | CratePayload | CloudPayload | JamPayload | PresencePayload;

export interface CombatEventPlugin {
  id: string; name: string; description: string;
  /** Seconds of warning before anything may hurt. Enforced at registration. */
  warning: number;
  /** Upper bound on the timeline's length, in seconds. */
  duration: number;
  /** What the HUD says while it is coming and while it lands. */
  banner: { warning: string; active: string };
  /** Hazards hurt whoever is in the way and are announced loudly; the rest are news. */
  hazard: boolean;
  /** What the feed blames, as in "Mortar killed …". The name's first word when absent. */
  cause?: string;
  /**
   * Where the director aims it: `area` somewhere 25–80 m from a player (or
   * `range`), checked so no round brackets them; `player` on a player, for
   * events that hunt (raids) and so carry their own warning.
   */
  targeting?: { policy: 'area' | 'player'; range?: readonly [number, number] };
  timeline(event: Readonly<CombatEventDescriptor>): CombatPayload[];
}

/** Craters and smoke linger this long after `duration`; the host keeps the descriptor for them. */
export const COMBAT_AFTERMATH = 8;
export const MAX_COMBAT_PAYLOADS = 48;
/** Running or lingering at once: three transports and three hazards at most are active (arena-rules), the rest are aftermath. */
export const MAX_COMBAT_EVENTS = 6;
/** Most troops one transport carries: a truck's full benches. */
export const MAX_TROOPS = 8;

/** mulberry32: small, fast and identical on every machine. */
export function combatRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const finitePlane = (p: CombatPlane | undefined) => !!p && finite(p.x) && finite(p.z);

const inWindow = (from: number, until: number, plugin: CombatEventPlugin) => finite(from) && finite(until) && from >= 0 && until >= from && until <= plugin.duration;
function validPayload(payload: CombatPayload, plugin: CombatEventPlugin) {
  if (payload.type === 'flyer')
    return finitePlane(payload.from) && finitePlane(payload.to) && finite(payload.height) && payload.height > 0 && payload.height <= 400 && ['jet', 'cargo'].includes(payload.model) && inWindow(payload.enter, payload.leave, plugin);
  if (payload.type === 'orbit')
    return [payload.entry, payload.center, payload.exit].every(finitePlane) && finite(payload.radius) && payload.radius > 0 && payload.radius <= 120 &&
      inWindow(payload.enter, payload.gone, plugin) && payload.arrive >= payload.enter && payload.leave >= payload.arrive && payload.gone >= payload.leave;
  if (payload.type === 'crate')
    return finitePlane(payload.at) && finite(payload.height) && payload.height > 0 && payload.height <= 400 && inWindow(payload.release, payload.until, plugin) && finite(payload.land) && payload.land > payload.release && payload.land <= payload.until;
  if (payload.type === 'cloud')
    return finitePlane(payload.center) && finite(payload.radius) && payload.radius > 0 && payload.radius <= 30 && inWindow(payload.from, payload.until, plugin) &&
      finite(payload.dps) && payload.dps >= 0 && payload.dps <= 20 && typeof payload.colour === 'string' &&
      // Gas may not start hurting before it has been announced.
      (payload.dps === 0 || payload.from >= plugin.warning);
  if (payload.type === 'jam') return inWindow(payload.from, payload.until, plugin);
  if (payload.type === 'presence') return finite(payload.until) && payload.until >= 0 && payload.until <= plugin.duration;
  if (payload.type === 'transport')
    return ['land', 'air', 'sea'].includes(payload.mode) && [payload.entry, payload.drop, payload.exit].every(finitePlane) && [payload.enter, payload.arrive, payload.depart, payload.leave, payload.cruise, payload.hover].every(finite) &&
      payload.enter >= 0 && payload.arrive >= payload.enter && payload.arrive >= plugin.warning && payload.depart >= payload.arrive && payload.leave >= payload.depart && payload.leave <= plugin.duration && payload.cruise >= payload.hover && payload.hover >= 0;
  if (payload.type === 'insert')
    return finitePlane(payload.at) && finite(payload.time) && Number.isInteger(payload.slot) && payload.slot >= 0 && payload.time >= plugin.warning && payload.time <= plugin.duration;
  if (payload.type === 'reveal') return finitePlane(payload.center) && finite(payload.radius) && payload.radius > 0 && payload.radius <= 30 && inWindow(payload.from, payload.until, plugin) && typeof payload.caller === 'string' && payload.caller.length <= 100;
  if (payload.type === 'marker')
    return finitePlane(payload.center) && finite(payload.radius) && payload.radius > 0 && finite(payload.from) && finite(payload.until) &&
      payload.from >= 0 && payload.until >= payload.from && payload.until <= plugin.duration + COMBAT_AFTERMATH;
  const { descent, blast } = payload;
  if (!finitePlane(payload.impact) || !finite(payload.time) || !finite(payload.flight) || payload.flight <= 0 || payload.time < 0 || payload.time > plugin.duration) return false;
  if (!descent || ![descent.x, descent.y, descent.z].every(finite) || descent.y >= 0 || Math.abs(Math.hypot(descent.x, descent.y, descent.z) - 1) > 1e-6) return false;
  if (payload.launch !== undefined && !finitePlane(payload.launch)) return false;
  if (!blast) return true;
  return [blast.radius, blast.damage, blast.minScale, blast.vehicleScale].every(finite) && blast.radius > 0 && blast.radius <= 30 &&
    blast.damage > 0 && blast.damage <= 400 && blast.minScale >= 0 && blast.minScale <= 1 && blast.vehicleScale >= 0 && blast.vehicleScale <= 4 &&
    // Nothing may hurt before it has been announced.
    payload.time >= plugin.warning;
}

const registry = new Map<string, CombatEventPlugin>();
/** Seeds every plugin is checked against before it is accepted. */
const PROBE_SEEDS = [1, 2, 3, 7, 42, 1337, 65535, 2 ** 31 + 11];
/** Local, statically imported extensions only: no downloaded scripts or eval. */
export function registerCombatEvent(plugin: CombatEventPlugin) {
  if (!/^[a-z][a-z0-9-]{0,31}$/.test(plugin.id) || registry.has(plugin.id)) throw new Error('Combat event ID must be unique and use lowercase letters, numbers or hyphens.');
  if (!plugin.name || typeof plugin.timeline !== 'function' || !finite(plugin.warning) || !finite(plugin.duration) ||
    plugin.warning < 1 || plugin.duration <= plugin.warning || plugin.duration > 180) throw new Error('Combat event needs a name, a timeline, at least a second of warning and a duration up to 180 s.');
  for (const seed of PROBE_SEEDS) for (const intensity of [.5, 1, 2]) {
    const payloads = plugin.timeline({ id: 'probe', kind: plugin.id, seed, start: 0, target: { x: 0, z: 0 }, heading: seed % 7, intensity });
    if (!Array.isArray(payloads) || payloads.length > MAX_COMBAT_PAYLOADS || !payloads.every(p => validPayload(p, plugin)))
      throw new Error(`Combat event ${plugin.id} produced an invalid timeline (seed ${seed}, intensity ${intensity}).`);
  }
  registry.set(plugin.id, Object.freeze({ ...plugin, banner: Object.freeze({ ...plugin.banner }) }));
}
export const getCombatEvent = (id: string) => registry.get(id);
export const listCombatEvents = () => [...registry.values()];

/** Timelines are pure but not free; the same descriptor is asked for every frame. */
const timelines = new WeakMap<CombatEventDescriptor, { ended: number | undefined; payloads: CombatPayload[] }>();
export function combatTimeline(event: CombatEventDescriptor): CombatPayload[] {
  let cached = timelines.get(event);
  // The host ends an event in place (a crew killed, a crate taken), so the cache keys on that too.
  if (!cached || cached.ended !== event.ended) {
    const plugin = registry.get(event.kind);
    const payloads = plugin ? plugin.timeline(event).slice(0, MAX_COMBAT_PAYLOADS) : [];
    cached = { ended: event.ended, payloads: finite(event.ended) ? endTimeline(payloads, event.ended - event.start) : payloads };
    timelines.set(event, cached);
  }
  return cached.payloads;
}
/**
 * What is left of a timeline whose live part stopped `end` seconds in: rounds
 * already in the air still land, nothing more is fired, and whatever was
 * waiting on the crew or the crate is over. A taken crate still lies where it
 * landed until its time is up.
 */
function endTimeline(payloads: CombatPayload[], end: number): CombatPayload[] {
  const kept = payloads.filter(p => p.type === 'munition' ? p.time - p.flight <= end : p.type === 'insert' ? p.time <= end : true);
  const landing = kept.reduce((last, p) => p.type === 'munition' ? Math.max(last, p.time) : last, end);
  return kept.map(p => p.type === 'presence' ? { ...p, until: Math.max(0, Math.min(p.until, end)) }
    : p.type === 'orbit' ? { ...p, leave: Math.min(p.leave, Math.max(p.arrive, end)), gone: Math.min(p.gone, end + 4) }
    : p.type === 'marker' ? { ...p, until: Math.max(p.from, Math.min(p.until, landing + 1.5)) }
    : p);
}

export type CombatPhase = 'warning' | 'active' | 'aftermath' | 'done';
/** When a payload has finished doing whatever it does, after `start`. */
export function payloadEnd(payload: CombatPayload) {
  switch (payload.type) {
    case 'munition': case 'insert': return payload.time;
    case 'transport': case 'flyer': return payload.leave;
    case 'orbit': return payload.gone;
    // A crate's part is over when it lands; how long it then lies there is the presence's to say.
    case 'crate': return payload.land;
    case 'reveal': case 'cloud': case 'jam': case 'presence': return payload.until;
    default: return 0;
  }
}
export function combatPhase(event: CombatEventDescriptor, now: number): CombatPhase {
  const plugin = registry.get(event.kind); if (!plugin) return 'done';
  const age = now - event.start;
  if (age < plugin.warning) return 'warning';
  const last = combatTimeline(event).reduce((end, p) => Math.max(end, payloadEnd(p)), plugin.warning);
  return age <= last ? 'active' : age <= plugin.duration + COMBAT_AFTERMATH ? 'aftermath' : 'done';
}

/** Whether a descriptor is well-formed, registered and plausible at `now` in `bounds`. */
export function validCombatEvent(value: unknown, now: number, bounds?: { minX: number; maxX: number; minZ: number; maxZ: number }): value is CombatEventDescriptor {
  if (!value || typeof value !== 'object') return false;
  const e = value as Partial<CombatEventDescriptor>;
  const plugin = typeof e.kind === 'string' ? registry.get(e.kind) : undefined;
  if (!plugin || typeof e.id !== 'string' || !e.id || e.id.length > 40 || !finite(e.seed) || !Number.isInteger(e.seed) || e.seed < 0 || e.seed > 0xffffffff) return false;
  if (!finite(e.start) || !finite(e.heading) || !finite(e.intensity) || e.intensity < .5 || e.intensity > 2 || !finitePlane(e.target)) return false;
  if (e.start > now + 1 || now - e.start > plugin.duration + COMBAT_AFTERMATH + 1) return false;
  if (e.reach !== undefined && (!finite(e.reach) || e.reach < 0 || e.reach > 400)) return false;
  if (e.kind === 'transport-sea') {
    const site = SENTOSA_LANDING_SITES.find(s => s.id === e.landing);
    if (!site || !e.origin || e.origin.x !== site.entry.x || e.origin.z !== site.entry.z || e.target!.x !== site.berth.x || e.target!.z !== site.berth.z || e.altitude !== site.waterY || e.heading !== 0 || !e.troops || e.troops > 4) return false;
  } else if (e.landing !== undefined) return false;
  if (e.troops !== undefined && (!Number.isInteger(e.troops) || e.troops < 1 || e.troops > MAX_TROOPS)) return false;
  if (e.faction !== undefined && (typeof e.faction !== 'string' || !getArenaFaction(e.faction))) return false;
  if (e.origin !== undefined && (!finitePlane(e.origin) || Math.abs(e.origin.x) > 5000 || Math.abs(e.origin.z) > 5000)) return false;
  if (e.altitude !== undefined && (!finite(e.altitude) || e.altitude < -50 || e.altitude > 400)) return false;
  if (e.ended !== undefined && (!finite(e.ended) || e.ended < e.start || e.ended > now + 1)) return false;
  if (e.outcome !== undefined && !OUTCOMES.includes(e.outcome)) return false;
  if (e.claimedBy !== undefined && (typeof e.claimedBy !== 'string' || !e.claimedBy || e.claimedBy.length > 100)) return false;
  return !bounds || (e.target!.x >= bounds.minX && e.target!.x <= bounds.maxX && e.target!.z >= bounds.minZ && e.target!.z <= bounds.maxZ);
}

/** Unit travel direction for a munition falling `pitch` radians below the horizon along `heading`. */
export function descentAlong(heading: number, pitch: number): CombatVector {
  const flat = Math.cos(pitch);
  // Actor yaw looks along -z at 0 (see arena bots' atan2(-dx, -dz)), so travel follows the same convention.
  return { x: -Math.sin(heading) * flat, y: -Math.sin(pitch), z: -Math.cos(heading) * flat };
}

export interface CombatCue { kind: 'launch' | 'whistle' | 'impact'; event: CombatEventDescriptor; payload: MunitionPayload }
/** How long before impact a shell can be heard. */
export const WHISTLE_LEAD = 1.2;
/**
 * Cues that fall in (from, to]: mortars firing, shells starting to whistle and
 * shells landing. Renderers call this once per frame with their previous and
 * current clock.
 */
export function combatCues(events: readonly CombatEventDescriptor[], from: number, to: number): CombatCue[] {
  const cues: CombatCue[] = [];
  if (!(to > from)) return cues;
  for (const event of events) for (const payload of combatTimeline(event)) {
    if (payload.type !== 'munition') continue;
    const impact = event.start + payload.time, whistle = impact - Math.min(WHISTLE_LEAD, payload.flight), fired = impact - payload.flight;
    if (payload.launch && fired > from && fired <= to) cues.push({ kind: 'launch', event, payload });
    if (payload.blast && whistle > from && whistle <= to) cues.push({ kind: 'whistle', event, payload });
    if (impact > from && impact <= to) cues.push({ kind: 'impact', event, payload });
  }
  return cues;
}

export interface TransportPose { x: number; y: number; z: number; yaw: number; visible: boolean;
  /** 0 to 1: engine or rotor effort, for sound. */
  effort: number }
const smooth = (t: number) => t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
const yawToward = (from: CombatPlane, to: CombatPlane) => Math.atan2(-(to.x - from.x), -(to.z - from.z));
const turnBetween = (from: number, to: number, t: number) => from + Math.atan2(Math.sin(to - from), Math.cos(to - from)) * t;
/**
 * Where a transport is `age` seconds after its event started. Pure, so the
 * renderer draws it from the descriptor alone. `y` is height above the ground
 * under it; the renderer adds the ground.
 */
export function transportPose(payload: TransportPayload, age: number): TransportPose {
  const { entry, drop, exit, enter, arrive, depart, leave, cruise, hover } = payload, air = payload.mode === 'air', sea = payload.mode === 'sea';
  const inward = yawToward(entry, drop), outward = yawToward(drop, exit);
  const along = (a: CombatPlane, b: CombatPlane, t: number) => ({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
  if (age < enter || age > leave) return { ...entry, y: air ? cruise : 0, yaw: inward, visible: false, effort: 0 };
  if (age < arrive) {
    // Full speed for most of the leg, then slowing into the drop rather than stopping dead.
    const t = (age - enter) / Math.max(.1, arrive - enter), travelled = t < .7 ? t / .7 * .82 : .82 + .18 * Math.sin((t - .7) / .3 * Math.PI / 2);
    // Helicopters come in high and drop to the hover over the last third.
    return { ...along(entry, drop, travelled), y: air ? cruise + (hover - cruise) * smooth((t - .62) / .38) : 0, yaw: inward, visible: true, effort: 1 };
  }
  if (age < depart) {
    const t = (age - arrive) / Math.max(.1, depart - arrive);
    // A truck turns round while the troops get out; a helicopter holds its hover.
    return sea ? { ...drop, y: 0, yaw: inward, visible: true, effort: .2 } : air ? { ...drop, y: hover + Math.sin(age * 2.1) * .15, yaw: inward, visible: true, effort: .85 }
      : { ...drop, y: 0, yaw: turnBetween(inward, outward, smooth(t)), visible: true, effort: .3 };
  }
  const t = (age - depart) / Math.max(.1, leave - depart);
  return { ...along(drop, exit, t * t), y: air ? hover + (cruise - hover) * smooth(t * 2.5) : 0,
    yaw: sea ? inward : air ? turnBetween(inward, outward, smooth(t * 2)) : outward, visible: true, effort: 1 };
}

/** Where a crossing aircraft is: straight from `from` to `to`; `y` is height above the ground. */
export function flyerPose(payload: FlyerPayload, age: number): TransportPose {
  const t = (age - payload.enter) / Math.max(.1, payload.leave - payload.enter), visible = t >= 0 && t <= 1, k = Math.max(0, Math.min(1, t));
  return { x: payload.from.x + (payload.to.x - payload.from.x) * k, z: payload.from.z + (payload.to.z - payload.from.z) * k, y: payload.height,
    yaw: yawToward(payload.from, payload.to), visible, effort: visible ? 1 : 0 };
}
/** Metres per second a raid helicopter flies its orbit and its legs in and out. */
export const ORBIT_SPEED = 26;
/**
 * Where a raid helicopter is `age` seconds in. `y` is `altitude`, above sea
 * level, not the ground: it holds a height clear of the rooftops it circles.
 */
export function orbitPose(payload: OrbitPayload, age: number, altitude: number): TransportPose {
  const { entry, center, radius, exit, enter, arrive, leave, gone } = payload;
  const join = Math.atan2(entry.z - center.z, entry.x - center.x);
  const around = (angle: number) => ({ x: center.x + Math.cos(angle) * radius, z: center.z + Math.sin(angle) * radius });
  const angleAt = (t: number) => join + Math.max(0, t - arrive) * ORBIT_SPEED / radius;
  // Nose along the direction of travel, (-sin, cos) for a rising angle, in actor-yaw terms.
  const tangent = (angle: number) => Math.atan2(Math.sin(angle), -Math.cos(angle));
  if (age < enter || age > gone) return { ...entry, y: altitude + 20, yaw: yawToward(entry, center), visible: false, effort: 0 };
  if (age < arrive) {
    const start = around(join), t = smooth((age - enter) / Math.max(.1, arrive - enter));
    return { x: entry.x + (start.x - entry.x) * t, z: entry.z + (start.z - entry.z) * t, y: altitude + 20 * (1 - t), yaw: yawToward(entry, start), visible: true, effort: 1 };
  }
  if (age <= leave) { const angle = angleAt(age), at = around(angle); return { ...at, y: altitude + Math.sin(age * 1.3) * .4, yaw: tangent(angle), visible: true, effort: .9 }; }
  const from = around(angleAt(leave)), t = (age - leave) / Math.max(.1, gone - leave);
  return { x: from.x + (exit.x - from.x) * t * t, z: from.z + (exit.z - from.z) * t * t, y: altitude + 25 * smooth(t), yaw: yawToward(from, exit), visible: true, effort: 1 };
}
/** Where a supply crate is: falling under its canopy, then on the ground. `y` is height above the ground under it. */
export function cratePose(payload: CratePayload, age: number) {
  const visible = age >= payload.release && age <= payload.until, t = Math.max(0, Math.min(1, (age - payload.release) / (payload.land - payload.release)));
  return { x: payload.at.x, z: payload.at.z, y: payload.height * (1 - t), landed: age >= payload.land, visible };
}
