import { helicopterGunPoint } from './helicopter-crew';
import type { ArenaTransport } from './combat-transports';
import * as THREE from 'three';
import { combatPhase, combatRandom, combatTimeline, cratePose, flyerPose, orbitPose, transportPose, type CombatEventDescriptor, type MunitionPayload, type TransportPayload } from './combat-events';
import type { ArenaRaider } from './arena-rules';
import { buildVehicleModel } from './vehicle-models';
import { withInstanceOpacity } from './fps-impact-material';

/**
 * Draws combat events from their descriptors: shells and bombs in their last
 * moments of flight, blasts, smoke, craters, danger rings, the transports that
 * bring reinforcements, crossing jets, raid helicopters and drones, mortar
 * pits, supply crates and clouds of smoke or gas. Every pool is fixed at
 * creation; the whole tree carries `fpsEffect` and stops no ray, so the host
 * resolves hits on live raiders, transport hulls and seated drivers separately.
 */

const FIRE = 96, SMOKE = 256, DEBRIS = 96, SHELLS = 24, CRATERS = 40, MARKERS = 18, TRANSPORTS = 3, ROPERS = 6;
const BOMBS = 16, FLYERS = 4, RAIDERS = 2, PITS = 2, CRATES = 2, PUFFS = 192;
/** Shells are drawn at an arcade speed so their last half-second is visible at all. */
const SHELL_SPEED = 120;
/** Bombs are drawn at roughly their real speed: a dark shape you can watch fall for two seconds. */
const BOMB_SPEED = 48;
/** Puffs in one cloud of smoke or gas, and with reduced effects. */
const CLOUD_PUFFS = [18, 8] as const;
const CRATER_LIFE = 60;
const noRaycast = () => {};
export type CombatCast = (origin: THREE.Vector3, direction: THREE.Vector3, far: number) => THREE.Vector3 | null;

interface Particle { x: number; y: number; z: number; vx: number; vy: number; vz: number; age: number; life: number; size: number; grow: number; colour: THREE.Color; spin: number; floor: number;
  /** Upward acceleration: hot or signal smoke climbs, dust settles. */
  lift: number; opacity: number }
function radial(size: number, edge: number) {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const d = Math.min(1, Math.hypot((x + .5) / size * 2 - 1, (y + .5) / size * 2 - 1)), i = (y * size + x) * 4;
    data[i] = data[i + 1] = data[i + 2] = 255; data[i + 3] = Math.round(Math.pow(1 - d, edge) * 255);
  }
  const texture = new THREE.DataTexture(data, size, size); texture.needsUpdate = true; return texture;
}
/** An original troop truck: cab, flatbed and canvas canopy on six wheels. Forward is local -Z. */
function buildTruck() {
  const root = new THREE.Group(), olive = new THREE.MeshStandardMaterial({ color: '#4a5236', roughness: .8 }),
    canvas = new THREE.MeshStandardMaterial({ color: '#5d6045', roughness: .95 }), dark = new THREE.MeshStandardMaterial({ color: '#1d2120', roughness: .85 }),
    glass = new THREE.MeshStandardMaterial({ color: '#809fa0', roughness: .2, metalness: .1, transparent: true, opacity: .22, depthWrite: false });
  root.userData.heat = 'engine';
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, material: THREE.Material) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material); mesh.position.set(x, y, z); root.add(mesh); return mesh;
  };
  box(2.3, .35, 6.6, 0, .95, 0, dark);              // chassis
  box(2.3, .85, 1.8, 0, 1.525, -2.35, olive);
  box(2.3, .15, 1.8, 0, 2.72, -2.35, olive);
  for (const x of [-1.1, 1.1]) { box(.1, .75, .12, x, 2.25, -3.17, olive); box(.1, .75, .12, x, 2.25, -1.5, olive); box(.04, .65, 1.55, x, 2.25, -2.35, glass); }
  box(2.1, .65, .06, 0, 2.3, -3.26, glass);
  box(.7, .18, .65, .55, 1.5, -2.4, dark); box(.7, .7, .15, .55, 1.85, -2.05, dark);
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(.23, .035, 6, 16), dark); wheel.position.set(.55, 2.03, -2.98); wheel.rotation.x = -.4; root.add(wheel);
  box(2.4, .5, 4.4, 0, 1.4, 1.05, olive);           // bed
  box(2.4, 1.6, 4.3, 0, 2.45, 1.1, canvas);         // canopy
  for (const z of [-2.3, .6, 2.1]) for (const x of [-1.15, 1.15]) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(.52, .52, .4, 12), dark); wheel.rotation.z = Math.PI / 2; wheel.position.set(x, .52, z); root.add(wheel);
  }
  return root;
}

/** Open the upper nose under the glazing so the seated pilot can actually be seen. */
function buildTransportHelicopter() {
  const model = buildVehicleModel('helicopter');
  const shell = model.children.find(n => n instanceof THREE.Mesh && n.geometry instanceof THREE.SphereGeometry) as THREE.Mesh | undefined;
  if (shell) {
    const geometry = shell.geometry.toNonIndexed(), positions = geometry.getAttribute('position'), kept: number[] = [];
    for (let i = 0; i < positions.count; i += 3) {
      const y = (positions.getY(i) + positions.getY(i + 1) + positions.getY(i + 2)) / 3;
      const x = (positions.getX(i) + positions.getX(i + 1) + positions.getX(i + 2)) / 3;
      const z = (positions.getZ(i) + positions.getZ(i + 1) + positions.getZ(i + 2)) / 3;
      if (y > -.3 && (z < -.25 || Math.abs(x) > .55 && z < .8)) continue;
      kept.push(i, i + 1, i + 2);
    }
    geometry.setIndex(kept); shell.geometry.dispose(); shell.geometry = geometry;
  }
  const dark = new THREE.MeshStandardMaterial({ color: '#252a26', roughness: .8 });
  for (const [w, h, d, x, y, z] of [[.65, .18, .7, .45, 1.2, -1.6], [.65, .7, .15, .45, 1.6, -1.25], [.07, .55, .07, .45, 1.55, -1.95]]) {
    const part = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), dark); part.position.set(x, y, z); model.add(part);
  }
  // Side benches and a cabin floor give exposed rifle passengers actual seats.
  for (const x of [-1, 1]) {
    const bench = new THREE.Mesh(new THREE.BoxGeometry(.8, .16, .75), dark); bench.position.set(x, 1.1, .2); model.add(bench);
  }
  const floor = new THREE.Mesh(new THREE.BoxGeometry(2.2, .1, 1.8), dark); floor.position.set(0, 1.02, .25); model.add(floor);
  return model;
}

