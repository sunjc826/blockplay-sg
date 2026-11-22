import * as THREE from 'three';
import type { SceneKit } from './scene-kit';
import { stageFall, stageImpact, stageTip, type StageZone } from './stage-parts';

/**
 * Stage parts a district can stand anywhere: each builds a piece and its other
 * state for a Levolution archetype (docs/LEVOLUTION.md), from one position, so a
 * scene adds an event with one line and moves it by changing that line.
 */

/** Seconds a piece of the `give-way` archetype takes to come down; the archetype draws it that long before it lands. */
export const STAGE_GIVE_WAY_SECONDS = 1.8;
/** Seconds flood water takes to rise (`flash-flood`). */
export const STAGE_FLOOD_SECONDS = 6;
/** How deep a flood stands: over the ankles, and shallow enough that someone lying in it still shows. */
export const STAGE_FLOOD_DEPTH = .3;
/** Seconds roller shutters take to close (`lockdown`). */
export const STAGE_SHUTTER_SECONDS = 2.4;

type Point = { x: number; z: number };
const bounds = (points: readonly Point[]) => ({ minX: Math.min(...points.map(p => p.x)), maxX: Math.max(...points.map(p => p.x)), minZ: Math.min(...points.map(p => p.z)), maxZ: Math.max(...points.map(p => p.z)) });

/**
 * A big rain tree that comes down along `heading` (radians; x = sin, z = cos) and lies across whatever is
 * there: `length` metres of trunk a player can vault and a bot cannot, with the crown beyond it.
 * For the `give-way` archetype. Stand it at the edge of a lane so that the fall crosses the lane.
 */
export function stageTree(kit: SceneKit, id: string, x: number, z: number, heading: number, length = 13) {
  const bark = kit.mat('#6b523c'), leaf = kit.mat('#3f6b3a'), pale = kit.mat('#55834a');
  const trunk = length * .62, sin = Math.sin(heading), cos = Math.cos(heading);
  /** The tree upright in `parent`'s space, set half a trunk's width behind the pivot so that it lies on the ground, not in it. */
  const tree = (parent: THREE.Object3D) => {
    kit.box(0, trunk / 2, -.5, .95, trunk, .95, bark, parent, true);
    for (const [dx, dy, dz, r, m] of [[0, 0, 0, 3.6, leaf], [2.2, -.8, .6, 2.6, pale], [-2, -.5, -.8, 2.8, leaf], [.4, 1.6, -1, 2.4, pale], [-.6, .4, 1.6, 2.5, leaf]] as const)
      kit.blob(dx, trunk + 2.2 + dy, -.5 + dz, r, r * .72, r, m, parent);
  };
  kit.stage(id, { tags: ['tree'] }, () => kit.freeform(() => {
    const standing = new THREE.Group(); standing.position.set(x, 0, z); standing.rotation.y = heading; kit.scene.add(standing);
    tree(standing); kit.solid(x, z, 1.2, 1.2);
  }));
  kit.stageState(id, 'fallen', () => kit.freeform(() => {
    const turned = new THREE.Group(); turned.position.set(x, 0, z); turned.rotation.y = heading; kit.scene.add(turned);
    const pivot = new THREE.Group(); pivot.rotation.order = 'YXZ'; pivot.rotation.x = Math.PI / 2; turned.add(pivot);
    tree(pivot); stageTip(pivot, { tip: Math.PI / 2, yaw: 0, seconds: STAGE_GIVE_WAY_SECONDS }); stageImpact(pivot, 1.1);
    const along = (a: number, u: number): Point => ({ x: x + sin * a + cos * u, z: z + cos * a - sin * u });
    const log = [along(.2, -.55), along(.2, .55), along(trunk, .55), along(trunk, -.55)], crown = [along(trunk + .2, -2.6), along(trunk + .2, 2.6), along(trunk + 5, 2.6), along(trunk + 5, -2.6)];
    kit.obstacles.push({ ...bounds(log), minY: 0, maxY: 1.05, footprint: log, supportsTop: true }, { ...bounds(crown), minY: 0, maxY: 2.6, footprint: crown });
  }));
}

