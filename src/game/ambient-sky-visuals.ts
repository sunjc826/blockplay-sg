import * as THREE from 'three';
import { createAmbientDirector, flakPose, flakTimeline, flarePose, flybyHeard, flybyPose, missilePose, navalShellPose, navalShips, navalTimeline, rocketPose, rocketTimeline,
  searchlightSites, shipPose, shootdownHit, shootdownPose, skylineTimeline, FLAK, FLARE, NAVAL, SHOOTDOWN, SKYLINE_SIZE,
  type AmbientEvent, type AmbientKind, type AmbientPoint, type AmbientView, type FlakRound, type NavalShell, type Rocket, type SkylineTimeline } from './ambient-sky';
import { createAmbientSkyAudio } from './ambient-sky-audio';
import { createBirds, BIRDS } from './ambient-birds';
import { buildJet } from './combat-event-visuals';
import { withInstanceOpacity } from './fps-impact-material';
import type { CombatRisk } from './combat-director';

/**
 * Draws and sounds the ambient sky (ambient-sky.ts): skyline battles, jet
 * passes, rocket salvos, flak and searchlights, a jet shot down, warships
 * off the coast, and birds flushed off the roofs (ambient-birds.ts). Pools are
 * fixed at creation, the tree carries `fpsEffect` and stops no ray: it is
 * scenery only. Glows and tracers ignore fog so a far flash still cuts through
 * the haze; smoke, trails, ships and birds keep it so they melt into the distance.
 */

const GLOWS = 160, TRACERS = 160, PUFFS = 420, BEAMS = 4;
/** A day without startles still sees a flock cross now and then, this many seconds apart. */
const PASSING_FLOCK = [45, 100] as const;
/** Skyline tracer is drawn at an arcade speed: real rounds cross a hundred metres too fast to see from this far. */
const SKYLINE_TRACER_SPEED = 120;
/** Beyond this from the camera nothing is drawn: the far plane is at 800 m. */
const DRAW_RANGE = 780;
/** At most this many far sounds a second: a big fight is a roll, not a hailstorm. */
const SOUNDS_PER_SECOND = 4;
const noRaycast = () => {};

interface Particle { x: number; y: number; z: number; vx: number; vy: number; vz: number; age: number; life: number; size: number; grow: number; colour: THREE.Color; opacity: number; lift: number }
interface Emitter { x: number; y: number; z: number; until: number; next: number; rate: number; colour: THREE.Color; size: number; rise: number; spread: number; life: number }
type Prepared = { skyline?: SkylineTimeline; rockets?: Rocket[]; flak?: { rounds: FlakRound[]; aim: AmbientPoint }; naval?: NavalShell[] };

/** An original destroyer silhouette: pointed hull, stepped superstructure, funnel, mast and a forward gun. Forward is local -Z. */
function buildWarship() {
  const root = new THREE.Group(), grey = new THREE.MeshStandardMaterial({ color: '#69727a', roughness: .75 }), dark = new THREE.MeshStandardMaterial({ color: '#363b40', roughness: .6 });
  // Drawn in plan with the bow at +y, extruded upward: turned flat, +y becomes -Z.
  const plan = new THREE.Shape(); plan.moveTo(-5, -36); plan.lineTo(5, -36); plan.lineTo(6.5, 2); plan.lineTo(3.5, 28); plan.lineTo(0, 40); plan.lineTo(-3.5, 28); plan.lineTo(-6.5, 2); plan.closePath();
  const hull = new THREE.Mesh(new THREE.ExtrudeGeometry(plan, { depth: 7, bevelEnabled: false }), dark); hull.rotation.x = -Math.PI / 2; hull.position.y = -2; root.add(hull);
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, material = grey) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material); m.position.set(x, y, z); root.add(m); return m; };
  box(10, 6, 30, 0, 8, 6);                        // deckhouse
  box(8, 5, 9, 0, 13, -4);                        // bridge
  box(4.5, 8, 6, 0, 14, 14);                      // funnel
  box(5, 3, 6, 0, 6.5, -22);                      // forward turret
  box(4, 2.5, 5, 0, 6, 28);                       // after turret
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(.35, .5, 16, 6), grey); mast.position.set(0, 23, 2); root.add(mast);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(.3, .3, 8, 6), dark); barrel.rotation.x = Math.PI / 2 + .25; barrel.position.set(0, 8, -27); root.add(barrel);
  return root;
}

function soft(size = 64) {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const d = Math.min(1, Math.hypot((x + .5) / size * 2 - 1, (y + .5) / size * 2 - 1)), i = (y * size + x) * 4;
    data[i] = data[i + 1] = data[i + 2] = 255; data[i + 3] = Math.round(Math.pow(1 - d, 1.6) * 255);
  }
  const texture = new THREE.DataTexture(data, size, size); texture.needsUpdate = true; return texture;
}