/** An original fast jet: fuselage, delta wing, fin. Forward is local -Z. */
export function buildJet() {
  const root = new THREE.Group(), skin = new THREE.MeshStandardMaterial({ color: '#7b8590', roughness: .5, metalness: .3 }), dark = new THREE.MeshStandardMaterial({ color: '#2b3036', roughness: .4 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(.75, .55, 13, 10), skin); body.rotation.x = Math.PI / 2; root.add(body);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(.75, 3, 10), skin); nose.rotation.x = -Math.PI / 2; nose.position.z = -8; root.add(nose);
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(.55, 8, 6), dark); canopy.scale.set(1, .7, 2.2); canopy.position.set(0, .6, -4); root.add(canopy);
  const wing = new THREE.Shape(); wing.moveTo(0, -2.5); wing.lineTo(6.5, 3.5); wing.lineTo(-6.5, 3.5); wing.closePath();
  const wings = new THREE.Mesh(new THREE.ExtrudeGeometry(wing, { depth: .18, bevelEnabled: false }), skin); wings.rotation.x = Math.PI / 2; wings.position.set(0, 0, 0); root.add(wings);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(.15, 2.4, 2.6), skin); fin.position.set(0, 1.4, 5.4); root.add(fin);
  return root;
}
/** An original four-engined cargo aircraft, high wing and a raised tail. Forward is local -Z. */
function buildCargo() {
  const root = new THREE.Group(), skin = new THREE.MeshStandardMaterial({ color: '#6c7568', roughness: .7 }), dark = new THREE.MeshStandardMaterial({ color: '#2a2f2b', roughness: .6 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 1.7, 24, 12), skin); body.rotation.x = Math.PI / 2; root.add(body);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(1.9, 12, 8), skin); nose.scale.set(1, .95, 1.6); nose.position.z = -12; root.add(nose);
  const wing = new THREE.Mesh(new THREE.BoxGeometry(32, .35, 3.6), skin); wing.position.set(0, 1.5, -1.5); root.add(wing);
  for (const x of [-10, -5, 5, 10]) { const pod = new THREE.Mesh(new THREE.CylinderGeometry(.5, .5, 2.6, 8), dark); pod.rotation.x = Math.PI / 2; pod.position.set(x, 1, -3); root.add(pod); }
  const tail = new THREE.Mesh(new THREE.BoxGeometry(11, .25, 2.4), skin); tail.position.set(0, 3, 11.5); root.add(tail);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(.3, 5, 3.2), skin); fin.position.set(0, 3.6, 11); root.add(fin);
  return root;
}
/** An original quadcopter with small navigation lamps visible from the ground. */
function buildDrone() {
  const root = new THREE.Group(), shell = new THREE.MeshStandardMaterial({ color: '#2a2e2c', roughness: .6 }), blade = new THREE.MeshBasicMaterial({ color: '#111', transparent: true, opacity: .45 });
  root.add(new THREE.Mesh(new THREE.BoxGeometry(.42, .16, .62), shell));
  const warhead = new THREE.Mesh(new THREE.CylinderGeometry(.09, .12, .5, 8), new THREE.MeshStandardMaterial({ color: '#59604e', roughness: .7 })); warhead.rotation.x = Math.PI / 2; warhead.position.set(0, -.14, -.05); root.add(warhead);
  for (const angle of [Math.PI / 4, -Math.PI / 4]) { const arm = new THREE.Mesh(new THREE.BoxGeometry(1.15, .04, .06), shell); arm.rotation.y = angle; root.add(arm); }
  for (const [x, z] of [[.4, .4], [-.4, .4], [.4, -.4], [-.4, -.4]]) { const rotor = new THREE.Mesh(new THREE.CylinderGeometry(.24, .24, .01, 14), blade); rotor.position.set(x, .06, z); root.add(rotor); }
  // Steady underside lamps stay visible between warning blinks. Their small,
  // depth-tested halos give the NVG's normal gain a signal without lighting terrain.
  const glow = radial(32, 2), lampGeometry = new THREE.SphereGeometry(.055, 6, 4);
  for (const [name, colour, x, y, z] of [
    ['port', '#ff6552', -.4, -.035, -.4],
    ['starboard', '#70ffa0', .4, -.035, -.4],
    ['tail', '#fff0cc', 0, -.13, .3],
  ] as const) {
    const lamp = new THREE.Mesh(lampGeometry, new THREE.MeshBasicMaterial({ color: colour, toneMapped: false }));
    lamp.name = `drone-nav-${name}`; lamp.position.set(x, y, z); root.add(lamp);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: colour, opacity: .45,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    halo.name = `drone-nav-${name}-glow`; halo.position.copy(lamp.position); halo.scale.setScalar(.34); root.add(halo);
  }
  const light = new THREE.Mesh(new THREE.SphereGeometry(.05, 6, 4), new THREE.MeshBasicMaterial({ color: '#ff3a2a', toneMapped: false })); light.name = 'drone-light'; light.position.set(0, .1, -.32); root.add(light);
  return root;
}
/** A mortar on its baseplate with a bipod, the tube leaning toward local -Z. */
function buildMortar() {
  const root = new THREE.Group(), steel = new THREE.MeshStandardMaterial({ color: '#3b4136', roughness: .6, metalness: .3 });
  const plate = new THREE.Mesh(new THREE.CylinderGeometry(.38, .42, .06, 12), steel); plate.position.y = .03; root.add(plate);
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(.055, .065, 1.15, 10), steel); tube.position.set(0, .55, -.25); tube.rotation.x = -.5; root.add(tube);
  for (const x of [-.22, .22]) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(.015, .015, .85, 5), steel); leg.position.set(x, .38, -.55); leg.rotation.set(.35, 0, x > 0 ? -.3 : .3); root.add(leg); }
  return root;
}
/** A supply crate under its canopy. The canopy is named so it can collapse on landing. */
function buildCrate() {
  const root = new THREE.Group(), wood = new THREE.MeshStandardMaterial({ color: '#4f5a3c', roughness: .85 }), strap = new THREE.MeshStandardMaterial({ color: '#c8b04a', roughness: .7 });
  const box = new THREE.Mesh(new THREE.BoxGeometry(1, .75, 1), wood); box.position.y = .375; root.add(box);
  for (const x of [-.25, .25]) { const band = new THREE.Mesh(new THREE.BoxGeometry(.08, .77, 1.02), strap); band.position.set(x, .375, 0); root.add(band); }
  const canopy = new THREE.Group(); canopy.name = 'crate-canopy'; root.add(canopy);
  const cloth = new THREE.Mesh(new THREE.SphereGeometry(3.2, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#d0bf8e', roughness: .9, side: THREE.DoubleSide }));
  cloth.scale.y = .55; cloth.position.y = 6; canopy.add(cloth);
  const points: number[] = [];
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; points.push(Math.cos(a) * .45, .75, Math.sin(a) * .45, Math.cos(a) * 3.1, 6, Math.sin(a) * 3.1); }
  const lines = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(points, 3)), new THREE.LineBasicMaterial({ color: '#2d2a22' }));
  canopy.add(lines);
  return root;
}
/** A dark utility gunship with an exposed cockpit, open rifle positions and the fleet chin mount. */
function buildGunship() {
  const root = buildTransportHelicopter();
  root.traverse(node => {
    if (!(node instanceof THREE.Mesh)) return;
    node.material = (Array.isArray(node.material) ? node.material : [node.material]).map(m => {
      const paint = m.clone(); if (!paint.transparent && 'color' in paint && paint.color instanceof THREE.Color) paint.color.multiplyScalar(.42); return paint;
    });
    if (Array.isArray(node.material) && node.material.length === 1) node.material = node.material[0];
  });
  return root;
}
/** Every drawable's owned geometry, materials and textures, for a model built on demand. */
function ownership(model: THREE.Object3D, geometries: THREE.BufferGeometry[], materials: THREE.Material[], textures: THREE.Texture[]) {
  model.traverse(node => {
    node.raycast = noRaycast;
    if (node instanceof THREE.Mesh || node instanceof THREE.LineSegments) {
      geometries.push(node.geometry);
    }
    if (node instanceof THREE.Mesh || node instanceof THREE.LineSegments || node instanceof THREE.Sprite) {
      (Array.isArray(node.material) ? node.material : [node.material]).forEach((m: THREE.Material) => { materials.push(m); if ('map' in m && m.map instanceof THREE.Texture) textures.push(m.map); });
    }
  });
}
const hashText = (text: string) => { let h = 2166136261; for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619); return h >>> 0; };
/** What the renderer saw happen to raiders this frame, for the engine to play. */
export interface RaiderHappenings { shots: THREE.Vector3[]; blasts: { at: THREE.Vector3; size: number }[] }