/**
 * A free-standing steel shelter, `width` along x and `depth` along z, whose roof comes down: the overhead
 * cover goes and two roof panels lie on the ground as crouch-height cover, with two posts left as stumps.
 * For the `give-way` archetype.
 */
export function stageCanopy(kit: SceneKit, id: string, x: number, z: number, width = 12, depth = 6) {
  const steel = kit.mat('#8d979b', .4, .5), roof = kit.mat('#c9cfc6', .6, .2), rust = kit.mat('#7d6a55');
  const posts = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sz]) => ({ x: x + sx * (width / 2 - .4), z: z + sz * (depth / 2 - .4) }));
  kit.stage(id, { tags: ['canopy', 'overhead'] }, () => kit.freeform(() => {
    for (const p of posts) { kit.box(p.x, 1.6, p.z, .3, 3.2, .3, steel, kit.scene, true); kit.solid(p.x, p.z, .4, .4); }
    kit.box(x, 3.32, z, width, .24, depth, roof, kit.scene, true);
    for (const side of [-1, 1]) kit.box(x, 3.12, z + side * (depth / 2 - .4), width - .4, .2, .2, steel);
  }));
  kit.stageState(id, 'fallen', () => kit.freeform(() => {
    // Two posts are left standing as stumps; the others went with the roof.
    for (const p of [posts[0], posts[2]]) { kit.box(p.x, .65, p.z, .3, 1.3, .3, rust, kit.scene, true); kit.obstacles.push({ minX: p.x - .2, maxX: p.x + .2, minZ: p.z - .2, maxZ: p.z + .2, minY: 0, maxY: 1.3 }); }
    const panel = (cx: number, cz: number, w: number, d: number, yaw: number, delay: number) => {
      const slab = new THREE.Group(); slab.position.set(cx, 0, cz); slab.rotation.y = yaw; kit.scene.add(slab);
      kit.box(0, .5, 0, w, .22, d, roof, slab, true); kit.box(0, .2, 0, w * .9, .4, d * .2, steel, slab);
      const lean = slab.children[0]; lean.rotation.z = .1;
      stageFall(slab, { position: [x + (cx - x) * .4, 3.3, z + (cz - z) * .4], yaw: 0, delay }); stageImpact(slab, .8);
      const cos = Math.cos(yaw), sin = Math.sin(yaw), footprint = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]].map(([px, pz]) => ({ x: cx + px * cos + pz * sin, z: cz - px * sin + pz * cos }));
      kit.obstacles.push({ ...bounds(footprint), minY: 0, maxY: .95, footprint, supportsTop: true });
    };
    panel(x - width * .24, z - depth * .12, width * .44, depth * .6, .22, 0);
    panel(x + width * .26, z + depth * .14, width * .4, depth * .55, -.35, .25);
  }));
}

/**
 * A line of roller shutters across a passage, from `x1` to `x2` at `z`: open, people walk through under
 * the header; shut, it is a wall. For the `lockdown` archetype. Give the map another way round.
 */
