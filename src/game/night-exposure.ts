import * as THREE from 'three';
import type { Direction } from './world-lighting';
import { DAY_SKY_RAYS } from './district-look';

/** Static geometry visibility, independent of the optional GPU shadow/AO passes. */
export const EXPOSURE_HEIGHTS = [-3.5, .5, 2.5, 5.5, 11.5, 23.5, 47.5, 95.5, 191.5] as const;
const CELL = 4, MAX_CELLS = 160, REACH = 260;
/** Daytime ambient occlusion radius: farther buildings bounce sunlight back and do not read as shade. */
const DAY_REACH = 70;
const SKY_RAYS = [[0, 1, 0], [.707, .707, 0], [-.707, .707, 0], [0, .707, .707], [0, .707, -.707]].map(([x, y, z]) => ({ x, y, z }));
export interface NightBlocker { box: THREE.Box3; local: THREE.Box3; inverse: THREE.Matrix4; transmission: number }
interface Node { box: THREE.Box3; items?: NightBlocker[]; left?: Node; right?: Node }

/** Excludes movable effects and small trim. Oriented boxes retain rotated walls and open gaps. */
export function collectNightBlockers(scene: THREE.Object3D) {
  const blockers: NightBlocker[] = [], transform = new THREE.Matrix4(), instance = new THREE.Matrix4();
  scene.updateMatrixWorld(true);
  function visit(object: THREE.Object3D) {
    if (!object.visible || object.userData.fpsEffect) return;
    if (object instanceof THREE.Mesh) {
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      const opaque = materials.filter(m => m.visible && m.colorWrite && !m.transparent && !m.userData.fpsWater && (m instanceof THREE.MeshStandardMaterial || m instanceof THREE.MeshLambertMaterial || m instanceof THREE.MeshPhongMaterial));
      if (opaque.length) {
        if (!object.geometry.boundingBox) object.geometry.computeBoundingBox();
        const local = object.geometry.boundingBox!;
        let clipLocal = local, shear: THREE.Matrix4 | null = null;
        const positions = object.geometry.getAttribute('position');
        // Authored route decks use eight corners: four on the top plane, four below.
        // Shear a sloped top flat before clipping, so its enclosing box cannot shadow the walking surface itself.
        if (positions?.count === 8 && object.geometry.index?.count === 36) {
          const points = Array.from({ length: 8 }, (_, i) => new THREE.Vector3().fromBufferAttribute(positions, i));
          const n = points[1].clone().sub(points[0]).cross(points[2].clone().sub(points[0]));
          if (Math.abs(n.y) > 1e-6) {
            const a = -n.x/n.y, b = -n.z/n.y, c = points[0].y-a*points[0].x-b*points[0].z;
            if (points.slice(0,4).every(p => Math.abs(p.y-a*p.x-b*p.z-c)<1e-4) && points.slice(4).every(p => p.y-a*p.x-b*p.z<c)) {
              shear = new THREE.Matrix4(); shear.elements[1] = -a; shear.elements[9] = -b;
              clipLocal = new THREE.Box3().setFromPoints(points.map(p => p.applyMatrix4(shear!)));
            }
          }
        }
        for (let i = 0; i < (object instanceof THREE.InstancedMesh ? object.count : 1); i++) {
          transform.copy(object.matrixWorld);
          if (object instanceof THREE.InstancedMesh) { object.getMatrixAt(i, instance); transform.multiply(instance); }
          const box = local.clone().applyMatrix4(transform), size = box.getSize(new THREE.Vector3());
          if (size.x < 1 || size.z < 1 || (size.y < .12 && Math.min(size.x, size.z) < 3)) continue;
          const green = opaque.every(m => { const c = (m as THREE.MeshStandardMaterial).color; return c.g > c.r * 1.15 && c.g > c.b * 1.08; });
          const inverse = transform.clone().invert(); if (shear) inverse.premultiply(shear);
          blockers.push({ box, local: clipLocal.clone(), inverse, transmission: green ? .35 : 0 });
        }
      }
    }
    for (const child of object.children) visit(child);
  }
  visit(scene); return blockers;
}

function tree(items: NightBlocker[]): Node {
  const box = new THREE.Box3(); for (const item of items) box.union(item.box);
  if (items.length <= 8) return { box, items };
  const size = box.getSize(new THREE.Vector3()), axis = size.x > size.z ? 'x' : 'z';
  items.sort((a, b) => a.box.min[axis] + a.box.max[axis] - b.box.min[axis] - b.box.max[axis]);
  const mid = items.length >> 1; return { box, left: tree(items.slice(0, mid)), right: tree(items.slice(mid)) };
}

