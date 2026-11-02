import { expect, it } from 'vitest';
import { FPS_WEAPONS, reloadLength } from './fps-rules';
import { reloadDrive, reloadEnergy } from './fps-reload-energy';

const axes = ['x', 'y', 'z', 'pitch', 'yaw', 'roll'] as const;
const rest = { x: 0, y: 0, z: 0, pitch: 0, yaw: 0, roll: 0 };

it('settles exactly at both ends and stays continuous for every weapon and reload type', () => {
  for (const weapon of FPS_WEAPONS) for (const empty of [false, true]) {
    expect(reloadEnergy(-1, empty, weapon)).toEqual(rest);
    expect(reloadEnergy(0, empty, weapon)).toEqual(rest);
    expect(reloadEnergy(1, empty, weapon)).toEqual(rest);
    expect(reloadEnergy(2, empty, weapon)).toEqual(rest);
    let previous = rest;
    for (let step = 1; step <= 1000; step++) {
      const pose = reloadEnergy(step / 1000, empty, weapon);
      for (const axis of axes) {
        expect(Number.isFinite(pose[axis])).toBe(true);
        expect(Math.abs(pose[axis])).toBeLessThan(axis === 'x' || axis === 'y' || axis === 'z' ? .14 : .23);
        expect(Math.abs(pose[axis] - previous[axis])).toBeLessThan(.045);
      }
      previous = pose;
    }
  }
});

it('keeps magazine and cover contacts on the same clock for tactical and empty reloads', () => {
  for (const weapon of FPS_WEAPONS) for (const time of [.035, .225, .64, .654, .74, .754, .81]) {
    const empty = reloadEnergy(time / reloadLength(true), true, weapon), tactical = reloadEnergy(time, false, weapon);
    for (const axis of axes) expect(empty[axis]).toBeCloseTo(tactical[axis], 12);
  }
});

it('gives heavy guns less angular agility and more longitudinal weight', () => {
  const pistol = FPS_WEAPONS.find(w => w.id === 'p30-inspired')!;
  const heavy = FPS_WEAPONS.find(w => w.id === 'cis50-inspired')!;
  expect(Math.abs(reloadEnergy(.12, false, heavy).roll)).toBeLessThan(Math.abs(reloadEnergy(.12, false, pistol).roll) * .4);
  expect(reloadEnergy(.035, false, heavy).z).toBeGreaterThan(reloadEnergy(.035, false, pistol).z);
  const rifle = FPS_WEAPONS.find(w => w.id === 'ff-oicw')!;
  const launcher = FPS_WEAPONS.find(w => w.id === 'ff-oicw-launcher')!;
  expect(reloadEnergy(.12, false, launcher)).toEqual(reloadEnergy(.12, false, rifle));
});

it('hits the box mount before the cover latch and releases only on an empty reload', () => {
  const belt = FPS_WEAPONS.find(w => w.id === 'mag-inspired')!;
  expect(reloadEnergy(.654, false, belt).y).toBeGreaterThan(0);
  expect(reloadEnergy(.752, false, belt).y).toBeLessThan(0);
  for (const weapon of FPS_WEAPONS) {
    expect(reloadEnergy(1.185, false, weapon)).toEqual(rest);
    expect(reloadEnergy(1.185 / reloadLength(true), true, weapon).z).toBeLessThan(-.015);
  }
});

it('accelerates the final insertion without overshooting physical endpoints', () => {
  expect(reloadDrive(-1)).toBe(0); expect(reloadDrive(0)).toBe(0);
  expect(reloadDrive(1)).toBe(1); expect(reloadDrive(2)).toBe(1);
  expect(reloadDrive(.5)).toBeLessThan(.25);
  expect(reloadDrive(.9) - reloadDrive(.7)).toBeGreaterThan(reloadDrive(.3) - reloadDrive(.1));
  let previous = 0;
  for (let step = 1; step <= 1000; step++) {
    const current = reloadDrive(step / 1000);
    expect(current).toBeGreaterThanOrEqual(previous); expect(current).toBeLessThanOrEqual(1);
    previous = current;
  }
});
