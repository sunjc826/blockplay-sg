import * as THREE from 'three';
import type { RegionBounds, Obstacle } from './region-collision';
import type { RegionWorld } from './regions';
import { getWalkSurfaces, surfaceContains, surfaceHeight } from './vertical-routes';
import { isWaterObject } from './water';
import { accelerateMeshRaycast } from './mesh-raycast';
import { grassDetail, swardDetail, type WorldDetail } from './environment-quality';
import { foliageDeclarations, foliageGrassPress, foliageUniforms } from './foliage-disturbance';
import { leafWetDeclarations, leafWetRoughness, leafWetSky, leafWetness } from './leaf-shading';
import { partitionGroundCaps, type GroundCap } from './ground-surface-ownership';

interface Patch { minX: number; maxX: number; minZ: number; maxZ: number; y: number; grass: boolean; wettable?: boolean; mesh?: THREE.Mesh; /** A lawn's own colour, which its tufts take. */ color?: THREE.Color; /** The same for ground painted vertex by vertex. */ tint?: (x: number, z: number) => THREE.Color }
const green = (material: THREE.Material) => {
  const c = (material as THREE.MeshStandardMaterial).color;
  return !!c && c.g > c.r * 1.04 && c.g > c.b * 1.12;
};
const hash = (x: number, z: number, salt = 0) => {
  const n = Math.sin(x * 127.1 + z * 311.7 + salt * 73.3) * 43758.5453;
  return n - Math.floor(n);
};
const size = 16, key = (x: number, z: number) => `${Math.floor(x / size)},${Math.floor(z / size)}`;
function index<T extends { minX: number; maxX: number; minZ: number; maxZ: number }>(items: T[]) {
  const bins = new Map<string, T[]>();
  for (const item of items) for (let x = Math.floor(item.minX / size); x <= Math.floor(item.maxX / size); x++)
    for (let z = Math.floor(item.minZ / size); z <= Math.floor(item.maxZ / size); z++) {
      const k = `${x},${z}`, row = bins.get(k) ?? []; row.push(item); bins.set(k, row);
    }
  return (x: number, z: number) => bins.get(key(x, z)) ?? [];
}

/** Whether a draped mesh (paving, a shore outline) lies over a point, within `above` and `below` of height `y`:
 * what a ray dropped on it would find, answered from its triangles sorted once into 2 m squares. A district
 * asks this for every tuft and blade, and a ray against each of Queenstown's eleven paving meshes was most of
 * the cost of growing its grass. */
export function footprint(mesh: THREE.Mesh) {
  const position = mesh.geometry.getAttribute('position'), index = mesh.geometry.index, count = Math.floor((index?.count ?? position.count) / 3);
  const corners = new Float32Array(count * 9), point = new THREE.Vector3(), cell = 2, bins = new Map<number, number[]>();
  const bin = (x: number, z: number) => (Math.floor(x / cell) + 32768) * 65536 + Math.floor(z / cell) + 32768;
  for (let face = 0; face < count; face++) {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let c = 0; c < 3; c++) {
      point.fromBufferAttribute(position, index ? index.getX(face * 3 + c) : face * 3 + c).applyMatrix4(mesh.matrixWorld);
      corners[face * 9 + c * 3] = point.x; corners[face * 9 + c * 3 + 1] = point.y; corners[face * 9 + c * 3 + 2] = point.z;
      minX = Math.min(minX, point.x); maxX = Math.max(maxX, point.x); minZ = Math.min(minZ, point.z); maxZ = Math.max(maxZ, point.z);
    }
    for (let x = Math.floor(minX / cell); x <= Math.floor(maxX / cell); x++) for (let z = Math.floor(minZ / cell); z <= Math.floor(maxZ / cell); z++) {
      const k = bin(x * cell, z * cell), row = bins.get(k); if (row) row.push(face); else bins.set(k, [face]);
    }
  }
  return (x: number, z: number, y: number, above: number, below: number) => {
    const row = bins.get(bin(x, z)); if (!row) return false;
    for (const face of row) {
      const o = face * 9, ax = corners[o], az = corners[o + 2], bx = corners[o + 3], bz = corners[o + 5], cx = corners[o + 6], cz = corners[o + 8];
      const area = (bx - ax) * (cz - az) - (cx - ax) * (bz - az); if (Math.abs(area) < 1e-9) continue;
      const u = ((x - ax) * (cz - az) - (cx - ax) * (z - az)) / area, v = ((bx - ax) * (z - az) - (x - ax) * (bz - az)) / area;
      if (u < 0 || v < 0 || u + v > 1) continue;
      const height = corners[o + 1] + u * (corners[o + 4] - corners[o + 1]) + v * (corners[o + 7] - corners[o + 1]);
      if (height <= y + above && height >= y - below) return true;
    }
    return false;
  };
}

/** A vertex-painted terrain's colour at any point: its vertices' colours gathered into bins a vertex spacing and a
 * half wide, and blended between bin centres. Undefined for a terrain of one material colour. */