/** Ray/box clipping without allocating vectors in the bake's inner loop. Direction need not be normalised. */
function hit(box: THREE.Box3, x: number, y: number, z: number, dx: number, dy: number, dz: number, far: number) {
  let near = .08;
  if (Math.abs(dx) < 1e-8) { if (x < box.min.x || x > box.max.x) return false; }
  else { const a = (box.min.x - x) / dx, b = (box.max.x - x) / dx; near = Math.max(near, Math.min(a, b)); far = Math.min(far, Math.max(a, b)); }
  if (Math.abs(dy) < 1e-8) { if (y < box.min.y || y > box.max.y) return false; }
  else { const a = (box.min.y - y) / dy, b = (box.max.y - y) / dy; near = Math.max(near, Math.min(a, b)); far = Math.min(far, Math.max(a, b)); }
  if (Math.abs(dz) < 1e-8) { if (z < box.min.z || z > box.max.z) return false; }
  else { const a = (box.min.z - z) / dz, b = (box.max.z - z) / dz; near = Math.max(near, Math.min(a, b)); far = Math.min(far, Math.max(a, b)); }
  return far >= near;
}

export function createExposureQuery(blockers: NightBlocker[]) {
  const root = tree([...blockers]);
  function ray(node: Node, p: Direction, d: Direction, reach = REACH): number {
    if (!hit(node.box, p.x, p.y, p.z, d.x, d.y, d.z, reach)) return 1;
    if (!node.items) { const a = ray(node.left!, p, d, reach); return a === 0 ? 0 : Math.min(a, ray(node.right!, p, d, reach)); }
    let transmission = 1;
    for (const item of node.items) {
      if (!hit(item.box, p.x, p.y, p.z, d.x, d.y, d.z, reach)) continue;
      const e = item.inverse.elements;
      if (hit(item.local, e[0]*p.x+e[4]*p.y+e[8]*p.z+e[12], e[1]*p.x+e[5]*p.y+e[9]*p.z+e[13], e[2]*p.x+e[6]*p.y+e[10]*p.z+e[14],
        e[0]*d.x+e[4]*d.y+e[8]*d.z, e[1]*d.x+e[5]*d.y+e[9]*d.z, e[2]*d.x+e[6]*d.y+e[10]*d.z, reach)) transmission = Math.min(transmission, item.transmission);
      if (transmission === 0) return 0;
    }
    return transmission;
  }
  function contains(node: Node, p: Direction): boolean {
    const b = node.box;
    if (p.x < b.min.x || p.x > b.max.x || p.y < b.min.y || p.y > b.max.y || p.z < b.min.z || p.z > b.max.z) return false;
    if (!node.items) return contains(node.left!, p) || contains(node.right!, p);
    return node.items.some(item => {
      if (item.transmission > 0 || !item.box.containsPoint(p as THREE.Vector3)) return false;
      const e = item.inverse.elements, l = item.local, x = e[0]*p.x+e[4]*p.y+e[8]*p.z+e[12], y = e[1]*p.x+e[5]*p.y+e[9]*p.z+e[13], z = e[2]*p.x+e[6]*p.y+e[10]*p.z+e[14];
      return x >= l.min.x && x <= l.max.x && y >= l.min.y && y <= l.max.y && z >= l.min.z && z <= l.max.z;
    });
  }
  return {
    /** Whether a point is inside solid (non-foliage) geometry, where no visibility is meaningful. */
    inside: (point: Direction) => blockers.length > 0 && contains(root, point),
    /** Cosine-weighted open sky over the upper hemisphere within 70 m: what daytime ambient light reaches. */
    daySky: (point: Direction) => blockers.length ? DAY_SKY_RAYS.reduce((sum, direction) => sum + ray(root, point, direction, DAY_REACH), 0) / DAY_SKY_RAYS.length : 1,
    moon: (point: Direction, direction: Direction) => blockers.length ? ray(root, point, direction) : 1,
    sky(point: Direction) { return SKY_RAYS.reduce((sum, direction) => sum + (blockers.length ? ray(root, point, direction) : 1), 0) / SKY_RAYS.length; },
  };
}

const SKY_FLOOR = .2;
export function skyVisibility(amount: number) { return SKY_FLOOR + (1 - SKY_FLOOR) * amount ** 2.2; }

