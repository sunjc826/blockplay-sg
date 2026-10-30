import { expect, it } from 'vitest';
import { createDeploymentIntro, DEPLOYMENT_DESCENT, DEPLOYMENT_READY } from './deployment-intro';
import { readyMotion, reloadMotion } from './fps-weapon-motion';

it('descends from the sky into the original eye and aim before readying the weapon', () => {
  const intro = createDeploymentIntro(); intro.begin(false);
  expect(intro.frame(1.75, -.1)).toMatchObject({ height: 151.75, pitch: -Math.PI / 2, stage: 'descent' });
  let last = Infinity;
  for (let i = 0; i < 300; i++) {
    const frame = intro.frame(1.75, -.1);
    expect(frame.height).toBeLessThanOrEqual(last); last = frame.height;
    intro.advance(.01);
  }
  expect(intro.frame(1.75, -.1).height).toBeCloseTo(1.75);
  intro.advance(.001);
  expect(intro.frame(1.75, -.1)).toMatchObject({ stage: 'ready', pitch: -.1, fov: 65 });
  expect(intro.active).toBe(true);
  intro.advance(DEPLOYMENT_READY);
  expect(intro.active).toBe(false);
  intro.begin(false); expect(intro.active).toBe(false);
});

it('supports skip, reset and a reduced-motion version without aerial travel', () => {
  const intro = createDeploymentIntro(); intro.advance(10); expect(intro.begun).toBe(false);
  intro.begin(true);
  expect(intro.frame(1.75, .2)).toMatchObject({ stage: 'ready', height: 1.75, pitch: .2, ready: 0 });
  intro.advance(NaN); intro.advance(-10); expect(intro.frame(1.75, 0).ready).toBe(0);
  intro.advance(DEPLOYMENT_READY); expect(intro.active).toBe(false);
  intro.reset(); intro.begin(false); intro.advance(1); intro.skip(); expect(intro.active).toBe(false);
  intro.reset(); intro.begin(false); expect(intro.active).toBe(true);
});

it('cuts below a roof only while obscured, never descends through the ceiling', () => {
  const intro = createDeploymentIntro(); intro.begin(false); let cut = false;
  for (let i = 0; i < 300; i++) {
    const frame = intro.frame(1.75, 0, 18);
    expect(frame.height === 1.75 || frame.height >= 21).toBe(true);
    if (!cut && frame.height === 1.75) { expect(frame.fade).toBeGreaterThan(.99); cut = true; }
    intro.advance(.01);
  }
  expect(cut).toBe(true);
  intro.advance(DEPLOYMENT_DESCENT); expect(intro.frame(1.75, 0, 18).fade).toBe(0);
});

it('racks either handle while leaving the magazine, belt and resting pose intact', () => {
  for (const side of ['top', 'right'] as const) {
    expect(readyMotion(.48, side).action).toBe(1);
    expect(readyMotion(.75, side).action).toBe(0);
    expect(readyMotion(.48, side).handToHandle).toBe(1);
    expect(readyMotion(.48, side).roll * (side === 'top' ? -1 : 1)).toBeGreaterThan(.4);
    for (let p = 0; p <= 1; p += .01) {
      expect(readyMotion(p, side)).toMatchObject({ magazineDrop: 0, magazineVisible: true, handToMagazine: 0, beltSeated: 1 });
    }
    expect(readyMotion(1, side)).toEqual(reloadMotion(0, false, side));
  }
});