const BEAM_VERTEX = `varying float vAlong; varying vec3 vNormal; varying vec3 vView;
void main() { vAlong = uv.y; vec4 mv = modelViewMatrix * vec4(position, 1.0); vNormal = normalize(normalMatrix * normal); vView = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`;
// Bright at the lamp, fading up the beam; soft at its edges where the view grazes the cone.
const BEAM_FRAGMENT = `uniform vec3 colour; uniform float strength; varying float vAlong; varying vec3 vNormal; varying vec3 vView;
void main() { float edge = pow(abs(dot(normalize(vNormal), normalize(vView))), 2.0); float fall = pow(1.0 - vAlong, 1.4);
  gl_FragColor = vec4(colour * strength * edge * fall, 1.0); }`;

export interface AmbientSkyFrame { camera: THREE.Camera; listener: AmbientPoint; bounds: AmbientView['bounds']; night: number; quiet: boolean }

/**
 * `sea`: which way open sea lies from the district (COASTAL_SEA), so warships
 * have somewhere to sail; inland, there are none.
 */
export function createAmbientSky(scene: THREE.Scene, options: { seed: number; risk: CombatRisk; sea?: { x: number; z: number }; reduced: () => boolean; audio: () => AudioContext | null; muted: () => boolean }) {
  const root = new THREE.Group(); root.name = 'ambient-sky'; root.userData.fpsEffect = true; scene.add(root);
  const director = createAmbientDirector({ seed: options.seed, risk: options.risk });
  const sound = createAmbientSkyAudio(options.audio, options.muted);
  const texture = soft(), geometries: THREE.BufferGeometry[] = [], materials: THREE.Material[] = [];
  const keep = <T extends THREE.BufferGeometry>(g: T) => { geometries.push(g); return g; };
  const hold = <T extends THREE.Material>(m: T) => { materials.push(m); return m; };
  const pool = (geometry: THREE.BufferGeometry, material: THREE.Material, count: number, name: string) => {
    const mesh = new THREE.InstancedMesh(geometry, material, count); mesh.name = name; mesh.frustumCulled = false; mesh.raycast = noRaycast;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.count = 0; root.add(mesh); return mesh;
  };
  const glowMesh = pool(keep(new THREE.PlaneGeometry(1, 1)), hold(new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false })), GLOWS, 'ambient-glows');
  const tracerMesh = pool(keep(new THREE.BoxGeometry(1, 1, 1)), hold(new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false })), TRACERS, 'ambient-tracers');
  const puffGeometry = keep(new THREE.PlaneGeometry(1, 1)), puffOpacity = new THREE.InstancedBufferAttribute(new Float32Array(PUFFS), 1).setUsage(THREE.DynamicDrawUsage);
  puffGeometry.setAttribute('effectOpacity', puffOpacity);
  const puffMesh = pool(puffGeometry, hold(withInstanceOpacity(new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }))), PUFFS, 'ambient-smoke');
  // Prime the per-instance colour buffers so the first frame's colours land.
  [glowMesh, tracerMesh, puffMesh].forEach(mesh => mesh.setColorAt(0, new THREE.Color()));

  const own = (model: THREE.Group) => {
    model.visible = false; root.add(model);
    model.traverse(node => { node.raycast = noRaycast; if (node instanceof THREE.Mesh) { geometries.push(node.geometry); materials.push(node.material as THREE.Material); } });
    return model;
  };
  // The flyby pair, then the one that gets shot down; yaw first so pitch and roll are the aircraft's own.
  const jets = [0, 1, 2].map(() => { const model = own(buildJet()); model.rotation.order = 'YXZ'; return model; });
  const ships = [0, 1].map(() => own(buildWarship()));

  // Birds: two wing triangles hinged at the body, each turned about the body's long axis by the wingbeat.
  const birds = createBirds(options.seed ^ 0x51ed270b);
  const birdMaterial = hold(new THREE.MeshBasicMaterial({ color: '#1f2225', side: THREE.DoubleSide }));
  const wing = (span: number) => keep(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -.12, 0, 0, .12, span, 0, .06], 3)));
  const wingMeshes = [pool(wing(.45), birdMaterial, BIRDS.max, 'ambient-bird-wings-right'), pool(wing(-.45), birdMaterial, BIRDS.max, 'ambient-bird-wings-left')];
  const bodyMesh = pool(keep(new THREE.BoxGeometry(.09, .08, .32)), birdMaterial, BIRDS.max, 'ambient-bird-bodies');
  let passAt = 20 + Math.random() * 40;

  const beamGeometry = keep(new THREE.CylinderGeometry(22, 1, 700, 24, 1, true)); beamGeometry.translate(0, 350, 0);
  const beams = Array.from({ length: BEAMS }, () => {
    const material = hold(new THREE.ShaderMaterial({ vertexShader: BEAM_VERTEX, fragmentShader: BEAM_FRAGMENT, uniforms: { colour: { value: new THREE.Color('#dfe8ff') }, strength: { value: 0 } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, forceSinglePass: true }));
    const mesh = new THREE.Mesh(beamGeometry, material); mesh.visible = false; mesh.raycast = noRaycast; mesh.frustumCulled = false; root.add(mesh);
    return { mesh, material, direction: new THREE.Vector3(0, 1, 0) };
  });
  let sites: ReturnType<typeof searchlightSites> | null = null, siteBounds = '';

  const glows: Particle[] = [], puffs: Particle[] = [], emitters: Emitter[] = [];
  const prepared = new Map<number, Prepared>();
  const trailClock = new Map<string, number>();
  let clock = 0, budget = SOUNDS_PER_SECOND, lastView: AmbientView | null = null;

  const add = (list: Particle[], capacity: number, p: Particle) => { if (list.length >= capacity) list.shift(); list.push(p); };
  function glow(at: AmbientPoint, size: number, life: number, colour: THREE.Color, grow = 0) {
    add(glows, GLOWS, { x: at.x, y: at.y, z: at.z, vx: 0, vy: 0, vz: 0, age: 0, life, size, grow, colour, opacity: 1, lift: 0 });
  }
  function puff(at: AmbientPoint, size: number, grow: number, life: number, colour: THREE.Color, opacity: number, rise = 0, spread = 0) {
    const a = Math.random() * Math.PI * 2, out = Math.random() * spread;
    add(puffs, PUFFS, { x: at.x, y: at.y, z: at.z, vx: Math.cos(a) * out + .6, vy: rise, vz: Math.sin(a) * out, age: 0, life: life * (.8 + Math.random() * .4), size, grow, colour, opacity, lift: 0 });
  }
  /** Whether a far sound may play now; keeps the rumble of a big fight from piling up. */
  const spend = () => { if (budget < 1) return false; budget -= 1; return true; };

  const camPosition = new THREE.Vector3(), camRight = new THREE.Vector3(), toward = new THREE.Vector3();
  const pan = (p: AmbientPoint) => { toward.set(p.x, p.y, p.z).sub(camPosition); const l = toward.length(); return l < 1 ? 0 : toward.dot(camRight) / l; };
  const far = (p: AmbientPoint) => Math.hypot(p.x - camPosition.x, p.y - camPosition.y, p.z - camPosition.z);
  /**
   * Fog-free glows still dim through the weather's fog, so a hazy day is not
   * lit through like clear air; a bright flash keeps a quarter of itself even
   * where the fog hides the ground.
   */
  const haze = (distance: number) => {
    const fog = scene.fog instanceof THREE.Fog ? scene.fog : null, near = fog?.near ?? 150, far = (fog?.far ?? 750) * 1.6;
    const t = Math.max(0, Math.min(1, (distance - near) / Math.max(1, far - near))); return 1 - .75 * t * t * (3 - 2 * t);
  };

  const flashHot = new THREE.Color('#fff0c8'), flashWarm = new THREE.Color('#ffb054'), skyGlow = new THREE.Color('#ff8a3a'), fireball = new THREE.Color('#ff7a26');
  const battleHaze = new THREE.Color('#6d655c'), columnSmoke = new THREE.Color('#2f2b28'), contrail = new THREE.Color('#e9eef2'), rocketSmoke = new THREE.Color('#bdb8ae');
  const motor = new THREE.Color('#fff2c6'), motorHalo = new THREE.Color('#ff9a3c'), tracerRed = new THREE.Color('#ff5a3a'), tracerGreen = new THREE.Color('#86ff6a');
  const flakTracer = new THREE.Color('#ffb24a'), flakBurst = new THREE.Color('#ffd07a'), flakSmoke = new THREE.Color('#3a3632'), lamp = new THREE.Color('#e6eeff');
  const flareWhite = new THREE.Color('#fff6e0'), flareRed = new THREE.Color('#ff4a3a'), flareGreen = new THREE.Color('#6bff7a');

  function prepare(event: AmbientEvent): Prepared {
    let entry = prepared.get(event.id);
    if (!entry) {
      entry = event.kind === 'skyline' ? { skyline: skylineTimeline(event) } : event.kind === 'rockets' ? { rockets: rocketTimeline(event) } : event.kind === 'flak' ? { flak: flakTimeline(event) }
        : event.kind === 'naval' ? { naval: navalTimeline(event) } : {};
      prepared.set(event.id, entry);
    }
    return entry;
  }

  const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), scale = new THREE.Vector3(), quaternion = new THREE.Quaternion(), facing = new THREE.Quaternion();
  const zAxis = new THREE.Vector3(0, 0, 1), yAxis = new THREE.Vector3(0, 1, 0), direction = new THREE.Vector3(), colour = new THREE.Color();
  let tracers = 0;
  function tracer(at: AmbientPoint, heading: AmbientPoint, length: number, width: number, tint: THREE.Color, brightness = 1) {
    if (tracers >= TRACERS) return;
    const distance = far(at); if (distance > DRAW_RANGE) return;
    direction.set(heading.x, heading.y, heading.z).normalize(); quaternion.setFromUnitVectors(zAxis, direction);
    tracerMesh.setColorAt(tracers, colour.copy(tint).multiplyScalar(brightness * haze(distance)));
    // Widened with distance so a far round stays a couple of pixels across.
    tracerMesh.setMatrixAt(tracers++, matrix.compose(position.set(at.x, at.y, at.z), quaternion, scale.set(width * Math.max(1, distance / 250), width * Math.max(1, distance / 250), length)));
  }
  /** One-frame glows: motors and afterburners, drawn where they are this frame rather than left behind. */
  const sprites: { at: AmbientPoint; size: number; colour: THREE.Color; brightness: number }[] = [];

  function skyline(event: AmbientEvent, timeline: SkylineTimeline, age: number, before: number, reduced: boolean) {
    for (const flash of timeline.flashes) {
      if (flash.time <= before || flash.time > age) continue;
      if (reduced && flash.size < SKYLINE_SIZE.large[0] && flash.time * 7 % 2 < 1) continue;
      const huge = flash.size >= SKYLINE_SIZE.huge;
      glow(flash, flash.size, .18 + flash.size * .008, flashHot.clone().multiplyScalar(reduced ? .6 : 1), flash.size * .5);
      // The flash lights the haze over the roofs, which is what shows from behind a downtown skyline.
      glow({ x: flash.x, y: 45 + flash.size, z: flash.z }, flash.size * 5, .6 + flash.size * .01, skyGlow.clone().multiplyScalar(.2), flash.size);
      if (flash.size >= SKYLINE_SIZE.large[0]) {
        if (spend()) sound.rumble(far(flash), huge ? 2 : 1, pan(flash));
        for (let i = 0; i < (huge ? 4 : 1); i++) glow({ x: flash.x + (Math.random() - .5) * flash.size * .4, y: flash.y + i * flash.size * .2, z: flash.z }, flash.size * .7, 1 + i * .3, fireball.clone().multiplyScalar(.7), flash.size * .4);
      }
      // The big ones burn on: a column of dark smoke that stands over the skyline.
      if (huge) emitters.push({ x: flash.x, y: flash.y + 10, z: flash.z, until: clock + 25, next: clock, rate: reduced ? .9 : .45, colour: columnSmoke, size: 14, rise: 6, spread: 2, life: 26 });
    }
    for (const burst of timeline.bursts) {
      const since = age - burst.time; if (since < 0 || since > 3) continue;
      if (burst.time > before && spend()) sound.crackle(far(burst.from), burst.rounds, pan(burst.from));
      const dx = burst.to.x - burst.from.x, dy = burst.to.y - burst.from.y, dz = burst.to.z - burst.from.z, span = Math.hypot(dx, dy, dz), flight = span / SKYLINE_TRACER_SPEED;
      for (let n = 0; n < burst.rounds; n++) {
        const t = (since - n * .09) / flight; if (t < 0 || t > 1) continue;
        // Along the bow: the slope of the arc tips each streak up, then over.
        const bow = Math.PI * burst.arc * Math.cos(Math.PI * t);
        tracer({ x: burst.from.x + dx * t, y: burst.from.y + dy * t + Math.sin(Math.PI * t) * burst.arc, z: burst.from.z + dz * t }, { x: dx, y: dy + bow, z: dz }, 10, 1.1, burst.colour === 'red' ? tracerRed : tracerGreen, 1.3);
      }
    }
    timeline.flares.forEach((flare, i) => {
      const since = age - flare.time, { y, bright } = flarePose(flare, since); if (!bright) return;
      const at = { x: flare.x, y, z: flare.z }, tint = flare.colour === 'red' ? flareRed : flare.colour === 'green' ? flareGreen : flareWhite;
      sprites.push({ at, size: 4, colour: tint, brightness: bright }, { at, size: 30, colour: tint, brightness: bright * .3 });
      const key = `${event.id}/f${i}`;
      if (since < FLARE.rise + 4 && clock >= (trailClock.get(key) ?? 0)) { trailClock.set(key, clock + (reduced ? .2 : .1)); puff(at, 1.5, 4, 6, contrail, .4); }
    });
    // A pall over the fight while it lasts, climbing above the roofs so it reads by day too.
    const key = `${event.id}/haze`;
    if (clock >= (trailClock.get(key) ?? 0)) {
      trailClock.set(key, clock + (reduced ? 2 : 1));
      puff({ x: event.at.x + (Math.random() - .5) * 120, y: 8 + Math.random() * 10, z: event.at.z + (Math.random() - .5) * 60 }, 22, 40, 28, battleHaze, .4, 4, 1);
    }
  }

  function flyby(event: AmbientEvent, age: number, reduced: boolean, used: Set<number>) {
    for (let wing = 0; wing < 2; wing++) {
      const pose = flybyPose(event, age, wing); if (!pose.visible) continue;
      const jet = jets[wing]; used.add(wing);
      jet.visible = true; jet.position.set(pose.x, pose.y, pose.z); jet.rotation.set(0, pose.yaw, Math.sin(age * .7 + wing) * .08);
      const tail = { x: pose.x + Math.sin(pose.yaw) * 8, y: pose.y, z: pose.z + Math.cos(pose.yaw) * 8 };
      sprites.push({ at: tail, size: 3, colour: motorHalo, brightness: .9 });
      const key = `${event.id}/${wing}`;
      if (clock >= (trailClock.get(key) ?? 0)) { trailClock.set(key, clock + (reduced ? .2 : .1)); puff(tail, 2.4, 8, 9, contrail, .6, 0, .3); }
    }
  }

  function rockets(event: AmbientEvent, list: Rocket[], age: number, before: number, reduced: boolean) {
    for (const [i, rocket] of list.entries()) {
      if (rocket.launch > before && rocket.launch <= age) {
        glow({ ...event.at, y: event.at.y + 4 }, 22, .4, flashWarm.clone(), 10);
        if (spend()) sound.whoosh(far(event.at), pan(event.at));
      }
      const pose = rocketPose(event, rocket, age); if (!pose.burning || far(pose) > DRAW_RANGE) continue;
      sprites.push({ at: pose, size: 5, colour: motor, brightness: 1 }, { at: pose, size: 16, colour: motorHalo, brightness: .35 });
      tracer({ x: pose.x - pose.direction.x * 5, y: pose.y - pose.direction.y * 5, z: pose.z - pose.direction.z * 5 }, pose.direction, 10, .9, motor, 1);
      const key = `${event.id}/r${i}`;
      if (clock >= (trailClock.get(key) ?? 0)) { trailClock.set(key, clock + (reduced ? .25 : .12)); puff(pose, 3, 10, 8, rocketSmoke, .5, .3, .4); }
    }
  }

  function flak(rounds: FlakRound[], age: number, before: number, reduced: boolean) {
    for (const [i, round] of rounds.entries()) {
      // Kept for the frame its flight ends in, however long the frame, so no airburst is missed.
      const since = age - round.time; if (since < 0 || round.time + round.flight <= before) continue;
      if (reduced && i % 2) continue;
      if (round.lead && round.time > before) {
        glow(round.from, 6, .12, flashWarm.clone());
        if (spend()) sound.crackle(far(round.from), Math.round(round.lead / 2), pan(round.from));
      }
      if (since <= round.flight) {
        const at = flakPose(round, since), slowing = { x: round.direction.x, y: round.direction.y - 9.8 * since / FLAK.speed, z: round.direction.z };
        tracer(at, slowing, 7, .8, flakTracer, 1.2);
      } else if (round.burst) {
        const at = flakPose(round, round.flight);
        glow(at, 11, .3, flakBurst.clone(), 6); puff(at, 4, 7, 6, flakSmoke, .55, 0, .5);
        if (spend()) sound.rumble(far(at), .35, pan(at));
      }
    }
  }

  /**
   * A jet hit by a missile: the missile's climb, the flash, then the fall —
   * burning, trailing black smoke, rolling — to a fireball and a standing
   * column of smoke where it comes down. Returns the jet's distance while it
   * still flies, for the roar.
   */
  function shootdown(event: AmbientEvent, age: number, before: number, reduced: boolean, used: Set<number>) {
    const pose = shootdownPose(event, age), hitAt = shootdownHit(), crashAt = hitAt + SHOOTDOWN.fallTime, key = `${event.id}/`;
    const missile = missilePose(event, age);
    if (missile.flying) {
      sprites.push({ at: missile, size: 4, colour: motor, brightness: 1 }, { at: missile, size: 12, colour: motorHalo, brightness: .3 });
      tracer(missile, missile.direction, 6, .7, motor);
      if (clock >= (trailClock.get(key + 'm') ?? 0)) { trailClock.set(key + 'm', clock + (reduced ? .08 : .04)); puff(missile, 4, 10, 7, contrail, .55, 0, .3); }
    }
    if (hitAt > before && hitAt <= age) {
      const hit = shootdownPose(event, hitAt);
      glow(hit, 36, .5, flashHot.clone(), 20); glow(hit, 22, 1.2, fireball.clone(), 14);
      for (let i = 0; i < (reduced ? 4 : 8); i++) puff(hit, 5, 14, 9, columnSmoke, .7, 0, 4);
      if (spend()) sound.rumble(far(hit), 1.4, pan(hit));
    }
    if (pose.phase === 'flying' || pose.phase === 'falling') {
      const jet = jets[2]; used.add(2);
      jet.visible = true; jet.position.set(pose.x, pose.y, pose.z); jet.rotation.set(pose.pitch, pose.yaw, pose.roll);
      if (pose.phase === 'falling') {
        // Fire streams back from the wing root and the smoke behind it stays hanging along the fall.
        const tail = { x: pose.x + Math.sin(pose.yaw) * 6, y: pose.y, z: pose.z + Math.cos(pose.yaw) * 6 };
        sprites.push({ at: tail, size: 9, colour: fireball, brightness: .9 }, { at: pose, size: 5, colour: flashWarm, brightness: .8 });
        if (clock >= (trailClock.get(key + 's') ?? 0)) { trailClock.set(key + 's', clock + (reduced ? .08 : .04)); puff(tail, 6, 20, 12, columnSmoke, .75, .8, .6); }
      }
    }
    if (crashAt > before && crashAt <= age) {
      const crash = { ...event.at, y: event.at.y + 4 };
      for (let i = 0; i < 4; i++) glow({ x: crash.x + (Math.random() - .5) * 20, y: crash.y + i * 10, z: crash.z + (Math.random() - .5) * 20 }, 40, 1.4 + i * .3, fireball.clone(), 25);
      glow({ ...crash, y: crash.y + 40 }, 160, 1, skyGlow.clone().multiplyScalar(.25), 60);
      emitters.push({ x: crash.x, y: crash.y + 6, z: crash.z, until: clock + 35, next: clock, rate: reduced ? .8 : .4, colour: columnSmoke, size: 16, rise: 6, spread: 2, life: 28 });
      if (spend()) sound.rumble(far(crash), 2.2, pan(crash));
    }
    return pose.phase === 'flying' || pose.phase === 'falling' ? far(pose) : Infinity;
  }

  /** Warships steaming down the coast, the lead (and any consort) firing salvos on ahead with a flash and a slap of smoke at the muzzle. */
  function naval(event: AmbientEvent, shells: NavalShell[], age: number, before: number, reduced: boolean, usedShips: Set<number>) {
    const count = navalShips(event);
    for (let i = 0; i < count; i++) {
      const pose = shipPose(event, age, i); if (!pose.visible || far(pose) > DRAW_RANGE + 60) continue;
      const ship = ships[i]; usedShips.add(i);
      ship.visible = true; ship.position.set(pose.x, pose.y + Math.sin(clock * .7 + i) * .3, pose.z); ship.rotation.set(Math.sin(clock * .5 + i) * .01, pose.yaw, Math.sin(clock * .6 + i * 2) * .02);
      const key = `${event.id}/k${i}`;
      if (clock >= (trailClock.get(key) ?? 0)) {
        trailClock.set(key, clock + (reduced ? 1.2 : .6));
        // Funnel smoke, streaming aft.
        puff({ x: pose.x + Math.sin(pose.yaw) * 14, y: pose.y + 19, z: pose.z + Math.cos(pose.yaw) * 14 }, 5, 18, 10, columnSmoke, .5, 1.2, .5);
      }
    }
    for (const shell of shells) {
      const since = age - shell.time; if (since < 0 || since > shell.range / NAVAL.shell) continue;
      const pose = navalShellPose(event, shell, since);
      if (shell.time > before) {
        glow(pose.muzzle, 30, .45, flashHot.clone(), 12); glow(pose.muzzle, 18, 1.1, fireball.clone().multiplyScalar(.7), 10);
        for (let i = 0; i < (reduced ? 2 : 4); i++) puff(pose.muzzle, 10, 35, 8, battleHaze, .65, .5, 3);
        if (spend()) sound.rumble(far(pose.muzzle), 1.5, pan(pose.muzzle));
      }
      if (pose.flying && far(pose) < DRAW_RANGE) { sprites.push({ at: pose, size: 5, colour: flashWarm, brightness: 1 }); tracer(pose, pose.direction, 10, 1.2, flashWarm, 1.2); }
    }
  }

  /** Each bird: a body, and two wings turned about it by the wingbeat. Small enough that a dark V reads as a bird at any range. */
  const birdYaw = new THREE.Quaternion(), birdWing = new THREE.Quaternion(), birdEuler = new THREE.Euler(0, 0, 0, 'YXZ');
  function drawBirds() {
    let n = 0;
    for (const flock of birds.flocks) {
      const shrink = Math.min(1, (flock.life - flock.age) / 2);
      for (const bird of flock.birds) {
        if (n >= BIRDS.max) break;
        birdEuler.set(Math.atan2(bird.vy, Math.hypot(bird.vx, bird.vz)) * .6, Math.atan2(-bird.vx, -bird.vz), 0); birdYaw.setFromEuler(birdEuler);
        position.set(bird.x, bird.y, bird.z); scale.setScalar(bird.size * shrink);
        bodyMesh.setMatrixAt(n, matrix.compose(position, birdYaw, scale));
        wingMeshes.forEach((mesh, side) => {
          birdWing.setFromAxisAngle(zAxis, side ? -bird.flap : bird.flap).premultiply(birdYaw);
          mesh.setMatrixAt(n, matrix.compose(position, birdWing, scale));
        });
        n++;
      }
    }
    for (const mesh of [bodyMesh, ...wingMeshes]) { mesh.count = n; mesh.instanceMatrix.needsUpdate = true; }
  }

  function searchlights(frame: AmbientSkyFrame, dt: number, aim: AmbientPoint | null) {
    const boundsKey = `${frame.bounds.minX},${frame.bounds.maxX},${frame.bounds.minZ},${frame.bounds.maxZ}`;
    if (!sites || boundsKey !== siteBounds) { sites = searchlightSites(frame.bounds, options.seed ^ 0x9e3779b9, BEAMS); siteBounds = boundsKey; }
    const strength = .1 * Math.max(0, Math.min(1, (frame.night - .3) / .5));
    beams.forEach((beam, i) => {
      const site = sites![i]; beam.mesh.visible = strength > .002;
      if (!beam.mesh.visible) return;
      const yaw = site.phase + Math.sin(clock * site.rate * 2) * 1.1 + clock * site.rate * .4, pitch = site.pitch + Math.sin(clock * site.rate * 2.6 + site.phase) * .15;
      direction.set(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
      // While the flak is up, three of the four hunt the same patch of sky; one keeps sweeping.
      if (aim && i < 3) direction.lerp(toward.set(aim.x - site.x + Math.sin(clock * .6 + i) * 60, aim.y, aim.z - site.z).normalize(), .75).normalize();
      beam.direction.lerp(direction, 1 - Math.exp(-dt * .9)).normalize();
      beam.mesh.position.set(site.x, frame.listener.y > 40 ? 0 : 2, site.z); beam.mesh.quaternion.setFromUnitVectors(yAxis, beam.direction);
      beam.material.uniforms.strength.value = strength;
      sprites.push({ at: { x: site.x, y: 3, z: site.z }, size: 7, colour: lamp, brightness: strength * 10 });
    });
  }

  function update(frameDt: number, frame: AmbientSkyFrame) {
    // A stall or a tab left in the background slows the sky rather than skipping whole set pieces past unseen.
    const dt = Math.min(frameDt, .1);
    clock += dt; budget = Math.min(SOUNDS_PER_SECOND, budget + dt * SOUNDS_PER_SECOND);
    const reduced = options.reduced();
    frame.camera.getWorldPosition(camPosition); camRight.setFromMatrixColumn(frame.camera.matrixWorld, 0).normalize(); frame.camera.getWorldQuaternion(facing);
    lastView = { now: clock, listener: frame.listener, bounds: frame.bounds, night: frame.night, quiet: frame.quiet, sea: options.sea };
    director.step(lastView);
    tracers = 0; sprites.length = 0;
    const used = new Set<number>(), usedShips = new Set<number>();
    let heard = Infinity, aim: AmbientPoint | null = null;
    for (const event of director.active) {
      const age = clock - event.start, before = age - dt, entry = prepare(event);
      if (event.kind === 'skyline' && entry.skyline) skyline(event, entry.skyline, age, before, reduced);
      else if (event.kind === 'flyby') { flyby(event, age, reduced, used); heard = Math.min(heard, flybyHeard(event, age, frame.listener)); }
      else if (event.kind === 'rockets' && entry.rockets) rockets(event, entry.rockets, age, before, reduced);
      else if (event.kind === 'flak' && entry.flak) { flak(entry.flak.rounds, age, before, reduced); aim = entry.flak.aim; }
      else if (event.kind === 'shootdown') heard = Math.min(heard, shootdown(event, age, before, reduced, used));
      else if (event.kind === 'naval' && entry.naval) naval(event, entry.naval, age, before, reduced, usedShips);
    }
    for (const id of prepared.keys()) if (!director.active.some(e => e.id === id)) prepared.delete(id);
    for (const key of trailClock.keys()) if (!director.active.some(e => key.startsWith(`${e.id}/`))) trailClock.delete(key);
    jets.forEach((jet, i) => { if (!used.has(i)) jet.visible = false; });
    ships.forEach((ship, i) => { if (!usedShips.has(i)) ship.visible = false; });
    searchlights(frame, dt, aim);

    // Now and then by day a flock crosses over, a little way off and well above the street.
    if (clock >= passAt) {
      passAt = clock + PASSING_FLOCK[0] + Math.random() * (PASSING_FLOCK[1] - PASSING_FLOCK[0]);
      if (frame.night < .5) {
        const a = Math.random() * Math.PI * 2, r = 60 + Math.random() * 60, b = a + Math.PI / 2 + (Math.random() - .5);
        birds.pass({ x: frame.listener.x + Math.cos(a) * r, y: frame.listener.y + 35 + Math.random() * 20, z: frame.listener.z + Math.sin(a) * r }, { x: Math.cos(b), z: Math.sin(b) });
      }
    }
    birds.step(dt); drawBirds();

    for (let i = emitters.length - 1; i >= 0; i--) {
      const e = emitters[i]; if (clock > e.until) { emitters.splice(i, 1); continue; }
      while (e.next <= clock) { e.next += e.rate; puff({ x: e.x + (Math.random() - .5) * 6, y: e.y, z: e.z + (Math.random() - .5) * 6 }, e.size, e.size * 2.2, e.life, e.colour, .6, e.rise, e.spread); }
    }
    for (const list of [glows, puffs]) for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i]; p.age += dt; if (p.age >= p.life) { list.splice(i, 1); continue; }
      p.vy += p.lift * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    }

    let shown = 0;
    for (const p of glows) {
      if (shown >= GLOWS) break;
      const t = p.age / p.life, distance = far(p); if (distance > DRAW_RANGE) continue;
      glowMesh.setColorAt(shown, colour.copy(p.colour).multiplyScalar((1 - t) * (1 - t) * haze(distance)));
      glowMesh.setMatrixAt(shown++, matrix.compose(position.set(p.x, p.y, p.z), facing, scale.setScalar(p.size + p.grow * t)));
    }
    for (const s of sprites) {
      if (shown >= GLOWS) break;
      const distance = far(s.at); if (distance > DRAW_RANGE) continue;
      glowMesh.setColorAt(shown, colour.copy(s.colour).multiplyScalar(s.brightness * haze(distance)));
      glowMesh.setMatrixAt(shown++, matrix.compose(position.set(s.at.x, s.at.y, s.at.z), facing, scale.setScalar(s.size * Math.max(1, distance / 300))));
    }
    glowMesh.count = shown; glowMesh.instanceMatrix.needsUpdate = true; if (glowMesh.instanceColor) glowMesh.instanceColor.needsUpdate = true;
    tracerMesh.count = tracers; tracerMesh.instanceMatrix.needsUpdate = true; if (tracerMesh.instanceColor) tracerMesh.instanceColor.needsUpdate = true;
    puffs.forEach((p, i) => {
      const t = p.age / p.life;
      puffMesh.setColorAt(i, p.colour); puffOpacity.setX(i, Math.min(1, t * 6) * (1 - t) * p.opacity);
      puffMesh.setMatrixAt(i, matrix.compose(position.set(p.x, p.y, p.z), facing, scale.setScalar(p.size + p.grow * t)));
    });
    puffMesh.count = puffs.length; puffMesh.instanceMatrix.needsUpdate = true; puffOpacity.needsUpdate = true; if (puffMesh.instanceColor) puffMesh.instanceColor.needsUpdate = true;
    /** The nearest jet as heard, for the engine's jet roar. */
    return { jet: heard };
  }

  return {
    update,
    /** Calls one in now, ahead of `facing` (a yaw) from wherever the camera last was. Flak by day shows tracer but no searchlights. */
    trigger(kind: AmbientKind, facing?: number) { return lastView ? director.force(kind, lastView, facing) : null; },
    /**
     * Something loud at `at` (a shell landing, a shot): birds roosting nearby
     * burst off the roofs. `perch` is where they were sitting, by default a
     * roof a little way off; `strength` 1 is a shell. Flushed birds do not go twice.
     */
    startle(at: AmbientPoint, strength: number, perch?: AmbientPoint) {
      const a = Math.random() * Math.PI * 2, r = 15 + Math.random() * 25;
      const roost = perch ?? { x: at.x + Math.cos(a) * r, y: at.y + 8 + Math.random() * 10, z: at.z + Math.sin(a) * r };
      if (birds.startle(at, strength, roost)) sound.flutter(far(roost), pan(roost));
    },
    /** events / glows / tracers / smoke / jets / searchlights / ships / birds, for smokes and tests. */
    get census() {
      return `${director.active.length}/${glowMesh.count}/${tracerMesh.count}/${puffMesh.count}/${jets.filter(j => j.visible).length}/${beams.filter(b => b.mesh.visible).length}/${ships.filter(s => s.visible).length}/${birds.count}`;
    },
    get active(): readonly AmbientEvent[] { return director.active; },
    /** The sky's own clock, which events' `start` is measured on. */
    get now() { return clock; },
    reset() {
      director.reset(); birds.reset(); glows.length = puffs.length = emitters.length = 0; prepared.clear(); trailClock.clear();
      [...jets, ...ships].forEach(model => { model.visible = false; });
    },
    dispose() {
      root.removeFromParent();
      [glowMesh, tracerMesh, puffMesh, bodyMesh, ...wingMeshes].forEach(mesh => mesh.dispose());
      new Set(geometries).forEach(g => g.dispose()); new Set(materials).forEach(m => m.dispose()); texture.dispose();
    },
  };
}
export type AmbientSky = ReturnType<typeof createAmbientSky>;