/**
 * Nine height slices preserve street, sheltered and elevated-space differences. RG = sky / moon visibility.
 * B, for districts with a look (`district-look`), is daytime sky visibility, baked on demand in bounded steps.
 */
export function bakeNightExposure(blockers: NightBlocker[], bounds: THREE.Box3, direction: Direction) {
  const query = createExposureQuery(blockers);
  const width = Math.max(2, Math.min(MAX_CELLS, Math.ceil((bounds.max.x - bounds.min.x) / CELL)));
  const depth = Math.max(2, Math.min(MAX_CELLS, Math.ceil((bounds.max.z - bounds.min.z) / CELL)));
  const data = new Uint8Array(width * depth * EXPOSURE_HEIGHTS.length * 4);
  const point = { x: 0, y: 0, z: 0 };
  function fill(moonOnly: boolean, moon: Direction) {
    if (!blockers.length) { data.fill(255); return; }
    for (let layer = 0; layer < EXPOSURE_HEIGHTS.length; layer++) for (let z = 0; z < depth; z++) for (let x = 0; x < width; x++) {
      point.x = bounds.min.x + (x + .5) / width * (bounds.max.x - bounds.min.x);
      point.y = EXPOSURE_HEIGHTS[layer]; point.z = bounds.min.z + (z + .5) / depth * (bounds.max.z - bounds.min.z);
      const i = ((layer * depth + z) * width + x) * 4;
      if (!moonOnly) data[i] = Math.round(query.sky(point) * 255);
      data[i + 1] = Math.round(query.moon(point, moon) * 255); data[i + 3] = 255;
    }
  }
  fill(false, direction);
  function sample(p: Direction) {
    const x = (p.x - bounds.min.x) / (bounds.max.x - bounds.min.x) * width - .5;
    const z = (p.z - bounds.min.z) / (bounds.max.z - bounds.min.z) * depth - .5;
    if (x < -.5 || z < -.5 || x > width - .5 || z > depth - .5 || p.y > EXPOSURE_HEIGHTS.at(-1)!) return { sky: 1, moon: 1, day: 1 };
    let lower = 0; while (lower < EXPOSURE_HEIGHTS.length - 2 && p.y > EXPOSURE_HEIGHTS[lower + 1]) lower++;
    const t = THREE.MathUtils.clamp((p.y - EXPOSURE_HEIGHTS[lower]) / (EXPOSURE_HEIGHTS[lower + 1] - EXPOSURE_HEIGHTS[lower]), 0, 1);
    function at(layer: number, channel: number) {
      let sum = 0;
      for (let dz = 0; dz < 2; dz++) for (let dx = 0; dx < 2; dx++) {
        const ix = THREE.MathUtils.clamp(Math.floor(x) + dx, 0, width - 1), iz = THREE.MathUtils.clamp(Math.floor(z) + dz, 0, depth - 1);
        sum += data[((layer * depth + iz) * width + ix) * 4 + channel] / 255 * (dx ? x - Math.floor(x) : 1 - x + Math.floor(x)) * (dz ? z - Math.floor(z) : 1 - z + Math.floor(z));
      }
      return sum;
    }
    return { sky: THREE.MathUtils.lerp(at(lower, 0), at(lower + 1, 0), t), moon: THREE.MathUtils.lerp(at(lower, 1), at(lower + 1, 1), t), day: THREE.MathUtils.lerp(at(lower, 2), at(lower + 1, 2), t) };
  }
  function prepareMoon(moon: Direction) {
    const next = new Uint8Array(data); let cursor = 0;
    return () => {
      const end = Math.min(cursor + 2048, width * depth * levels.length);
      for (; cursor < end; cursor++) {
        const layer = Math.floor(cursor / (width * depth)), cell = cursor % (width * depth);
        point.x = bounds.min.x + (cell % width + .5) / width * (bounds.max.x - bounds.min.x);
        point.y = EXPOSURE_HEIGHTS[layer]; point.z = bounds.min.z + (Math.floor(cell / width) + .5) / depth * (bounds.max.z - bounds.min.z);
        next[cursor * 4 + 1] = Math.round(query.moon(point, moon) * 255);
      }
      if (cursor < width * depth * levels.length) return false;
      // Only the moon channel: the daytime bake may have filled B meanwhile.
      for (let i = 1; i < data.length; i += 4) data[i] = next[i];
      return true;
    };
  }
  /**
   * Daytime sky visibility into B, in steps of at most `budget` ms, then solid
   * cells take their open neighbours' values: a wall or roof samples just
   * outside itself, and filtering must not pull in the dark inside.
   */
  function prepareDay() {
    const cells = width * depth * levels.length, solid = new Uint8Array(cells); let cursor = 0;
    return (budget: number) => {
      const stop = performance.now() + budget;
      for (; cursor < cells; cursor++) {
        if ((cursor & 63) === 0 && performance.now() > stop) return false;
        const layer = Math.floor(cursor / (width * depth)), cell = cursor % (width * depth);
        point.x = bounds.min.x + (cell % width + .5) / width * (bounds.max.x - bounds.min.x);
        point.y = EXPOSURE_HEIGHTS[layer]; point.z = bounds.min.z + (Math.floor(cell / width) + .5) / depth * (bounds.max.z - bounds.min.z);
        if (query.inside(point)) { solid[cursor] = 1; continue; }
        data[cursor * 4 + 2] = Math.round(query.daySky(point) * 255);
      }
      dilateDay(solid);
      return true;
    };
  }
  function dilateDay(solid: Uint8Array) {
    const plane = width * depth;
    // The top solid layer of a column (a roof) takes the open air above it.
    for (let layer = levels.length - 2; layer >= 0; layer--) for (let cell = 0; cell < plane; cell++) {
      const i = layer * plane + cell, above = i + plane;
      if (solid[i] && !solid[above]) { data[i * 4 + 2] = data[above * 4 + 2]; solid[i] = 2; }
    }
    // Other solid cells: a few rings of horizontal neighbours, so walls read the street beside them.
    for (let pass = 0; pass < 3; pass++) {
      const filled: number[] = [];
      for (let layer = 0; layer < levels.length; layer++) for (let z = 0; z < depth; z++) for (let x = 0; x < width; x++) {
        const i = layer * plane + z * width + x; if (solid[i] !== 1) continue;
        let sum = 0, count = 0;
        for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, nz = z + dz; if ((!dx && !dz) || nx < 0 || nz < 0 || nx >= width || nz >= depth) continue;
          const j = layer * plane + nz * width + nx; if (solid[j] === 1) continue;
          sum += data[j * 4 + 2]; count++;
        }
        if (count) filled.push(i, Math.round(sum / count));
      }
      for (let k = 0; k < filled.length; k += 2) { data[filled[k] * 4 + 2] = filled[k + 1]; solid[filled[k]] = 3; }
      if (!filled.length) break;
    }
  }
  return { width, depth, data, sample, prepareMoon, prepareDay, updateMoon: (moon: Direction) => fill(true, moon) };
}

