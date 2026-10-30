import * as THREE from 'three';
import type { Direction } from './world-lighting';

/** Static geometry visibility, independent of the optional GPU shadow/AO passes. */
export const EXPOSURE_HEIGHTS = [-3.5, .5, 2.5, 5.5, 11.5, 23.5, 47.5, 95.5, 191.5] as const;
const CELL = 4, MAX_CELLS = 160, REACH = 260;
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
        for (let i = 0; i < (object instanceof THREE.InstancedMesh ? object.count : 1); i++) {
          transform.copy(object.matrixWorld);
          if (object instanceof THREE.InstancedMesh) { object.getMatrixAt(i, instance); transform.multiply(instance); }
          const box = local.clone().applyMatrix4(transform), size = box.getSize(new THREE.Vector3());
          if (size.x < 1 || size.z < 1 || (size.y < .12 && Math.min(size.x, size.z) < 3)) continue;
          const green = opaque.every(m => { const c = (m as THREE.MeshStandardMaterial).color; return c.g > c.r * 1.15 && c.g > c.b * 1.08; });
          blockers.push({ box, local: local.clone(), inverse: transform.clone().invert(), transmission: green ? .35 : 0 });
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
  function ray(node: Node, p: Direction, d: Direction): number {
    if (!hit(node.box, p.x, p.y, p.z, d.x, d.y, d.z, REACH)) return 1;
    if (!node.items) { const a = ray(node.left!, p, d); return a === 0 ? 0 : Math.min(a, ray(node.right!, p, d)); }
    let transmission = 1;
    for (const item of node.items) {
      if (!hit(item.box, p.x, p.y, p.z, d.x, d.y, d.z, REACH)) continue;
      const e = item.inverse.elements;
      if (hit(item.local, e[0]*p.x+e[4]*p.y+e[8]*p.z+e[12], e[1]*p.x+e[5]*p.y+e[9]*p.z+e[13], e[2]*p.x+e[6]*p.y+e[10]*p.z+e[14],
        e[0]*d.x+e[4]*d.y+e[8]*d.z, e[1]*d.x+e[5]*d.y+e[9]*d.z, e[2]*d.x+e[6]*d.y+e[10]*d.z, REACH)) transmission = Math.min(transmission, item.transmission);
      if (transmission === 0) return 0;
    }
    return transmission;
  }
  return {
    moon: (point: Direction, direction: Direction) => blockers.length ? ray(root, point, direction) : 1,
    sky(point: Direction) { return SKY_RAYS.reduce((sum, direction) => sum + (blockers.length ? ray(root, point, direction) : 1), 0) / SKY_RAYS.length; },
  };
}

const SKY_FLOOR = .2;
export function skyVisibility(amount: number) { return SKY_FLOOR + (1 - SKY_FLOOR) * amount ** 2.2; }

/** Nine height slices preserve street, sheltered and elevated-space differences. RG = sky / moon visibility. */
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
    if (x < -.5 || z < -.5 || x > width - .5 || z > depth - .5 || p.y > EXPOSURE_HEIGHTS.at(-1)!) return { sky: 1, moon: 1 };
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
    return { sky: THREE.MathUtils.lerp(at(lower, 0), at(lower + 1, 0), t), moon: THREE.MathUtils.lerp(at(lower, 1), at(lower + 1, 1), t) };
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
      data.set(next); return true;
    };
  }
  return { width, depth, data, sample, prepareMoon, updateMoon: (moon: Direction) => fill(true, moon) };
}

const levels = EXPOSURE_HEIGHTS;
const DECLARATIONS = /* glsl */`
uniform sampler2D nightExposureMap;
uniform vec4 nightExposureBounds;
uniform vec2 nightExposureSize;
uniform float nightExposureAmount;
vec2 nightExposureSlice(vec3 p, float layer) {
  vec2 uv = clamp((p.xz - nightExposureBounds.xy) * nightExposureBounds.zw, 0.0, 1.0);
  uv = clamp(uv, 0.5 / nightExposureSize, 1.0 - 0.5 / nightExposureSize);
  uv.y = (uv.y + layer) / ${levels.length.toFixed(1)};
  return texture2D(nightExposureMap, uv).rg;
}
vec2 nightExposureAt(vec3 p) {
  if (nightExposureAmount < 0.001) return vec2(1.0);
  vec2 uv = (p.xz - nightExposureBounds.xy) * nightExposureBounds.zw;
  if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0))) || p.y > ${levels.at(-1)!.toFixed(1)}) return vec2(1.0);
  ${levels.slice(0, -1).map((h, i) => `if (p.y <= ${levels[i + 1].toFixed(1)}) return mix(nightExposureSlice(p, ${i.toFixed(1)}), nightExposureSlice(p, ${(i + 1).toFixed(1)}), clamp((p.y - ${h.toFixed(1)}) / ${(levels[i + 1] - h).toFixed(1)}, 0.0, 1.0));`).join('\n  ')}
  return vec2(1.0);
}
float nightSkyFactor(float visibility) { return mix(1.0, ${SKY_FLOOR.toFixed(2)} + ${(1 - SKY_FLOOR).toFixed(2)} * pow(visibility, 2.2), nightExposureAmount); }
float nightMoonFactor(float visibility) { return mix(1.0, 0.025 + 0.975 * visibility, nightExposureAmount); }
`;

