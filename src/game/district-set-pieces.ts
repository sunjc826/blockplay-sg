import * as THREE from 'three';
import type { RegionId } from './region-ids';
import type { RegionWorld } from './regions';

/**
 * District set pieces: the machinery of a working city carrying on through
 * the war. Queenstown's train keeps its timetable, Punggol's LRT shuttles,
 * HarbourFront's and Tuas's cranes keep moving boxes, Changi's airliners keep
 * coming and going, Tuas's flare burns, the Woodlands shuttle crosses the
 * Causeway, Marina's Flyer turns and its Supertrees and bay put on their
 * night shows, and macaques sit about Upper Thomson and Bukit Timah.
 *
 * Every piece is a pure function of the world clock, so every mode and every
 * LAN peer sees the same train in the same place. All of it hangs under one
 * group flagged `fpsEffect` with raycasting off: scenery that no shot, bot or
 * collider ever meets. `cues` reports what should be heard between two times.
 */

export type SetPieceCueKind = 'chime' | 'horn' | 'train-horn' | 'airliner' | 'flypast';
export interface SetPieceCue { kind: SetPieceCueKind; at: { x: number; y: number; z: number } }
interface SetPiece { animate(time: number, night: number): void; cues?(from: number, to: number): SetPieceCue[] }
type Kit = ReturnType<typeof createKit>;

const noRaycast = () => {};
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const smooth = (v: number) => { const t = clamp01(v); return t * t * (3 - 2 * t); };
/** Whether `time` steps past `mark` between two calls, on a timetable repeating every `period`. */
function crosses(from: number, to: number, mark: number, period = Infinity) {
  if (!(to > from)) return false;
  if (!Number.isFinite(period)) return from < mark && mark <= to;
  const k = Math.floor((to - mark) / period);
  return mark + k * period > from && mark + k * period <= to;
}
/** 0 by day, 1 at night, from the atmosphere's hour: the lights come up around 7 pm and go off after dawn. */
export function nightOf(hour: number | undefined) {
  if (hour === undefined || !Number.isFinite(hour)) return 0;
  return Math.max(smooth((hour - 19) / .75), 1 - smooth((hour - 6.5) / .75));
}

/**
 * A run along a straight track: in from `reach` at `speed`, braking to a stop
 * at 0, waiting `dwell`, then out the far side (`through`) or back the way it
 * came. Returns the offset from the stop, signed by direction of travel, and
 * the times of arrival and departure.
 */
export function trackRun(u: number, o: { reach: number; speed: number; accel: number; dwell: number; through: boolean }) {
  const brake = o.speed * o.speed / (2 * o.accel), ramp = o.speed / o.accel, cruise = Math.max(0, o.reach - brake) / o.speed;
  const arrive = cruise + ramp, depart = arrive + o.dwell, leave = depart + ramp + cruise;
  let s: number;
  if (u < cruise) s = -o.reach + u * o.speed;
  else if (u < arrive) { const r = arrive - u; s = -o.accel * r * r / 2; }
  else if (u < depart) s = 0;
  else if (u < depart + ramp) { const r = u - depart; s = o.accel * r * r / 2; }
  else s = Math.min(o.reach, brake + (u - depart - ramp) * o.speed);
  // Back the way it came: the same distances, mirrored onto the approach side.
  return { s: o.through || u < depart ? s : -s, arrive, depart, leave, visible: u >= 0 && u <= leave };
}

/** Distance covered `u` seconds into a move of `distance` from rest to rest: speed up, cruise, slow down. */
export function travel(u: number, distance: number, speed: number, accel: number) {
  const rampDistance = speed * speed / (2 * accel), ramp = speed / accel;
  if (distance < 2 * rampDistance) {
    const half = Math.sqrt(distance / accel), total = 2 * half, t = clamp01(u / total) * total;
    return { s: t < half ? accel * t * t / 2 : distance - accel * (total - t) * (total - t) / 2, total };
  }
  const cruise = (distance - 2 * rampDistance) / speed, total = 2 * ramp + cruise, t = Math.max(0, Math.min(total, u));
  const s = t < ramp ? accel * t * t / 2 : t < ramp + cruise ? rampDistance + (t - ramp) * speed : distance - accel * (total - t) * (total - t) / 2;
  return { s, total };
}

