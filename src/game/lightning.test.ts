import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { LIGHTNING_PERIOD, buildBolt, createLightning, lightningStrike, strikeClock, strikeFlash } from './lightning';
import { crossedLightning } from './world-audio';

describe('lightning', () => {
  it('starts each strike on the moment the thunder is cued', () => {
    for (const t of [1, 24, 47, 1151]) {
      expect(crossedLightning(t - .1, t + .1)).toBe(true);
      expect(strikeClock(t + .1).since).toBeCloseTo(.1); expect(strikeClock(t - .1).since).toBeGreaterThan(LIGHTNING_PERIOD - 1);
      expect(strikeClock(t + .1).index).toBe(strikeClock(t - .1).index + 1);
    }
  });
  it('varies its strikes: restrikes, sheet flashes and distances, the same every time for one index', () => {
    const strikes = Array.from({ length: 200 }, (_, i) => lightningStrike(i));
    expect(lightningStrike(17)).toEqual(strikes[17]);
    expect(new Set(strikes.map(s => s.strokes.length)).size).toBeGreaterThan(2);
    const sheets = strikes.filter(s => s.sheet).length; expect(sheets).toBeGreaterThan(25); expect(sheets).toBeLessThan(80);
    for (const s of strikes) {
      expect(s.strokes[0]).toBe(0); expect(s.strokes[s.strokes.length - 1]).toBeLessThan(.4);
      expect(s.distance).toBeGreaterThanOrEqual(350); expect(s.distance).toBeLessThanOrEqual(2050);
      expect(s.range).toBeLessThan(700); expect(Math.abs(s.bearing)).toBeLessThanOrEqual(.8);
    }
  });
  it('flickers the channel on its restrikes, lights the forks once, and gives the sky one smooth pulse', () => {
    const strike = { ...lightningStrike(0), strokes: [0, .1, .2], sheet: false };
    expect(strikeFlash(strike, -.01).bolt).toBe(0); expect(strikeFlash(strike, 1).bolt).toBe(0);
    expect(strikeFlash(strike, 0).bolt).toBe(1);
    const before = strikeFlash(strike, .095).bolt, after = strikeFlash(strike, .101).bolt; expect(after).toBeGreaterThan(before * 2);
    expect(strikeFlash(strike, .101).forks).toBeLessThan(.12);
    // The sky rises once and only falls afterwards, restrikes or not.
    let peak = 0, last = 0, falling = false;
    for (let t = 0; t < .9; t += .005) { const sky = strikeFlash(strike, t).sky; if (falling) expect(sky).toBeLessThanOrEqual(last + 1e-9); else if (sky < last) falling = true; peak = Math.max(peak, sky); last = sky; }
    expect(peak).toBeGreaterThan(.9); expect(last).toBeLessThan(.06);
  });
  it('builds one unbroken channel from the cloud to the ground with forks that leave it downwards', () => {
    for (const seed of [3, 10, 17, 24, 311]) {
      const bolt = buildBolt(seed, 4), trunk = bolt.filter(s => s.trunk), forks = bolt.filter(s => !s.trunk);
      expect(bolt.length).toBeLessThanOrEqual(176); expect(trunk).toHaveLength(64); expect(forks.length).toBeGreaterThanOrEqual(32);
      expect(trunk[0].ay).toBe(250); expect(trunk[63].by).toBe(4);
      for (let i = 1; i < trunk.length; i++) { expect(trunk[i].ax).toBe(trunk[i - 1].bx); expect(trunk[i].ay).toBe(trunk[i - 1].by); }
      for (const s of forks) { expect(s.bright).toBeLessThanOrEqual(.5); expect(s.by).toBeGreaterThan(4); }
      // Jagged: the path is a good deal longer than the straight drop.
      expect(trunk.reduce((n, s) => n + Math.hypot(s.bx - s.ax, s.by - s.ay, s.bz - s.az), 0)).toBeGreaterThan(246 * 1.12);
    }
  });
  it('draws a bolt ahead of the camera during a strike only, and nothing when switched off', () => {
    const scene = new THREE.Scene(), lightning = createLightning(scene), camera = new THREE.PerspectiveCamera();
    camera.position.set(10, 2, -5); camera.lookAt(110, 2, -5); camera.updateMatrixWorld();
    const visible = Array.from({ length: 40 }, (_, i) => i).find(i => !lightningStrike(i).sheet)!, start = 1 + visible * LIGHTNING_PERIOD;
    expect(lightning.update(start - .5, camera, true)).toBe(0); expect(lightning.root.visible).toBe(false);
    expect(lightning.update(start + .05, camera, true)).toBeGreaterThan(.8); expect(lightning.root.visible).toBe(true);
    const bolt = lightning.root.children[0] as THREE.Mesh, p = bolt.geometry.attributes.position;
    expect(bolt.visible).toBe(true); expect(bolt.geometry.drawRange.count).toBeGreaterThan(64 * 6);
    let ahead = 0; for (let i = 0; i < bolt.geometry.drawRange.count; i++) { expect(Number.isFinite(p.getX(i) + p.getY(i) + p.getZ(i))).toBe(true); ahead += p.getX(i) - 10; }
    expect(ahead / bolt.geometry.drawRange.count).toBeGreaterThan(80);
    expect(lightning.update(start + .05, camera, false)).toBe(0); expect(lightning.root.visible).toBe(false);
    expect(lightning.update(start + 2, camera, true)).toBe(0); expect(lightning.strike).toBeNull();
    expect(new THREE.Raycaster(camera.position, new THREE.Vector3(1, .3, 0).normalize()).intersectObject(lightning.root, true)).toEqual([]);
    lightning.dispose(); expect(scene.children).toHaveLength(0);
  });
});
