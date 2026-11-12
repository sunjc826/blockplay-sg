import { describe, expect, it } from 'vitest';
import { Euler, Vector3 } from 'three';
import { createMovementMotion } from './fps-movement';
import { FPS_WEAPONS } from './fps-rules';
import { runningWeaponMotion } from './fps-weapon-run';

const running = () => ({ ...createMovementMotion(), sprint: 1, gaitWeight: 1 });
describe('weapon running carries', () => {
  it('keeps rifle muzzles and receiver tops turned inward throughout the stride', () => {
    const state = running();
    for (const weapon of FPS_WEAPONS.filter(w => w.id !== 'p30-inspired')) {
      for (let phase = 0; phase <= 64; phase++) {
        state.gait = phase / 64 * Math.PI * 2;
        const pose = runningWeaponMotion(state, weapon);
        const rotation = new Euler(pose.pitch, pose.yaw, pose.roll);
        expect(new Vector3(0, 0, -1).applyEuler(rotation).x, weapon.id).toBeLessThan(0);
        expect(new Vector3(0, 1, 0).applyEuler(rotation).x, weapon.id).toBeLessThan(0);
        expect(pose.x, weapon.id).toBeLessThan(0);
      }
    }
  });
  it('gives every physical platform a distinct carry, with a steadier heavy cradle', () => {
    const state = running(), physical = FPS_WEAPONS.filter(w => !w.id.endsWith('-launcher'));
    const poses = physical.map(w => JSON.stringify(runningWeaponMotion(state, w, 0, true)));
    expect(new Set(poses).size).toBe(physical.length);
    const excursion = (id: string) => {
      const weapon = FPS_WEAPONS.find(w => w.id === id)!;
      state.gait = Math.PI / 2; const left = runningWeaponMotion(state, weapon);
      state.gait = Math.PI * 1.5; const right = runningWeaponMotion(state, weapon);
      return Math.abs(left.x - right.x);
    };
    expect(excursion('cis50-inspired')).toBeLessThan(excursion('mag-inspired'));
    expect(excursion('mag-inspired')).toBeLessThan(excursion('p30-inspired'));
  });
  it('keeps integral launcher modes in the same pose and rhythm as their rifle', () => {
    const state = running();
    for (const mode of FPS_WEAPONS.filter(w => w.id.endsWith('-launcher'))) {
      const parent = FPS_WEAPONS.find(w => w.id === mode.id.replace(/-launcher$/, ''))!;
      for (const gait of [0, .5, Math.PI, 5]) {
        state.gait = gait;
        expect(runningWeaponMotion(state, mode)).toEqual(runningWeaponMotion(state, parent));
      }
    }
  });
  it('settles at rest/ADS, preserves reduced-motion poses, and loops without a jump', () => {
    for (const weapon of FPS_WEAPONS) {
      const state = running(), start = runningWeaponMotion(state, weapon);
      state.gait = Math.PI * 2;
      const end = runningWeaponMotion(state, weapon);
      for (const axis of Object.keys(start) as (keyof typeof start)[]) expect(end[axis]).toBeCloseTo(start[axis], 10);
      const reduced = runningWeaponMotion(state, weapon, 0, true);
      state.gait = 1.7;
      expect(runningWeaponMotion(state, weapon, 0, true)).toEqual(reduced);
      for (const value of Object.values(runningWeaponMotion(state, weapon, 1))) expect(value).toBeCloseTo(0);
      state.sprint = 0;
      for (const value of Object.values(runningWeaponMotion(state, weapon))) expect(value).toBeCloseTo(0);
    }
  });
});