function createKit(scene: THREE.Scene, root: THREE.Group) {
  const geometries: THREE.BufferGeometry[] = [], materials: THREE.Material[] = [];
  const keep = <T extends THREE.BufferGeometry>(g: T) => { geometries.push(g); return g; };
  const lit = (color: string, extra: THREE.MeshStandardMaterialParameters = {}) => { const m = new THREE.MeshStandardMaterial({ color, roughness: .6, ...extra }); materials.push(m); return m; };
  const glow = (color: string, extra: THREE.MeshBasicMaterialParameters = {}) => { const m = new THREE.MeshBasicMaterial({ color, toneMapped: false, ...extra }); materials.push(m); return m; };
  const unit = keep(new THREE.BoxGeometry(1, 1, 1)), round = keep(new THREE.CylinderGeometry(.5, .5, 1, 10)), ball = keep(new THREE.SphereGeometry(.5, 10, 8));
  const box = (parent: THREE.Object3D, x: number, y: number, z: number, w: number, h: number, d: number, material: THREE.Material) => {
    const mesh = new THREE.Mesh(unit, material); mesh.position.set(x, y, z); mesh.scale.set(w, h, d); mesh.raycast = noRaycast; parent.add(mesh); return mesh;
  };
  const cylinder = (parent: THREE.Object3D, x: number, y: number, z: number, r: number, h: number, material: THREE.Material) => {
    const mesh = new THREE.Mesh(round, material); mesh.position.set(x, y, z); mesh.scale.set(r * 2, h, r * 2); mesh.raycast = noRaycast; parent.add(mesh); return mesh;
  };
  const sphere = (parent: THREE.Object3D, x: number, y: number, z: number, r: number, material: THREE.Material) => {
    const mesh = new THREE.Mesh(ball, material); mesh.position.set(x, y, z); mesh.scale.setScalar(r * 2); mesh.raycast = noRaycast; parent.add(mesh); return mesh;
  };
  const group = (parent: THREE.Object3D = root) => { const g = new THREE.Group(); parent.add(g); return g; };
  /** A pool of small lights that can be recoloured each frame. */
  const lights = (count: number, radius: number) => {
    const mesh = new THREE.InstancedMesh(keep(new THREE.SphereGeometry(radius, 6, 4)), glow('#ffffff'), count);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.raycast = noRaycast; mesh.frustumCulled = false; mesh.setColorAt(0, new THREE.Color());
    root.add(mesh); return mesh;
  };
  const ray = new THREE.Raycaster(), down = new THREE.Vector3(0, -1, 0), from = new THREE.Vector3();
  /** The top surface at (x, z): a roof, a railing, a platform; the ground when there is nothing else. */
  const surface = (x: number, z: number, top = 80) => {
    ray.set(from.set(x, top, z), down); ray.far = top + 20;
    const hit = ray.intersectObjects(scene.children.filter(c => c !== root && !c.userData.fpsEffect), true)[0];
    return hit?.point.y ?? 0;
  };
  return { keep, lit, glow, box, cylinder, sphere, group, lights, surface, dispose() { geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); } };
}

// ---------------------------------------------------------------- Queenstown

/** EW19: in from the west or the east on alternate runs, a stop at the platform with the door chimes, then on. */
export const QUEENSTOWN_MRT = { period: 120, reach: 250, speed: 16, accel: 1.2, dwell: 28 } as const;
export function queenstownTrain(time: number) {
  const k = Math.floor(time / QUEENSTOWN_MRT.period), u = time - k * QUEENSTOWN_MRT.period, dir = k % 2 ? -1 : 1;
  const run = trackRun(u, { ...QUEENSTOWN_MRT, through: true });
  return { x: run.s * dir, visible: run.visible, run };
}
function queenstown(scene: THREE.Scene): SetPiece | null {
  const train = scene.getObjectByName('queenstown-train'); if (!train) return null;
  const run = trackRun(0, { ...QUEENSTOWN_MRT, through: true }), at = { x: 0, y: 10.5, z: 22 };
  return {
    animate(time) { const t = queenstownTrain(time); train.visible = t.visible; train.position.x = t.x; },
    cues: (from, to) => [run.arrive + 1.5, run.depart - 3].filter(mark => crosses(from, to, mark, QUEENSTOWN_MRT.period)).map(() => ({ kind: 'chime' as const, at })),
  };
}

// ---------------------------------------------------------------- Punggol

/** The LRT shuttles between its station and the far end of the viaduct, waiting at each. */
export const PUNGGOL_LRT = { x: 215, station: 108, end: -138, deck: 14, speed: 12, accel: 1, dwell: 20, wait: 10 } as const;
export function punggolTrain(time: number) {
  const { station, end, speed, accel, dwell, wait } = PUNGGOL_LRT, distance = station - end, leg = travel(0, distance, speed, accel).total;
  const period = dwell + leg + wait + leg, u = ((time % period) + period) % period;
  const z = u < dwell ? station : u < dwell + leg ? station - travel(u - dwell, distance, speed, accel).s
    : u < dwell + leg + wait ? end : end + travel(u - dwell - leg - wait, distance, speed, accel).s;
  return { z, period };
}
function punggol(kit: Kit): SetPiece {
  const train = kit.group(), white = kit.lit('#eef1ee'), band = kit.lit('#2f8a62'), glass = kit.lit('#2b3d45', { roughness: .2, metalness: .3 }), dark = kit.lit('#2a2d2f');
  for (const dz of [-6, 6]) {
    kit.box(train, 0, 1.45, dz, 2.6, 2.6, 11.4, white);
    kit.box(train, 0, .55, dz, 2.66, .4, 11.4, band);
    for (const side of [-1, 1]) kit.box(train, side * 1.32, 1.85, dz, .06, .9, 9.4, glass);
    kit.box(train, 0, .1, dz, 1.6, .3, 9, dark);
  }
  for (const end of [-1, 1]) kit.box(train, 0, 1.75, end * 11.75, 2.2, 1.1, .1, glass);
  train.position.set(PUNGGOL_LRT.x, PUNGGOL_LRT.deck, PUNGGOL_LRT.station);
  const period = punggolTrain(0).period;
  return {
    animate(time) { train.position.z = punggolTrain(time).z; },
    cues: (from, to) => crosses(from, to, PUNGGOL_LRT.dwell - 3, period) ? [{ kind: 'chime', at: { x: PUNGGOL_LRT.x, y: 16, z: PUNGGOL_LRT.station } }] : [],
  };
}