/** Patches natural light only. Emissive windows, lamp pools, torches and flashes keep their illumination. */
export function createNightExposure(scene: THREE.Scene) {
  const blockers = collectNightBlockers(scene), bounds = new THREE.Box3();
  for (const b of blockers) bounds.union(b.box);
  if (bounds.isEmpty()) bounds.set(new THREE.Vector3(-100, 0, -100), new THREE.Vector3(100, 100, 100));
  bounds.expandByScalar(4);
  const field = bakeNightExposure(blockers, bounds, { x: 0, y: 1, z: 0 });
  const texture = new THREE.DataTexture(field.data, field.width, field.depth * levels.length);
  texture.minFilter = texture.magFilter = THREE.LinearFilter; texture.needsUpdate = true;
  const uniforms = { nightExposureMap: { value: texture }, nightExposureBounds: { value: new THREE.Vector4(bounds.min.x, bounds.min.z, 1/(bounds.max.x-bounds.min.x), 1/(bounds.max.z-bounds.min.z)) },
    nightExposureSize: { value: new THREE.Vector2(field.width, field.depth) }, nightExposureAmount: { value: 0 } };
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
          compile.call(this, shader, renderer); Object.assign(shader.uniforms, uniforms);
          shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>\n${DECLARATIONS}`);
          if (water) {
            shader.fragmentShader = shader.fragmentShader.replace('vec3 colour = mix(body, sky, fresnel);', `
              vec2 naturalVisibility = nightExposureAt(vWorld + normal * 0.35);
              body *= mix(1.0, (nightSkyFactor(naturalVisibility.r) + nightMoonFactor(naturalVisibility.g)) * 0.5, nightExposureAmount);
              sky *= nightSkyFactor(naturalVisibility.r);
              vec3 colour = mix(body, sky, fresnel);`)
              .replace('glint * uGlintStrength;', 'glint * uGlintStrength * nightMoonFactor(naturalVisibility.g);');
          } else {
            shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vExposureWorld;\nvarying vec3 vExposureNormal;')
              .replace('#include <project_vertex>', `#include <project_vertex>
                vec4 exposureWorld = vec4(transformed, 1.0);
                #ifdef USE_INSTANCING
                  exposureWorld = instanceMatrix * exposureWorld;
                #endif
                vExposureWorld = (modelMatrix * exposureWorld).xyz;
                vExposureNormal = inverseTransformDirection(transformedNormal, viewMatrix);`);
            shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vExposureWorld;\nvarying vec3 vExposureNormal;')
              .replace('#include <lights_fragment_begin>', `vec2 naturalVisibility = nightExposureAt(vExposureWorld + normalize(vExposureNormal) * 0.35);\n${THREE.ShaderChunk.lights_fragment_begin.replace('getDirectionalLightInfo( directionalLight, directLight );', 'getDirectionalLightInfo( directionalLight, directLight );\n directLight.color *= nightMoonFactor(naturalVisibility.g);')}`)
              .replace('#include <lights_fragment_end>', `
                #if defined(RE_IndirectDiffuse)
                  irradiance *= nightSkyFactor(naturalVisibility.r);
                  iblIrradiance *= nightSkyFactor(naturalVisibility.r);
                #endif
                #if defined(RE_IndirectSpecular)
                  radiance *= nightSkyFactor(naturalVisibility.r); clearcoatRadiance *= nightSkyFactor(naturalVisibility.r);
                #endif
                #include <lights_fragment_end>`);
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
    field, blockerCount: blockers.length,
    update(amount: number, moon: Direction, dt: number) {
      uniforms.nightExposureAmount.value = amount;
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
