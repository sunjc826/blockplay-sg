import * as THREE from 'three';
import { insideFootprint, type Obstacle } from './region-collision';
import { RAIN_DETAIL, type WorldDetail } from './environment-quality';
import type { VehicleRainHit } from './vehicle-rain';
import { gustFactor, gustSheet, gustWave } from './wind-gusts';

export interface RainSplashOptions { strength?: number; normal?: THREE.Vector3; attachment?: THREE.Object3D; velocity?: THREE.Vector3; sprayOnly?: boolean }

/** Static column index shared by streak clipping, roof splashes and shelter. */
export function createRainSurface(obstacles: readonly Obstacle[], ground: (x: number, z: number) => number = () => 0) {
  const cells = new Map<string, Obstacle[]>(), size = 12;
  for (const o of obstacles.filter(o => !o.water)) for (let x = Math.floor(o.minX / size); x <= Math.floor(o.maxX / size); x++)
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

const DROP_COUNT = RAIN_DETAIL.ultra.drops, SPRAY_COUNT = RAIN_DETAIL.ultra.spray, SPRAY_REACH = 42, SPLASH_COUNT = 192, SPOKES = 4, RING_SEGMENTS = 12;
const LAMP_VERTEX = /* glsl */`uniform sampler2D rainLampMap; uniform vec4 rainLampBounds; uniform vec3 rainLampLight;
vec3 rainLamp(vec3 world) {
  vec2 uv = (world.xz - rainLampBounds.xy) * rainLampBounds.zw;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return vec3(0.0);
  vec4 pool = texture2D(rainLampMap, uv);
  // Only what falls through the cone under the head is lit: nothing above a lamp, most just below it.
  float lift = world.y - (pool.g * 60.0 - 10.0);
  return rainLampLight * pool.r * (.3 + .7 * pool.r) * (1.0 - smoothstep(5.0, 8.5, lift)) * (.55 + .45 * smoothstep(0.0, 5.0, lift));
}
`;
/** Rain shown falling through the cones of the nearest lamps: how many lamps, streaks under each, how far off, and the cone's radius per metre below the head. */
export const LAMP_RAIN = { lamps: 24, streaks: 48, reach: 80, spread: .8 } as const;
export interface RainLamps { map: THREE.Texture; bounds: THREE.Vector4; light: THREE.Color; heads?: Float32Array }
const sample = (i: number, salt: number) => { const n = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453; return n - Math.floor(n); };

/**
 * Three fixed draw calls; particles stay in world space as the eye moves.
 * Rain follows the gust fronts the trees lean to (`wind-gusts.ts`): in a lull it falls nearly
 * straight and thin; as a front passes it slants, lengthens and brightens in sheets, impacts
 * throw their droplets downwind, and blown spray crosses roofs and roads with the front.
 */
export function createRainEffects(parent: THREE.Object3D, surface: (x: number, z: number) => number, movingSurface?: (x: number, z: number, hit: VehicleRainHit) => VehicleRainHit) {
  const root = new THREE.Group(); root.name = 'rain-effects'; parent.add(root);
  const positions = new Float32Array(DROP_COUNT * 6);
  const gusts = new Float32Array(DROP_COUNT * 2).fill(1);
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('rainGust', new THREE.BufferAttribute(gusts, 1).setUsage(THREE.DynamicDrawUsage));
  const material = new THREE.LineBasicMaterial({ color: '#c1deeb', transparent: true, opacity: .48, depthWrite: false });
  const rainEye = { value: new THREE.Vector3() }, rainReach = { value: 24 };
  // Street lamps (`world-night-lights.ts` bakes their pools top-down): rain falling through a pool catches
  // its light, so at night a lamp's glow fills out into the lit streaks and spray around it.
  const darkMap = new THREE.DataTexture(new Uint8Array(4), 1, 1); darkMap.needsUpdate = true;
  const lampUniforms = { rainLampMap: { value: darkMap as THREE.Texture }, rainLampBounds: { value: new THREE.Vector4(0, 0, 0, 0) }, rainLampLight: { value: new THREE.Color(0, 0, 0) } };
  const rainAmbient = { value: 1 };
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, { rainEye, rainReach, rainAmbient }, lampUniforms);
    shader.vertexShader = 'attribute float rainGust; varying float rainAlpha; varying vec3 rainWorld; varying vec3 rainLit;\n' + LAMP_VERTEX + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nrainAlpha = rainGust; rainWorld = (modelMatrix * vec4(position, 1.0)).xyz; rainLit = rainLamp(rainWorld);');
    shader.fragmentShader = 'varying float rainAlpha; varying vec3 rainWorld; varying vec3 rainLit; uniform float rainAmbient; uniform vec3 rainEye; uniform float rainReach;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <alphatest_fragment>', `
      diffuseColor.rgb = diffuseColor.rgb * rainAmbient + rainLit;
      diffuseColor.a *= min(2.0, rainAlpha + 2.5 * max(rainLit.r, rainLit.g)) * (1.0 - smoothstep(rainReach * .75, rainReach, distance(rainWorld.xz, rainEye.xz)));
      #include <alphatest_fragment>`);
  };
  material.customProgramCacheKey = () => 'rain-distance-fade-v3';
  const streaks = new THREE.LineSegments(geometry, material); streaks.name = 'rain-streaks'; streaks.frustumCulled = false; root.add(streaks);
  // Each impact has an expanding ring and four short ballistic droplets.
  const vertices = SPLASH_COUNT * (RING_SEGMENTS + SPOKES) * 2;
  const splashPositions = new Float32Array(vertices * 3), colors = new Float32Array(vertices * 3);
  const splashGeometry = new THREE.BufferGeometry();
  splashGeometry.setAttribute('position', new THREE.BufferAttribute(splashPositions, 3).setUsage(THREE.DynamicDrawUsage));
  splashGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3).setUsage(THREE.DynamicDrawUsage));
  const splashMaterial = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: .65, blending: THREE.AdditiveBlending, depthWrite: false });
  const splashes = new THREE.LineSegments(splashGeometry, splashMaterial); splashes.name = 'rain-splashes'; splashes.frustumCulled = false; root.add(splashes);
  // Blown spray: soft motes that ride the wind just above whatever the rain lands on, all but
  // invisible in a lull and thick at a gust's height, so a front shows as it crosses.
  const sprayPositions = new Float32Array(SPRAY_COUNT * 3), sprayLook = new Float32Array(SPRAY_COUNT * 2);
  const sprayGeometry = new THREE.BufferGeometry();
  sprayGeometry.setAttribute('position', new THREE.BufferAttribute(sprayPositions, 3).setUsage(THREE.DynamicDrawUsage));
  sprayGeometry.setAttribute('spray', new THREE.BufferAttribute(sprayLook, 2).setUsage(THREE.DynamicDrawUsage));
  const sprayMaterial = new THREE.PointsMaterial({ color: '#c8dbe4', size: 1, sizeAttenuation: true, transparent: true, depthWrite: false, fog: false, toneMapped: false });
  sprayMaterial.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, lampUniforms);
    shader.vertexShader = 'attribute vec2 spray; varying float sprayAlpha; varying vec3 sprayLit;\n' + LAMP_VERTEX + shader.vertexShader.replace('gl_PointSize = size;', 'gl_PointSize = size * spray.x;')
      .replace('#include <fog_vertex>', 'gl_PointSize = min(gl_PointSize, 240.0); sprayAlpha = spray.y * smoothstep(1.5, 7.0, -mvPosition.z); sprayLit = rainLamp((modelMatrix * vec4(position, 1.0)).xyz);\n#include <fog_vertex>');
    shader.fragmentShader = 'varying float sprayAlpha; varying vec3 sprayLit;\n' + shader.fragmentShader.replace('#include <alphatest_fragment>', `
      vec2 sprayPoint = gl_PointCoord * 2.0 - 1.0;
      diffuseColor.rgb += sprayLit * .6;
      diffuseColor.a *= sprayAlpha * (1.0 + 1.5 * max(sprayLit.r, sprayLit.g)) * (1.0 - smoothstep(0.0, 1.0, dot(sprayPoint, sprayPoint)));
      #include <alphatest_fragment>`);
  };
  sprayMaterial.customProgramCacheKey = () => 'rain-spray-v2';
  const spray = new THREE.Points(sprayGeometry, sprayMaterial); spray.name = 'rain-spray'; spray.frustumCulled = false; spray.visible = false; root.add(spray);
  // Rain under the lamps: the open fall is too thin to show a lamp's cone, so the nearest lamps each get
  // their own streaks, lit by how close they pass to the head. Stateless: a streak's place follows from the clock.
  const coneVertices = LAMP_RAIN.lamps * LAMP_RAIN.streaks * 2, conePositions = new Float32Array(coneVertices * 3), coneColors = new Float32Array(coneVertices * 3);
  const coneGeometry = new THREE.BufferGeometry();
  coneGeometry.setAttribute('position', new THREE.BufferAttribute(conePositions, 3).setUsage(THREE.DynamicDrawUsage));
  coneGeometry.setAttribute('color', new THREE.BufferAttribute(coneColors, 3).setUsage(THREE.DynamicDrawUsage));
  const coneMaterial = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const cones = new THREE.LineSegments(coneGeometry, coneMaterial); cones.name = 'rain-lamp-cones'; cones.frustumCulled = false; cones.visible = false; root.add(cones);
  const nearLamps: number[] = []; let lamps: RainLamps | null = null, lampScan = 0;
  const motes = Array.from({ length: SPRAY_COUNT }, () => ({ x: 0, y: 0, z: 0, age: 0, life: 0, size: 1, cycle: 0 }));
  root.traverse(o => { o.raycast = () => {}; o.userData.fpsEffect = true; });
  const drops = Array.from({ length: DROP_COUNT }, () => ({ x: 0, y: 0, z: 0, cycle: 0, ready: false }));
  const impacts = Array.from({ length: SPLASH_COUNT }, () => ({ x: 0, y: 0, z: 0, age: 1, strength: 0, attachment: undefined as THREE.Object3D | undefined, origin: new THREE.Vector3(), normal: new THREE.Vector3(0, 1, 0), velocity: new THREE.Vector3(), sprayOnly: false }));
  let cursor = 0, disposed = false, detail: WorldDetail = 'low';
  let profile: typeof RAIN_DETAIL[WorldDetail] = RAIN_DETAIL.low;
  let nearCount: number = profile.nearDrops;
  let activeCount = 0, clock = 0, sprayCount = 0;
  const blown = new THREE.Vector3();
  const hit: VehicleRainHit = { height: 0, normal: new THREE.Vector3(0, 1, 0) };
  const impactPoint = new THREE.Vector3(), ringPoint = new THREE.Vector3(), ringNormal = new THREE.Vector3(), u = new THREE.Vector3(), v = new THREE.Vector3(), matrix = new THREE.Matrix3();
  function sampleSurface(x: number, z: number) {
    hit.height = surface(x, z); hit.object = undefined; hit.kind = 'solid'; hit.normal.set(0, 1, 0);
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
    const span = i < nearCount ? (i % 3 === 0 ? 16 : 48) : profile.radius * 2;
    d.x = eye.x + (sample(i, salt) - .5) * span; d.z = eye.z + (sample(i, salt + 1) - .5) * span;
    const top = eye.y + (i < nearCount ? 22 : profile.height), floor = Math.max(eye.y - 12, sampleSurface(d.x, d.z));
    d.y = initial ? floor + sample(i, salt + 2) * Math.max(0, top - floor) : top;
    d.ready = true;
  }
  return {
    root, streaks, splashes, spray, cones, splash,
    get counts() { return { drops: geometry.drawRange.count / 2, splashes: impacts.filter(s => s.age < .48).length }; },
    /**
     * The light rain is seen by: `ambient` 1 by day down to a faint grey at night, and the street lamps'
     * baked pools (`lamps` absent: none), with `light` their colour at its present strength.
     */
    setLight(ambient: number, next?: RainLamps | null) {
      rainAmbient.value = ambient; if (lamps !== (next ?? null)) lampScan = 0;
      lamps = next ?? null;
      lampUniforms.rainLampMap.value = lamps?.map ?? darkMap;
      if (lamps) { lampUniforms.rainLampBounds.value.copy(lamps.bounds); lampUniforms.rainLampLight.value.copy(lamps.light); } else lampUniforms.rainLampLight.value.setRGB(0, 0, 0);
    },
    /** Streaks drawn under street lamps this frame. */
    get lampStreaks() { return coneGeometry.drawRange.count / 2; },
    /** Spray motes drawn this frame; none on low rain detail, with reduced effects or in still air. */
    get sprayCount() { return sprayCount; },
    get radius() { return profile.radius; },
    /**
     * `time` is the gust clock the trees run on (omitted: this pool keeps its own); `tint` the colour
     * spray takes, the air's own (the fog's), so it darkens with the hour.
     */
    update(dt: number, eye: THREE.Vector3, rain: number, wind: number, reduced: boolean, quality: WorldDetail = 'low', time?: number, tint?: THREE.Color) {
      if (disposed) return;
      const step = Math.max(0, Math.min(.1, dt));
      clock = time ?? clock + step;
      // Reduced effects keep a steady fall: no fronts, no spray.
      const gustiness = reduced ? 0 : Math.min(1, Math.max(0, wind) / 3);
      const nextDetail = reduced ? 'low' : quality;
      if (detail !== nextDetail) { detail = nextDetail; drops.forEach(d => { d.ready = false; }); }
      profile = RAIN_DETAIL[detail]; rainEye.value.copy(eye); rainReach.value = profile.radius;
      const count = Math.floor(profile.drops * THREE.MathUtils.clamp(rain, 0, 1) * (reduced ? .18 : 1));
      nearCount = Math.floor(count * profile.nearDrops / profile.drops);
      streaks.visible = count > 0; geometry.setDrawRange(0, count * 2);
      for (let i = count; i < activeCount; i++) drops[i].ready = false;
      activeCount = count;
      for (let i = 0; i < count; i++) {
        const d = drops[i];
        if (!d.ready || Math.abs(d.x - eye.x) > profile.radius + 1 || Math.abs(d.z - eye.z) > profile.radius + 1 || d.y > eye.y + profile.height + 5 || d.y < eye.y - 13) spawn(i, eye, true);
        const previousY = d.y;
        const wave = gustiness ? gustWave(d.x, d.z, clock) : 0, gust = wave * wave * wave * gustiness, sheet = gust ? gustSheet(d.x, d.z, clock) : 0;
        const blow = wind * (gustiness ? gustFactor(wave) : 1), veer = .18 + .2 * sheet * gust, fall = 21 + sample(i, 4) * 9;
        d.x += blow * step; d.z += blow * veer * step; d.y -= fall * step;
        const floor = sampleSurface(d.x, d.z), k = i * 6;
        let exposed = floor;
        if (d.y <= floor || d.y < eye.y - 12) {
          if (hit.kind !== 'water' && i % 3 === 0 && Math.hypot(d.x - eye.x, d.z - eye.z) < 28 && previousY > floor && d.y <= floor && Math.abs(floor - eye.y) < 9) {
            const attachment = hit.object;
            const dx = (surface(d.x + .1, d.z) - surface(d.x - .1, d.z)) / .2;
            const dz = (surface(d.x, d.z + .1) - surface(d.x, d.z - .1)) / .2;
            if (!attachment) hit.normal.set(Math.abs(dx) <= 1 ? -dx : 0, 1, Math.abs(dz) <= 1 ? -dz : 0).normalize();
            splash(impactPoint.set(d.x, floor, d.z).addScaledVector(hit.normal, .025), { attachment, normal: hit.normal, strength: hit.kind === 'rail' ? .22 : .6 + sample(i, d.cycle) * .4, sprayOnly: hit.kind === 'rail', velocity: attachment ? undefined : blown.set(blow * .3, 0, blow * veer * .3) });
          }
          spawn(i, eye, false);
          exposed = sampleSurface(d.x, d.z);
        }
        // No segment crosses the exposed surface, including the tail.
        const bottom = Math.max(exposed + .02, d.y - (.65 + sample(i, 5) * .3) * (i < nearCount ? 1 : 1.8) * (1 + .3 * gust));
        // The tail trails downwind by the drop's own slope, drawn half again as steep so a gust reads at a glance.
        const visible = d.y > exposed, lean = visible ? (d.y - bottom) / fall * 1.5 : 0;
        positions[k] = d.x; positions[k + 1] = d.y; positions[k + 2] = d.z;
        positions[k + 3] = d.x + blow * lean; positions[k + 4] = visible ? bottom : d.y; positions[k + 5] = d.z + blow * veer * lean;
        // Thin in a lull, dense in a gust, and banded into sheets inside it.
        gusts[i * 2] = gusts[i * 2 + 1] = 1 + gustiness * (-.32 + gust * (.85 + .4 * sheet));
      }
      geometry.attributes.position.needsUpdate = geometry.attributes.rainGust.needsUpdate = count > 0;
      sprayCount = Math.floor(profile.spray * THREE.MathUtils.clamp(rain, 0, 1) * gustiness);
      spray.visible = sprayCount > 0; sprayGeometry.setDrawRange(0, sprayCount);
      if (tint) sprayMaterial.color.copy(tint);
      for (let i = 0; i < sprayCount; i++) {
        const m = motes[i];
        let ground = sampleSurface(m.x, m.z);
        if (m.age >= m.life || m.y <= ground || Math.hypot(m.x - eye.x, m.z - eye.z) > SPRAY_REACH) {
          const salt = ++m.cycle * 5, lift = sample(i, salt + 2);
          m.x = eye.x + (sample(i, salt) - .5) * SPRAY_REACH * 1.9; m.z = eye.z + (sample(i, salt + 1) - .5) * SPRAY_REACH * 1.9;
          ground = sampleSurface(m.x, m.z);
          // Most of it skims the surface it was knocked off; a little is carried higher.
          m.y = ground + .25 + lift * lift * 9; m.life = 2.2 + sample(i, salt + 3) * 2.6; m.size = 1.3 + sample(i, salt + 4) * 2.4;
          m.age = m.cycle === 1 ? sample(i, 9) * m.life : 0;
        }
        const wave = gustWave(m.x, m.z, clock), gust = wave * wave * wave, blow = wind * gustFactor(wave) * 1.1;
        m.age += step; m.x += blow * step; m.z += blow * (.18 + .2 * gustSheet(m.x, m.z, clock) * gust) * step; m.y += (.5 * gust - .55) * step;
        const far = Math.hypot(m.x - eye.x, m.z - eye.z), life = m.age / m.life;
        const shown = m.y > ground && Math.abs(m.y - eye.y) < 30 ? Math.sin(Math.PI * Math.min(1, life)) * (1 - THREE.MathUtils.smoothstep(far, SPRAY_REACH * .7, SPRAY_REACH)) : 0;
        sprayPositions[i * 3] = m.x; sprayPositions[i * 3 + 1] = m.y; sprayPositions[i * 3 + 2] = m.z;
        sprayLook[i * 2] = m.size * (1 + life * .8); sprayLook[i * 2 + 1] = shown * rain * (.012 + .1 * gust);
      }
      sprayGeometry.attributes.position.needsUpdate = sprayGeometry.attributes.spray.needsUpdate = sprayCount > 0;
      const heads = lamps?.heads, glow = lamps ? Math.max(lamps.light.r, lamps.light.g, lamps.light.b) : 0;
      const perLamp = heads && glow > .01 && detail !== 'low' ? Math.floor(LAMP_RAIN.streaks * THREE.MathUtils.clamp(rain, 0, 1)) : 0;
      let coneVertex = 0;
      if (perLamp && heads && lamps) {
        lampScan -= step;
        if (lampScan <= 0) {
          lampScan = .5; nearLamps.length = 0;
          for (let i = 0; i < heads.length / 4; i++) if (Math.hypot(heads[i * 4] - eye.x, heads[i * 4 + 2] - eye.z) < LAMP_RAIN.reach) nearLamps.push(i);
          nearLamps.sort((a, b) => Math.hypot(heads[a * 4] - eye.x, heads[a * 4 + 2] - eye.z) - Math.hypot(heads[b * 4] - eye.x, heads[b * 4 + 2] - eye.z));
          nearLamps.length = Math.min(nearLamps.length, LAMP_RAIN.lamps);
        }
        const { r, g, b } = lamps.light;
        for (const lamp of nearLamps) {
          const hx = heads[lamp * 4], hy = heads[lamp * 4 + 1], hz = heads[lamp * 4 + 2], drop = heads[lamp * 4 + 3];
          const wave = gustiness ? gustWave(hx, hz, clock) : 0, blow = wind * (gustiness ? gustFactor(wave) : 1);
          const fade = 1 - THREE.MathUtils.smoothstep(Math.hypot(hx - eye.x, hz - eye.z), LAMP_RAIN.reach * .7, LAMP_RAIN.reach);
          for (let j = 0; j < perLamp; j++) {
            const seed = lamp * 131 + j, fall = 15 + sample(seed, 1) * 8, length = .45 + sample(seed, 2) * .45;
            // Each streak loops from just above the head to the ground, entering upwind so the gust carries it through the cone.
            // They crowd towards the middle, where the light is: spread evenly, all but one or two would fall through the dim skirt.
            const depth = ((clock * fall + sample(seed, 3) * 40) % (drop + 1)) - 1, angle = sample(seed, 4) * Math.PI * 2, out = sample(seed, 5) * Math.min(3.4, drop * .45);
            const carried = blow * (depth - drop * .5) / fall, x = hx + Math.cos(angle) * out + carried, z = hz + Math.sin(angle) * out + carried * .18;
            const tail = Math.min(length, Math.max(0, drop - depth)), lean = blow * tail / fall * 1.5;
            // Bright by the head and down the middle of the cone, nothing outside it or above the head.
            const beside = Math.hypot(x - hx, z - hz), cone = .5 + Math.max(0, depth) * LAMP_RAIN.spread;
            const lit = depth <= 0 || beside >= cone ? 0 : (1 - beside / cone) ** 1.2 / (1 + (depth * depth + beside * beside) / 22) * fade * 3.2;
            const k = coneVertex * 3;
            conePositions[k] = x; conePositions[k + 1] = hy - depth; conePositions[k + 2] = z;
            conePositions[k + 3] = x + lean; conePositions[k + 4] = hy - depth - tail; conePositions[k + 5] = z + lean * .18;
            coneColors[k] = r * lit; coneColors[k + 1] = g * lit; coneColors[k + 2] = b * lit;
            coneColors[k + 3] = r * lit * .35; coneColors[k + 4] = g * lit * .35; coneColors[k + 5] = b * lit * .35;
            coneVertex += 2;
          }
        }
      }
      cones.visible = coneVertex > 0; coneGeometry.setDrawRange(0, coneVertex);
      coneGeometry.attributes.position.needsUpdate = coneGeometry.attributes.color.needsUpdate = coneVertex > 0;
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
    dispose() { if (disposed) return; disposed = true; root.removeFromParent(); geometry.dispose(); material.dispose(); splashGeometry.dispose(); splashMaterial.dispose(); sprayGeometry.dispose(); sprayMaterial.dispose(); coneGeometry.dispose(); coneMaterial.dispose(); darkMap.dispose(); },
  };
}
