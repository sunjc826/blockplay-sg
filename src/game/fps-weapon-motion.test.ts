import { expect, it } from 'vitest';
import { EMPTY_RELOAD, RELOAD_POINTS, reloadCommit, reloadShare } from './fps-rules';
import { beltWeaponMotion, handleSide, inspectMotion, READY_BEATS, READY_SECONDS, readyClock, readyMotion, reloadMotion, reloadStage, smoothStep } from './fps-weapon-motion';

it('inspects both sides, holds each view, and returns exactly to ready', () => {
  const ready = { x: 0, y: 0, z: 0, pitch: 0, yaw: 0, roll: 0 };
  expect(inspectMotion(0)).toEqual(ready);
  expect(inspectMotion(1)).toEqual(ready);
  expect(inspectMotion(-1)).toEqual(ready);
  expect(inspectMotion(2)).toEqual(ready);
  expect(inspectMotion(.25)).toEqual(inspectMotion(.4));
  expect(inspectMotion(.65)).toEqual(inspectMotion(.75));
  expect(inspectMotion(.3).roll).toBeLessThan(-.5);
  expect(inspectMotion(.7).roll).toBeGreaterThan(.5);
  for (let p = 0; p <= 1; p += .001) {
    const pose = inspectMotion(p), next = inspectMotion(p + .001);
    for (const axis of Object.keys(pose) as (keyof typeof pose)[]) {
      expect(Number.isFinite(pose[axis])).toBe(true);
      expect(Math.abs(next[axis] - pose[axis])).toBeLessThan(.015);
    }
  }
});

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
  // Square to the shoulder, not turned to show its left side, with the butt dipping on the draw.
  expect(Math.abs(top.yaw)).toBeLessThan(.1); expect(Math.abs(top.roll)).toBeLessThan(.15); expect(top.pitch).toBeGreaterThan(.06);
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

it('holds belt-fed weapons steady around the tray and joins the existing empty charging stroke', () => {
  expect(beltWeaponMotion(0)).toEqual(reloadMotion(0));
  expect(beltWeaponMotion(1)).toEqual(reloadMotion(0));
  expect(beltWeaponMotion(.55).roll).toBeCloseTo(-.14);
  expect(beltWeaponMotion(reloadShare(1.08, true), true)).toEqual(reloadMotion(reloadShare(1.08, true), true));
  for (const empty of [false, true]) for (let p = .001; p <= 1; p += .001) {
    const previous = beltWeaponMotion(p - .001, empty), current = beltWeaponMotion(p, empty);
    for (const axis of ['x', 'y', 'z', 'pitch', 'yaw', 'roll'] as const)
      expect(Math.abs(current[axis] - previous[axis])).toBeLessThan(.03);
  }
});

it('takes up tension before ripping the magazine free and hitting the charging stop', () => {
  expect(reloadMotion(.20).magazineDrop).toBeLessThan(.02);
  expect(reloadMotion(.275).magazineDrop).toBeGreaterThan(.32);
  const action = (t: number) => reloadMotion(reloadShare(t, true), true).action;
  expect(action(.97)).toBeCloseTo(.08);
  expect(action(1.015)).toBeCloseTo(1);
  expect(action(1.17)).toBeLessThan(.31);
  expect(action(1.19)).toBe(0);
});

it('racks with a firm draw, a short hold, and the handle home after the release', () => {
  const { pull, stop, release, home } = READY_BEATS;
  expect(readyClock(0)).toBeCloseTo(.80);
  expect(readyClock(1)).toBeCloseTo(EMPTY_RELOAD.length);
  expect(stop - pull).toBeGreaterThanOrEqual(.15);
  expect(release - stop).toBeLessThanOrEqual(.1);
  const action = (seconds: number) => readyMotion(seconds / READY_SECONDS, 'top').action;
  expect(action(pull)).toBeCloseTo(.08);
  // Still gaining speed at the rear stop.
  expect(action(stop - .01) - action(stop - .02)).toBeGreaterThan(action(pull + .02) - action(pull + .01));
  expect(action(stop)).toBeCloseTo(1);
  expect(action(release)).toBeCloseTo(1);
  expect(action(home)).toBe(0);
  expect(readyClock(release / READY_SECONDS)).toBeCloseTo(1.16);
  let previous = readyClock(0);
  for (let step = 1; step <= 100; step++) { const next = readyClock(step / 100); expect(next).toBeGreaterThanOrEqual(previous); previous = next; }
});

it('holds the gun pose through the release, then goes straight to rest', () => {
  for (const side of ['top', 'right'] as const) {
    const { release, returns } = READY_BEATS, pose = (seconds: number) => readyMotion(seconds / READY_SECONDS, side);
    expect(pose(returns).z).toBeCloseTo(pose(release).z, 5);
    expect(pose(returns).roll).toBeCloseTo(pose(release).roll, 5);
    // No forward kick past rest on the way home.
    for (let seconds = returns; seconds <= READY_SECONDS; seconds += .01) expect(pose(seconds).z).toBeGreaterThanOrEqual(0);
  }
});

it('throws the gun up past its mark, then catches it', () => {
  // What the throw adds to the pose the gun is rising into.
  const y = (seconds: number) => readyMotion(seconds / READY_SECONDS).y
    - reloadMotion(readyClock(seconds / READY_SECONDS) / EMPTY_RELOAD.length, true).y * smoothStep(seconds / READY_BEATS.raised);
  expect(y(0)).toBeCloseTo(-.55);
  expect(y(READY_BEATS.raised * .8)).toBeGreaterThan(.01);
  expect(y(READY_BEATS.raised)).toBeCloseTo(0);
});
