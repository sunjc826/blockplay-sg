import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { aimDirection, fountainHeight, laserAim, paletteAt, showStep, supertreeLights, supertreeProgramme } from './marina-bay-show';
import { BAY_SHOW } from './district-set-pieces';
import { getRegion } from './regions';

const TREES = [[291, 15, 11], [304, 65, 14], [289, 116, 10]] as const;

describe('the Marina Bay shows', () => {
  it('crossfades from one palette to the next instead of cutting', () => {
    const a = new THREE.Color(), b = new THREE.Color(), before = new THREE.Color(), after = new THREE.Color();
    expect(showStep(10, 20, 3)).toEqual({ index: 0, blend: 0 });
    expect(showStep(18.5, 20, 3).blend).toBeCloseTo(.5);
    // Just before a change the colour has already arrived where the next step starts.
    const end = showStep(19.999, 20, 3), start = showStep(20, 20, 3);
    paletteAt(end.index, end.blend, before, b); paletteAt(start.index, start.blend, after, b);
    expect(before.r).toBeCloseTo(after.r, 2); expect(before.g).toBeCloseTo(after.g, 2); expect(before.b).toBeCloseTo(after.b, 2);
    paletteAt(-1, 0, a, b); expect(Number.isFinite(a.r)).toBe(true);
  });

  it('hangs the Supertree lamps on each tree\'s own frame', () => {
    const lights = supertreeLights(TREES);
    expect(lights.length).toBeGreaterThan(1500);
    for (const l of lights) {
      const [x, z, r] = TREES[l.tree];
      expect(Math.hypot(l.x - x, l.z - z)).toBeLessThanOrEqual(r + 2.01);
      expect(l.y).toBeGreaterThanOrEqual(1); expect(l.y).toBeLessThanOrEqual(26.01);
      expect(l.rise).toBeGreaterThanOrEqual(0); expect(l.rise).toBeLessThanOrEqual(1);
    }
  });

  it('runs every Supertree programme smoothly, with no strobing', () => {
    const lights = supertreeLights(TREES).filter((_, i) => i % 7 === 0);
    for (let programme = 0; programme < 4; programme++) for (const light of lights) for (let t = 0; t < 20; t += .5) {
      const now = supertreeProgramme(programme, light, t), next = supertreeProgramme(programme, light, t + 1 / 60);
      for (const v of [now.mix, now.level]) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1); }
      expect(Math.abs(next.level - now.level), `programme ${programme}`).toBeLessThan(.12);
      expect(Math.abs(next.mix - now.mix), `programme ${programme}`).toBeLessThan(.12);
    }
  });

  it('keeps the lasers sweeping over the bay and the city, never down onto the promenade', () => {
    const d = new THREE.Vector3();
    for (let pattern = 0; pattern < 4; pattern++) for (let emitter = 0; emitter < 2; emitter++) for (let k = 0; k < 4; k++) for (let t = 0; t < 60; t += .25) {
      const aim = laserAim(pattern, emitter, k, t);
      expect(aim.pitch).toBeGreaterThan(-.25); expect(aim.pitch).toBeLessThan(.3);
      expect(Math.abs(aim.yaw)).toBeLessThan(.6);
      // West, away from the SkyPark, and out over the bay.
      expect(aimDirection(aim, d).x).toBeLessThan(-.8);
    }
  });

  it('keeps every fountain jet between a ripple and thirty metres', () => {
    for (let pattern = 0; pattern < 4; pattern++) for (let i = 0; i < 13; i++) for (let t = 0; t < 30; t += .3) {
      const h = fountainHeight(pattern, i, 13, t); expect(h).toBeGreaterThanOrEqual(5); expect(h).toBeLessThanOrEqual(30);
    }
  });

  it('puts the show on at night and leaves the bay dark by day', () => {
    const world = getRegion('marina-bay').build();
    try {
      const clock = new THREE.Object3D(); clock.name = 'world-atmosphere'; world.scene.add(clock);
      const root = world.scene.getObjectByName('district-set-pieces')!;
      const shown = () => { const kinds: string[] = []; root.traverse(o => { if ((o as THREE.Mesh).material instanceof THREE.ShaderMaterial && o.visible && o.parent!.visible) kinds.push(o.type); }); return kinds; };
      clock.userData.timeOfDay = 13; world.animate(60);
      expect(shown()).toEqual([]);
      clock.userData.timeOfDay = 22.5; world.animate(60);
      // The Supertrees, the fountains, eight lasers and their emitters.
      expect(shown().length).toBe(11);
      world.animate(BAY_SHOW.length + 30);
      expect(shown()).toEqual(['Points']);
    } finally { world.dispose(); }
  });
});