// ---------------------------------------------------------------- Cranes

/**
 * A container crane at work: the trolley runs along its boom between two
 * spots, lowers the spreader, takes the box, lifts it, carries it over and
 * sets it down, then waits over it; the next cycle carries it back. `top` is
 * the trolley's height.
 */
export const CRANE = { lower: 5, grab: 1.2, travel: 9, idle: 6 } as const;
export function craneState(u: number, o: { a: number; b: number; lift: number; dropA: number; dropB: number }) {
  const cycle = 4 * CRANE.lower + 2 * CRANE.grab + CRANE.travel + CRANE.idle, k = Math.floor(u / cycle), t = u - k * cycle;
  const [from, to, fromY, toY] = k % 2 ? [o.b, o.a, o.dropB, o.dropA] : [o.a, o.b, o.dropA, o.dropB];
  const steps = [CRANE.lower, CRANE.grab, CRANE.lower, CRANE.travel, CRANE.lower, CRANE.grab, CRANE.lower];
  let phase = 0, at = t; while (phase < steps.length && at >= steps[phase]) { at -= steps[phase]; phase++; }
  const f = phase < steps.length ? smooth(at / steps[phase]) : 1;
  // Trolley x, spreader height and whether the box hangs from it, phase by phase.
  const table: [number, number, boolean][] = [
    [from, o.lift + (fromY - o.lift) * f, false], [from, fromY, f > .5], [from, fromY + (o.lift - fromY) * f, true], [from + (to - from) * f, o.lift, true],
    [to, o.lift + (toY - o.lift) * f, true], [to, toY, f < .5], [to, toY + (o.lift - toY) * f, false],
  ];
  const [x, hook, carrying] = phase < steps.length ? table[phase] : [to, o.lift, false];
  // Where the box rests while not carried: at the source before it is taken, at the destination after.
  const resting = phase <= 1 && !carrying ? from : to;
  return { x, hook, carrying, resting, restingY: resting === from ? fromY : toY, cycle };
}
function crane(kit: Kit, o: { x: number; z: number; a: number; b: number; top: number; lift: number; colour: string; long: 'x' | 'z'; offset: number }) {
  const steel = kit.lit('#30363a'), box = kit.lit(o.colour, { roughness: .8 }), rope = kit.lit('#1b1d1f');
  const trolley = kit.group(), spreader = kit.group(), carried = kit.group(), parked = kit.group();
  kit.box(trolley, 0, 0, 0, 4.6, 2.2, 4.6, steel);
  const ropes = [-1, 1].map(side => kit.cylinder(trolley, 0, 0, side * 1.3, .06, 1, rope));
  kit.box(spreader, 0, 0, 0, o.long === 'z' ? 2.6 : 12.2, .35, o.long === 'z' ? 12.2 : 2.6, kit.lit('#d9a21f'));
  for (const g of [carried, parked]) kit.box(g, 0, 1.3, 0, o.long === 'z' ? 2.44 : 12, 2.6, o.long === 'z' ? 12 : 2.44, box);
  const dropA = kit.surface(o.x + o.a, o.z, o.lift - 1) + .02, dropB = kit.surface(o.x + o.b, o.z, o.lift - 1) + .02, lift = o.lift;
  return {
    animate(time: number) {
      const s = craneState(time + o.offset, { a: o.a, b: o.b, lift, dropA: dropA + 2.95, dropB: dropB + 2.95 });
      trolley.position.set(o.x + s.x, o.top, o.z); spreader.position.set(o.x + s.x, s.hook, o.z);
      const length = o.top - s.hook; ropes.forEach(r => { r.scale.y = length; r.position.y = -length / 2; });
      carried.visible = s.carrying; carried.position.set(o.x + s.x, s.hook - 2.95, o.z);
      parked.visible = !s.carrying; parked.position.set(o.x + s.resting, s.restingY - 2.95, o.z);
    },
  };
}
function harbourfront(kit: Kit): SetPiece {
  const cranes = [146, 174].map((z, i) => crane(kit, { x: 180, z, a: 6, b: 34, top: 33.6, lift: 28, colour: i ? '#2f6f9a' : '#b8432f', long: 'z', offset: i * 23 }));
  const horn = { x: -40, y: 50, z: 158 };
  return {
    animate(time) { cranes.forEach(c => c.animate(time)); },
    // The liner sounds two long blasts every few minutes.
    cues: (from, to) => crosses(from, to, 40, 150) ? [{ kind: 'horn', at: horn }] : [],
  };
}

// ---------------------------------------------------------------- Tuas