const levels = EXPOSURE_HEIGHTS;
const DECLARATIONS = /* glsl */`
uniform sampler2D nightExposureMap;
uniform vec4 nightExposureBounds;
uniform vec2 nightExposureSize;
uniform float nightExposureAmount;
uniform float nightExposureDay;
vec3 nightExposureSlice(vec3 p, float layer) {
  vec2 uv = clamp((p.xz - nightExposureBounds.xy) * nightExposureBounds.zw, 0.0, 1.0);
  uv = clamp(uv, 0.5 / nightExposureSize, 1.0 - 0.5 / nightExposureSize);
  uv.y = (uv.y + layer) / ${levels.length.toFixed(1)};
  return texture2D(nightExposureMap, uv).rgb;
}
vec3 nightExposureAt(vec3 p) {
  if (nightExposureAmount < 0.001 && nightExposureDay < 0.001) return vec3(1.0);
  vec2 uv = (p.xz - nightExposureBounds.xy) * nightExposureBounds.zw;
  if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0))) || p.y > ${levels.at(-1)!.toFixed(1)}) return vec3(1.0);
  ${levels.slice(0, -1).map((h, i) => `if (p.y <= ${levels[i + 1].toFixed(1)}) return mix(nightExposureSlice(p, ${i.toFixed(1)}), nightExposureSlice(p, ${(i + 1).toFixed(1)}), clamp((p.y - ${h.toFixed(1)}) / ${(levels[i + 1] - h).toFixed(1)}, 0.0, 1.0));`).join('\n  ')}
  return vec3(1.0);
}
float nightSkyFactor(float visibility) { return mix(1.0, ${SKY_FLOOR.toFixed(2)} + ${(1 - SKY_FLOOR).toFixed(2)} * pow(visibility, 2.2), nightExposureAmount); }
float nightMoonFactor(float visibility) { return mix(1.0, 0.025 + 0.975 * visibility, nightExposureAmount); }
`;

