import { expect, it } from 'vitest';
import { EMPTY_RELOAD, RELOAD_POINTS, reloadCommit, reloadShare } from './fps-rules';
import { handleSide, reloadMotion, reloadStage } from './fps-weapon-motion';

it('removes and reseats the magazine, restoring the complete resting pose', () => {
  expect(reloadMotion(.34).magazineDrop).toBeCloseTo(.30);
  expect(reloadMotion(.43).magazineVisible).toBe(false);
  expect(reloadMotion(.60).magazineVisible).toBe(true);
  expect(reloadMotion(.74).magazineDrop).toBeLessThanOrEqual(0);
  for (const empty of [false, true]) {
    expect(reloadMotion(1, empty)).toEqual(reloadMotion(0, empty));
    for (let p = 0; p <= 1; p += .01) expect(Object.values(reloadMotion(p, empty)).every(v => typeof v === 'boolean' || Number.isFinite(v))).toBe(true);
  }
});
it('changes the magazine on the same clock from empty', () => {
  for (const t of [.2, .34, .43, .6, .7]) expect(reloadMotion(reloadShare(t, true), true).magazineDrop).toBeCloseTo(reloadMotion(t).magazineDrop);
});
it('never touches the handle on a tactical reload', () => {
  for (let p = 0; p <= 1; p += .01) expect(reloadMotion(p).action + reloadMotion(p).handToHandle).toBe(0);
});
it('racks the handle back, holds it, then lets it fly home as the round chambers', () => {
  const at = (t: number) => reloadMotion(reloadShare(t, true), true);
  expect(at(RELOAD_POINTS.seat).action).toBe(0);
  expect(at(.95).handToHandle).toBeCloseTo(1);
  expect(at(1.06).action).toBe(1); expect(at(1.12).action).toBe(1);
  expect(at(EMPTY_RELOAD.chamber).action).toBeLessThan(.6);
  expect(at(1.2).action).toBe(0);
  // A right-side handle rolls the other way from the magazine change to show it;
  // a top lever keeps the cant and turns the muzzle in instead.
  expect(Math.sign(at(1.1).roll)).toBe(-Math.sign(at(.4).roll));
  const top = reloadMotion(reloadShare(1.1, true), true, 'top');
  expect(Math.sign(top.roll)).toBe(Math.sign(at(.4).roll)); expect(top.yaw).toBeGreaterThan(.3);
  expect(handleSide('sar21-inspired')).toBe('top'); expect(handleSide('mag-inspired')).toBe('right');
  // Held low while cocking, below the magazine change.
  expect(at(1.1).y).toBeLessThan(at(.6).y - .05); expect(top.y).toBeLessThan(at(.6).y - .05);
  // The release throws the gun forward, away from the camera, before it settles.
  expect(at(1.2).z).toBeLessThan(at(1.12).z - .06);
});
it('stages an empty reload through the charging handle', () => {
  expect(reloadStage(.65)).toBe('MAG OUT');
  expect(reloadStage(.4)).toBe('MAG IN');
  expect(reloadStage(.15, false)).toBe('SEAT MAG');
  const stage = (t: number) => reloadStage(1 - reloadShare(t, true), true);
  expect(stage(.8)).toBe('SEAT MAG');
  expect(stage(1)).toBe('BOLT BACK');
  expect(stage(EMPTY_RELOAD.chamber)).toBe('CHAMBER');
  expect(stage(1.3)).toBe('READY');
  expect(reloadCommit(true)).toBeCloseTo(reloadShare(EMPTY_RELOAD.chamber, true));
  expect(reloadStage(0)).toBe('');
});