function tuas(kit: Kit): SetPiece {
  const cranes = [97, 165].map((x, i) => crane(kit, { x, z: -40, a: -11, b: 11, top: 21.6, lift: 15, colour: i ? '#c4882a' : '#4f7a46', long: 'z', offset: i * 17 }));
  // The flare: tongues of flame over the stack tip, never quite still.
  const flare = kit.group(); flare.position.set(-96, 62.4, 72);
  const tongues = ['#ff7a1a', '#ffb23a', '#fff0b0'].map((c, i) => {
    const m = new THREE.Mesh(kit.keep(new THREE.ConeGeometry(3.6 - i * .9, 16 - i * 3.6, 8)), kit.glow(c, { transparent: true, opacity: .85 - i * .1, depthWrite: false }));
    m.position.y = 7 - i * 1.2; m.raycast = noRaycast; flare.add(m); return m;
  });
  return {
    animate(time) {
      cranes.forEach(c => c.animate(time));
      tongues.forEach((t, i) => {
        const flicker = .85 + .15 * Math.sin(time * (11 + i * 3)) + .08 * Math.sin(time * 23.7 + i);
        t.scale.set(flicker, .8 + .3 * Math.sin(time * (7 + i * 2.3) + i), flicker); t.rotation.z = Math.sin(time * 1.3 + i) * .12;
      });
    },
  };
}

// ---------------------------------------------------------------- Changi

/** Arrivals and departures alternate along a line off the east coast: in over the sea, out climbing north. */
export const CHANGI_FLIGHTS = { period: 55, x: 420, south: 900, north: -1300, arrive: { speed: 70, high: 330, low: 6 }, depart: { speed: 82, low: 6, high: 420 } } as const;
export function changiFlight(time: number) {
  const k = Math.floor(time / CHANGI_FLIGHTS.period), u = time - k * CHANGI_FLIGHTS.period, arriving = k % 2 === 0, span = CHANGI_FLIGHTS.south - CHANGI_FLIGHTS.north;
  const spec = arriving ? CHANGI_FLIGHTS.arrive : CHANGI_FLIGHTS.depart, f = u * spec.speed / span;
  // Arrivals come down from the north to the runway south; departures lift off there and climb away north.
  const z = arriving ? CHANGI_FLIGHTS.north + f * span : CHANGI_FLIGHTS.south - f * span;
  const y = arriving ? CHANGI_FLIGHTS.arrive.high + (CHANGI_FLIGHTS.arrive.low - CHANGI_FLIGHTS.arrive.high) * f : CHANGI_FLIGHTS.depart.low + (CHANGI_FLIGHTS.depart.high - CHANGI_FLIGHTS.depart.low) * Math.pow(f, 1.3);
  return { x: CHANGI_FLIGHTS.x, y, z, arriving, visible: f <= 1, heading: arriving ? Math.PI : 0, pitch: arriving ? .04 : .16 };
}
function buildAirliner(kit: Kit) {
  const plane = kit.group(), white = kit.lit('#f1f3f4'), belly = kit.lit('#9aa3aa'), tail = kit.lit('#1e4f8a'), engine = kit.lit('#c9ced2');
  const body = kit.cylinder(plane, 0, 0, 0, 2.6, 58, white); body.rotation.x = Math.PI / 2;
  const nose = new THREE.Mesh(kit.keep(new THREE.SphereGeometry(2.6, 10, 8)), white); nose.scale.set(1, 1, 2.2); nose.position.z = -29; nose.raycast = noRaycast; plane.add(nose);
  const tailCone = new THREE.Mesh(kit.keep(new THREE.ConeGeometry(2.6, 9, 10)), white); tailCone.rotation.x = Math.PI / 2; tailCone.position.z = 33; tailCone.raycast = noRaycast; plane.add(tailCone);
  kit.box(plane, 0, -1.4, 0, 3.6, 1.2, 50, belly);
  const wings = new THREE.Shape(); wings.moveTo(0, -6); wings.lineTo(30, 8); wings.lineTo(30, 11); wings.lineTo(0, 6); wings.lineTo(-30, 11); wings.lineTo(-30, 8); wings.closePath();
  const wing = new THREE.Mesh(kit.keep(new THREE.ExtrudeGeometry(wings, { depth: .5, bevelEnabled: false })), white); wing.rotation.x = Math.PI / 2; wing.position.set(0, -1, 0); wing.raycast = noRaycast; plane.add(wing);
  for (const side of [-1, 1]) { const pod = kit.cylinder(plane, side * 10, -2.6, -2, 1.3, 6, engine); pod.rotation.x = Math.PI / 2; }
  const stab = new THREE.Shape(); stab.moveTo(0, 0); stab.lineTo(11, 6); stab.lineTo(11, 8); stab.lineTo(0, 5); stab.lineTo(-11, 8); stab.lineTo(-11, 6); stab.closePath();
  const tailplane = new THREE.Mesh(kit.keep(new THREE.ExtrudeGeometry(stab, { depth: .35, bevelEnabled: false })), white); tailplane.rotation.x = Math.PI / 2; tailplane.position.set(0, 1, 26); tailplane.raycast = noRaycast; plane.add(tailplane);
  const fin = kit.box(plane, 0, 6.5, 31, .5, 10, 8, tail); fin.rotation.x = -.35;
  // Navigation lights: red port, green starboard, a white strobe on the tail.
  const port = kit.sphere(plane, -30, -1, 10, .5, kit.glow('#ff3030')), starboard = kit.sphere(plane, 30, -1, 10, .5, kit.glow('#30ff60')), strobe = kit.sphere(plane, 0, 11, 34, .5, kit.glow('#ffffff'));
  plane.rotation.order = 'YXZ';
  return { plane, port, starboard, strobe };
}
function changi(kit: Kit): SetPiece {
  const jet = buildAirliner(kit);
  return {
    animate(time, night) {
      const f = changiFlight(time); jet.plane.visible = f.visible;
      jet.plane.position.set(f.x, f.y, f.z); jet.plane.rotation.set(f.pitch, f.heading, 0);
      jet.port.visible = jet.starboard.visible = night > .2; jet.strobe.visible = night > .2 && (time * 1.1) % 1 < .08;
    },
    // Heard as it passes abeam the terminal: arrivals fly on even slots, departures on odd.
    cues(from, to) {
      const marks = [-CHANGI_FLIGHTS.north / CHANGI_FLIGHTS.arrive.speed, CHANGI_FLIGHTS.period + CHANGI_FLIGHTS.south / CHANGI_FLIGHTS.depart.speed];
      return marks.filter(mark => crosses(from, to, mark, CHANGI_FLIGHTS.period * 2)).map(mark => { const f = changiFlight(mark); return { kind: 'airliner' as const, at: { x: f.x, y: f.y, z: f.z } }; });
    },
  };
}

