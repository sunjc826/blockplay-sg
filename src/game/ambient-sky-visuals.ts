import * as THREE from 'three';
import { createAmbientDirector, flakPose, flakTimeline, flarePose, flybyHeard, flybyPose, missilePose, navalShellPose, navalShips, navalTimeline, rocketPose, rocketTimeline,
  searchlightSites, shipPose, shootdownHit, shootdownPose, skylineTimeline, FLAK, FLARE, NAVAL, SHOOTDOWN, SKYLINE_SIZE,
  type AmbientEvent, type AmbientKind, type AmbientPoint, type AmbientView, type FlakRound, type NavalShell, type Rocket, type SkylineTimeline } from './ambient-sky';
import { createAmbientSkyAudio } from './ambient-sky-audio';
import { createBirds, BIRDS } from './ambient-birds';
import { buildJet } from './combat-event-visuals';
import { withInstanceOpacity } from './fps-impact-material';
import { LIGHT_BLENDING } from './light-blending';
import type { LightSource } from './moving-lights';
import type { CombatRisk } from './combat-director';
import type { SetPieceCueKind } from './district-set-pieces';

/**
 * Draws and sounds the ambient sky (ambient-sky.ts): skyline battles, jet
 * passes, rocket salvos, flak and searchlights, a jet shot down, warships
 * off the coast, and birds flushed off the roofs (ambient-birds.ts). Pools are
 * fixed at creation, the tree carries `fpsEffect` and stops no ray: it is
 * scenery only. Glows and tracers ignore fog so a far flash still cuts through
 * the haze; smoke, trails, ships and birds keep it so they melt into the distance.
 */

const GLOWS = 160, TRACERS = 160, PUFFS = 420, BEAMS = 4;
/** Skyline tracer is drawn at an arcade speed: real rounds cross a hundred metres too fast to see from this far. */
const SKYLINE_TRACER_SPEED = 120;
/** Beyond this from the camera nothing is drawn: the far plane is at 800 m. */
const DRAW_RANGE = 780;
/** At most this many far sounds a second: a big fight is a roll, not a hailstorm. */
const SOUNDS_PER_SECOND = 4;
const noRaycast = () => {};

interface Particle { x: number; y: number; z: number; vx: number; vy: number; vz: number; age: number; life: number; size: number; grow: number; colour: THREE.Color; opacity: number; lift: number;
  /** Light it throws on the city at its brightest: intensity, and reach in metres (moving-lights). */
  light?: readonly [number, number] }
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

/** A searchlight's beam: metres long, its core's radius at the lamp and at the far end, and how far past the core the glow's shell reaches. */
const BEAM = { length: 700, base: 1.2, top: 20, shell: 2.2 } as const;
const BEAM_VERTEX = `varying vec3 vWorld;
void main() { vec4 world = modelMatrix * vec4(position, 1.0); vWorld = world.xyz; gl_Position = projectionMatrix * viewMatrix * world; }`;
/*
 * Lit air rather than a solid: the shell is only where the shader runs. Each
 * pixel takes its sight line's closest pass to the beam's axis and adds the
 * light scattered there: a Gaussian core with a wider, fainter halo, so there
 * is no edge to see. A line running along the beam crosses more lit air and
 * shows brighter; the light thins as the beam spreads, dust drifts through it
 * and the weather's fog dims it with distance. Only the far wall is drawn, so
 * each pixel is counted once, from outside the beam or in it.
 */
const BEAM_FRAGMENT = `uniform vec3 colour; uniform float strength; uniform float time; uniform vec3 origin; uniform vec3 axis; uniform float fogNear; uniform float fogFar;
varying vec3 vWorld;
float hash(vec3 p) { p = fract(p * .3183099 + .1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float noise(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x), mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
void main() {
  vec3 ray = vWorld - cameraPosition; float reach = length(ray); ray /= reach;
  vec3 w = cameraPosition - origin; float b = dot(ray, axis), across = max(1.0 - b * b, 1e-4);
  float t = clamp((b * dot(axis, w) - dot(ray, w)) / across, 0.0, reach);
  vec3 p = w + ray * t; float along = dot(p, axis), h = clamp(along / ${BEAM.length.toFixed(1)}, 0.0, 1.0);
  float radius = mix(${BEAM.base.toFixed(1)}, ${BEAM.top.toFixed(1)}, h), q = length(p - axis * along) / radius;
  float profile = (exp(-2.2 * q * q) + .14 * exp(-.45 * q * q)) * (1.0 - smoothstep(${(BEAM.shell * .55).toFixed(2)}, ${BEAM.shell.toFixed(2)}, q));
  // Lit air crossed: more looking up the beam than across it, thinning as it spreads and gone before the shell's far cap.
  float depth = 1.0 / max(sqrt(across), .22), thin = 1.0 / (1.0 + h * 7.0), ends = smoothstep(-.004, .01, along / ${BEAM.length.toFixed(1)}) * (1.0 - smoothstep(.5, 1.0, h));
  // Dust drawn out along the beam, so looking up it does not foreshorten the motes into rungs.
  vec3 drift = origin + p - axis * along * .8 + vec3(0.0, -time * 2.5, time * 1.2);
  float dust = .7 + .45 * noise(drift * .045) + .25 * noise(drift * .16 + 7.0);
  float fogged = clamp((t - fogNear) / max(1.0, fogFar * 1.6 - fogNear), 0.0, 1.0), haze = 1.0 - .7 * fogged * fogged * (3.0 - 2.0 * fogged);
  float light = profile * depth * thin * ends * dust * haze;
  // A little dither so the long, faint gradient does not band.
  gl_FragColor = vec4(colour * strength * light + (hash(vec3(gl_FragCoord.xy, time)) - .5) / 255.0, 1.0);
}`;

