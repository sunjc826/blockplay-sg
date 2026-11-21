import { treePart, batchTrees, animateTrees } from './tree-wind';
import { captureFoliageDrift } from './ambient-drift';
import * as THREE from 'three';
import { createDistrictWater, type WaterMaterial } from './water';
import type { Obstacle } from './region-collision';
import type { RegionStamp, RegionWorld } from './regions';
import { districtLook, surfaceHash, type DistrictLook, type LookPresetId } from './district-look';
import { KERB, ROAD_LINE, minRadius, snapFootprint, snapModuleBox } from './block-module';
import { captureStagePart, captureStageState } from './stage-parts';

export interface SceneKitOptions {
  /** Sky and fog colour; districts pick their own daylight. */
  background: string;
  fogNear: number;
  fogFar: number;
  sun?: { x: number; y: number; z: number; color?: string; intensity?: number };
  shadow?: { extent: number; far: number };
  hemisphere?: { sky: string; ground: string; intensity: number };
  /**
   * The district's look (`district-look`): gradient sky, clouds, height haze, baked indirect light and a
   * colour grade. A preset name takes that preset with the hue of `background`; pass `districtLook(...)`
   * to override fields, or a full `DistrictLook`.
   */
  look?: LookPresetId | DistrictLook;
  /** Build on the block module (docs/SHAPE-LANGUAGE.md). New districts set this. */
  module?: boolean;
}

/**
 * Shared primitives for authored districts: tracked geometry and materials,
 * axis-aligned colliders, canvas signs and the instanced-batch/dispose pass.
 * Marina, Raffles and Queenstown predate this and keep their own copies.
 *
 * With `module: true`, boxes and colliders are built on the block module
 * (docs/SHAPE-LANGUAGE.md): both edges snap to the 0.1 m detail grid, nothing
 * is modelled thinner than 0.1 m, and a box and a collider authored with the
 * same numbers stay identical. Wrap landmark geometry in `freeform(() => ...)`
 * to keep it exact. Districts not yet converted build exactly as authored.
 */