// ---------------------------------------------------------------- Woodlands

/** The cross-border shuttle comes in over the Causeway, waits at the checkpoint end of the line and goes back. */
export const WOODLANDS_SHUTTLE = { period: 180, x: -24, stop: -167, reach: 290, speed: 14, accel: .8, dwell: 40, rail: 1.1 } as const;
export function woodlandsShuttle(time: number) {
  const u = ((time % WOODLANDS_SHUTTLE.period) + WOODLANDS_SHUTTLE.period) % WOODLANDS_SHUTTLE.period;
  const run = trackRun(u, { ...WOODLANDS_SHUTTLE, through: false });
  // In from the north (-z), back out north.
  return { z: WOODLANDS_SHUTTLE.stop + run.s, visible: run.visible, run };
}
function woodlands(kit: Kit): SetPiece {
  const train = kit.group(), blue = kit.lit('#1f4f8f'), white = kit.lit('#e9ecec'), glass = kit.lit('#26343c', { roughness: .2, metalness: .3 }), dark = kit.lit('#2b2d2e');
  for (let car = 0; car < 4; car++) {
    const z = (car - 1.5) * 18.5;
    kit.box(train, 0, 2.3, z, 3, 3.2, 18, white); kit.box(train, 0, 1.1, z, 3.04, .8, 18, blue);
    for (const side of [-1, 1]) kit.box(train, side * 1.52, 2.7, z, .06, 1, 15, glass);
    kit.box(train, 0, .35, z, 2, .5, 15, dark);
  }
  train.position.set(WOODLANDS_SHUTTLE.x, WOODLANDS_SHUTTLE.rail, WOODLANDS_SHUTTLE.stop);
  const run = trackRun(0, { ...WOODLANDS_SHUTTLE, through: false }), at = (z: number) => ({ x: WOODLANDS_SHUTTLE.x, y: 4, z });
  return {
    animate(time) { const s = woodlandsShuttle(time); train.visible = s.visible; train.position.z = s.z; },
    cues: (from, to) => [
      ...(crosses(from, to, run.arrive - 14, WOODLANDS_SHUTTLE.period) ? [{ kind: 'train-horn' as const, at: at(WOODLANDS_SHUTTLE.stop - 120) }] : []),
      ...(crosses(from, to, run.depart - 1, WOODLANDS_SHUTTLE.period) ? [{ kind: 'train-horn' as const, at: at(WOODLANDS_SHUTTLE.stop) }] : []),
    ],
  };
}

// ---------------------------------------------------------------- Marina Bay

/** A turn every eight minutes: slow enough to read as the Flyer, quick enough to see moving. */
export const FLYER_TURN = 480;
/** Supertrees, as marina-scene lays them out: centre and canopy radius. */
const SUPERTREES = [[291, 15, 11], [304, 65, 14], [289, 116, 10]] as const;
/** At night the bay show runs this long, this often; the National Day rehearsal flies over by day. */
export const BAY_SHOW = { every: 600, length: 180 } as const, FLYPAST = { every: 420, speed: 150, reach: 900, height: 140 } as const;
const showColours = ['#ff3b6b', '#ffb02e', '#43e0ff', '#7a5cff', '#58ff8a', '#ffffff'].map(c => new THREE.Color(c));

