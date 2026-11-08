import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createRainEffects, createRainSurface } from './rain-effects';

describe('rain impact surfaces', () => {
  it('uses elevated terrain and the highest exposed roof, respecting convex footprints', () => {
    const surface = createRainSurface([
      { minX: -2, maxX: 2, minZ: -2, maxZ: 2, minY: 6, maxY: 7 },
      { minX: 0, maxX: 4, minZ: 0, maxZ: 4, maxY: 12, footprint: [{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 0, z: 4 }] },
    ], () => 3);
    expect(surface(-1, -1)).toBe(7); expect(surface(1, 1)).toBe(12);
    expect(surface(3, 3)).toBe(3); expect(surface(20, 20)).toBe(3);
  });
});

describe('bounded rain and splashes', () => {
  it('lands on raised ground, expands rings above it, and never crosses the floor', () => {
    const scene = new THREE.Scene(), effects = createRainEffects(scene, () => 4), eye = new THREE.Vector3(0, 5.75, 0);
    for (let i = 0; i < 120; i++) effects.update(1 / 60, eye, 1, 3, false);
    expect(effects.counts.drops).toBe(1200); expect(effects.counts.splashes).toBeGreaterThan(10);
    const streaks = effects.streaks.geometry.attributes.position;
    for (let i = 0; i < effects.streaks.geometry.drawRange.count; i++) expect(streaks.getY(i)).toBeGreaterThanOrEqual(4);
    const spray = effects.splashes.geometry.attributes.position;
    let height = 0;
    for (let i = 0; i < effects.splashes.geometry.drawRange.count; i++) { expect(spray.getY(i)).toBeGreaterThan(4); height = Math.max(height, spray.getY(i)); }
    expect(height).toBeGreaterThan(4.1);
    expect(new THREE.Raycaster(eye, new THREE.Vector3(0, -1, 0)).intersectObject(effects.root, true)).toEqual([]);
    effects.dispose(); expect(scene.children).toHaveLength(0);
  });
  it('keeps world positions when the camera moves, reduces the pool, and clears after rain stops', () => {
    const scene = new THREE.Scene(), effects = createRainEffects(scene, () => 0), eye = new THREE.Vector3(0, 1.75, 0);
    effects.update(0, eye, 1, 0, false);
    const before = Array.from(effects.streaks.geometry.attributes.position.array);
    eye.x += .5; effects.update(0, eye, 1, 0, false);
    expect(Array.from(effects.streaks.geometry.attributes.position.array)).toEqual(before);
    effects.update(.016, eye, 1, 0, true); expect(effects.counts.drops).toBeLessThanOrEqual(225);
    for (let i = 0; i < 40; i++) effects.update(.016, eye, 0, 0, false);
    expect(effects.counts).toEqual({ drops: 0, splashes: 0 }); expect(effects.splashes.visible).toBe(false);
    effects.dispose();
  });
  it('clips roof columns even while the camera is sheltered', () => {
    const surface = createRainSurface([{ minX: -3, maxX: 3, minZ: -3, maxZ: 3, maxY: 5 }]);
    const effects = createRainEffects(new THREE.Scene(), surface), eye = new THREE.Vector3(0, 2, 0);
    for (let n = 0; n < 60; n++) effects.update(.016, eye, 1, 2, false);
    const p = effects.streaks.geometry.attributes.position;
    for (let i = 0; i < effects.streaks.geometry.drawRange.count; i += 2) {
      const floor = surface(p.getX(i), p.getZ(i));
      if (p.getY(i) !== p.getY(i + 1)) expect(p.getY(i + 1)).toBeGreaterThan(floor);
    }
    expect(effects.streaks.visible).toBe(true); effects.dispose();
  });
});


it('keeps ground impacts in view from a raised vehicle chase camera', () => {
  const effects = createRainEffects(new THREE.Scene(), () => 0), eye = new THREE.Vector3(0, 7, 0);
  for (let n = 0; n < 180; n++) effects.update(1 / 60, eye, 1, 2, false);
  expect(effects.counts.splashes).toBeGreaterThan(20); effects.dispose();
});

for (const [quality, radius, drops] of [['high',80,6000],['ultra',130,12000]] as const) it(`${quality}: distant showers preserve nearby rain, clip roofs and switch back to low`, () => {
  const effects=createRainEffects(new THREE.Scene(),()=>4), eye=new THREE.Vector3(0,5.75,0);
  effects.update(0,eye,.4,0,false,quality);
  expect(effects.radius).toBe(radius);expect(effects.counts.drops).toBe(drops*.4);
  const p=effects.streaks.geometry.attributes.position;
  let near=0,far=0;
  for(let i=0;i<effects.streaks.geometry.drawRange.count;i+=2){
    const distance=Math.hypot(p.getX(i),p.getZ(i));
    if(distance<24)near++;if(distance>radius*.5&&distance<radius)far++;
    expect(p.getY(i+1)).toBeGreaterThanOrEqual(4);
  }
  expect(near).toBeGreaterThan(400);expect(far).toBeGreaterThan(200);
  effects.update(.016,eye,1,0,true,quality);expect(effects.radius).toBe(24);expect(effects.counts.drops).toBe(216);
  effects.update(.016,eye,1,0,false,'low');expect(effects.counts.drops).toBe(1200);
  effects.dispose();
});