export function createCombatEventVisuals(scene: THREE.Scene, cast: CombatCast, options: { reduced: () => boolean }) {
  const root = new THREE.Group(); root.name = 'combat-events'; root.userData.fpsEffect = true; scene.add(root);
  const geometries: THREE.BufferGeometry[] = [], materials: THREE.Material[] = [], textures: THREE.Texture[] = [radial(64, 1.4), radial(64, .7)];
  const [soft, blot] = textures;
  const keep = <T extends THREE.BufferGeometry>(g: T) => { geometries.push(g); return g; };
  const hold = <T extends THREE.Material>(m: T) => { materials.push(m); return m; };
  const pool = (geometry: THREE.BufferGeometry, material: THREE.Material, count: number, name: string) => {
    const mesh = new THREE.InstancedMesh(geometry, material, count); mesh.name = name; mesh.frustumCulled = false; mesh.raycast = noRaycast;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.count = 0; root.add(mesh); return mesh;
  };
  const opacityPool = (count: number) => {
    const geometry = keep(new THREE.PlaneGeometry(1, 1)), opacity = new THREE.InstancedBufferAttribute(new Float32Array(count), 1).setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('effectOpacity', opacity); return { geometry, opacity };
  };
  const fireMesh = pool(keep(new THREE.PlaneGeometry(1, 1)), hold(new THREE.MeshBasicMaterial({ map: soft, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })), FIRE, 'combat-fire');
  const smokeQuad = opacityPool(SMOKE);
  const smokeMesh = pool(smokeQuad.geometry, hold(withInstanceOpacity(new THREE.MeshBasicMaterial({ map: soft, transparent: true, depthWrite: false }))), SMOKE, 'combat-smoke');
  const debrisMesh = pool(keep(new THREE.BoxGeometry(1, 1, 1)), hold(new THREE.MeshBasicMaterial({ color: '#ffffff' })), DEBRIS, 'combat-debris');
  const shellMesh = pool(keep(new THREE.BoxGeometry(.18, .18, 1)), hold(new THREE.MeshBasicMaterial({ color: '#ffd59a', transparent: true, opacity: .9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })), SHELLS, 'combat-shells');
  const craterQuad = opacityPool(CRATERS);
  const craterMesh = pool(craterQuad.geometry, hold(withInstanceOpacity(new THREE.MeshBasicMaterial({ color: '#1b1612', map: blot, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }))), CRATERS, 'combat-craters');
  const flash = new THREE.PointLight('#ffb35c', 0, 60, 1.6); root.add(flash);

  const ringGeometry = keep(new THREE.RingGeometry(.94, 1, 72));
  const markers = Array.from({ length: MARKERS }, () => {
    const material = hold(new THREE.MeshBasicMaterial({ color: '#ff4a3a', transparent: true, opacity: 0, side: THREE.DoubleSide, forceSinglePass: true, depthWrite: false }));
    const mesh = new THREE.Mesh(ringGeometry, material); mesh.name = 'combat-danger-ring'; mesh.rotation.x = -Math.PI / 2; mesh.visible = false; mesh.raycast = noRaycast; root.add(mesh);
    return { mesh, material };
  });
  const ropeGeometry = keep(new THREE.BufferGeometry()); ropeGeometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(TRANSPORTS * 2 * 2 * 3), 3));
  const ropes = new THREE.LineSegments(ropeGeometry, hold(new THREE.LineBasicMaterial({ color: '#1a1714' }))); ropes.frustumCulled = false; ropes.raycast = noRaycast; root.add(ropes);
  const roperMesh = pool(keep(new THREE.CapsuleGeometry(.24, 1.1, 3, 6)), hold(new THREE.MeshStandardMaterial({ color: '#3f4632', roughness: .9 })), ROPERS, 'combat-ropers');
  const bombMesh = pool(keep(new THREE.CapsuleGeometry(.22, 1.2, 3, 8)), hold(new THREE.MeshStandardMaterial({ color: '#2c302b', roughness: .6 })), BOMBS, 'combat-bombs');
  const puffQuad = opacityPool(PUFFS);
  const puffMesh = pool(puffQuad.geometry, hold(withInstanceOpacity(new THREE.MeshBasicMaterial({ map: soft, transparent: true, depthWrite: false }))), PUFFS, 'combat-clouds');

  // Models that most matches never see are built the first time they are needed, up to a fixed count each.
  type Prop = { model: THREE.Group; owner: string; extra?: Record<string, number> };
  const props: Record<'jet' | 'cargo' | 'gunship' | 'drone' | 'mortar' | 'crate', Prop[]> = { jet: [], cargo: [], gunship: [], drone: [], mortar: [], crate: [] };
  const limits = { jet: FLYERS, cargo: 1, gunship: RAIDERS, drone: RAIDERS, mortar: PITS, crate: CRATES };
  const builders = { jet: buildJet, cargo: buildCargo, gunship: buildGunship, drone: buildDrone, mortar: buildMortar, crate: buildCrate };
  const used = new Set<Prop>();
  function prop(kind: keyof typeof props, owner: string) {
    const list = props[kind];
    let slot = list.find(p => p.owner === owner) ?? list.find(p => !p.owner);
    if (!slot && list.length < limits[kind]) {
      const model = builders[kind](); ownership(model, geometries, materials, textures); model.visible = false; root.add(model);
      slot = { model, owner: '' }; list.push(slot);
    }
    if (slot) { slot.owner = owner; slot.model.visible = true; used.add(slot); }
    return slot;
  }
  /** Last frame's raider states and shot counts, so a change can be drawn once. */
  const seenTransports = new Map<string, number>();
  const seenRaiders = new Map<string, { state: string; shots: number }>();
  const trail = new THREE.Color('#2f2d2a');

  // Transport models are built on first use: most matches never see one of each.
  const fleet: Record<'land' | 'air', { model: THREE.Group; rotor?: THREE.Object3D; tail?: THREE.Object3D; ground: number; groundAt: number; owner: string }[]> = { land: [], air: [] };
  function vehicle(mode: 'land' | 'air', owner: string) {
    const list = fleet[mode];
    let slot = list.find(v => v.owner === owner) ?? list.find(v => !v.owner);
    if (!slot && list.length < TRANSPORTS) {
      const model = mode === 'land' ? buildTruck() : buildTransportHelicopter();
      model.traverse(node => {
        node.raycast = noRaycast;
        if (node instanceof THREE.Mesh) { geometries.push(node.geometry); (Array.isArray(node.material) ? node.material : [node.material]).forEach(m => { materials.push(m); if ('map' in m && m.map instanceof THREE.Texture) textures.push(m.map); }); }
      });
      model.visible = false; root.add(model);
      slot = { model, rotor: model.getObjectByName('main-rotor'), tail: model.getObjectByName('tail-rotor'), ground: 0, groundAt: -Infinity, owner: '' };
      list.push(slot);
    }
    if (slot) slot.owner = owner;
    return slot;
  }

  const fire: Particle[] = [], smoke: Particle[] = [], debris: Particle[] = [];
  const craters: { x: number; y: number; z: number; size: number; age: number }[] = [];
  const emitters: { x: number; y: number; z: number; colour: THREE.Color; until: number; next: number; rate: number }[] = [];
  let clock = 0;
  const landings = new Map<string, THREE.Vector3>();
  const origin = new THREE.Vector3(), direction = new THREE.Vector3(), down = new THREE.Vector3(0, -1, 0);
  /** Where a munition meets the world, cast once along its own path and remembered. */
  function landingOf(event: CombatEventDescriptor, payload: MunitionPayload) {
    const key = `${event.id}/${payload.id}`;
    let point = landings.get(key);
    if (!point) {
      const { descent, impact } = payload, height = 150, length = height / -descent.y;
      direction.set(descent.x, descent.y, descent.z);
      origin.set(impact.x - descent.x * length, height, impact.z - descent.z * length);
      point = cast(origin, direction, length + 2)?.clone() ?? new THREE.Vector3(impact.x, 0, impact.z);
      landings.set(key, point);
      if (landings.size > 400) landings.delete(landings.keys().next().value!);
    }
    return point;
  }
  function groundAt(x: number, z: number) { return cast(origin.set(x, 120, z), down, 200)?.y ?? 0; }
  /** The ground under a point an event keeps coming back to, cast once and remembered with its landings. */
  function groundOnce(key: string, x: number, z: number) {
    let point = landings.get(key);
    if (!point) { point = new THREE.Vector3(x, groundAt(x, z), z); landings.set(key, point); }
    return point.y;
  }

  function add(list: Particle[], capacity: number, particle: Particle) { if (list.length >= capacity) list.shift(); list.push(particle); }
  function particle(at: THREE.Vector3, spread: number, up: number, life: number, size: number, grow: number, colour: THREE.Color): Particle {
    const angle = Math.random() * Math.PI * 2, out = Math.random() * spread;
    return { x: at.x, y: at.y, z: at.z, vx: Math.cos(angle) * out, vy: up * (.5 + Math.random() * .5), vz: Math.sin(angle) * out, age: 0, life: life * (.7 + Math.random() * .6), size, grow, colour, spin: Math.random() * 6, floor: at.y, lift: 0, opacity: .85 };
  }
  const dust = new THREE.Color('#857762'), soot = new THREE.Color('#3a3530'), chunk = new THREE.Color('#2c2620'), wash = new THREE.Color('#a69a80');
  /** A shell landing: fireball, smoke, thrown dirt, a crater and a flash. `size` 1 is an artillery round. */
  function blast(at: THREE.Vector3, size = 1) {
    const scale = options.reduced() ? .45 : 1;
    for (let i = 0; i < Math.round(14 * scale); i++) add(fire, FIRE, particle(at, 7 * size, 6 * size, .55, 1.6 * size, 5 * size, new THREE.Color('#ffd28a')));
    for (let i = 0; i < Math.round(18 * scale); i++) {
      const cloud = particle(at, 4 * size, 3.5 * size, 4.5, 2.4 * size, 2.2 * size, (i % 3 ? dust : soot).clone());
      cloud.lift = .4; add(smoke, SMOKE, cloud);
    }
    for (let i = 0; i < Math.round(14 * scale); i++) {
      const p = particle(at, 9 * size, 11 * size, 2.2, .18 + Math.random() * .22, 0, chunk); p.y += .2; add(debris, DEBRIS, p);
    }
    craters.push({ x: at.x, y: at.y, z: at.z, size: 3.2 * size * (.85 + Math.random() * .3), age: 0 }); if (craters.length > CRATERS) craters.shift();
    flash.position.set(at.x, at.y + 2, at.z); flash.intensity = 60 * size;
  }
  /** A spotting round: no damage, a column of coloured smoke that lingers. */
  function spot(at: THREE.Vector3, colour: string) {
    add(fire, FIRE, particle(at, 2, 2, .3, 1, 2, new THREE.Color('#ffcf99')));
    emitters.push({ x: at.x, y: at.y, z: at.z, colour: new THREE.Color(colour), until: clock + 9, next: clock, rate: options.reduced() ? .35 : .14 });
    if (emitters.length > 6) emitters.shift();
  }

  const matrix = new THREE.Matrix4(), quaternion = new THREE.Quaternion(), position = new THREE.Vector3(), scale = new THREE.Vector3(), colour = new THREE.Color();
  const flat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2), roll = new THREE.Quaternion(), zAxis = new THREE.Vector3(0, 0, 1);
  const fireHot = new THREE.Color('#fff1c4'), fireMid = new THREE.Color('#ff8a2a'), fireCool = new THREE.Color('#3a0e00');
  const ropeTop = new THREE.Vector3();

  function step(list: Particle[], dt: number, gravity: number, drag: number) {
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i]; p.age += dt;
      if (p.age >= p.life) { list.splice(i, 1); continue; }
      const damp = Math.exp(-drag * dt);
      p.vx *= damp; p.vz *= damp; p.vy = p.vy * damp + (p.lift - gravity) * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (gravity > 0 && p.y < p.floor) { p.y = p.floor; p.vy *= -.25; p.vx *= .5; p.vz *= .5; }
      p.spin += dt * 4;
    }
  }

  const cameraQuaternion = new THREE.Quaternion(), yAxis = new THREE.Vector3(0, -1, 0), gunAt = new THREE.Vector3();
  /**
   * Drones from the host's positions, smoothed; the door gun's muzzle and the
   * moment a raider bursts or hits the ground. Returns what happened, for sound.
   */
  function drawRaiders(raiders: readonly ArenaRaider[], dt: number): RaiderHappenings {
    const happened: RaiderHappenings = { shots: [], blasts: [] }, present = new Set<string>();
    for (const r of raiders) {
      present.add(r.event);
      const seen = seenRaiders.get(r.event) ?? { state: r.state, shots: r.shots };
      if (r.kind === 'drone' && r.state !== 'exploded' && r.state !== 'wreck') {
        const v = prop('drone', r.event);
        if (v) {
          const fresh = !v.extra; v.extra ??= { spin: 0 };
          if (fresh) v.model.position.set(r.x, r.y, r.z); else v.model.position.lerp(position.set(r.x, r.y, r.z), 1 - Math.exp(-14 * dt));
          v.model.rotation.set(r.state === 'dive' ? -.7 : r.state === 'down' ? clock * 7 : 0, r.yaw, 0);
          const light = v.model.getObjectByName('drone-light');
          // Slow blink circling, frantic once locked, steady in the dive.
          if (light) light.visible = r.state === 'dive' || Math.sin(clock * (r.state === 'lock' ? 50 : 9)) > 0;
        }
      }
      if (r.state === 'down' && !options.reduced() && Math.random() < dt * 30) {
        const puff = particle(position.set(r.x, r.y + .6, r.z), .6, .5, 2.2, r.kind === 'gunship' ? 1.6 : .5, 1.4, trail); puff.lift = .6; add(smoke, SMOKE, puff);
      }
      if (seen.state !== r.state && (r.state === 'exploded' || (r.state === 'wreck' && r.kind === 'gunship'))) {
        const at = new THREE.Vector3(r.x, r.y, r.z), size = r.kind === 'gunship' ? 1.4 : .75;
        blast(at, size); happened.blasts.push({ at, size });
        if (r.kind === 'gunship') emitters.push({ x: r.x, y: r.y, z: r.z, colour: trail.clone(), until: clock + 20, next: clock, rate: options.reduced() ? .4 : .12 });
      }
      if (r.kind === 'gunship' && r.shots > seen.shots && r.aim) {
        const muzzle = helicopterGunPoint(r); gunAt.set(muzzle.x, muzzle.y, muzzle.z);
        // The rounds themselves fly in the snapshot and are drawn with everyone else's; this is the muzzle and the sound.
        for (let n = 0; n < Math.min(3, r.shots - seen.shots); n++) happened.shots.push(gunAt.clone());
      }
      seenRaiders.set(r.event, { state: r.state, shots: r.shots });
    }
    for (const id of seenRaiders.keys()) if (!present.has(id)) seenRaiders.delete(id);
    return happened;
  }

  function update(dt: number, events: readonly CombatEventDescriptor[], time: number, camera: THREE.Camera, raiders: readonly ArenaRaider[] = [], transports: readonly ArenaTransport[] = []): RaiderHappenings {
    clock += dt;
    // Lingering signal smoke from spotting rounds and downwash dust under a hovering helicopter.
    for (let i = emitters.length - 1; i >= 0; i--) {
      const e = emitters[i]; if (clock > e.until) { emitters.splice(i, 1); continue; }
      // Signal smoke: a thin, buoyant column that leans downwind as it climbs.
      while (e.next <= clock) {
        e.next += e.rate;
        const puff = particle(position.set(e.x, e.y + .3, e.z), .5, 1.5, 6.5, .9, 1.4, e.colour);
        puff.lift = 1.1; puff.vx += .9; puff.opacity = .6; add(smoke, SMOKE, puff);
      }
    }
    let shells = 0, ropeLines = 0, ropers = 0, bombs = 0, puffs = 0;
    used.clear();
    const reduced = options.reduced();
    const live = new Set<string>(), ropeArray = ropeGeometry.getAttribute('position') as THREE.BufferAttribute;
    markers.forEach(m => { m.mesh.visible = false; });
    let marker = 0;
    camera.getWorldQuaternion(cameraQuaternion);
    for (const event of events) {
      if (combatPhase(event, time) === 'done') continue;
      const age = time - event.start;
      if (event.kind === 'mortar' && event.origin) {
        const pit = prop('mortar', event.id);
        if (pit) { pit.model.position.set(event.origin.x, groundOnce(`${event.id}/pit`, event.origin.x, event.origin.z), event.origin.z); pit.model.rotation.set(0, event.heading, 0); }
      }
      if (event.kind === 'helicopter-raid') {
        const orbit = combatTimeline(event).find(p => p.type === 'orbit');
        const live = raiders.find(r => r.event === event.id);
        // A flying raid is drawn from its own pure path; one coming down follows the host.
        const falling = live && ['down', 'wreck', 'landing', 'landed'].includes(live.state);
        const pose = orbit?.type === 'orbit' && !falling ? orbitPose(orbit, age, event.altitude ?? 40) : null;
        if ((pose?.visible || falling) && live) {
          const v = prop('gunship', event.id);
          if (v) {
            const smoothing = 1 - Math.exp(-12 * dt);
            if (pose) { v.model.position.set(pose.x, pose.y, pose.z); v.model.rotation.set(0, pose.yaw, 0); }
            else { v.model.position.lerp(position.set(live.x, live.y, live.z), smoothing); v.model.rotation.set(live.state === 'wreck' ? .25 : 0, live.yaw, live.state === 'wreck' ? .4 : 0); }
            const rotor = v.model.getObjectByName('main-rotor'), tail = v.model.getObjectByName('tail-rotor');
            if (rotor && live.state !== 'wreck' && live.state !== 'landed') rotor.rotation.y += dt * 38;
            if (tail && live.state !== 'wreck' && live.state !== 'landed') tail.rotation.x += dt * 60;
            const turret = v.model.getObjectByName('vehicle-turret');
            if (turret && live.aim) {
              const mount = helicopterGunPoint(live), dx = live.aim.x - mount.x, dy = live.aim.y - mount.y, dz = live.aim.z - mount.z;
              turret.rotation.set(Math.max(-1.05, Math.min(.65, Math.atan2(dy, Math.hypot(dx, dz)))), Math.atan2(-dx, -dz) - live.yaw, 0);
            }
            v.model.updateMatrixWorld(true);
          }
        }
      }
      for (const payload of combatTimeline(event)) {
        if (payload.type === 'munition') {
          const remaining = payload.time - age, bomb = payload.kind === 'bomb';
          if (remaining <= 0 || remaining > Math.min(payload.flight, bomb ? 2.5 : .9)) continue;
          if (bomb ? bombs >= BOMBS : shells >= SHELLS) continue;
          const at = landingOf(event, payload), speed = bomb ? BOMB_SPEED : SHELL_SPEED;
          position.set(at.x - payload.descent.x * speed * remaining, at.y - payload.descent.y * speed * remaining, at.z - payload.descent.z * speed * remaining);
          roll.setFromUnitVectors(zAxis, direction.set(payload.descent.x, payload.descent.y, payload.descent.z));
          if (bomb) { quaternion.setFromUnitVectors(yAxis, direction); bombMesh.setMatrixAt(bombs++, matrix.compose(position, quaternion, scale.set(1, 1, 1))); }
          else shellMesh.setMatrixAt(shells++, matrix.compose(position, roll, scale.set(1, 1, payload.kind === 'shell' || !payload.kind ? 7 : 3.5)));
        } else if (payload.type === 'flyer') {
          const pose = flyerPose(payload, age); if (!pose.visible) continue;
          const v = prop(payload.model, `${event.id}/${payload.id}`); if (!v) continue;
          v.model.position.set(pose.x, groundOnce(`${event.id}/ground`, event.target.x, event.target.z) + pose.y, pose.z); v.model.rotation.set(0, pose.yaw, 0);
        } else if (payload.type === 'crate') {
          const pose = cratePose(payload, age);
          // Carried off by a patrol: it goes when they take it.
          if (!pose.visible || (event.outcome === 'secured' && event.ended !== undefined && time >= event.ended)) continue;
          const v = prop('crate', event.id); if (!v) continue;
          const ground = groundOnce(`${event.id}/crate`, payload.at.x, payload.at.z);
          v.model.position.set(pose.x, ground + pose.y, pose.z); v.model.rotation.set(0, (event.seed % 628) / 100, 0);
          const canopy = v.model.getObjectByName('crate-canopy');
          if (canopy) {
            // On landing the canopy sags and slides off to one side, then is gone.
            const settle = Math.max(0, Math.min(1, (age - payload.land) / 1.6));
            canopy.visible = settle < 1; canopy.scale.set(1 + settle * .3, 1 - settle * .95, 1 + settle * .3); canopy.position.x = settle * 2.5;
            if (!pose.landed) canopy.rotation.z = Math.sin(clock * 1.3) * .05;
          }
        } else if (payload.type === 'cloud') {
          if (age < payload.from || age > payload.until) continue;
          const key = `${event.id}/cloud${payload.id}`, ground = groundOnce(key, payload.center.x, payload.center.z);
          const fade = Math.min(1, (age - payload.from) / 2.5) * Math.min(1, (payload.until - age) / 4);
          const random = combatRandom(hashText(key)), count = CLOUD_PUFFS[reduced ? 1 : 0];
          colour.set(payload.colour);
          for (let k = 0; k < count && puffs < PUFFS; k++) {
            const a = random() * Math.PI * 2, r = Math.sqrt(random()) * payload.radius * .8, rise = .8 + random() * 3.6, size = payload.radius * (.55 + random() * .45);
            const drift = Math.sin(clock * .25 + k) * .7;
            position.set(payload.center.x + Math.cos(a) * r + drift, ground + rise + Math.sin(clock * .4 + k) * .2, payload.center.z + Math.sin(a) * r);
            puffMesh.setColorAt(puffs, colour); puffQuad.opacity.setX(puffs, fade * .78);
            puffMesh.setMatrixAt(puffs++, matrix.compose(position, cameraQuaternion, scale.setScalar(size)));
          }
        } else if (payload.type === 'marker' && marker < MARKERS && age >= payload.from && age <= payload.until) {
          const m = markers[marker++], y = groundOnce(`${event.id}/${payload.id}/marker`, payload.center.x, payload.center.z);
          m.mesh.position.set(payload.center.x, y + .12, payload.center.z); m.mesh.scale.setScalar(payload.radius); m.mesh.visible = true;
          m.material.color.set(payload.colour); m.material.opacity = (.35 + .25 * Math.sin(clock * 6)) * Math.min(1, (payload.until - age) / 1.5);
        } else if (payload.type === 'transport') {
          const active = transports.find(t => t.event === event.id);
          drawTransport(event, payload, age, dt, live, active);
          if (payload.mode === 'air') {
            const v = fleet.air.find(s => s.owner === event.id);
            const roping = (!active || active.state === 'unloading') && age >= payload.arrive + .5 && age <= payload.depart - .4;
            if (v && roping && ropeLines < TRANSPORTS * 2) for (const side of [-1, 1]) {
              ropeTop.set(side * 1.3, 1.1, -.3).applyMatrix4(v.model.matrixWorld);
              ropeArray.setXYZ(ropeLines * 2, ropeTop.x, ropeTop.y, ropeTop.z); ropeArray.setXYZ(ropeLines * 2 + 1, ropeTop.x, v.ground + .1, ropeTop.z); ropeLines++;
            }
            if (v && roping && !options.reduced() && Math.random() < dt * 14)
              add(smoke, SMOKE, particle(position.set(payload.drop.x + (Math.random() - .5) * 8, v.ground + .2, payload.drop.z + (Math.random() - .5) * 8), 6, .8, 1.6, 1.6, 2.4, wash));
            // Troops slide the last stretch of rope just before they are on the ground.
            if (v && roping) for (const insert of combatTimeline(event)) {
              if (insert.type !== 'insert' || ropers >= ROPERS) continue;
              const until = insert.time - age; if (until <= 0 || until > 1.2) continue;
              const side = insert.slot % 2 ? -1 : 1, top = ropeTop.set(side * 1.3, 1.1, -.3).applyMatrix4(v.model.matrixWorld);
              position.set(top.x, v.ground + .8 + (top.y - v.ground - .8) * until / 1.2, top.z);
              roperMesh.setMatrixAt(ropers++, matrix.compose(position, quaternion.identity(), scale.set(1, 1, 1)));
            }
          }
        }
      }
    }
    camera.getWorldQuaternion(quaternion);
    for (const mode of ['land', 'air'] as const) for (const v of fleet[mode]) if (!live.has(v.owner)) { v.owner = ''; v.model.visible = false; }
    const happened = drawRaiders(raiders, dt);
    for (const list of Object.values(props)) for (const p of list) if (!used.has(p)) { p.owner = ''; p.model.visible = false; }
    bombMesh.count = bombs; bombMesh.instanceMatrix.needsUpdate = true;
    puffMesh.count = puffs; puffMesh.instanceMatrix.needsUpdate = true; puffQuad.opacity.needsUpdate = true; if (puffMesh.instanceColor) puffMesh.instanceColor.needsUpdate = true;
    shellMesh.count = shells; shellMesh.instanceMatrix.needsUpdate = true;
    roperMesh.count = ropers; roperMesh.instanceMatrix.needsUpdate = true;
    ropeGeometry.setDrawRange(0, ropeLines * 2); ropeArray.needsUpdate = true; ropes.visible = ropeLines > 0;

    step(fire, dt, -1.5, 2.5); step(smoke, dt, 0, 1.1); step(debris, dt, 18, .2);
    fire.forEach((p, i) => {
      const t = p.age / p.life;
      colour.copy(t < .3 ? fireHot.clone().lerp(fireMid, t / .3) : fireMid.clone().lerp(fireCool, (t - .3) / .7)).multiplyScalar(1 - t * .6);
      fireMesh.setColorAt(i, colour);
      fireMesh.setMatrixAt(i, matrix.compose(position.set(p.x, p.y, p.z), quaternion, scale.setScalar(p.size + p.grow * t)));
    });
    fireMesh.count = fire.length; fireMesh.instanceMatrix.needsUpdate = true; if (fireMesh.instanceColor) fireMesh.instanceColor.needsUpdate = true;
    smoke.forEach((p, i) => {
      const t = p.age / p.life;
      smokeMesh.setColorAt(i, p.colour); smokeQuad.opacity.setX(i, Math.min(1, t * 8) * (1 - t) * p.opacity);
      smokeMesh.setMatrixAt(i, matrix.compose(position.set(p.x, p.y, p.z), quaternion, scale.setScalar(p.size + p.grow * t * 3)));
    });
    smokeMesh.count = smoke.length; smokeMesh.instanceMatrix.needsUpdate = true; smokeQuad.opacity.needsUpdate = true; if (smokeMesh.instanceColor) smokeMesh.instanceColor.needsUpdate = true;
    debris.forEach((p, i) => {
      debrisMesh.setColorAt(i, p.colour);
      roll.setFromAxisAngle(zAxis, p.spin);
      debrisMesh.setMatrixAt(i, matrix.compose(position.set(p.x, p.y, p.z), roll, scale.setScalar(p.size)));
    });
    debrisMesh.count = debris.length; debrisMesh.instanceMatrix.needsUpdate = true; if (debrisMesh.instanceColor) debrisMesh.instanceColor.needsUpdate = true;
    for (let i = craters.length - 1; i >= 0; i--) if ((craters[i].age += dt) > CRATER_LIFE) craters.splice(i, 1);
    craters.forEach((c, i) => {
      craterQuad.opacity.setX(i, Math.min(1, (CRATER_LIFE - c.age) / 10) * .85);
      craterMesh.setMatrixAt(i, matrix.compose(position.set(c.x, c.y + .03, c.z), flat, scale.set(c.size, c.size, 1)));
    });
    craterMesh.count = craters.length; craterMesh.instanceMatrix.needsUpdate = true; craterQuad.opacity.needsUpdate = true;
    flash.intensity *= Math.exp(-dt * 14); if (flash.intensity < .05) flash.intensity = 0;
    for (const t of transports) {
      const before = seenTransports.get(t.event);
      if (before !== undefined && before > 0 && t.health === 0) {
        const at = new THREE.Vector3(t.x, t.y + 1.3, t.z), size = t.mode === 'air' ? 1.25 : 1;
        blast(at, size); happened.blasts.push({ at, size });
      }
      seenTransports.set(t.event, t.health);
    }
    const presentTransports = new Set(transports.map(t => t.event));
    for (const id of seenTransports.keys()) if (!presentTransports.has(id)) seenTransports.delete(id);
    return happened;
  }

  function drawTransport(event: CombatEventDescriptor, payload: TransportPayload, age: number, dt: number, live: Set<string>, active?: ArenaTransport) {
    const pose = active ? { ...active, effort: active.health <= 0 || !active.driverAlive ? 0 : active.state === 'stopped' ? .2 : .85 } : transportPose(payload, age);
    if (!pose.visible) return;
    const v = vehicle(payload.mode, event.id); if (!v) return;
    live.add(event.id);
    // The ground under a transport is sampled a few times a second, not every frame.
    if (clock - v.groundAt > .15) { v.ground = groundAt(pose.x, pose.z); v.groundAt = clock; }
    v.model.visible = true; v.model.position.set(pose.x, active ? pose.y : v.ground + pose.y, pose.z); v.model.rotation.set(active?.state === 'down' ? -.2 : 0, pose.yaw, active?.state === 'wreck' && active.mode === 'air' ? -.18 : 0);
    const stage = !active || active.health > active.maxHealth * .5 ? 1 : active.health > 0 ? .8 : .38;
    if (v.model.userData.transportTint !== stage) {
      v.model.userData.transportTint = stage;
      v.model.traverse(node => { if (!(node instanceof THREE.Mesh)) return;
        for (const material of Array.isArray(node.material) ? node.material : [node.material]) if (material instanceof THREE.MeshStandardMaterial) {
          material.userData.transportBase ??= material.color.clone(); material.color.copy(material.userData.transportBase).multiplyScalar(stage);
        }
      });
    }
    if (active && active.health <= active.maxHealth * .5 && Math.random() < dt * (options.reduced() ? 2 : 8)) {
      const at = position.set(active.x, active.y + 1.8, active.z);
      const puff = particle(at, .5, 1.3, 3.5, 1.1, 1.2, soot); puff.lift = 1; add(smoke, SMOKE, puff);
      if (active.health <= active.maxHealth * .25) add(fire, FIRE, particle(at, .4, .8, .7, .8, 1.2, fireMid));
    }
    if (v.rotor) v.rotor.rotation.y += dt * 38 * pose.effort;
    if (v.tail) v.tail.rotation.x += dt * 60 * pose.effort;
    v.model.updateMatrixWorld(true);
  }

  /** Builds one of each model now, hidden, so its geometry and shaders are ready before an event first needs one. */
  function prewarm() {
    for (const kind of Object.keys(props) as (keyof typeof props)[]) { const slot = prop(kind, ''); if (slot) { slot.model.visible = false; used.delete(slot); } }
    for (const mode of ['land', 'air'] as const) vehicle(mode, '');
  }
  function reset() {
    fire.length = smoke.length = debris.length = craters.length = emitters.length = 0; landings.clear(); seenRaiders.clear(); seenTransports.clear(); flash.intensity = 0;
    for (const mode of ['land', 'air'] as const) for (const v of fleet[mode]) { v.owner = ''; v.model.visible = false; }
    for (const list of Object.values(props)) for (const p of list) { p.owner = ''; p.model.visible = false; p.extra = undefined; }
  }
  return {
    update, blast, spot, landingOf, reset, prewarm,
    /** Live pool sizes, for smokes and tests. */
    get counts() {
      const shown = (kind: keyof typeof props) => props[kind].filter(p => p.owner).length;
      return { fire: fire.length, smoke: smoke.length, debris: debris.length, craters: craters.length, transports: fleet.land.filter(v => v.owner).length + fleet.air.filter(v => v.owner).length,
        flyers: shown('jet') + shown('cargo'), raiders: shown('gunship') + shown('drone'), pits: shown('mortar'), crates: shown('crate'), puffs: puffMesh.count };
    },
    dispose() {
      root.removeFromParent();
      [fireMesh, smokeMesh, debrisMesh, shellMesh, craterMesh, roperMesh, bombMesh, puffMesh].forEach(mesh => mesh.dispose());
      new Set(geometries).forEach(g => g.dispose()); new Set(materials).forEach(m => m.dispose()); new Set(textures).forEach(t => t.dispose());
    },
  };
}
export type CombatEventVisuals = ReturnType<typeof createCombatEventVisuals>;