function terrainTint(mesh: THREE.Mesh, box: THREE.Box3) {
  const material = mesh.material as THREE.MeshStandardMaterial, colors = mesh.geometry.getAttribute('color'), positions = mesh.geometry.getAttribute('position');
  if (!material.vertexColors || !colors) return undefined;
  const wide = box.max.x - box.min.x, deep = box.max.z - box.min.z, cell = Math.max(1, Math.sqrt(wide * deep / positions.count) * 1.5);
  const columns = Math.max(1, Math.ceil(wide / cell)), rows = Math.max(1, Math.ceil(deep / cell));
  const sums = new Float32Array(columns * rows * 4), mean = [0, 0, 0], point = new THREE.Vector3();
  const paint = material.color.toArray();
  for (let i = 0; i < positions.count; i++) {
    point.fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld);
    const n = (Math.min(rows - 1, Math.max(0, Math.floor((point.z - box.min.z) / cell))) * columns + Math.min(columns - 1, Math.max(0, Math.floor((point.x - box.min.x) / cell)))) * 4;
    for (let c = 0; c < 3; c++) { const v = colors.getComponent(i, c) * paint[c]; sums[n + c] += v; mean[c] += v / positions.count; }
    sums[n + 3]++;
  }
  return (x: number, z: number) => {
    const u = (x - box.min.x) / cell - .5, v = (z - box.min.z) / cell - .5, i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j, out = [0, 0, 0];
    for (let b = 0; b < 4; b++) {
      const n = (Math.min(rows - 1, Math.max(0, j + (b >> 1))) * columns + Math.min(columns - 1, Math.max(0, i + (b & 1)))) * 4;
      const weight = (b & 1 ? fu : 1 - fu) * (b >> 1 ? fv : 1 - fv), count = sums[n + 3];
      for (let c = 0; c < 3; c++) out[c] += weight * (count ? sums[n + c] / count : mean[c]);
    }
    return new THREE.Color().setRGB(out[0], out[1], out[2]);
  };
}

