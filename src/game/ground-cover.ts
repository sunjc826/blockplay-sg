import * as THREE from 'three';
import type { RegionBounds, Obstacle } from './region-collision';
import type { RegionWorld } from './regions';
import { getWalkSurfaces, surfaceContains, surfaceHeight } from './vertical-routes';
import { isWaterObject } from './water';
import { accelerateMeshRaycast } from './mesh-raycast';

interface Patch { minX: number; maxX: number; minZ: number; maxZ: number; y: number; grass: boolean; mesh?: THREE.Mesh }
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

/** World-space soil detail uses no image downloads and stays continuous across terrain tiles. */
function soilMaterial(source: THREE.Material) {
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
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.18,.125,.065), smoothstep(.67,.9,soilPatch) * .32);`);
  };
  material.customProgramCacheKey = () => `${source.customProgramCacheKey()}-soil-v1`;
  return material;
}

/** Normalize decorative street/lawn caps, never authored elevated floors or water.
 * Physics stays on the district's existing terrain. Tiny paint offsets stay below
 * rain's 2.5 cm clearance; broad opaque caps can no longer bury wheels or impacts. */
export function withGroundCover<T extends RegionWorld>(world: T, bounds: RegionBounds): T {
  const ground = bounds.groundHeight ?? (() => 0), surfaces = getWalkSurfaces(world.scene);
  const patches: Patch[] = [], materials = new Map<THREE.Material, THREE.Material>(), geometries: THREE.BufferGeometry[] = [];
  const raycastDisposers: (() => void)[] = [];
  const box = new THREE.Box3(), instance = new THREE.Matrix4(), transform = new THREE.Matrix4();
  const point = new THREE.Vector3();
  let corrected = 0;
  world.scene.updateMatrixWorld(true);
  const protectedSurface = (x: number, z: number, y: number) => surfaces.some(s => surfaceContains(s, x, z) && Math.abs(surfaceHeight(s, x, z) - y) < .035);
  const detail = (source: THREE.Material) => {
    let material = materials.get(source);
    if (!material) { material = soilMaterial(source); materials.set(source, material); }
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
      corrected++; continue;
    }
    if (object.userData.terrain) {
      box.copy(local).applyMatrix4(object.matrixWorld);
      patches.push({ minX: box.min.x, maxX: box.max.x, minZ: box.min.z, maxZ: box.max.z, y: NaN, grass: true });
      object.material = detail(material); object.userData.noShadowCast = true; object.castShadow = false;
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
      const patch: Patch = { minX: box.min.x, maxX: box.max.x, minZ: box.min.z, maxZ: box.max.z, y: box.max.y + shift, grass };
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
  const patchesAt = index(patches), surfacesAt = index([...surfaces]), obstaclesAt = index<Obstacle>(world.obstacles);
  const ray = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(0, -1, 0), 0, 3);
  const sample = (x: number, z: number) => {
    let y = ground(x, z), grass = false, owner = -Infinity;
    for (const patch of patchesAt(x, z)) {
      if (x < patch.minX || x > patch.maxX || z < patch.minZ || z > patch.maxZ) continue;
      const top = Number.isNaN(patch.y) ? y : patch.y;
      if (top < y - .02 || top < owner - 1e-5) continue;
      if (patch.mesh) {
        ray.ray.origin.set(x, y + 1, z);
        if (!ray.intersectObject(patch.mesh).length) continue;
      }
      // Paving wins over a coplanar soil plate at its edge.
      if (top > owner + 1e-5 || !patch.grass) { owner = top; grass = patch.grass; }
      y = Math.max(y, top);
    }
    for (const s of surfacesAt(x, z)) if (surfaceContains(s, x, z)) {
      const top = surfaceHeight(s, x, z);
      if (top > y + .02) { y = top; grass = false; }
    }
    return { y, grass };
  };
  const grass = createGrass(world.scene, bounds, (x, z) => {
    const p = sample(x, z);
    if (!p.grass || obstaclesAt(x, z).some(o => x > o.minX - .25 && x < o.maxX + .25 && z > o.minZ - .25 && z < o.maxZ + .25)) return null;
    return p.y;
  });
  world.scene.userData.groundCover = { corrected, patches: patches.length, grass, sample };
  world.scene.userData.rainGroundHeight = (x: number, z: number) => sample(x, z).y;
  const dispose = world.dispose;
  world.dispose = () => { grass.dispose(); raycastDisposers.forEach(remove => remove()); materials.forEach(m => m.dispose()); geometries.forEach(g => g.dispose()); dispose(); };
  return world;
}

/** One bounded instanced draw; solid tapered blades avoid alpha-card overdraw.
 * Rebuild only after crossing a 4 m cell, with deterministic world placement. */
export function createGrass(scene: THREE.Scene, bounds: RegionBounds, floor: (x: number, z: number) => number | null) {
  const positions: number[] = [], colors: number[] = [];
  const base = new THREE.Color('#70834e'), tip = new THREE.Color('#a5b66a');
  for (let blade = 0; blade < 3; blade++) {
    const a = blade * Math.PI * 2 / 3, c = Math.cos(a), s = Math.sin(a);
    for (const [x, y, z] of [[-.025,0,0],[.025,0,0],[-.012,.6,.012],[.025,0,0],[.012,.6,.012],[-.012,.6,.012],[-.012,.6,.012],[.012,.6,.012],[0,1,.035]]) {
      positions.push(x*c-z*s,y,x*s+z*c);
      const color = base.clone().lerp(tip,y); colors.push(color.r,color.g,color.b);
    }
  }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors,3));
  // A meadow's diffuse response is broad, rather than black/bright alternating
  // paper faces. Upward foliage normals retain the scene's light and shadows.
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(positions.map((_, i) => i % 3 === 1 ? 1 : 0),3));
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 1 });
  const time = { value: 0 }, eye = { value: new THREE.Vector3() }, reach = { value: 23 };
  material.onBeforeCompile = shader => {
    shader.uniforms.grassTime = time; shader.uniforms.grassEye = eye; shader.uniforms.grassReach = reach;
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nuniform float grassTime;\nuniform vec3 grassEye;\nuniform float grassReach;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec3 grassRoot = (modelMatrix * instanceMatrix * vec4(0,0,0,1)).xyz;
        float grassFade = 1.0-smoothstep(grassReach-6.0,grassReach,distance(grassRoot.xz,grassEye.xz));
        transformed.y *= grassFade;
        transformed.x += sin(grassTime*1.4+grassRoot.x*.5+grassRoot.z*.3)*.13*position.y*position.y*grassFade;`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\nnormal *= faceDirection;');
  };
  material.customProgramCacheKey = () => 'ground-grass-v1';
  const mesh = new THREE.InstancedMesh(geometry,material,4096); mesh.name = 'Nearby grass tufts'; mesh.count = 0;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.castShadow = false; mesh.receiveShadow = true;
  mesh.userData.noShadowCast = true; mesh.userData.fpsEffect = true; mesh.raycast = () => {};
  scene.add(mesh);
  const dummy = new THREE.Object3D(), cameraPosition = new THREE.Vector3();
  let cellX = Infinity, cellZ = Infinity, lastQuality = '', disposed = false;
  return {
    mesh,
    update(camera: THREE.Camera, seconds: number, reduced: boolean, mobile = false) {
      if (disposed) return;
      camera.getWorldPosition(cameraPosition); eye.value.copy(cameraPosition); time.value = reduced ? 0 : seconds;
      const quality = reduced ? 'reduced' : mobile ? 'mobile' : 'full', radius = reduced ? 11 : mobile ? 16 : 23;
      reach.value = radius;
      const cx = Math.floor(cameraPosition.x/4)*4, cz = Math.floor(cameraPosition.z/4)*4;
      if (cx === cellX && cz === cellZ && quality === lastQuality) return;
      cellX = cx; cellZ = cz; lastQuality = quality;
      const spacing = reduced ? 1.35 : mobile ? 1.05 : .8, limit = reduced ? 384 : mobile ? 1536 : 4096;
      let count = 0;
      mesh.position.set(cx,0,cz);
      for (let ix = Math.floor((cx-radius-4)/spacing); ix <= Math.ceil((cx+radius+4)/spacing); ix++)
        for (let iz = Math.floor((cz-radius-4)/spacing); iz <= Math.ceil((cz+radius+4)/spacing); iz++) {
          const x = (ix+hash(ix,iz)) * spacing, z = (iz+hash(ix,iz,1)) * spacing;
          if (x < bounds.minX || x > bounds.maxX || z < bounds.minZ || z > bounds.maxZ || Math.hypot(x-cx,z-cz)>radius+3 || count>=limit) continue;
          const y = floor(x,z); if (y === null) continue;
          dummy.position.set(x-cx,y-.005,z-cz); dummy.rotation.set(0,hash(ix,iz,2)*Math.PI*2,0);
          const scale = .65 + hash(ix,iz,3)*.65;
          dummy.scale.set(scale, (.12+hash(ix,iz,4)*.12)*(reduced?.7:1), scale); dummy.updateMatrix(); mesh.setMatrixAt(count++,dummy.matrix);
        }
      mesh.count = count; mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingBox(); mesh.computeBoundingSphere(); mesh.updateMatrixWorld(true);
    },
    dispose() { if (disposed) return; disposed = true; mesh.removeFromParent(); mesh.dispose(); geometry.dispose(); material.dispose(); },
  };
}
