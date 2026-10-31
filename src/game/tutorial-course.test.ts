import { describe, expect, it } from 'vitest';
import { advanceCourse, COURSE_STEPS, COURSE_LAYOUT as L, startCourse, tutorialCheckpoint, type CourseProgress } from './tutorial-course';
import type { FpsHud } from './fps-engine';
const sample = (values: Partial<FpsHud> = {}): FpsHud => ({ phase: 'playing', x: L.laneX, z: L.spawnZ, yaw: 0, pitch: -.03, prone: false, aiming: false, landed: 0, weapon: 0, reloading: 0, reloadSaved: 0, magazine: 30, mapExpanded: false, tutorial: { feet: 0, grounded: true, stance: 'stand', sprinting: false }, ...values } as FpsHud);
const at = (id: string) => ({ ...startCourse(), step: COURSE_STEPS.findIndex(s => s.id === id) });
describe('recruit course progression', () => {
  it('requires real look movement and never advances while paused', () => {
    expect(advanceCourse(startCourse(), sample()).step).toBe(0);
    expect(advanceCourse(startCourse(), sample({ yaw: .4, phase: 'paused' })).step).toBe(0);
    expect(advanceCourse(startCourse(), sample({ yaw: .4 })).step).toBe(1);
  });
  it('requires 35 m of real sprint travel on the 50 m track', () => {
    expect(advanceCourse(at('walk'), sample({ z: L.sprintZ })).step).toBe(1);
    expect(advanceCourse(at('walk'), sample({ z: L.walkZ })).step).toBe(2);
    const sprint = { feet: 0, grounded: true, stance: 'stand' as const, sprinting: true };
    expect(advanceCourse(at('sprint'), sample({ z: L.sprintZ, tutorial: sprint })).step).toBe(2);
    let progress: CourseProgress = { ...at('sprint'), lastZ: L.walkZ };
    for (let z = L.walkZ - 1; z >= L.sprintZ; z--) progress = advanceCourse(progress, sample({ z, tutorial: sprint }));
    expect(progress.step).toBe(3);
    expect(progress.sprintMetres).toBeGreaterThanOrEqual(35);
    let walked: CourseProgress = { ...at('sprint'), lastZ: L.walkZ };
    for (let z = L.walkZ - 1; z > L.sprintZ; z--) walked = advanceCourse(walked, sample({ z }));
    expect(advanceCourse(walked, sample({ z: L.sprintZ, tutorial: sprint })).step).toBe(2);
    expect(advanceCourse({ ...at('sprint'), lastZ: 40 }, sample({ x: L.laneX + 8, z: 39, tutorial: sprint })).sprintMetres).toBe(0);
    expect(advanceCourse({ ...at('sprint'), lastZ: L.walkZ }, sample({ z: L.sprintZ, tutorial: sprint })).sprintMetres).toBe(0);
  });
  it('requires a jump at the hurdle and landing beyond it', () => {
    expect(advanceCourse(at('jump'), sample({ z: L.jumpZ })).step).toBe(3);
    const jump = { feet: .6, grounded: false, stance: 'stand' as const, sprinting: false };
    expect(advanceCourse(at('jump'), sample({ x: L.laneX + 8, z: L.hurdleZ, tutorial: jump })).jumped).toBe(false);
    const jumped = advanceCourse(at('jump'), sample({ z: L.hurdleZ + 1, tutorial: jump }));
    expect(jumped.jumped).toBe(true);
    expect(advanceCourse(jumped, sample({ z: L.jumpZ })).step).toBe(4);
  });
  it('requires crouching in the passage, rather than elsewhere', () => {
    const crouch = { feet: 0, grounded: true, stance: 'crouch' as const, sprinting: false };
    const outside = advanceCourse(at('crouch'), sample({ z: 15, tutorial: crouch }));
    expect(outside.crouched).toBe(false);
    const inside = advanceCourse(outside, sample({ z: (L.crouch.entryZ + L.crouch.exitZ) / 2, tutorial: crouch }));
    expect(advanceCourse(inside, sample({ z: L.crouchZ, tutorial: crouch })).step).toBe(5);
  });
  it('requires entering and exiting the low crawl prone, not lying down at its finish', () => {
    const low = (z: number, x: number = L.laneX) => sample({ x, z, prone: true, tutorial: { feet: 0, grounded: true, stance: 'prone', sprinting: false } });
    expect(advanceCourse(at('prone'), low(L.proneZ)).step).toBe(5);
    const entered = advanceCourse(at('prone'), low(L.crawl.entryZ - .5));
    expect(entered.crawlEntered).toBe(true);
    expect(advanceCourse(entered, low(L.proneZ, L.laneX + 8)).crawled).toBe(false);
    const stood = advanceCourse(entered, sample({ z: L.crawl.entryZ - 1 }));
    expect(stood.crawlEntered).toBe(false);
    expect(advanceCourse(stood, low(L.proneZ)).step).toBe(5);
    const exited = advanceCourse(entered, low(L.crawl.exitZ - .6));
    expect(exited.crawled).toBe(true);
    // Standing after clearing the mesh is encouraged, not a reason to repeat it.
    expect(advanceCourse(exited, sample({ z: L.proneZ })).step).toBe(6);
    const resumed = advanceCourse(entered, { ...low(L.crawl.exitZ + 1), prone: false });
    expect(resumed.crawlEntered).toBe(true);
    expect(advanceCourse(resumed, sample({ z: L.proneZ })).step).toBe(6);
  });
  it('places skipped obstacles behind the next lesson approach', () => {
    expect(tutorialCheckpoint(5)).toEqual({ x: L.laneX, z: L.crouchZ });
    expect(tutorialCheckpoint(6)).toEqual({ x: L.laneX, z: L.proneZ });
    expect(tutorialCheckpoint(8)).toEqual({ x: L.rangeX, z: L.firingZ });
  });
  it('does not accept missed shots or an interrupted reload', () => {
    expect(advanceCourse(at('fire'), sample({ shots: 5, landed: 0 })).step).toBe(7);
    expect(advanceCourse(at('fire'), sample({ shots: 5, landed: 1 })).step).toBe(8);
    const loading = advanceCourse(at('reload'), sample({ reloading: .8 }));
    expect(advanceCourse(loading, sample({ reloadSaved: .4 })).step).toBe(8);
    expect(advanceCourse(loading, sample({ weapon: 2 })).step).toBe(8);
    expect(advanceCourse(loading, sample({ magazine: 31 })).step).toBe(9);
  });
  it('requires a different carried weapon and opening then closing the map', () => {
    expect(advanceCourse(at('switch'), sample({ weapon: 0 })).step).toBe(9);
    expect(advanceCourse(at('switch'), sample({ weapon: 2 })).step).toBe(10);
    expect(advanceCourse(at('map'), sample()).step).toBe(10);
    const opened = advanceCourse(at('map'), sample({ mapExpanded: true }));
    expect(opened.step).toBe(10);
    expect(advanceCourse(opened, sample()).step).toBe(11);
  });
});