export function stageShutters(kit: SceneKit, id: string, x1: number, x2: number, z: number) {
  const frame = kit.mat('#5d676c', .5, .4), slat = kit.mat('#aab2b4', .45, .5), stripe = kit.mat('#d8a02a');
  const bays = Math.max(1, Math.round((x2 - x1) / 4.6)), bay = (x2 - x1) / bays, height = 3.2;
  const structure = () => {
    for (let i = 0; i <= bays; i++) { const px = x1 + i * bay; kit.box(px, height / 2 + .1, z, .5, height + .2, .5, frame, kit.scene, true); }
    // The housing the shutters roll up into: deep and tall enough to hide a rolled slat.
    kit.box((x1 + x2) / 2, height + .1, z, x2 - x1 + .5, 1, .7, frame, kit.scene, true);
  };
  kit.stage(id, { tags: ['shutters', 'gate'] }, () => kit.freeform(() => {
    structure();
    for (let i = 0; i <= bays; i++) kit.solid(x1 + i * bay, z, .6, .6);
  }));
  kit.stageState(id, 'shut', () => kit.freeform(() => {
    structure();
    // Each bay comes down as four slats out of the housing, lowest first.
    const slats = 4, tall = (height - .4) / slats;
    for (let i = 0; i < bays; i++) for (let n = 0; n < slats; n++) {
      const cx = x1 + (i + .5) * bay, panel = new THREE.Group(); panel.position.set(cx, n * tall, z); kit.scene.add(panel);
      kit.box(0, tall / 2, 0, bay - .5, tall, .12, slat, panel, true);
      for (const y of [.2, tall - .2]) kit.box(0, y, .07, bay - .5, .04, .02, frame, panel);
      if (!n) kit.box(0, .12, .08, bay - .5, .24, .04, stripe, panel);
      stageFall(panel, { position: [cx, height - .35, z], delay: .12 * i + .2 * n });
    }
    kit.obstacles.push({ minX: x1 - .3, maxX: x2 + .3, minZ: z - .3, maxZ: z + .3, minY: 0, maxY: height + .6 });
  }));
}

/**
 * A substation kiosk, 3 m by 2 m. Blowing it up, or the match clock, puts the district's lights out
 * (`substation` archetype). Its other state is the same cabinet burnt out, doors hanging.
 */
export function stageSubstation(kit: SceneKit, id: string, x: number, z: number) {
  const green = kit.mat('#3f5a4a', .6, .2), plinth = kit.mat('#9a9990'), sign = kit.mat('#e2b21c'), burnt = kit.mat('#2b2a28', .9), vent = kit.mat('#24302a');
  const cabinet = (body: THREE.Material, wrecked: boolean) => kit.freeform(() => {
    kit.box(x, .12, z, 3.4, .24, 2.4, plinth);
    kit.box(x, 1.34, z, 3, 2.2, 2, body, kit.scene, true);
    kit.box(x, 2.52, z, 3.2, .16, 2.2, wrecked ? burnt : vent);
    for (const dx of [-.75, .75]) { const door = kit.box(x + dx, 1.3, z + 1.02, 1.3, 1.9, .06, wrecked ? burnt : vent); if (wrecked) { door.rotation.y = dx * .9; door.position.z += .45; door.position.x += dx * .35; } }
    if (!wrecked) kit.box(x, 1.9, z + 1.06, .5, .5, .03, sign);
    kit.obstacles.push({ minX: x - 1.6, maxX: x + 1.6, minZ: z - 1.1, maxZ: z + 1.1, minY: 0, maxY: 2.6, supportsTop: true });
  });
  kit.stage(id, { tags: ['substation'] }, () => cabinet(green, false));
  kit.stageState(id, 'wrecked', () => cabinet(burnt, true));
}

/**
 * Ground that floods: `zones` are rectangles of level ground that go under a sheet of water
 * `STAGE_FLOOD_DEPTH` deep, where everyone on foot is slowed (`flash-flood` archetype). Dry until then.
 * Choose ground both teams have to cross, or flood both sides alike.
 */
export function stageFlood(kit: SceneKit, id: string, zones: readonly StageZone[], colour = '#6f8f8a') {
  const water = kit.water(colour);
  kit.stage(id, { tags: ['flood', 'water'], zones }, () => {});
  kit.stageState(id, 'flooded', () => kit.freeform(() => {
    for (const zone of zones) {
      const cx = (zone.minX + zone.maxX) / 2, cz = (zone.minZ + zone.maxZ) / 2;
      const sheet = kit.box(cx, STAGE_FLOOD_DEPTH - .3, cz, zone.maxX - zone.minX, .6, zone.maxZ - zone.minZ, water);
      stageFall(sheet, { position: [cx, -.34, cz], seconds: STAGE_FLOOD_SECONDS, rise: true });
    }
  }));
}
