import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { RELOAD_STYLES, normalizeReloadStyle, reloadPhase, weaponReloadStyle } from './fps-reload-styles';
import { reloadMotion, reloadStage } from './fps-weapon-motion';
import { createWeaponHandling } from './fps-viewmodel';

for (const style of RELOAD_STYLES) describe(style, () => {
  it('has bounded, continuous motion and returns to rest', () => {
    let previous = reloadMotion(0, style), phase = 0;
    for (let n = 1; n <= 1000; n++) {
      const motion = reloadMotion(n / 1000, style), nextPhase = reloadPhase(n / 1000, style);
      expect(nextPhase).toBeGreaterThanOrEqual(phase);
      for (const key of Object.keys(motion) as (keyof typeof motion)[]) {
        if (typeof motion[key] !== 'number') continue;
        expect(Number.isFinite(motion[key])).toBe(true);
        expect(Math.abs((motion[key] as number) - (previous[key] as number))).toBeLessThan(.05);
      }
      previous = motion; phase = nextPhase;
    }
    const { pairSwap: _start, ...start } = reloadMotion(0, style);
    const { pairSwap: _end, ...end } = reloadMotion(1, style);
    expect(end).toEqual(start);
    expect(reloadStage(0, true, style)).toBe('');
    expect(reloadMotion(NaN, style)).toEqual(reloadMotion(0, style));
  });
});
it('keeps retention and the taped pair visible, with distinct choreography', () => {
  const poses = RELOAD_STYLES.map(style => JSON.stringify(reloadMotion(.4, style)));
  expect(new Set(poses).size).toBe(RELOAD_STYLES.length);
  for (let p = 0; p <= 1; p += .01) {
    expect(reloadMotion(p, 'dual-mag').magazineVisible).toBe(true);
    expect(reloadMotion(p, 'tactical').magazineVisible).toBe(true);
  }
  expect(reloadStage(.8, false, 'dual-mag')).toBe('SWAP PAIR');
  expect(reloadStage(.8, false, 'tactical')).toBe('RETAIN MAG');
});
it('falls back safely for unsupported weapons and old saved preferences', () => {
  expect(weaponReloadStyle('dual-mag', 1)).toBe('standard');
  expect(weaponReloadStyle('dual-mag', 0)).toBe('dual-mag');
  expect(normalizeReloadStyle('removed-style')).toBe('standard');
  expect(normalizeReloadStyle(null)).toBe('standard');
});
function fixture(index = 0) {
  const model = new THREE.Group();
  const magazine = new THREE.Mesh(new THREE.BoxGeometry(.04, .24, .07).translate(0, -.02, .245), new THREE.MeshBasicMaterial());
  magazine.name = `${index ? 'ultimax' : 'sar21'}-inspired__magazine`; model.add(magazine);
  const handling = createWeaponHandling(model, index);
  return { model, magazine, handling, dispose() { handling.dispose(); magazine.geometry.dispose(); magazine.material.dispose(); } };
}
it('swaps the taped pair continuously, alternates sides, and cleans up', () => {
  const f = fixture();
  const spare = f.model.getObjectByName('fps-spare-magazine')!;
  const positions = () => [f.magazine.position.x, spare.position.x].sort((a, b) => a - b);
  f.handling.update(.42549, false, 'dual-mag'); const before = positions();
  f.handling.update(.42551, false, 'dual-mag'); const after = positions();
  expect(after[0]).toBeCloseTo(before[0], 3); expect(after[1]).toBeCloseTo(before[1], 3);
  f.handling.update(1, false, 'dual-mag'); f.handling.update(null, false, 'dual-mag');
  expect(f.magazine.position.toArray()).toEqual([0, 0, 0]); expect(spare.position.x).toBeCloseTo(-.075);
  f.handling.update(.6, false, 'dual-mag'); f.handling.update(null, false, 'dual-mag');
  expect(spare.position.x).toBeCloseTo(.075);
  f.handling.update(null, false, 'standard');
  expect(f.model.getObjectByName('fps-taped-magazines')!.visible).toBe(false);
  f.dispose(); expect(f.model.children).toEqual([f.magazine]);
});
it('restores a hidden magazine and the action after an interrupted reload', () => {
  const f = fixture();
  f.handling.update(.43, true); expect(f.magazine.visible).toBe(false);
  f.handling.update(null, true); expect(f.magazine.visible).toBe(true);
  expect(f.magazine.position.toArray()).toEqual([0, 0, 0]);
  f.dispose();
  const drum = fixture(1); drum.handling.update(.4, true, 'dual-mag');
  expect(drum.model.getObjectByName('fps-taped-magazines')!.visible).toBe(false); drum.dispose();
});