function marina(kit: Kit, scene: THREE.Scene): SetPiece {
  const flyer = scene.getObjectByName('marina-flyer-wheel'), pods = flyer ? flyer.children.filter(c => c.name === 'marina-flyer-capsule') : [];
  // Rim lights on the Flyer turn with it.
  const rimLights = new THREE.InstancedMesh(kit.keep(new THREE.SphereGeometry(.35, 6, 4)), kit.glow('#ffffff'), 64);
  rimLights.raycast = noRaycast; rimLights.frustumCulled = false; flyer?.add(rimLights);
  const matrix = new THREE.Matrix4(), colour = new THREE.Color(), off = new THREE.Color('#000000');
  for (let i = 0; i < 64; i++) { const a = (i % 32) / 32 * Math.PI * 2, z = i < 32 ? -3 : 3; rimLights.setMatrixAt(i, matrix.makeTranslation(Math.cos(a) * 25.5, Math.sin(a) * 25.5, z)); rimLights.setColorAt(i, off); }

  // Supertree lights: round each canopy rim, out along the branches and up the trunk.
  const points: { x: number; y: number; z: number; tree: number; band: number; angle: number }[] = [];
  SUPERTREES.forEach(([x, z, r], tree) => {
    for (let i = 0; i < 30; i++) { const a = i / 30 * Math.PI * 2; points.push({ x: x + Math.cos(a) * r, y: 25.3, z: z + Math.sin(a) * r, tree, band: 3, angle: a }); }
    for (let i = 0; i < 12; i++) for (const f of [.45, .7]) { const a = i * Math.PI / 6; points.push({ x: x + Math.cos(a) * r * f, y: 21 + f * 3, z: z + Math.sin(a) * r * f, tree, band: 2, angle: a }); }
    for (let i = 0; i < 18; i++) { const a = i * 1.1, y = 2 + i * .95; points.push({ x: x + Math.cos(a) * 2.6, y, z: z + Math.sin(a) * 2.6, tree, band: y / 20, angle: a }); }
  });
  const treeLights = kit.lights(points.length, .55);
  points.forEach((p, i) => { treeLights.setMatrixAt(i, matrix.makeTranslation(p.x, p.y, p.z)); });

  // The bay show: a line of fountains across the water and lasers sweeping from the south promenade.
  const water = kit.glow('#bfe8ff', { transparent: true, opacity: .45, depthWrite: false, blending: THREE.AdditiveBlending });
  // Each jet flares out as it rises, like spray rather than a pole.
  const spray = kit.keep(new THREE.CylinderGeometry(1.8, .35, 1, 12, 1, true));
  const fountains = kit.group(), jets = Array.from({ length: 9 }, (_, i) => { const m = new THREE.Mesh(spray, water); m.position.set(-48 + i * 12, 0, 20); m.raycast = noRaycast; m.visible = false; fountains.add(m); return m; });
  const laserMaterial = kit.glow('#43e0ff', { transparent: true, opacity: .55, depthWrite: false, blending: THREE.AdditiveBlending });
  const lasers = Array.from({ length: 4 }, () => { const g = kit.group(); g.position.set(0, 18, 62); const beam = kit.cylinder(g, 0, 150, 0, .18, 300, laserMaterial); beam.visible = true; g.visible = false; return g; });

  // National Day rehearsal: five jets in a V with red and white smoke.
  const parade = Array.from({ length: 5 }, (_, i) => {
    const plane = kit.group(), grey = kit.lit('#8a939a');
    const body = kit.cylinder(plane, 0, 0, 0, .7, 13, grey); body.rotation.x = Math.PI / 2;
    const wing = new THREE.Shape(); wing.moveTo(0, -2.5); wing.lineTo(6, 3.5); wing.lineTo(-6, 3.5); wing.closePath();
    const wings = new THREE.Mesh(kit.keep(new THREE.ExtrudeGeometry(wing, { depth: .18, bevelEnabled: false })), grey); wings.rotation.x = Math.PI / 2; wings.raycast = noRaycast; plane.add(wings);
    kit.box(plane, 0, 1.3, 5.2, .15, 2.2, 2.4, grey);
    const smoke = kit.box(kit.group(), 0, 0, 0, 1.6, 1.6, 1, kit.lit(i % 2 ? '#f4f4f4' : '#e8333a', { transparent: true, opacity: .7, depthWrite: false }));
    return { plane, smoke, side: [0, -1, 1, -2, 2][i] };
  });

  return {
    animate(time, night) {
      if (flyer) {
        flyer.rotation.z = time / FLYER_TURN * Math.PI * 2;
        for (const pod of pods) pod.rotation.z = -flyer.rotation.z;
      }
      // Flyer: a slow chase of colour round the rims after dark.
      rimLights.visible = night >= .05;
      for (let i = 0; rimLights.visible && i < 64; i++) {
        const wave = .5 + .5 * Math.sin((i % 32) / 32 * Math.PI * 4 - time * 1.5);
        rimLights.setColorAt(i, colour.copy(showColours[Math.floor(time / 20) % showColours.length]).multiplyScalar((.25 + .75 * wave) * night));
      }
      if (rimLights.instanceColor) rimLights.instanceColor.needsUpdate = true;

      // Supertrees: the programme changes every twenty seconds; waves round the rims, colour climbing the trunks, a twinkle.
      const programme = Math.floor(time / 20) % 4, base = showColours[Math.floor(time / 20) % showColours.length], next = showColours[(Math.floor(time / 20) + 2) % showColours.length];
      treeLights.visible = night >= .05;
      if (treeLights.visible) points.forEach((p, i) => {
        let level = .6;
        if (programme === 0) level = .5 + .5 * Math.sin(p.angle * 3 - time * 2 + p.tree);
        else if (programme === 1) level = smooth(1 - Math.abs(((time * .4 + p.tree * .3) % 1.4) - p.band / 3.2) * 3);
        else if (programme === 2) level = (Math.sin(i * 12.9898 + Math.floor(time * 6) * 78.233) * 43758.5453) % 1 > .55 ? 1 : .25;
        else level = .5 + .5 * Math.sin(time * 1.2 + p.tree * 2);
        treeLights.setColorAt(i, colour.copy(base).lerp(next, p.band / 3).multiplyScalar(Math.abs(level) * night));
      });
      if (treeLights.instanceColor) treeLights.instanceColor.needsUpdate = true;
      treeLights.count = points.length; treeLights.instanceMatrix.needsUpdate = true;

      // The bay show, at night only.
      const show = time % BAY_SHOW.every, on = night > .5 && show < BAY_SHOW.length;
      jets.forEach((jet, i) => {
        jet.visible = on; if (!on) return;
        const h = 6 + 26 * Math.abs(Math.sin(time * .9 + i * .55 + Math.sin(time * .2) * 2));
        jet.scale.y = h; jet.position.y = MARINA_WATER + h / 2;
        (jet.material as THREE.MeshBasicMaterial).color.copy(showColours[Math.floor(show / 15) % showColours.length]).lerp(new THREE.Color('#ffffff'), .5);
      });
      lasers.forEach((laser, i) => {
        laser.visible = on; if (!on) return;
        laser.rotation.set(-.9 + Math.sin(time * .5 + i) * .3, 0, (i - 1.5) * .3 + Math.sin(time * .7 + i * 1.7) * .4);
      });
      laserMaterial.color.copy(showColours[Math.floor(show / 15 + 2) % showColours.length]);

      // The flypast, by day: in over the bay from the west, smoke on, out to the east.
      const k = Math.floor(time / FLYPAST.every), u = time - k * FLYPAST.every, flying = night < .5 && u * FLYPAST.speed <= FLYPAST.reach * 2;
      const lead = -FLYPAST.reach + u * FLYPAST.speed;
      for (const { plane, smoke, side } of parade) {
        const x = lead - Math.abs(side) * 18, z = -20 + side * 16, start = -FLYPAST.reach - Math.abs(side) * 18;
        plane.visible = flying; plane.position.set(x, FLYPAST.height, z); plane.rotation.set(0, -Math.PI / 2, 0);
        // The smoke trail stays hanging for a while after they have gone, thinning.
        const trailEnd = Math.min(x, FLYPAST.reach), length = Math.max(0, trailEnd - start), fade = 1 - clamp01((u * FLYPAST.speed - FLYPAST.reach * 2) / FLYPAST.speed / 25);
        smoke.visible = night < .5 && length > 1 && fade > 0 && u < FLYPAST.reach * 2 / FLYPAST.speed + 25;
        smoke.position.set(start + length / 2 - 6, FLYPAST.height - .5, z); smoke.scale.set(length, 1.6 + (1 - fade) * 4, 1.6 + (1 - fade) * 4);
        (smoke.material as THREE.MeshStandardMaterial).opacity = .7 * fade;
      }
    },
    cues: (from, to) => crosses(from, to, FLYPAST.reach / FLYPAST.speed, FLYPAST.every) ? [{ kind: 'flypast', at: { x: 0, y: FLYPAST.height, z: -20 } }] : [],
  };
}
const MARINA_WATER = -0.4;

