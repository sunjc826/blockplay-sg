import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { getRegion } from './regions';
import { DEFAULT_STAGE_OVERLAYS, createStageReview, crushFootprints, districtStageArenas, dustClouds, stagePhase, stageSpan, stageTicks } from './levelution-review';
import { getStageParts } from './stage-parts';
import { districtSurfaceHit } from './district-review';

describe('Levelution on the review board', () => {
  it('finds a district\'s staged arenas and none where there are no events', () => {
    const tuas = getRegion('tuas').build(), bishan = getRegion('bishan').build();
    try {
      const arenas = districtStageArenas('tuas', tuas.scene);
      expect(arenas.map(a => a.area.id)).toEqual(['container-yard']);
      expect(arenas[0].events.map(e => e.binding.id)).toEqual(['container-yard-west', 'container-yard-east']);
      expect(districtStageArenas('bishan', bishan.scene)).toEqual([]);
    } finally { tuas.dispose(); bishan.dispose(); }
  });

  it('lays the events out as a timeline, with where each crush lands and when the dust hangs', () => {
    const world = getRegion('tuas').build();
    try {
      const [arena] = districtStageArenas('tuas', world.scene), [west, east] = arena.events;
      expect(stageSpan(arena.events)).toBe(east.duration); expect(east.duration).toBeGreaterThan(west.duration);
      const ticks = stageTicks(arena.events);
      expect(ticks[0]).toEqual({ at: 0, label: 'West gantry: warning · East gantry: warning' });
      expect(ticks.map(t => t.at)).toEqual([...ticks.map(t => t.at)].sort((a, b) => a - b));
      expect(ticks.some(t => t.label.includes('stacking-crane-west → falling'))).toBe(true);
      expect(ticks.at(-1)!.label).toBe('East gantry: settled');
      expect(stagePhase(arena.events, 0)).toBe('As built'); expect(stagePhase(arena.events, 2)).toBe('Warning');
      expect(stagePhase(arena.events, west.warning + 1)).toBe('Coming down'); expect(stagePhase(arena.events, 99)).toBe('Settled');
      const crushes = crushFootprints(west);
      expect(crushes).toHaveLength(3);
      for (const crush of crushes) { expect(crush.at).toBeGreaterThanOrEqual(west.warning); expect(crush.obstacles.length).toBeGreaterThan(0); }
      // The gantry's own landing is its two legs and two end frames.
      expect(crushes.at(-1)!.obstacles).toHaveLength(4);
      const clouds = dustClouds(west);
      expect(clouds).toHaveLength(5);
      for (const cloud of clouds) { expect(cloud.from).toBeGreaterThan(west.warning); expect(cloud.until - cloud.from).toBeGreaterThan(10); }
    } finally { world.dispose(); }
  });

  it('scrubs the built scene forwards and back, and draws notes no pin can land on', () => {
    const world = getRegion('tuas').build(), region = getRegion('tuas');
    try {
      const arenas = districtStageArenas('tuas', world.scene), review = createStageReview(world, arenas, region.bounds), events = arenas[0].events;
      const crane = getStageParts(world.scene).find(p => p.id === 'stacking-crane-west')!, stack = getStageParts(world.scene).find(p => p.id === 'container-stack-b')!;
      const span = stageSpan(events);
      expect(review.seek(events, span)).toEqual([]);
      expect(crane.states.fallen.object.parent).toBe(world.scene); expect(stack.states.toppled.object.parent).toBe(world.scene);
      for (const o of crane.states.fallen.obstacles) expect(world.obstacles).toContain(o);
      // Back to the middle of the fall: the gantry is in the air, tipped part of the way.
      review.seek(events, events[0].warning + 1.5);
      expect(crane.states.falling.object.parent).toBe(world.scene); expect(crane.states.fallen.object.parent).toBeNull();
      const tip = crane.states.falling.object.children.find(o => o.userData.stageTip)!.rotation.x;
      expect(tip).toBeGreaterThan(0); expect(tip).toBeLessThan(Math.PI / 2);
      // Playing forward in small steps reports what lands on the way.
      let landed = 0; for (let t = events[0].warning + 1.5; t <= events[0].warning + 6; t += .05) landed += review.seek(events, t).length;
      expect(landed).toBeGreaterThan(10);
      review.seek(events, 0);
      expect(crane.object.parent).toBe(world.scene); expect(stack.object.parent).toBe(world.scene);
      for (const o of crane.obstacles) expect(world.obstacles).toContain(o);
      // Only one event chosen: the other half of the yard stays as built.
      review.seek([events[0]], span);
      expect(getStageParts(world.scene).find(p => p.id === 'stacking-crane-east')!.object.parent).toBe(world.scene);
      review.overlays(events, events[0].warning + 3.5, { ...DEFAULT_STAGE_OVERLAYS, colliders: true }, arenas[0]);
      const notes = world.scene.getObjectByName('Levelution review overlays')!, dressing = world.scene.getObjectByName('Arena dressing')!;
      expect(notes.children.length).toBeGreaterThan(20); expect(dressing.children.length).toBeGreaterThan(20);
      world.scene.updateMatrixWorld(true);
      const ray = new THREE.Raycaster(new THREE.Vector3(97, 80, -20), new THREE.Vector3(0, -1, 0)), hit = districtSurfaceHit(world.scene, ray, region.bounds)!;
      for (let o: THREE.Object3D | null = hit.object; o; o = o.parent) expect(o === notes || o === dressing).toBe(false);
      review.overlays(events, 0, { ring: false, crush: false, colliders: false, dust: false, dressing: false });
      expect(world.scene.getObjectByName('Arena dressing')).toBeUndefined();
      expect(world.scene.getObjectByName('Levelution review overlays')!.children).toHaveLength(0);
      review.dispose();
      expect(world.scene.getObjectByName('Levelution review overlays')).toBeUndefined();
      expect(crane.object.parent).toBe(world.scene);
    } finally { world.dispose(); }
  });
});
