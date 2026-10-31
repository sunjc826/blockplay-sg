import * as THREE from 'three';
import { insideFootprint, type Obstacle } from './region-collision';
import type { VehicleRainHit } from './vehicle-rain';

export interface RainSplashOptions { strength?: number; normal?: THREE.Vector3; attachment?: THREE.Object3D; velocity?: THREE.Vector3; sprayOnly?: boolean }

/** Static column index shared by streak clipping, roof splashes and shelter. */
export function createRainSurface(obstacles: readonly Obstacle[], ground: (x: number, z: number) => number = () => 0) {
  const cells = new Map<string, Obstacle[]>(), size = 12;
  for (const o of obstacles) for (let x = Math.floor(o.minX / size); x <= Math.floor(o.maxX / size); x++)
    for (let z = Math.floor(o.minZ / size); z <= Math.floor(o.maxZ / size); z++) {
      const key = `${x},${z}`, bucket = cells.get(key) ?? []; bucket.push(o); cells.set(key, bucket);
    }
  return (x: number, z: number) => {
    let height = ground(x, z);
    for (const o of cells.get(`${Math.floor(x / size)},${Math.floor(z / size)}`) ?? []) {
      if (x >= o.minX && x <= o.maxX && z >= o.minZ && z <= o.maxZ && (!o.footprint || insideFootprint(o.footprint, x, z))) height = Math.max(height, o.maxY ?? 12);
    }
    return height;
  };
}

const DROP_COUNT = 1200, SPLASH_COUNT = 192, SPOKES = 4, RING_SEGMENTS = 12;
const sample = (i: number, salt: number) => { const n = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453; return n - Math.floor(n); };