// ---------------------------------------------------------------- Macaques

/** Where macaques sit: railings, roof edges, platform ends. Heights are found by looking down onto the scene. */
/** [x, z, look down from]: probing from just above the perch keeps tree canopies overhead out of it. */
const MACAQUE_PERCHES: Partial<Record<RegionId, readonly (readonly [number, number, number])[]>> = {
  'upper-thomson': [[-180, 72.4, 4], [-172, 72.4, 4], [-164, 72.4, 4], [-176, -59.6, 4], [-166, -59.6, 4], [-104, -82, 12], [-94, -82, 12], [-84, -82, 12]],
  'bukit-timah': [[92, 118, 9], [104, 118, 9], [98, 142, 9], [90, 128, 3], [106, 136, 3], [96, 124, 3]],
};
export const MACAQUE = { sit: 22, move: 7, troop: 5 } as const;
/** Macaque `n` at `time`: which perch it sits on, or the hop between two; deterministic, so peers agree. */
export function macaqueState(n: number, time: number, perches: number) {
  const span = MACAQUE.sit + MACAQUE.move, offset = n * 9.7, t = time + offset, k = Math.floor(t / span), u = t - k * span;
  const from = (n * 3 + k * (n % 2 ? 1 : perches - 1)) % perches, to = (n * 3 + (k + 1) * (n % 2 ? 1 : perches - 1)) % perches;
  return { from, to, moving: u > MACAQUE.sit, f: u > MACAQUE.sit ? (u - MACAQUE.sit) / MACAQUE.move : 0 };
}
function macaques(kit: Kit, perches: readonly (readonly [number, number, number])[]): SetPiece {
  const fur = kit.lit('#8a7a60', { roughness: .95 }), face = kit.lit('#c9998a', { roughness: .9 }), dark = kit.lit('#5c5040', { roughness: .95 });
  const spots = perches.map(([x, z, top]) => ({ x, y: kit.surface(x, z, top), z }));
  const troop = Array.from({ length: MACAQUE.troop }, (_, n) => {
    const root = kit.group(), body = kit.group(root);
    const torso = kit.sphere(body, 0, 0, 0, .25, fur); torso.scale.set(.42, .38, .62);
    const head = kit.group(body); head.position.set(0, .12, -.32); kit.sphere(head, 0, 0, 0, .13, fur); kit.sphere(head, 0, -.01, -.1, .07, face);
    const tail = kit.cylinder(body, 0, -.05, .55, .025, .6, dark); tail.rotation.x = 1.1;
    const legs = [[-.12, -.2], [.12, -.2], [-.12, .2], [.12, .2]].map(([x, z]) => kit.cylinder(body, x, -.2, z, .04, .3, dark));
    root.scale.setScalar(1.15 + (n % 3) * .12);
    return { root, body, head, legs };
  });
  return {
    animate(time) {
      troop.forEach((m, n) => {
        const s = macaqueState(n, time, spots.length), a = spots[s.from], b = spots[s.to];
        if (!s.moving) {
          // Sitting up: back straight, tail down, the head turning to look about or to groom.
          m.root.position.set(a.x + (n % 2 ? .4 : -.4), a.y + .32, a.z + (n % 3) * .3); m.root.rotation.y = n * 1.3 + Math.sin(time * .1 + n) * .4;
          m.body.rotation.x = -1; m.head.rotation.set(1 + Math.sin(time * .8 + n) * .2, Math.sin(time * .5 + n * 2) * .7, 0);
          m.legs.forEach((leg, i) => { leg.rotation.x = i < 2 ? 1.2 : 0; });
        } else {
          // On the move: four-footed, bounding, a hop up or down between perches.
          const f = s.f, x = a.x + (b.x - a.x) * f, z = a.z + (b.z - a.z) * f, hop = Math.sin(Math.PI * f) * (1 + Math.abs(b.y - a.y) * .3);
          m.root.position.set(x, a.y + (b.y - a.y) * smooth(f) + .3 + hop + Math.abs(Math.sin(time * 9)) * .08, z);
          m.root.rotation.y = Math.atan2(-(b.x - a.x), -(b.z - a.z)); m.body.rotation.x = 0; m.head.rotation.set(0, 0, 0);
          m.legs.forEach((leg, i) => { leg.rotation.x = Math.sin(time * 14 + (i % 2) * Math.PI + (i > 1 ? 1 : 0)) * .7; });
        }
      });
    },
  };
}

