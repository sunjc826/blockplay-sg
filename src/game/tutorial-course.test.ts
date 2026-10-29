import { describe, expect, it } from 'vitest';
import { advanceCourse, COURSE_STEPS, startCourse } from './tutorial-course';
import { initialFpsHud, type FpsHud } from './fps-engine';
const sample = (values: Partial<FpsHud> = {}): FpsHud => ({ ...initialFpsHud, phase: 'playing', x: 0, z: 28, tutorial: { feet: 0, grounded: true, stance: 'stand', sprinting: false }, ...values });
const at = (id: string) => ({ ...startCourse(), step: COURSE_STEPS.findIndex(s => s.id === id) });
describe('recruit course progression', () => {
  it('requires real look movement and never advances while paused', () => {
    expect(advanceCourse(startCourse(), sample()).step).toBe(0);
    expect(advanceCourse(startCourse(), sample({ yaw: .4, phase: 'paused' })).step).toBe(0);
    expect(advanceCourse(startCourse(), sample({ yaw: .4 })).step).toBe(1);
  });
  it('requires the current gate and actual sprinting', () => {
    expect(advanceCourse(at('walk'), sample({ x: 0, z: 12 })).step).toBe(1);
    expect(advanceCourse(at('walk'), sample({ x: 0, z: 22 })).step).toBe(2);
    expect(advanceCourse(at('sprint'), sample({ x: 0, z: 12 })).step).toBe(2);
    expect(advanceCourse(at('sprint'), sample({ x: 0, z: 12, tutorial: { feet: 0, grounded: true, stance: 'stand', sprinting: true } })).step).toBe(3);
  });
  it('requires a jump at the hurdle and landing beyond it', () => {
    expect(advanceCourse(at('jump'), sample({ x: 0, z: 3 })).step).toBe(3);
    const jumped = advanceCourse(at('jump'), sample({ x: 0, z: 7.8, tutorial: { feet: .6, grounded: false, stance: 'stand', sprinting: false } }));
    expect(jumped.jumped).toBe(true);
    expect(advanceCourse(jumped, sample({ x: 0, z: 3 })).step).toBe(4);
  });
  it('requires crouching in the tunnel, rather than elsewhere', () => {
    const crouch = { feet: 0, grounded: true, stance: 'crouch' as const, sprinting: false };
    const outside = advanceCourse(at('crouch'), sample({ z: 15, tutorial: crouch }));
    expect(outside.crouched).toBe(false);
    const inside = advanceCourse(outside, sample({ z: -1, tutorial: crouch }));
    expect(advanceCourse(inside, sample({ z: -5, tutorial: crouch })).step).toBe(5);
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