/** Two fixed draw calls; particles stay in world space as the eye moves. */
export function createRainEffects(parent: THREE.Object3D, surface: (x: number, z: number) => number, movingSurface?: (x: number, z: number, hit: VehicleRainHit) => VehicleRainHit) {
  const root = new THREE.Group(); root.name = 'rain-effects'; parent.add(root);
  const positions = new Float32Array(DROP_COUNT * 6);
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
  const material = new THREE.LineBasicMaterial({ color: '#c1deeb', transparent: true, opacity: .48, depthWrite: false });
  const streaks = new THREE.LineSegments(geometry, material); streaks.name = 'rain-streaks'; streaks.frustumCulled = false; root.add(streaks);
  // Each impact has an expanding ring and four short ballistic droplets.
  const vertices = SPLASH_COUNT * (RING_SEGMENTS + SPOKES) * 2;
  const splashPositions = new Float32Array(vertices * 3), colors = new Float32Array(vertices * 3);
  const splashGeometry = new THREE.BufferGeometry();
  splashGeometry.setAttribute('position', new THREE.BufferAttribute(splashPositions, 3).setUsage(THREE.DynamicDrawUsage));
  splashGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3).setUsage(THREE.DynamicDrawUsage));
  const splashMaterial = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: .65, blending: THREE.AdditiveBlending, depthWrite: false });
  const splashes = new THREE.LineSegments(splashGeometry, splashMaterial); splashes.name = 'rain-splashes'; splashes.frustumCulled = false; root.add(splashes);
  root.traverse(o => { o.raycast = () => {}; o.userData.fpsEffect = true; });
  const drops = Array.from({ length: DROP_COUNT }, () => ({ x: 0, y: 0, z: 0, cycle: 0, ready: false }));
  const impacts = Array.from({ length: SPLASH_COUNT }, () => ({ x: 0, y: 0, z: 0, age: 1, strength: 0, attachment: undefined as THREE.Object3D | undefined, origin: new THREE.Vector3(), normal: new THREE.Vector3(0, 1, 0), velocity: new THREE.Vector3(), sprayOnly: false }));
  let cursor = 0, disposed = false;
  const hit: VehicleRainHit = { height: 0, normal: new THREE.Vector3(0, 1, 0) };
  const impactPoint = new THREE.Vector3(), ringPoint = new THREE.Vector3(), ringNormal = new THREE.Vector3(), u = new THREE.Vector3(), v = new THREE.Vector3(), matrix = new THREE.Matrix3();
  function sampleSurface(x: number, z: number) {
    hit.height = surface(x, z); hit.object = undefined; hit.normal.set(0, 1, 0);
    movingSurface?.(x, z, hit); return hit.height;
  }
  function splash(point: THREE.Vector3, options: RainSplashOptions = {}) {
    if (disposed) return;
    const s = impacts[cursor++ % SPLASH_COUNT];
    s.x = point.x; s.y = point.y; s.z = point.z; s.age = 0; s.strength = options.strength ?? .8;
    s.attachment = options.attachment; s.origin.copy(point); s.normal.copy(options.normal ?? THREE.Object3D.DEFAULT_UP);
    s.velocity.copy(options.velocity ?? impactPoint.set(0, 0, 0)); s.sprayOnly = options.sprayOnly ?? false;
    if (s.attachment) {
      s.attachment.worldToLocal(s.origin);
      s.normal.applyMatrix3(matrix.getNormalMatrix(s.attachment.matrixWorld).invert()).normalize();
    }
  }
  function spawn(i: number, eye: THREE.Vector3, initial: boolean) {
    const d = drops[i], salt = ++d.cycle * 7;
    const span = i % 3 === 0 ? 16 : 48;
    d.x = eye.x + (sample(i, salt) - .5) * span; d.z = eye.z + (sample(i, salt + 1) - .5) * span;
    const top = eye.y + 22, floor = Math.max(eye.y - 12, sampleSurface(d.x, d.z));
    d.y = initial ? floor + sample(i, salt + 2) * Math.max(0, top - floor) : top;
    d.ready = true;
  }
  return {
    root, streaks, splashes, splash,
    get counts() { return { drops: geometry.drawRange.count / 2, splashes: impacts.filter(s => s.age < .48).length }; },
    update(dt: number, eye: THREE.Vector3, rain: number, wind: number, reduced: boolean) {
      if (disposed) return;
      const step = Math.max(0, Math.min(.1, dt));
      const count = Math.floor(DROP_COUNT * THREE.MathUtils.clamp(rain, 0, 1) * (reduced ? .18 : 1));
      streaks.visible = count > 0; geometry.setDrawRange(0, count * 2);
      for (let i = 0; i < DROP_COUNT; i++) {
        const d = drops[i];
        if (i >= count) { d.ready = false; continue; }
        if (!d.ready || Math.abs(d.x - eye.x) > 25 || Math.abs(d.z - eye.z) > 25 || d.y > eye.y + 27 || d.y < eye.y - 13) spawn(i, eye, true);
        const previousY = d.y;
        d.x += wind * step; d.z += wind * .18 * step; d.y -= (21 + sample(i, 4) * 9) * step;
        const floor = sampleSurface(d.x, d.z), k = i * 6;
        if (d.y <= floor || d.y < eye.y - 12) {
          if (i % 3 === 0 && previousY > floor && d.y <= floor && Math.abs(floor - eye.y) < 9) {
            const attachment = hit.object;
            const dx = (surface(d.x + .1, d.z) - surface(d.x - .1, d.z)) / .2;
            const dz = (surface(d.x, d.z + .1) - surface(d.x, d.z - .1)) / .2;
            if (!attachment) hit.normal.set(Math.abs(dx) <= 1 ? -dx : 0, 1, Math.abs(dz) <= 1 ? -dz : 0).normalize();
            splash(impactPoint.set(d.x, floor, d.z).addScaledVector(hit.normal, .025), { attachment, normal: hit.normal, strength: .6 + sample(i, d.cycle) * .4 });
          }
          spawn(i, eye, false);
        }
        // No segment crosses the exposed surface, including the tail.
        const exposed = sampleSurface(d.x, d.z), bottom = Math.max(exposed + .02, d.y - .65 - sample(i, 5) * .3);
        const visible = d.y > exposed;
        positions[k] = d.x; positions[k + 1] = d.y; positions[k + 2] = d.z;
        positions[k + 3] = d.x + (visible ? wind * .028 : 0); positions[k + 4] = visible ? bottom : d.y; positions[k + 5] = d.z;
      }
      geometry.attributes.position.needsUpdate = count > 0;
      let vertex = 0;
      const point = (x: number, y: number, z: number, brightness: number) => {
        const k = vertex++ * 3; splashPositions[k] = x; splashPositions[k + 1] = y; splashPositions[k + 2] = z;
        colors[k] = brightness * .65; colors[k + 1] = brightness * .85; colors[k + 2] = brightness;
      };
      for (const s of impacts) {
        s.age += step; if (s.age >= .48) continue;
        ringPoint.copy(s.origin); ringNormal.copy(s.normal);
        if (s.attachment) {
          if (!s.attachment.parent || !s.attachment.visible) { s.age = 1; continue; }
          ringPoint.applyMatrix4(s.attachment.matrixWorld); ringNormal.applyMatrix3(matrix.getNormalMatrix(s.attachment.matrixWorld)).normalize();
        }
        u.set(1, 0, 0); if (Math.abs(ringNormal.x) > .9) u.set(0, 0, 1);
        u.addScaledVector(ringNormal, -u.dot(ringNormal)).normalize(); v.crossVectors(ringNormal, u);
        const t = s.age / .48, radius = .025 + t * .22 * s.strength, brightness = (1 - t) ** 2 * s.strength;
        if (!s.sprayOnly) for (let j = 0; j < RING_SEGMENTS; j++) for (const angle of [j / RING_SEGMENTS * Math.PI * 2, (j + 1) / RING_SEGMENTS * Math.PI * 2]) {
          point(ringPoint.x + radius * (Math.cos(angle) * u.x + Math.sin(angle) * v.x), ringPoint.y + radius * (Math.cos(angle) * u.y + Math.sin(angle) * v.y), ringPoint.z + radius * (Math.cos(angle) * u.z + Math.sin(angle) * v.z), brightness * .6);
        }
        for (let j = 0; j < SPOKES; j++) {
          const angle = j / SPOKES * Math.PI * 2 + s.strength * 7, r = s.age * .65 * s.strength;
          const y = Math.max(0, s.age * 1.7 * s.strength - 4.9 * s.age ** 2);
          point(s.x + s.velocity.x * s.age + Math.cos(angle) * r, s.y + y, s.z + s.velocity.z * s.age + Math.sin(angle) * r, brightness);
          point(s.x + s.velocity.x * s.age + Math.cos(angle) * (r + .02), s.y + Math.max(0, y - .04), s.z + s.velocity.z * s.age + Math.sin(angle) * (r + .02), brightness * .3);
        }
      }
      splashes.visible = vertex > 0; splashGeometry.setDrawRange(0, vertex);
      splashGeometry.attributes.position.needsUpdate = splashGeometry.attributes.color.needsUpdate = vertex > 0;
    },
    dispose() { if (disposed) return; disposed = true; root.removeFromParent(); geometry.dispose(); material.dispose(); splashGeometry.dispose(); splashMaterial.dispose(); },
  };
}