export interface AmbientSkyFrame { camera: THREE.Camera; listener: AmbientPoint; bounds: AmbientView['bounds']; night: number; quiet: boolean }

/**
 * `sea`: which way open sea lies from the district (COASTAL_SEA), so warships
 * have somewhere to sail; inland, there are none.
 */
export function createAmbientSky(scene: THREE.Scene, options: { seed: number; risk: CombatRisk; sea?: { x: number; z: number }; reduced: () => boolean; audio: () => AudioContext | null; muted: () => boolean; birdSurface: (x: number, z: number) => number | null; birdClear: (from: AmbientPoint, perch: AmbientPoint) => boolean }) {
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
  const glowMesh = pool(keep(new THREE.PlaneGeometry(1, 1)), hold(new THREE.MeshBasicMaterial({ map: texture, ...LIGHT_BLENDING, fog: false, toneMapped: false })), GLOWS, 'ambient-glows');
  const tracerMesh = pool(keep(new THREE.BoxGeometry(1, 1, 1)), hold(new THREE.MeshBasicMaterial({ ...LIGHT_BLENDING, fog: false, toneMapped: false })), TRACERS, 'ambient-tracers');
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

  // The shell the beam's glow is drawn in, a little past the lamp at the bottom so its halo is not cut off flat. Capped,
  // so a sight line running up the beam still meets a far wall.
  const beamGeometry = keep(new THREE.CylinderGeometry(BEAM.top * BEAM.shell, BEAM.base * BEAM.shell, BEAM.length + 4, 32, 1)); beamGeometry.translate(0, BEAM.length / 2 - 2, 0);
  const beams = Array.from({ length: BEAMS }, () => {
    const material = hold(new THREE.ShaderMaterial({ vertexShader: BEAM_VERTEX, fragmentShader: BEAM_FRAGMENT,
      uniforms: { colour: { value: new THREE.Color('#dfe8ff') }, strength: { value: 0 }, time: { value: 0 }, origin: { value: new THREE.Vector3() }, axis: { value: new THREE.Vector3(0, 1, 0) }, fogNear: { value: 150 }, fogFar: { value: 750 } },
      ...LIGHT_BLENDING, side: THREE.BackSide }));
    const mesh = new THREE.Mesh(beamGeometry, material); mesh.visible = false; mesh.raycast = noRaycast; mesh.frustumCulled = false; root.add(mesh);
    return { mesh, material, direction: new THREE.Vector3(0, 1, 0) };
  });
  let sites: ReturnType<typeof searchlightSites> | null = null, siteBounds = '';

  const glows: Particle[] = [], puffs: Particle[] = [], emitters: Emitter[] = [];
  const prepared = new Map<number, Prepared>();
  const trailClock = new Map<string, number>();
  let clock = 0, budget = SOUNDS_PER_SECOND, lastView: AmbientView | null = null;

  const add = (list: Particle[], capacity: number, p: Particle) => { if (list.length >= capacity) list.shift(); list.push(p); };
  function glow(at: AmbientPoint, size: number, life: number, colour: THREE.Color, grow = 0, light?: readonly [number, number]) {
    add(glows, GLOWS, { x: at.x, y: at.y, z: at.z, vx: 0, vy: 0, vz: 0, age: 0, life, size, grow, colour, opacity: 1, lift: 0, light });
  }
  /** This frame's light on the city from things in the air, for the night shader's moving lights. */
  const shining: LightSource[] = [];
  const shine = (at: AmbientPoint, colour: THREE.Color, intensity: number, reach: number) => { shining.push({ x: at.x, y: at.y, z: at.z, colour, intensity, reach }); };
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
      glow(flash, flash.size, .18 + flash.size * .008, flashHot.clone().multiplyScalar(reduced ? .6 : 1), flash.size * .5, [flash.size * .15, Math.min(450, flash.size * 20)]);
      // The flash lights the haze over the roofs, which is what shows from behind a downtown skyline.
      glow({ x: flash.x, y: 45 + flash.size, z: flash.z }, flash.size * 5, .6 + flash.size * .01, skyGlow.clone().multiplyScalar(.2), flash.size);
      if (flash.size >= SKYLINE_SIZE.large[0]) {
        if (spend()) sound.rumble(far(flash), huge ? 2 : 1, pan(flash));
        for (let i = 0; i < (huge ? 4 : 1); i++) glow({ x: flash.x + (Math.random() - .5) * flash.size * .4, y: flash.y + i * flash.size * .2, z: flash.z }, flash.size * .7, 1 + i * .3, fireball.clone().multiplyScalar(.7), flash.size * .4, i ? undefined : [flash.size * .08, Math.min(400, flash.size * 15)]);
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
      // A flare is there to light the ground: the brightest, widest light in the sky.
      shine(at, tint, 1.5 * bright, 450);
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
        glow({ ...event.at, y: event.at.y + 4 }, 22, .4, flashWarm.clone(), 10, [3, 300]);
        if (spend()) sound.whoosh(far(event.at), pan(event.at));
      }
      const pose = rocketPose(event, rocket, age); if (!pose.burning || far(pose) > DRAW_RANGE) continue;
      sprites.push({ at: pose, size: 5, colour: motor, brightness: 1 }, { at: pose, size: 16, colour: motorHalo, brightness: .35 }); shine(pose, motorHalo, 3, 320);
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
        glow(round.from, 6, .12, flashWarm.clone(), 0, [1.5, 120]);
        if (spend()) sound.crackle(far(round.from), Math.round(round.lead / 2), pan(round.from));
      }
      if (since <= round.flight) {
        const at = flakPose(round, since), slowing = { x: round.direction.x, y: round.direction.y - 9.8 * since / FLAK.speed, z: round.direction.z };
        tracer(at, slowing, 7, .8, flakTracer, 1.2);
      } else if (round.burst) {
        const at = flakPose(round, round.flight);
        glow(at, 11, .3, flakBurst.clone(), 6, [1.5, 280]); puff(at, 4, 7, 6, flakSmoke, .55, 0, .5);
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
      sprites.push({ at: missile, size: 4, colour: motor, brightness: 1 }, { at: missile, size: 12, colour: motorHalo, brightness: .3 }); shine(missile, motorHalo, 2, 260);
      tracer(missile, missile.direction, 6, .7, motor);
      if (clock >= (trailClock.get(key + 'm') ?? 0)) { trailClock.set(key + 'm', clock + (reduced ? .08 : .04)); puff(missile, 4, 10, 7, contrail, .55, 0, .3); }
    }
    if (hitAt > before && hitAt <= age) {
      const hit = shootdownPose(event, hitAt);
      glow(hit, 36, .5, flashHot.clone(), 20, [5, 450]); glow(hit, 22, 1.2, fireball.clone(), 14, [2.5, 350]);
      for (let i = 0; i < (reduced ? 4 : 8); i++) puff(hit, 5, 14, 9, columnSmoke, .7, 0, 4);
      if (spend()) sound.rumble(far(hit), 1.4, pan(hit));
    }
    if (pose.phase === 'flying' || pose.phase === 'falling') {
      const jet = jets[2]; used.add(2);
      jet.visible = true; jet.position.set(pose.x, pose.y, pose.z); jet.rotation.set(pose.pitch, pose.yaw, pose.roll);
      if (pose.phase === 'falling') {
        // Fire streams back from the wing root and the smoke behind it stays hanging along the fall.
        const tail = { x: pose.x + Math.sin(pose.yaw) * 6, y: pose.y, z: pose.z + Math.cos(pose.yaw) * 6 };
        sprites.push({ at: tail, size: 9, colour: fireball, brightness: .9 }, { at: pose, size: 5, colour: flashWarm, brightness: .8 }); shine(tail, fireball, 2, 300);
        if (clock >= (trailClock.get(key + 's') ?? 0)) { trailClock.set(key + 's', clock + (reduced ? .08 : .04)); puff(tail, 6, 20, 12, columnSmoke, .75, .8, .6); }
      }
    }
    if (crashAt > before && crashAt <= age) {
      const crash = { ...event.at, y: event.at.y + 4 };
      for (let i = 0; i < 4; i++) glow({ x: crash.x + (Math.random() - .5) * 20, y: crash.y + i * 10, z: crash.z + (Math.random() - .5) * 20 }, 40, 1.4 + i * .3, fireball.clone(), 25, i ? undefined : [4, 450]);
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
        glow(pose.muzzle, 30, .45, flashHot.clone(), 12, [3, 450]); glow(pose.muzzle, 18, 1.1, fireball.clone().multiplyScalar(.7), 10);
        for (let i = 0; i < (reduced ? 2 : 4); i++) puff(pose.muzzle, 10, 35, 8, battleHaze, .65, .5, 3);
        if (spend()) sound.rumble(far(pose.muzzle), 1.5, pan(pose.muzzle));
      }
      if (pose.flying && far(pose) < DRAW_RANGE) { sprites.push({ at: pose, size: 5, colour: flashWarm, brightness: 1 }); tracer(pose, pose.direction, 10, 1.2, flashWarm, 1.2); shine(pose, flashWarm, 1, 250); }
    }
  }

  /** Each bird: a body, and two wings turned about it by the wingbeat. Small enough that a dark V reads as a bird at any range. */
  const birdYaw = new THREE.Quaternion(), birdWing = new THREE.Quaternion(), birdEuler = new THREE.Euler(0, 0, 0, 'YXZ');
  function drawBirds() {
    let n = 0;
    for (const flock of birds.flocks) {
      const shrink = flock.resting ? 1 : Math.min(1, (flock.life - flock.age) / 2);
      for (const bird of flock.birds) {
        if (n >= BIRDS.max) break;
        birdEuler.set(Math.atan2(bird.vy, Math.hypot(bird.vx, bird.vz)) * .6, flock.resting ? bird.phase : Math.atan2(-bird.vx, -bird.vz), 0); birdYaw.setFromEuler(birdEuler);
        position.set(bird.x, bird.y, bird.z); scale.setScalar(bird.size * shrink);
        bodyMesh.setMatrixAt(n, matrix.compose(position, birdYaw, scale));
        if (flock.resting) scale.set(bird.size * .25, bird.size, bird.size * .85);
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
      const uniforms = beam.material.uniforms, fog = scene.fog instanceof THREE.Fog ? scene.fog : null;
      uniforms.strength.value = strength; uniforms.time.value = clock; uniforms.origin.value.copy(beam.mesh.position); uniforms.axis.value.copy(beam.direction);
      uniforms.fogNear.value = fog?.near ?? 150; uniforms.fogFar.value = fog?.far ?? 750;
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
    tracers = 0; sprites.length = 0; shining.length = 0;
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

    birds.populate(frame.listener, frame.bounds, options.birdSurface);
    birds.step(dt); drawBirds();

    for (let i = emitters.length - 1; i >= 0; i--) {
      const e = emitters[i]; if (clock > e.until) { emitters.splice(i, 1); continue; }
      while (e.next <= clock) { e.next += e.rate; puff({ x: e.x + (Math.random() - .5) * 6, y: e.y, z: e.z + (Math.random() - .5) * 6 }, e.size, e.size * 2.2, e.life, e.colour, .6, e.rise, e.spread); }
    }
    for (const list of [glows, puffs]) for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i]; p.age += dt; if (p.age >= p.life) { list.splice(i, 1); continue; }
      p.vy += p.lift * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    }

    // Flashes fade as they light: the same (1 - t)² the glow is drawn with.
    for (const p of glows) if (p.light) { const t = p.age / p.life; shine(p, p.colour, p.light[0] * (1 - t) * (1 - t), p.light[1]); }
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
    /** The nearest jet as heard, for the engine's jet roar; and the light all of it throws on the city. */
    return { jet: heard, lights: shining as readonly LightSource[] };
  }

  return {
    update,
    /** Calls one in now, ahead of `facing` (a yaw) from wherever the camera last was. Flak by day shows tracer but no searchlights. */
    trigger(kind: AmbientKind, facing?: number) { return lastView ? director.force(kind, lastView, facing) : null; },
    /** Scatter existing roosts near a blast or in a shot's firing corridor. */
    startle(at: AmbientPoint, strength: number, direction?: AmbientPoint) {
      for (const roost of birds.startle(at, strength, direction, perch => options.birdClear(at, perch))) {
        sound.flutter(far(roost), pan(roost));
      }
    },
    /** Plays a district set piece's sound from where it happens (district-set-pieces). */
    cue(kind: SetPieceCueKind, at: AmbientPoint) {
      const distance = far(at), side = pan(at);
      if (kind === 'chime') sound.chime(distance, side);
      else if (kind === 'horn' || kind === 'train-horn') sound.horn(distance, side, kind === 'train-horn');
      else sound.roar(distance, side, kind === 'flypast' ? 4 : 7, kind === 'flypast' ? 1.6 : 1.2);
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