/** A district look's additions to the lit-material patch (see `district-look`). */
export interface ExposureExtension {
  uniforms: Record<string, THREE.IUniform>;
  declarations: string;
  /** Runs inside RE_IndirectDiffuse / RE_IndirectSpecular after the night factors; `naturalVisibility.b` is daytime sky. */
  indirect: string; specular: string;
  /** Replaces three's fog and runs before tone mapping. */
  fog: string;
  /** Surface variation: vertex declarations and code after project_vertex, then fragment code after color_fragment and roughnessmap_fragment. */
  vertexDeclarations?: string; vertex?: string; albedo?: string; roughness?: string;
}
/** Steps of the daytime bake per update: it never holds up entering a district. */
export const DAY_BAKE_BUDGET_MS = 4;

/**
 * Patches natural light only. Emissive windows, lamp pools, torches and flashes keep their illumination.
 * With an extension (a district look), daytime sky visibility is baked into B after load and fades in.
 */
export function createNightExposure(scene: THREE.Scene, extension?: ExposureExtension) {
  const blockers = collectNightBlockers(scene), bounds = new THREE.Box3();
  for (const b of blockers) bounds.union(b.box);
  if (bounds.isEmpty()) bounds.set(new THREE.Vector3(-100, 0, -100), new THREE.Vector3(100, 100, 100));
  bounds.expandByScalar(4);
  const field = bakeNightExposure(blockers, bounds, { x: 0, y: 1, z: 0 });
  const texture = new THREE.DataTexture(field.data, field.width, field.depth * levels.length);
  texture.minFilter = texture.magFilter = THREE.LinearFilter; texture.needsUpdate = true;
  const uniforms = { nightExposureMap: { value: texture }, nightExposureBounds: { value: new THREE.Vector4(bounds.min.x, bounds.min.z, 1/(bounds.max.x-bounds.min.x), 1/(bounds.max.z-bounds.min.z)) },
    nightExposureSize: { value: new THREE.Vector2(field.width, field.depth) }, nightExposureAmount: { value: 0 }, nightExposureDay: { value: 0 } };
  const dayBake = extension ? field.prepareDay() : null;
  let dayReady = !extension, dayFade = 0, dayTarget = 0, dayBakeMs = 0;
  const patched = new Map<THREE.Material, { compile: THREE.Material['onBeforeCompile']; key: THREE.Material['customProgramCacheKey'] }>();
  let lastMoon: Direction | null = null, rescan = 0, pending: (() => boolean) | null = null, pendingMoon: Direction | null = null;
  function scan() {
    function visit(object: THREE.Object3D) {
      if (object.userData.fpsEffect) return;
      if (object instanceof THREE.Mesh) for (const m of Array.isArray(object.material) ? object.material : [object.material]) {
        if (patched.has(m)) continue;
        const water = !!m.userData.setLighting && !!m.userData.fpsWater;
        if (!water && !(m instanceof THREE.MeshStandardMaterial || m instanceof THREE.MeshLambertMaterial || m instanceof THREE.MeshPhongMaterial)) continue;
        const compile = m.onBeforeCompile, key = m.customProgramCacheKey; patched.set(m, { compile, key });
        m.onBeforeCompile = function(shader: Parameters<THREE.Material['onBeforeCompile']>[0], renderer: THREE.WebGLRenderer) {
          compile.call(this, shader, renderer); Object.assign(shader.uniforms, uniforms, extension?.uniforms);
          shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>\n${DECLARATIONS}${water ? '' : extension?.declarations ?? ''}`);
          if (water) {
            shader.fragmentShader = shader.fragmentShader.replace('vec3 colour = mix(body, sky, fresnel);', `
              vec3 naturalVisibility = nightExposureAt(vWorld + normal * 0.35);
              body *= mix(1.0, (nightSkyFactor(naturalVisibility.r) + nightMoonFactor(naturalVisibility.g)) * 0.5, nightExposureAmount);
              sky *= nightSkyFactor(naturalVisibility.r);
              vec3 colour = mix(body, sky, fresnel);`)
              .replace('glint * uGlintStrength;', 'glint * uGlintStrength * nightMoonFactor(naturalVisibility.g);');
          } else {
            shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>\nvarying vec3 vExposureWorld;\nvarying vec3 vExposureNormal;\n${extension?.vertexDeclarations ?? ''}`)
              .replace('#include <project_vertex>', `#include <project_vertex>
                vec4 exposureWorld = vec4(transformed, 1.0);
                #ifdef USE_INSTANCING
                  exposureWorld = instanceMatrix * exposureWorld;
                #endif
                vExposureWorld = (modelMatrix * exposureWorld).xyz;
                vExposureNormal = inverseTransformDirection(transformedNormal, viewMatrix);
                ${extension?.vertex ?? ''}`);
            if (extension?.albedo) shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>\n${extension.albedo}`);
            if (extension?.roughness) shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\n${extension.roughness}`);
            shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vExposureWorld;\nvarying vec3 vExposureNormal;')
              .replace('#include <lights_fragment_begin>', `vec3 naturalVisibility = nightExposureAt(vExposureWorld + normalize(vExposureNormal) * 0.35);\n${THREE.ShaderChunk.lights_fragment_begin.replace('getDirectionalLightInfo( directionalLight, directLight );', 'getDirectionalLightInfo( directionalLight, directLight );\n directLight.color *= nightMoonFactor(naturalVisibility.g);')}`)
              .replace('#include <lights_fragment_end>', `
                #if defined(RE_IndirectDiffuse)
                  irradiance *= nightSkyFactor(naturalVisibility.r);
                  iblIrradiance *= nightSkyFactor(naturalVisibility.r);
                  ${extension?.indirect ?? ''}
                #endif
                #if defined(RE_IndirectSpecular)
                  radiance *= nightSkyFactor(naturalVisibility.r); clearcoatRadiance *= nightSkyFactor(naturalVisibility.r);
                  ${extension?.specular ?? ''}
                #endif
                #include <lights_fragment_end>`);
            if (extension) shader.fragmentShader = shader.fragmentShader.replace('#include <fog_fragment>', '')
              .replace('#include <tonemapping_fragment>', `${extension.fog}\n#include <tonemapping_fragment>`);
          }
        };
        // A recreated controller must bind its own uniforms even if this material already cached an older program.
        m.customProgramCacheKey = function() { return key.call(this) + '|natural-night-exposure:' + texture.id; }; m.needsUpdate = true;
      }
      object.children.forEach(visit);
    }
    visit(scene);
  }
  scan();
  return {
    field, blockerCount: blockers.length, scanMaterials: scan,
    /** Whether the daytime channel is baked, and the main-thread time its steps took in all. */
    get dayReady() { return dayReady; }, get dayBakeMs() { return dayBakeMs; },
    /** Completes the daytime bake at once (review pages and tests), with no fade. */
    finishDay() {
      if (dayReady || !dayBake) return; const start = performance.now();
      while (!dayBake(1000)) { /* bounded steps until done */ }
      dayBakeMs += performance.now() - start; dayReady = true; dayFade = 1; texture.needsUpdate = true;
      uniforms.nightExposureDay.value = dayTarget;
    },
    /** `day` is the look's daytime indirect strength; it applies once the bake is done, eased in over 1.5 s. */
    update(amount: number, moon: Direction, dt: number, day = 0) {
      uniforms.nightExposureAmount.value = amount;
      if (!dayReady && dayBake) {
        const start = performance.now(); dayReady = dayBake(DAY_BAKE_BUDGET_MS); dayBakeMs += performance.now() - start;
        if (dayReady) texture.needsUpdate = true;
      }
      if (dayReady) dayFade = Math.min(1, dayFade + Math.max(0, dt) / 1.5);
      dayTarget = day; uniforms.nightExposureDay.value = extension ? day * dayFade : 0;
      if (amount > 0 && !lastMoon) {
        field.updateMoon(moon); texture.needsUpdate = true; lastMoon = { ...moon };
      } else if (amount > 0 && lastMoon && !pending && moon.x*lastMoon.x+moon.y*lastMoon.y+moon.z*lastMoon.z < .996) {
        pendingMoon = { ...moon }; pending = field.prepareMoon(pendingMoon);
      }
      // Moving moonlight is rebuilt in bounded batches, then uploaded atomically; no periodic full-bake frame hitch.
      if (pending?.()) { texture.needsUpdate = true; pending = null; lastMoon = pendingMoon; }
      if ((rescan -= dt) <= 0) { rescan = .5; scan(); }
    },
    sample: field.sample,
    dispose() { for (const [m, original] of patched) { m.onBeforeCompile = original.compile; m.customProgramCacheKey = original.key; m.needsUpdate = true; } texture.dispose(); patched.clear(); },
  };
}