// ---------------------------------------------------------------- Wiring

/** Districts with a set piece; the others are left as they were. */
export const SET_PIECE_DISTRICTS: readonly RegionId[] = ['queenstown', 'punggol', 'harbourfront', 'tuas', 'changi', 'woodlands', 'marina-bay', 'upper-thomson', 'bukit-timah'];

/**
 * Adds a district's set pieces to its built world: they run inside the
 * world's own `animate`, and `cues` says what to play between two times.
 */
export function withSetPieces(id: RegionId, world: RegionWorld): RegionWorld {
  if (!SET_PIECE_DISTRICTS.includes(id)) return world;
  const root = new THREE.Group(); root.name = 'district-set-pieces'; root.userData.fpsEffect = true; world.scene.add(root);
  const kit = createKit(world.scene, root), pieces: SetPiece[] = [];
  const add = (piece: SetPiece | null) => { if (piece) pieces.push(piece); };
  if (id === 'queenstown') add(queenstown(world.scene));
  if (id === 'punggol') add(punggol(kit));
  if (id === 'harbourfront') add(harbourfront(kit));
  if (id === 'tuas') add(tuas(kit));
  if (id === 'changi') add(changi(kit));
  if (id === 'woodlands') add(woodlands(kit));
  if (id === 'marina-bay') add(marina(kit, world.scene));
  const perches = MACAQUE_PERCHES[id]; if (perches) add(macaques(kit, perches));
  root.traverse(node => { node.raycast = noRaycast; });
  // Everything starts where the timetable has it at time 0, not heaped at the origin before the first frame.
  for (const piece of pieces) piece.animate(0, 0);
  const base = world.animate.bind(world), dispose = world.dispose.bind(world);
  return {
    ...world,
    animate(time: number) {
      base(time);
      const night = nightOf(world.scene.getObjectByName('world-atmosphere')?.userData.timeOfDay);
      for (const piece of pieces) piece.animate(time, night);
    },
    cues: (from, to) => pieces.flatMap(piece => piece.cues?.(from, to) ?? []),
    dispose() { root.removeFromParent(); kit.dispose(); dispose(); },
  };
}