export function createSceneKit(options: SceneKitOptions) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(options.background);
  scene.fog = new THREE.Fog(options.background, options.fogNear, options.fogFar);
  if (options.look) scene.userData.districtLook = typeof options.look === 'string' ? districtLook(options.look, options.background) : options.look;
  if (options.module) scene.userData.blockModule = true;
  const sky = options.hemisphere ?? { sky: '#f1f8ff', ground: '#787366', intensity: 1.8 };
  scene.add(new THREE.HemisphereLight(sky.sky, sky.ground, sky.intensity));
  const sunOptions = options.sun ?? { x: -110, y: 190, z: 100 };
  const sun = new THREE.DirectionalLight(sunOptions.color ?? '#fff1dd', sunOptions.intensity ?? 2);
  sun.position.set(sunOptions.x, sunOptions.y, sunOptions.z);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.normalBias = 0.22;
  const extent = options.shadow?.extent ?? 230;
  Object.assign(sun.shadow.camera, { left: -extent, right: extent, top: extent, bottom: -extent, far: options.shadow?.far ?? 540 });
  scene.add(sun);

  const onModule = options.module === true;
  const geometries: THREE.BufferGeometry[] = [], materials: THREE.Material[] = [], textures: THREE.Texture[] = [];
  const obstacles: Obstacle[] = [];
  const geo = <T extends THREE.BufferGeometry>(geometry: T) => { geometries.push(geometry); return geometry; };
  const mat = (color: string, roughness = 0.76, metalness = 0) => {
    const material = new THREE.MeshStandardMaterial({ color, roughness, metalness });
    materials.push(material); return material;
  };
  const waters: WaterMaterial[] = [];
  /** Water in the district's colour, on the surface shader every district shares (water.ts). */
  const water = (color: string, surface: { choppiness?: number; falls?: boolean } = {}) => {
    const material = createDistrictWater(color, { sun: sun.position, background: options.background, ...surface });
    materials.push(material); waters.push(material); return material;
  };
  const unit = geo(new THREE.BoxGeometry(1, 1, 1));
  const cylinderGeo = geo(new THREE.CylinderGeometry(1, 1, 1, 10));
  const crownGeo = geo(new THREE.IcosahedronGeometry(1, 1));

  let freeformDepth = onModule ? 0 : 1;
  /** Build landmark geometry exactly as authored, off the module grid. */
  function freeform<T>(build: () => T): T {
    freeformDepth++;
    try { return build(); } finally { freeformDepth--; }
  }
  function box(x: number, y: number, z: number, w: number, h: number, d: number, material: THREE.Material, parent: THREE.Object3D = scene, shadow = false) {
    const mesh = new THREE.Mesh(unit, material);
    if (freeformDepth) { mesh.position.set(x, y, z); mesh.scale.set(w, h, d); }
    else { const b = snapModuleBox(x, y, z, w, h, d); mesh.position.set(b.x, b.y, b.z); mesh.scale.set(b.w, b.h, b.d); }
    mesh.castShadow = shadow; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  }
  function cylinder(x: number, y: number, z: number, r: number, h: number, material: THREE.Material, parent: THREE.Object3D = scene) {
    const mesh = new THREE.Mesh(cylinderGeo, material);
    const radius = freeformDepth ? r : minRadius(r);
    mesh.position.set(x, y, z); mesh.scale.set(radius, h, radius);
    mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  }
  function beam(a: THREE.Vector3, b: THREE.Vector3, r: number, material: THREE.Material) {
    const mesh = cylinder(0, 0, 0, r, a.distanceTo(b), material);
    mesh.position.copy(a).add(b).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    return mesh;
  }
  /** Axis-aligned footprint. Keep these clear of every displayed road centreline. */
  function solid(x: number, z: number, w: number, d: number) {
    const footprint = { minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 };
    obstacles.push(freeformDepth ? footprint : snapFootprint(footprint));
  }
  function blob(x: number, y: number, z: number, sx: number, sy: number, sz: number, material: THREE.Material, parent: THREE.Object3D = scene) {
    const mesh = new THREE.Mesh(crownGeo, material);
    mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz); mesh.castShadow = true; parent.add(mesh); return mesh;
  }
  function sign(text: string, x: number, y: number, z: number, w = 16, h = 2, color = '#235749', textColor = '#fff9e8') {
    if (typeof document === 'undefined') return;
    const canvas = document.createElement('canvas'); canvas.width = 768; canvas.height = 128;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    ctx.fillStyle = color; ctx.fillRect(0, 0, 768, 128);
    ctx.fillStyle = textColor; ctx.font = 'bold 54px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, 384, 66, 740);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; textures.push(texture);
    const material = new THREE.MeshBasicMaterial({ map: texture }); materials.push(material);
    const panel = new THREE.Mesh(geo(new THREE.PlaneGeometry(w, h)), material);
    panel.position.set(x, y, z); scene.add(panel); return panel;
  }
  function tree(x: number, z: number, h: number, trunk: THREE.Material, leaf: THREE.Material) {
    treePart(box(x, h / 2, z, 0.6, h, 0.6, trunk, scene, true), x, 0, z, h); solid(x, z, 0.8, 0.8);
    for (let i = 0; i < 3; i++) treePart(blob(x + (i - 1) * 1.7, h + i % 2, z, 3.6, 2.5, 3.5, leaf), x, 0, z, h, 1);
  }
  /** Simple animated bystander. Groups are never batched, so they can move. */
  function walker(x: number, z: number, shirt: THREE.Material, skin: THREE.Material, legs: THREE.Material) {
    return freeform(() => walkerFigure(x, z, shirt, skin, legs));
  }
  /** Bystanders and the car keep their own proportions, off the module. */
  function walkerFigure(x: number, z: number, shirt: THREE.Material, skin: THREE.Material, legs: THREE.Material) {
    const person = new THREE.Group();
    box(0, 1.1, 0, 0.5, 0.7, 0.35, shirt, person);
    box(0, 1.7, 0, 0.33, 0.35, 0.33, skin, person);
    for (const side of [-0.16, 0.16]) box(side, 0.4, 0, 0.16, 0.8, 0.18, legs, person);
    person.position.set(x, 0, z); scene.add(person); return person;
  }
  function car(body: THREE.Material, glass: THREE.Material, trim: THREE.Material, dark: THREE.Material) {
    return freeform(() => carModel(body, glass, trim, dark));
  }
  function carModel(body: THREE.Material, glass: THREE.Material, trim: THREE.Material, dark: THREE.Material) {
    const group = new THREE.Group(); scene.add(group);
    box(0, 0.7, 0, 1.8, 0.65, 3.4, body, group, true);
    box(0, 1.18, 0.1, 1.5, 0.62, 1.65, glass, group);
    box(0, 1.51, 0.1, 1.6, 0.13, 1.85, trim, group);
    box(0, 0.65, -1.74, 1.55, 0.2, 0.08, trim, group);
    const wheelGeo = geo(new THREE.CylinderGeometry(0.36, 0.36, 0.24, 10));
    for (const x of [-0.94, 0.94]) for (const z of [-1.05, 1.05]) {
      const wheel = new THREE.Mesh(wheelGeo, dark); wheel.rotation.z = Math.PI / 2; wheel.position.set(x, 0.38, z); group.add(wheel);
    }
    group.visible = false; return group;
  }
  /**
   * Orthogonal street grid with centre lines, kerbs and a perimeter loop.
   * Returns nothing to collide with: districts place their own footprints
   * clear of these centrelines. Lines are module road paint (0.2 m wide,
   * 5 m dashes on a 12 m pitch) and kerbs are a module kerb high.
   *
   * Between junctions each carriageway also gets a darker gutter strip and a
   * solid edge line along both sides. Where two grid roads cross, every arm
   * gets a zebra crossing and a stop line on the approaching half (traffic
   * keeps left). All of it is flat paint: nothing here collides or gives cover.
   */
  function streetGrid(options: {
    ew: readonly number[]; ns: readonly number[]; edgeX: number; edgeZ: number;
    asphalt: THREE.Material; line: THREE.Material; kerb?: THREE.Material; width?: number; loop?: boolean;
  }) {
    const { ew, ns, edgeX, edgeZ, asphalt, line, kerb, loop = true } = options;
    const width = options.width ?? 16, half = width / 2 + 2.5;
    const lineWidth = onModule ? ROAD_LINE.width : 0.16, dash = onModule ? ROAD_LINE.dash : 5;
    const kerbHeight = onModule ? KERB.height : 0.22, kerbY = onModule ? KERB.height / 2 : 0.12;
    const runs = (edge: number, crossings: readonly number[]) => {
      let spans: [number,number][] = [[-edge,edge]];
      for (const cross of crossings) spans = spans.flatMap(([a,b]) => {
        const lo=Math.max(a,cross-width/2),hi=Math.min(b,cross+width/2);
        return hi<=lo?[[a,b] as [number,number]]:[[a,lo],[hi,b]].filter(([from,to])=>to-from>1e-5) as [number,number][];
      });
      return spans;
    };
    const horizontal = runs(edgeX, [...ns, ...(loop?[-edgeX,edgeX]:[])]);
    const vertical = runs(edgeZ, [...ew, ...(loop?[-edgeZ,edgeZ]:[])]);
    const gutter = mat(`#${(asphalt as THREE.MeshStandardMaterial).color.clone().multiplyScalar(.7).getHexString()}`, .95);
    const gutterWidth = 0.5, edgeInset = 1, stripe = 0.5, crossing = 3, setback = 1;
    const iron = mat('#24282a', .7, .35);
    /** Paint along one stretch of road between junctions. `along` maps (distance along, offset across) to x and z. */
    const dress = (from: number, to: number, centre: number, stops: readonly number[], place: (along: number, across: number, length: number, breadth: number, material: THREE.Material, lift?: number) => void) => {
      if (to - from < 2) return;
      for (const side of [-1, 1]) {
        place((from + to) / 2, centre + side * (width / 2 - gutterWidth / 2), to - from, gutterWidth, gutter, .075);
        place((from + to) / 2, centre + side * (width / 2 - edgeInset), to - from, lineWidth, line);
      }
      // Ironwork: a drain grate in each gutter every 24 m, staggered side to side, and a manhole cover in one
      // lane about every 40 m, placed from the stretch's own position so a district builds the same every time.
      for (let at = from + 7, n = 0; at < to - 4; at += 24, n++) for (const side of [-1, 1]) place(at + (side > 0 ? 12 : 0) < to - 4 ? at + (side > 0 ? 12 : 0) : at, centre + side * (width / 2 - gutterWidth / 2), 0.8, 0.4, iron, .1);
      for (let at = from + 15; at < to - 8; at += 41) {
        const lane = surfaceHash(Math.round(at), Math.round(centre)) > .5 ? 1 : -1;
        place(at, centre + lane * width / 4, 0.9, 0.9, iron, .1);
      }
      for (const [end, toward] of [[from, 1], [to, -1]] as const) {
        // Only where this stretch meets another grid road, and only when it is long enough to hold both ends' paint.
        if (!stops.some(stop => Math.abs(Math.abs(end - stop) - width / 2) < 1e-3) || to - from < 2 * (setback + crossing + 2)) continue;
        const near = end + toward * setback, far = near + toward * crossing;
        for (let across = -width / 2 + gutterWidth + stripe; across < width / 2 - gutterWidth - stripe / 2; across += stripe * 2) place((near + far) / 2, centre + across, crossing, stripe, line);
        // Traffic keeps left: a stretch entered at `from` is left by the lane on its far side.
        place(far + toward * 1, centre + toward * width / 4, 0.4, width / 2 - gutterWidth, line);
      }
    };
    for (const z of ew) {
      box(0, 0, z, edgeX * 2, 0.12, width, asphalt);
      for (let x = -edgeX + 6; x < edgeX; x += 12) box(x, 0.09, z, dash, 0.025, lineWidth, line);
      if (kerb) for (const side of [-half, half]) for (const [a,b] of horizontal) box((a+b)/2, kerbY, z + side, b-a, kerbHeight, 3, kerb);
      for (const [a,b] of horizontal) dress(a, b, z, ns, (along, across, length, breadth, material, lift = .09) => box(along, lift, across, length, 0.025, breadth, material));
    }
    for (const x of ns) {
      box(x, 0, 0, width, 0.12, edgeZ * 2, asphalt);
      for (let z = -edgeZ + 6; z < edgeZ; z += 12) box(x, 0.09, z, lineWidth, 0.025, dash, line);
      if (kerb) for (const side of [-half, half]) for (const [a,b] of vertical) box(x + side, kerbY, (a+b)/2, 3, kerbHeight, b-a, kerb);
      for (const [a,b] of vertical) dress(a, b, x, ew, (along, across, length, breadth, material, lift = .09) => box(across, lift, along, breadth, 0.025, length, material));
    }
    if (!loop) return;
    for (const z of [-edgeZ, edgeZ]) {
      box(0, 0, z, edgeX * 2 + width, 0.12, width, asphalt);
      for (let x = -edgeX; x < edgeX; x += 12) box(x, 0.09, z, dash, 0.025, lineWidth, line);
    }
    for (const x of [-edgeX, edgeX]) {
      box(x, 0, 0, width, 0.12, edgeZ * 2, asphalt);
      for (let z = -edgeZ; z < edgeZ; z += 12) box(x, 0.09, z, lineWidth, 0.025, dash, line);
    }
  }

  const stageInstances: THREE.InstancedMesh[] = [];
  /**
   * Mark what `build` adds as a stage part: a named piece of the district a Levelution event may act on
   * (docs/LEVELUTION.md). Build it as usual inside the callback. Trees do not belong in a part.
   */
  function stage(id: string, options: { tags?: readonly string[] }, build: () => void) {
    stageInstances.push(...captureStagePart({ scene, obstacles }, id, options.tags ?? [], build));
  }
  /** An alternative state of a stage part, built beside it from the same position and kept out of the world until an event sets it. */
  function stageState(id: string, state: string, build: () => void) {
    stageInstances.push(...captureStageState({ scene, obstacles }, id, state, build));
  }

  function stampRings(list: readonly RegionStamp[], material: THREE.Material) {
    const stampGeo = geo(new THREE.TorusGeometry(1.15, 0.16, 5, 20));
    return list.map(stamp => {
      const mesh = new THREE.Mesh(stampGeo, material);
      mesh.position.set(stamp.x, 2.2, stamp.z); scene.add(mesh); return mesh;
    });
  }

  /**
   * Merge repeated static meshes into instanced draws, then hand back the
   * region world. Anything parented to a Group stays individually animatable.
   */
  function finish({ car: carGroup, stamps, animate }: { car: THREE.Object3D; stamps: THREE.Mesh[]; animate: (time: number) => void }): RegionWorld {
    captureFoliageDrift(scene);
    scene.userData.authoredMeshCount = scene.children.filter(child => child instanceof THREE.Mesh).length;
    const batches = new Map<string, THREE.Mesh[]>(), instances = batchTrees(scene, geo, m => materials.push(m));
    for (const child of [...scene.children]) {
      if (!(child instanceof THREE.Mesh) || child instanceof THREE.InstancedMesh || Array.isArray(child.material) || stamps.includes(child)) continue;
      const key = `${child.geometry.uuid}:${child.material.uuid}:${child.castShadow}:${child.receiveShadow}`;
      const batch = batches.get(key) ?? []; batch.push(child); batches.set(key, batch);
    }
    for (const batch of batches.values()) {
      if (batch.length < 2) continue;
      const merged = new THREE.InstancedMesh(batch[0].geometry, batch[0].material, batch.length);
      merged.castShadow = batch[0].castShadow; merged.receiveShadow = batch[0].receiveShadow;
      batch.forEach((mesh, index) => { mesh.updateMatrix(); merged.setMatrixAt(index, mesh.matrix); scene.remove(mesh); });
      merged.computeBoundingSphere(); scene.add(merged); instances.push(merged);
    }
    return {
      scene, obstacles, car: carGroup, stamps,
      animate(time: number) {
        animateTrees(scene, time);
        waters.forEach(material => material.userData.setTime(time));
        stamps.forEach((stamp, index) => {
          stamp.rotation.y = time * 0.7;
          stamp.position.y = 2.2 + Math.sin(time * 2 + index) * 0.2;
        });
        animate(time);
      },
      dispose() {
        instances.forEach(mesh => mesh.dispose());
        stageInstances.forEach(mesh => mesh.dispose());
        geometries.forEach(geometry => geometry.dispose());
        materials.forEach(material => material.dispose());
        textures.forEach(texture => texture.dispose());
        sun.shadow.dispose();
      },
    };
  }

  return { scene, obstacles, geo, mat, water, box, cylinder, beam, blob, solid, sign, tree, walker, car, streetGrid, stampRings, finish, freeform, stage, stageState, THREE };
}
export type SceneKit = ReturnType<typeof createSceneKit>;