/** World-space soil detail uses no image downloads and stays continuous across terrain tiles. */
function soilMaterial(source: THREE.Material, turf = false) {
  const material = source.clone();
  const previous = source.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer);
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vSoilWorld;')
      .replace('#include <project_vertex>', `
        vec4 soilPosition = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          soilPosition = instanceMatrix * soilPosition;
        #endif
        vSoilWorld = (modelMatrix * soilPosition).xyz;
        #include <project_vertex>`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vSoilWorld;
      float soilHash(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
      float soilNoise(vec2 p) {
        vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(soilHash(i),soilHash(i+vec2(1,0)),f.x),mix(soilHash(i+vec2(0,1)),soilHash(i+vec2(1,1)),f.x),f.y);
      }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float soilPatch = soilNoise(vSoilWorld.xz * .38);
        float soilGrain = soilNoise(vSoilWorld.xz * 24.0);
        diffuseColor.rgb *= .81 + .26 * soilPatch + .15 * soilGrain;
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.18,.125,.065), smoothstep(.67,.9,soilPatch) * .32);
        ${turf ? `// A lawn between its tufts is still grass: short blades lying two ways, lit and shadowed, and thatch
        // showing through where the sward is thin. Faded out with distance, where it would only shimmer.
        float turfNear = 1.0 - smoothstep(16.0, 42.0, length(vViewPosition));
        // Ground painted vertex by vertex is turf only where it is painted green.
        turfNear *= step(diffuseColor.r * 1.04, diffuseColor.g) * step(diffuseColor.b * 1.12, diffuseColor.g);
        float turfA = soilNoise(vec2(vSoilWorld.x * 58.0 + vSoilWorld.z * 9.0, vSoilWorld.z * 13.0 - vSoilWorld.x * 3.0));
        float turfB = soilNoise(vec2(vSoilWorld.z * 63.0 - vSoilWorld.x * 11.0, vSoilWorld.x * 12.0 + vSoilWorld.z * 4.0));
        float turfBlade = max(turfA, turfB), turfThin = smoothstep(.55, .2, soilNoise(vSoilWorld.xz * 3.1) * .6 + turfBlade * .4);
        diffuseColor.rgb *= 1.0 + turfNear * ((turfBlade - .58) * .46 - turfThin * .1);
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.12, 1.02, .7), turfNear * turfThin * .35);` : ''}`);
  };
  material.customProgramCacheKey = () => `${source.customProgramCacheKey()}-soil-v3${turf ? '-turf' : ''}`;
  return material;
}

/** Normalize decorative street/lawn caps, never authored elevated floors or water.
 * Physics stays on the district's existing terrain. Tiny paint offsets stay below
 * rain's 2.5 cm clearance; broad opaque caps can no longer bury wheels or impacts. */
export function withGroundCover<T extends RegionWorld>(world: T, bounds: RegionBounds): T {
  const ground = bounds.groundHeight ?? (() => 0), surfaces = getWalkSurfaces(world.scene);
  const patches: Patch[] = [], materials = new Map<THREE.Material, THREE.Material>(), geometries: THREE.BufferGeometry[] = [];
  const raycastDisposers: (() => void)[] = [];
  const caps: GroundCap[] = [];
  const box = new THREE.Box3(), instance = new THREE.Matrix4(), transform = new THREE.Matrix4();
  const point = new THREE.Vector3();
  let corrected = 0;
  world.scene.updateMatrixWorld(true);
  const protectedSurface = (x: number, z: number, y: number) => surfaces.some(s => surfaceContains(s, x, z) && Math.abs(surfaceHeight(s, x, z) - y) < .035);
  const detail = (source: THREE.Material, turf = green(source)) => {
    let material = materials.get(source);
    if (!material) { material = soilMaterial(source, turf); materials.set(source, material); }
    return material;
  };
  for (const object of [...world.scene.children]) {
    if (!(object instanceof THREE.Mesh) || Array.isArray(object.material) || object.material.transparent) continue;
    const material = object.material, water = isWaterObject(object), grass = !water && green(material);
    if (!object.geometry.boundingBox) object.geometry.computeBoundingBox();
    const local = object.geometry.boundingBox!;
    // Queenstown's paving already follows the exact terrain triangles. Remove
    // only its decorative height offset, retaining the authored slopes and holes.
    if (object.name === 'Queenstown graded paving') {
      const geometry = object.geometry.clone(), positions = geometry.getAttribute('position');
      const bright = (material as THREE.MeshStandardMaterial).color?.getHSL({ h: 0, s: 0, l: 0 }).l ?? 0;
      const offset = bright > .65 ? .012 : .005;
      for (let i = 0; i < positions.count; i++) {
        point.fromBufferAttribute(positions, i).applyMatrix4(object.matrixWorld);
        positions.setY(i, ground(point.x, point.z) + offset);
      }
      geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
      object.geometry = geometry; object.raycast = THREE.Mesh.prototype.raycast; geometries.push(geometry);
      raycastDisposers.push(accelerateMeshRaycast(object));
      object.userData.noShadowCast = true; object.castShadow = false;
      box.copy(geometry.boundingBox!).applyMatrix4(object.matrixWorld);
      patches.push({ minX: box.min.x, maxX: box.max.x, minZ: box.min.z, maxZ: box.max.z, y: NaN, grass: false, wettable: true, mesh: object });
      corrected++; continue;
    }
    // Paving draped over graded ground (the Botanic Gardens' paths): no grass wherever it lies.
    if (object.userData.groundPaving) {
      box.copy(local).applyMatrix4(object.matrixWorld);
      patches.push({ minX: box.min.x, maxX: box.max.x, minZ: box.min.z, maxZ: box.max.z, y: NaN, grass: false, wettable: true, mesh: object });
      object.userData.noShadowCast = true; object.castShadow = false;
      continue;
    }
    if (object.userData.terrain) {
      box.copy(local).applyMatrix4(object.matrixWorld);
      const grass = object.userData.terrainCover !== 'sand';
      const tint = grass ? terrainTint(object, box) : undefined;
      patches.push({ minX: box.min.x, maxX: box.max.x, minZ: box.min.z, maxZ: box.max.z, y: NaN, grass, wettable: !grass, color: grass && !tint ? (material as THREE.MeshStandardMaterial).color : undefined, tint });
      if (grass) object.material = detail(material, !!tint || green(material));
      object.userData.noShadowCast = true; object.castShadow = false;
      continue;
    }
    const count = object instanceof THREE.InstancedMesh ? object.count : 1;
    let grassParts = 0, groundParts = 0;
    for (let i = 0; i < count; i++) {
      if (object instanceof THREE.InstancedMesh) { object.getMatrixAt(i, instance); transform.multiplyMatrices(object.matrixWorld, instance); }
      else transform.copy(object.matrixWorld);
      box.copy(local).applyMatrix4(transform);
      const w = box.max.x - box.min.x, d = box.max.z - box.min.z, h = box.max.y - box.min.y;
      if (box.max.y > .61 || box.max.y < -.2 || box.min.y > (h < .08 ? .6 : .35) || h > 1.21 || w < .08 || d < .08 || w * d < .25) continue;
      // Tilted structural members are not ground overlays.
      if (h > .001 && (Math.abs(transform.elements[1]) > 1e-5 || Math.abs(transform.elements[9]) > 1e-5)) continue;
      const x = (box.min.x + box.max.x) / 2, z = (box.min.z + box.max.z) / 2;
      const protectedFloor = water || protectedSurface(x, z, box.max.y);
      const color = (material as THREE.MeshStandardMaterial).color;
      const offset = w * d > 100000 ? -.018 : grass ? 0 : color && Math.min(color.r, color.g, color.b) > .6 ? .012 : .005;
      // The base plate is flat beneath terrain; avoid raising that whole plate
      // to the height of a hill that happens to contain its centre.
      const target = offset;
      const shift = protectedFloor ? 0 : target - box.max.y;
      if (Math.abs(shift) > 1e-5) {
        if (object instanceof THREE.InstancedMesh) { instance.elements[13] += shift; object.setMatrixAt(i, instance); }
        else object.position.y += shift;
        corrected++;
      }
      const patch: Patch = { minX: box.min.x, maxX: box.max.x, minZ: box.min.z, maxZ: box.max.z, y: box.max.y + shift, grass, wettable: !grass && !water, color: grass ? color : undefined };
      if (object.geometry.type === 'BoxGeometry' && Math.abs(transform.elements[2]) < 1e-5 && Math.abs(transform.elements[8]) < 1e-5 && transform.elements[0] > 0 && transform.elements[5] > 0 && transform.elements[10] > 0) {
        caps.push({ ...patch, mesh: object, instance: object instanceof THREE.InstancedMesh ? i : undefined, authoredTop: box.max.y });
      }
      // Nonrectangular island shores retain their exact outline for grass masks.
      if (object.geometry.type === 'ShapeGeometry' || object.geometry.type === 'PlaneGeometry') patch.mesh = object;
      patches.push(patch); groundParts++; if (grass) grassParts++;
    }
    if (object instanceof THREE.InstancedMesh && groundParts) {
      object.instanceMatrix.needsUpdate = true; object.computeBoundingBox(); object.computeBoundingSphere();
    }
    if (groundParts === count && groundParts && !water) {
      object.userData.groundSurface = true; object.userData.noShadowCast = true; object.castShadow = false;
    }
    if (grassParts || groundParts && material.userData.soil) object.material = detail(material);
  }
  world.scene.updateMatrixWorld(true);
  const ownership = partitionGroundCaps(caps);
  world.scene.updateMatrixWorld(true);
  const patchesAt = index(patches), surfacesAt = index([...surfaces]), obstaclesAt = index<Obstacle>(world.obstacles);
  const footprints = new Map<THREE.Mesh, ReturnType<typeof footprint>>();
  const covers = (mesh: THREE.Mesh, x: number, z: number, y: number) => {
    let test = footprints.get(mesh); if (!test) { test = footprint(mesh); footprints.set(mesh, test); }
    // The reach of the ray this replaces: from a metre above the ground to two below it.
    return test(x, z, y, 1, 2);
  };
  const sampleState = (x: number, z: number) => {
    let y = ground(x, z), grass = false, wettable = false, owner = -Infinity, color: THREE.Color | undefined, tint: Patch['tint'];
    for (const patch of patchesAt(x, z)) {
      if (x < patch.minX || x > patch.maxX || z < patch.minZ || z > patch.maxZ) continue;
      const top = Number.isNaN(patch.y) ? y : patch.y;
      if (top < y - .02 || top < owner - 1e-5) continue;
      if (patch.mesh && !covers(patch.mesh, x, z, y)) continue;
      // Paving wins over a coplanar soil plate at its edge.
      if (top > owner + 1e-5 || !patch.grass) { owner = top; grass = patch.grass; wettable = patch.wettable === true; color = patch.color; tint = patch.tint; }
      y = Math.max(y, top);
    }
    for (const s of surfacesAt(x, z)) if (surfaceContains(s, x, z)) {
      const top = surfaceHeight(s, x, z);
      if (top > y + .02) { y = top; grass = false; wettable = false; color = tint = undefined; }
    }
    return { y, grass, wettable, color: tint && grass ? tint(x, z) : color };
  };
  const sample = (x: number, z: number) => { const { y, grass } = sampleState(x, z); return { y, grass }; };
  const grass = createGrass(world.scene, bounds, (x, z) => {
    const p = sample(x, z);
    if (!p.grass || obstaclesAt(x, z).some(o => x > o.minX - .25 && x < o.maxX + .25 && z > o.minZ - .25 && z < o.maxZ + .25)) return null;
    return p.y;
  }, (x, z) => sampleState(x, z).color, { sward: world.scene.userData.lawnSward !== false });
  const wetGround = (x: number, z: number) => {
    const p = sampleState(x, z); return p.wettable && !p.grass ? p.y : null;
  };
  world.scene.userData.groundCover = { corrected, patches: patches.length, ownership, grass, sample, wetGround };
  world.scene.userData.rainGroundHeight = (x: number, z: number) => sample(x, z).y;
  const dispose = world.dispose;
  world.dispose = () => { grass.dispose(); ownership.dispose(); raycastDisposers.forEach(remove => remove()); materials.forEach(m => m.dispose()); geometries.forEach(g => g.dispose()); dispose(); };
  return world;
}

/** How far the weather's wind (0 still to 7 squall) lays grass over: mean tip travel as a share of blade height. */
export const grassWindLean = (wind: number) => .1 + Math.min(7, Math.max(0, wind)) * .1;

export const SWARD_BLADES = 5, SWARD_CAPACITY = 26000;
/** One clump of a mown lawn: broad, blunt blades (cow grass, Axonopus compressus) that arch outward from the
 * crown. Each blade has three joints along its length, so the wind's lean (which grows with the square of
 * height) curls it over instead of tipping it as a straight piece. Height is 0 to 1; the instance sets it. */
function swardGeometry(base: THREE.Color, tip: THREE.Color) {
  const positions: number[] = [], colors: number[] = [], normals: number[] = [];
  const rows = [0, .4, .75, 1], color = new THREE.Color();
  for (let blade = 0; blade < SWARD_BLADES; blade++) {
    const a = blade * 2.399963, c = Math.cos(a), s = Math.sin(a);
    const tall = [1, .78, .9, .66, .84][blade], droop = [.03, .075, .05, .09, .06][blade], out = [.015, .07, .045, .095, .06][blade], half = [.014, .012, .015, .011, .013][blade];
    const point = (row: number, side: number) => {
      const t = rows[row], reach = out + droop * t * t, wide = row === 3 ? 0 : half * (1 - .3 * t) * side;
      return [c * reach - s * wide, tall * t * (1 - .22 * t), s * reach + c * wide];
    };
    const push = (...corners: number[][]) => {
      for (const p of corners) {
        positions.push(p[0], p[1], p[2]); color.copy(base).lerp(tip, p[1]); colors.push(color.r, color.g, color.b);
        // Mostly upward, as the tufts are, but turned a little the way the blade arches so clumps catch the light unevenly.
        const n = new THREE.Vector3(c * .5, 1, s * .5).normalize(); normals.push(n.x, n.y, n.z);
      }
    };
    for (let row = 0; row < 2; row++) {
      push(point(row, -1), point(row, 1), point(row + 1, -1));
      push(point(row, 1), point(row + 1, 1), point(row + 1, -1));
    }
    push(point(2, -1), point(2, 1), point(3, 0));
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  return geometry;
}

/** Two bounded instanced LODs; solid tapered blades avoid alpha-card overdraw.
 * Rebuild only after crossing a 4 m cell, with deterministic world placement.
 * `sward` adds a third, much denser layer of short curved blades close to the viewer, for a mown lawn. */
export function createGrass(scene: THREE.Scene, bounds: RegionBounds, floor: (x: number, z: number) => number | null, lawn?: (x: number, z: number) => THREE.Color | undefined, options: { sward?: boolean } = {}) {
  const positions: number[] = [], colors: number[] = [];
  // A tuft is the colour of the lawn it grows from (the instance colour), darker at the foot and paler and
  // a little yellower at the tip. Where no lawn colour is known it is the green the tufts always were.
  const base = new THREE.Color().setRGB(.84, .84, .8), tip = new THREE.Color().setRGB(1.42, 1.3, 1.02), plain = new THREE.Color('#7f9257');
  const bloom: number[] = [];
  // Three blades of unequal length, the shorter ones splayed further out.
  for (let blade = 0; blade < 3; blade++) {
    const a = blade * Math.PI * 2 / 3, c = Math.cos(a), s = Math.sin(a), tall = [1, .7, .85][blade], splay = [1, 1.9, 1.4][blade];
    for (const [x, y, z] of [[-.025,0,0],[.025,0,0],[-.012,.6,.012],[.025,0,0],[.012,.6,.012],[-.012,.6,.012],[-.012,.6,.012],[.012,.6,.012],[0,1,.035]]) {
      positions.push(x*c-z*splay*s,y*tall,x*s+z*splay*c);
      const color = base.clone().lerp(tip,y); colors.push(color.r,color.g,color.b); bloom.push(0);
    }
  }
  // A small flower head above the blades. The shader keeps it on a few tufts, in drifts, and colours it.
  for (const [x, z] of [[-.04,0],[0,-.04],[.04,0],[-.04,0],[.04,0],[0,.04]]) { positions.push(x,1.06+z*.8,z); colors.push(1,1,1); bloom.push(1); }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors,3));
  geometry.setAttribute('grassBloom', new THREE.Float32BufferAttribute(bloom,1));
  // A meadow's diffuse response is broad, rather than black/bright alternating
  // paper faces. Upward foliage normals retain the scene's light and shadows.
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(positions.map((_, i) => i % 3 === 1 ? 1 : 0),3));
  // A blade's upper face is smooth enough to shine: with the sun low and ahead, a lawn takes a sheen.
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: .72 });
  const time = { value: 0 }, eye = { value: new THREE.Vector3() }, reach = { value: 23 };
  const farReach = { value: 23 }, nearReach = { value: 23 };
  const wind = { value: 0 }, foliage = foliageUniforms(scene);
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, { grassTime: time, grassEye: eye, grassReach: reach, grassWind: wind, leafWet: leafWetness }, foliage);
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\n#ifdef GRASS_BLOOM\nattribute float grassBloom;\n#endif\nuniform float grassTime, grassWind;\nuniform vec3 grassEye;\nuniform float grassReach;' + foliageDeclarations)
      // A lawn is not one green: broad drier and lusher patches, and every tuft a little its own.
      .replace('#include <color_vertex>', `#include <color_vertex>
        vec3 grassRoot = (modelMatrix * instanceMatrix * vec4(0,0,0,1)).xyz;
        float grassPick = fract(sin(dot(grassRoot.xz, vec2(12.9898, 78.233))) * 43758.5453);
        float grassPatch = sin(grassRoot.x * .11 + sin(grassRoot.z * .07) * 2.0) * sin(grassRoot.z * .13 + sin(grassRoot.x * .05) * 2.0);
        vColor.rgb *= mix(vec3(.86, .96, .88), vec3(1.16, 1.06, .78), .5 + .5 * grassPatch) * (.9 + .2 * grassPick);
        // A blade's foot stands in the shade of its neighbours.
        vColor.rgb *= .58 + .42 * smoothstep(0.0, .75, position.y);
        // Lush ground grows longer than dry ground, in the same broad patches, with ragged clumps here and there.
        float grassLush = (.72 + .7 * smoothstep(-.6, .7, -grassPatch)) * (1.0 + .55 * step(.93, fract(grassPick * 17.0)));
        #ifdef GRASS_BLOOM
        // Lawn flowers, in drifts: white coat buttons, yellow creeping daisy, pink mimosa.
        float grassDrift = sin(grassRoot.x * .09 + 1.3) * sin(grassRoot.z * .075 + .4) + .35 * sin(grassRoot.x * .31 + grassRoot.z * .27);
        float grassFlower = step(grassPick, .16) * step(.25, grassDrift);
        float grassKind = fract(grassPick * 61.0 + floor(grassRoot.x * .04) * .37 + floor(grassRoot.z * .04) * .61);
        if (grassBloom > .5) vColor.rgb = grassKind < .45 ? vec3(.96, .95, .86) : grassKind < .8 ? vec3(.98, .8, .2) : vec3(.92, .55, .74);
        #endif`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef GRASS_BLOOM
        transformed *= mix(1.0, grassFlower, step(.5, grassBloom));
        #endif
        float grassFade = 1.0-smoothstep(grassReach-6.0,grassReach,distance(grassRoot.xz,grassEye.xz));
        transformed.y *= grassFade * grassLush;
        // Wind crosses a lawn as fronts, in the direction and at the speed the trees' gusts
        // travel (tree-wind.ts): long swells that lay the grass over, and metre-scale waves
        // running through them. Lean is tip travel as a share of the blade's height.
        vec2 grassDown = vec2(.984, .177);
        float grassFront = dot(grassRoot.xz, grassDown) - grassTime * 7.0;
        float grassAcross = dot(grassRoot.xz, vec2(-.177, .984));
        float grassSwell = .5 + .5 * sin(grassFront * .045 + 1.5 * sin(grassFront * .017 + grassTime * .11));
        float grassWave = sin(grassFront * .8 + sin(grassAcross * .23 + grassTime * .4) * 1.7) + .5 * sin(grassFront * 1.9 + grassAcross * .6);
        vec2 grassLean = grassDown * grassWind * (.45 + .55 * grassSwell * grassSwell + .22 * grassWave * (.4 + grassSwell));
        // Each tuft also trembles on its own, so still air is not a frozen lawn.
        grassLean += vec2(sin(grassTime * 2.3 + grassRoot.x * 1.7 + grassRoot.z * .9), cos(grassTime * 1.9 + grassRoot.z * 1.3)) * (.04 + .05 * grassWind);
        float grassFlat = 0.0;
        ${foliageGrassPress}
        float grassLength = length(grassLean);
        if (grassLength > 1.05) grassLean *= 1.05 / grassLength;
        // A leaning blade keeps its length: what it gains sideways it loses in height.
        transformed.y *= (1.0 - grassFlat) * (1.0 - .3 * min(1.0, grassLength * grassLength));
        vec3 grassOffset = vec3(grassLean.x, 0.0, grassLean.y) * length(instanceMatrix[1].xyz) * position.y * position.y * grassFade;
        transformed += vec3(dot(grassOffset, instanceMatrix[0].xyz) / dot(instanceMatrix[0].xyz, instanceMatrix[0].xyz), 0.0,
                            dot(grassOffset, instanceMatrix[2].xyz) / dot(instanceMatrix[2].xyz, instanceMatrix[2].xyz));`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\nnormal *= faceDirection;')
      .replace('#include <common>', '#include <common>\n' + leafWetDeclarations).replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n' + leafWetRoughness)
      .replace('#include <lights_fragment_end>', leafWetSky + '#include <lights_fragment_end>');
  };
  type Defined = THREE.MeshStandardMaterial & { defines: Record<string, string> };
  (material as Defined).defines = { STANDARD: '', GRASS_BLOOM: '' };
  material.customProgramCacheKey = () => 'ground-grass-v6';
  const mesh = new THREE.InstancedMesh(geometry,material,26000); mesh.name = 'Nearby grass tufts'; mesh.count = 0;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.castShadow = false; mesh.receiveShadow = true;
  mesh.userData.noShadowCast = true; mesh.userData.fpsEffect = true; mesh.raycast = () => {};
  // Three single triangles per tuft in the distance, versus nine nearby.
  const farGeometry = new THREE.BufferGeometry();
  const farPositions: number[] = [], farColors: number[] = [];
  for (let blade = 0; blade < 3; blade++) {
    const a = blade * Math.PI * 2 / 3;
    for (const [x, y] of [[-.055, 0], [.055, 0], [0, 1]]) {
      farPositions.push(x * Math.cos(a), y, x * Math.sin(a));
      const c = base.clone().lerp(tip, y); farColors.push(c.r, c.g, c.b);
    }
  }
  farGeometry.setAttribute('position', new THREE.Float32BufferAttribute(farPositions, 3));
  farGeometry.setAttribute('color', new THREE.Float32BufferAttribute(farColors, 3));
  farGeometry.setAttribute('normal', new THREE.Float32BufferAttribute(farPositions.map((_, i) => i % 3 === 1 ? 1 : 0), 3));
  const farMaterial = material.clone(); (farMaterial as Defined).defines = { STANDARD: '' };
  farMaterial.onBeforeCompile = (shader, renderer) => {
    material.onBeforeCompile(shader, renderer);
    shader.uniforms.grassReach = farReach; shader.uniforms.grassNear = nearReach;
    shader.vertexShader = 'uniform float grassNear;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('transformed.y *= grassFade * grassLush;', `
      grassFade *= smoothstep(grassNear - 6.0, grassNear, distance(grassRoot.xz,grassEye.xz));
      transformed.y *= grassFade * grassLush;`);
  };
  farMaterial.customProgramCacheKey = () => 'ground-grass-far-v6';
  const farMesh = new THREE.InstancedMesh(farGeometry, farMaterial, 26000); farMesh.name = 'Distant grass tufts'; farMesh.count = 0;
  farMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); farMesh.receiveShadow = true;
  farMesh.userData.noShadowCast = true; farMesh.userData.fpsEffect = true; farMesh.raycast = () => {};
  // The sward: the same shader, so it leans to the same wind fronts, bodies and shots, on its own short reach.
  const swardReach = { value: 0 };
  let sward: THREE.InstancedMesh | undefined;
  if (options.sward) {
    const swardMaterial = material.clone(); (swardMaterial as Defined).defines = { STANDARD: '' };
    swardMaterial.onBeforeCompile = (shader, renderer) => {
      material.onBeforeCompile(shader, renderer);
      shader.uniforms.grassReach = swardReach;
      // Mown to one height, near enough: only a little of the lush-and-dry difference the tufts show. It thins
      // out over its last four metres by losing clumps, then height, so there is no ring where it stops.
      shader.vertexShader = shader.vertexShader.replace('float grassFade = 1.0-smoothstep(grassReach-6.0,grassReach,distance(grassRoot.xz,grassEye.xz));', `
        float swardFar = distance(grassRoot.xz, grassEye.xz);
        float grassFade = (1.0 - smoothstep(grassReach - 1.5, grassReach, swardFar)) * step(smoothstep(grassReach - 5.0, grassReach - .5, swardFar), fract(grassPick * 7.0) + .001);`)
        .replace('transformed.y *= grassFade * grassLush;', 'transformed.xz *= step(.001, grassFade); transformed.y *= grassFade * mix(1.0, grassLush, .3);');
    };
    swardMaterial.customProgramCacheKey = () => 'ground-grass-sward-v3';
    sward = new THREE.InstancedMesh(swardGeometry(new THREE.Color().setRGB(.7, .74, .7), new THREE.Color().setRGB(1.3, 1.24, .98)), swardMaterial, SWARD_CAPACITY);
    sward.name = 'Lawn sward'; sward.count = 0; sward.visible = false;
    sward.instanceMatrix.setUsage(THREE.DynamicDrawUsage); sward.receiveShadow = true;
    sward.userData.noShadowCast = true; sward.userData.fpsEffect = true; sward.raycast = () => {};
  }
  for (const tufts of sward ? [mesh, farMesh, sward] : [mesh, farMesh]) { tufts.setColorAt(0, plain); tufts.instanceColor!.setUsage(THREE.DynamicDrawUsage); }
  scene.add(mesh, farMesh); if (sward) scene.add(sward);
  const heights = new Map<string, number | null>(), tints = new Map<string, THREE.Color>();
  const swardHeights = new Map<number, number | null>(), swardTints = new Map<number, THREE.Color>();
  const dummy = new THREE.Object3D(), cameraPosition = new THREE.Vector3();
  let cellX = Infinity, cellZ = Infinity, lastQuality = '', disposed = false;
  let swardX = Infinity, swardZ = Infinity, swardQuality = '';
  /** The sward follows the viewer in 2 m steps, finer than the tufts, since its reach is only a few strides. */
  const fillSward = (target: THREE.InstancedMesh, quality: string, profile: { radius: number; spacing: number } | null) => {
    const step = 2, cx = Math.floor(cameraPosition.x / step) * step + step / 2, cz = Math.floor(cameraPosition.z / step) * step + step / 2;
    swardReach.value = profile?.radius ?? 0;
    if (cx === swardX && cz === swardZ && quality === swardQuality) return;
    if (quality !== swardQuality || swardHeights.size > 160000) { swardHeights.clear(); swardTints.clear(); }
    swardX = cx; swardZ = cz; swardQuality = quality;
    let count = 0, minY = Infinity, maxY = -Infinity; target.position.set(cx, 0, cz);
    const matrices = target.instanceMatrix.array, shades = target.instanceColor!.array;
    if (profile) {
      const { radius, spacing } = profile, edge = radius + step * .71, edge2 = edge * edge;
      for (let ix = Math.floor((cx - edge) / spacing); ix <= Math.ceil((cx + edge) / spacing); ix++)
        for (let iz = Math.floor((cz - edge) / spacing); iz <= Math.ceil((cz + edge) / spacing); iz++) {
          if (count >= SWARD_CAPACITY) break;
          const x = (ix + hash(ix, iz, 5)) * spacing, z = (iz + hash(ix, iz, 6)) * spacing, dx = x - cx, dz = z - cz;
          if (dx * dx + dz * dz > edge2 || x < bounds.minX || x > bounds.maxX || z < bounds.minZ || z > bounds.maxZ) continue;
          const k = (ix + 32768) * 65536 + iz + 32768;
          let y = swardHeights.get(k);
          if (y === undefined) { y = floor(x, z); swardHeights.set(k, y); if (y !== null) swardTints.set(k, lawn?.(x, z) ?? plain); }
          if (y === null) continue;
          minY = Math.min(minY, y); maxY = Math.max(maxY, y);
          const wide = (.85 + hash(ix, iz, 7) * .5) * Math.max(1, spacing / .22);
          // Written straight into the buffers: a turn about the vertical, a scale and a place, thousands of times a step.
          const turn = hash(ix, iz, 8) * Math.PI * 2, c = Math.cos(turn) * wide, s = Math.sin(turn) * wide, m = count * 16, tint = swardTints.get(k) ?? plain;
          matrices[m] = c; matrices[m + 1] = 0; matrices[m + 2] = -s; matrices[m + 3] = 0;
          matrices[m + 4] = 0; matrices[m + 5] = .14 + hash(ix, iz, 9) * .09; matrices[m + 6] = 0; matrices[m + 7] = 0;
          matrices[m + 8] = s; matrices[m + 9] = 0; matrices[m + 10] = c; matrices[m + 11] = 0;
          matrices[m + 12] = dx; matrices[m + 13] = y - .004; matrices[m + 14] = dz; matrices[m + 15] = 1;
          shades[count * 3] = tint.r; shades[count * 3 + 1] = tint.g; shades[count * 3 + 2] = tint.b; count++;
        }
    }
    target.count = count; target.visible = count > 0; target.instanceMatrix.needsUpdate = true; target.instanceColor!.needsUpdate = true;
    target.boundingBox ??= new THREE.Box3(); target.boundingSphere ??= new THREE.Sphere();
    if (count) {
      const reach = (profile?.radius ?? 0) + 3;
      target.boundingBox.min.set(-reach, minY - .01, -reach); target.boundingBox.max.set(reach, maxY + .3, reach);
      target.boundingBox.getBoundingSphere(target.boundingSphere);
    } else { target.boundingBox.makeEmpty(); target.boundingSphere.set(new THREE.Vector3(), 0); }
    target.updateMatrixWorld(true);
  };
  return {
    mesh, farMesh, sward,
    get radius() { return farReach.value; },
    get count() { return mesh.count + farMesh.count + (sward?.count ?? 0); },
    /** `windSpeed` is the weather's wind, 0 (still) to 7 (squall); reduced effects hold the grass still. */
    update(camera: THREE.Camera, seconds: number, reduced: boolean, mobile = false, detail: WorldDetail = 'low', windSpeed = 0) {
      if (disposed) return;
      wind.value = reduced ? 0 : grassWindLean(windSpeed);
      camera.getWorldPosition(cameraPosition); eye.value.copy(cameraPosition); time.value = reduced ? 0 : seconds;
      const quality = `${detail}:${reduced}:${mobile}`, profile = grassDetail(detail, reduced, mobile);
      reach.value = nearReach.value = profile.near; farReach.value = profile.radius;
      if (sward) fillSward(sward, quality, swardDetail(detail, reduced, mobile));
      const cx = Math.floor(cameraPosition.x/4)*4, cz = Math.floor(cameraPosition.z/4)*4;
      if (cx === cellX && cz === cellZ && quality === lastQuality) return;
      if (quality !== lastQuality || heights.size > 100000) { heights.clear(); tints.clear(); }
      cellX = cx; cellZ = cz; lastQuality = quality;
      const fill = (target: THREE.InstancedMesh, radius: number, inner: number, spacing: number, limit: number) => {
        let count = 0, minY = Infinity, maxY = -Infinity; target.position.set(cx, 0, cz);
        if (limit) for (let ix = Math.floor((cx-radius-4)/spacing); ix <= Math.ceil((cx+radius+4)/spacing); ix++)
          for (let iz = Math.floor((cz-radius-4)/spacing); iz <= Math.ceil((cz+radius+4)/spacing); iz++) {
            const x = (ix+hash(ix,iz)) * spacing, z = (iz+hash(ix,iz,1)) * spacing, distance = Math.hypot(x-cx,z-cz);
            if (x < bounds.minX || x > bounds.maxX || z < bounds.minZ || z > bounds.maxZ || distance > radius+3 || distance < inner-9 || count >= limit) continue;
            const k = `${spacing}:${ix}:${iz}`;
            if (!heights.has(k)) { const y = floor(x,z); heights.set(k, y); if (y !== null) tints.set(k, lawn?.(x, z) ?? plain); }
            const y = heights.get(k)!; if (y === null) continue;
            minY = Math.min(minY, y); maxY = Math.max(maxY, y);
            dummy.position.set(x-cx,y-.005,z-cz); dummy.rotation.set(0,hash(ix,iz,2)*Math.PI*2,0);
            const scale = .65 + hash(ix,iz,3)*.65;
            dummy.scale.set(scale, (.12+hash(ix,iz,4)*.12)*(reduced?.7:1), scale); dummy.updateMatrix(); target.setColorAt(count, tints.get(k) ?? plain); target.setMatrixAt(count++,dummy.matrix);
          }
        target.count = count; target.visible = count > 0; target.instanceMatrix.needsUpdate = true; if (target.instanceColor) target.instanceColor.needsUpdate = true;
        // Conservative cell bounds include blade height and sway. Avoid two
        // extra matrix scans over tens of thousands of instances when moving.
        target.boundingBox ??= new THREE.Box3(); target.boundingSphere ??= new THREE.Sphere();
        if (count) {
          target.boundingBox.min.set(-radius-4, minY-.01, -radius-4);
          target.boundingBox.max.set(radius+4, maxY+.4, radius+4);
          target.boundingBox.getBoundingSphere(target.boundingSphere);
        } else { target.boundingBox.makeEmpty(); target.boundingSphere.set(new THREE.Vector3(), 0); }
        target.updateMatrixWorld(true);
      };
      fill(mesh, profile.near, 0, profile.spacing, profile.limit);
      fill(farMesh, profile.radius, profile.near, profile.farSpacing, profile.farLimit);
    },
    dispose() { if (disposed) return; disposed = true; mesh.removeFromParent(); mesh.dispose(); geometry.dispose(); material.dispose(); farMesh.removeFromParent(); farMesh.dispose(); farGeometry.dispose(); farMaterial.dispose(); heights.clear(); tints.clear();
      if (sward) { sward.removeFromParent(); sward.dispose(); sward.geometry.dispose(); (sward.material as THREE.Material).dispose(); swardHeights.clear(); swardTints.clear(); } },
  };
}
