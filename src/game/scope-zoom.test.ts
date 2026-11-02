import { expect, it } from 'vitest';
import { FPS_WEAPONS, opticMagnification } from './fps-rules';
import { createScopeZoom, createScopeZoomWheel, scopeZoomLookScale } from './scope-zoom';

const sniper = FPS_WEAPONS.find(weapon => weapon.id === 'ff-intervention')!;
it('starts the Mythic scope at 6×, steps both ways and stops at 3×/12× without wrapping', () => {
  const zoom = createScopeZoom(), original = JSON.stringify(sniper);
  expect(zoom.read(sniper)).toEqual({ value: 6, min: 3, max: 12 });
  for (const value of [9, 12]) { expect(zoom.step(sniper, 1)).toBe(true); expect(zoom.read(sniper)?.value).toBe(value); }
  expect(zoom.step(sniper, 1)).toBe(false);
  for (const value of [9, 6, 3]) { zoom.step(sniper, -1); expect(zoom.read(sniper)?.value).toBe(value); }
  expect(zoom.step(sniper, -1)).toBe(false);
  expect(JSON.stringify(sniper)).toBe(original);
  expect(opticMagnification(sniper)).toBeCloseTo(6);
});
it('remembers the choice across weapon switches and model/spec rebuilds without changing fixed sights', () => {
  const zoom = createScopeZoom(); zoom.step(sniper, 1);
  for (const weapon of FPS_WEAPONS.filter(weapon => !weapon.zoomSteps)) {
    expect(zoom.read(weapon)).toBeNull(); expect(zoom.step(weapon, 1)).toBe(false);
  }
  expect(zoom.read({ ...sniper })?.value).toBe(9);
  for (const invalid of [0, NaN, Infinity]) expect(zoom.step(sniper, invalid)).toBe(false);
  expect(zoom.read(sniper)?.value).toBe(9);
});
it('slows high-power aiming while preserving hip and fixed-scope sensitivity', () => {
  expect(scopeZoomLookScale(sniper, 6, true)).toBeCloseTo(1);
  expect(scopeZoomLookScale(sniper, 12, true)).toBeCloseTo(.5);
  expect(scopeZoomLookScale(sniper, 3, true)).toBeCloseTo(2);
  expect(scopeZoomLookScale(sniper, 12, false)).toBe(1);
  expect(scopeZoomLookScale(FPS_WEAPONS[0], 12, true)).toBe(1);
  expect(scopeZoomLookScale(sniper, NaN, true)).toBe(1);
});
it('accepts mouse, line-mode and fine trackpad scrolling with bounded detents', () => {
  const wheel = createScopeZoomWheel();
  expect(wheel(-100, 0, 0)).toBe(1);
  expect(wheel(3, 1, 30)).toBe(-1);
  expect(wheel(-1, 2, 60)).toBe(1);
  for (let i = 0; i < 7; i++) expect(wheel(-5, 0, 100 + i * 10)).toBe(0);
  expect(wheel(-5, 0, 180)).toBe(1);
  expect(wheel(1000, 0, 200)).toBe(-1);
});
it('drops stale and reversed trackpad motion instead of carrying it into another adjustment', () => {
  const wheel = createScopeZoomWheel();
  expect(wheel(-30, 0, 0)).toBe(0);
  expect(wheel(-20, 0, 400)).toBe(0);
  expect(wheel(30, 0, 450)).toBe(0);
  expect(wheel(10, 0, 460)).toBe(-1);
  expect(wheel(NaN, 0, 470)).toBe(0);
});

it('gives Smart Power two zoom levels, independent memory and sensitivity around its 4× default', () => {
  const rifle = FPS_WEAPONS.find(weapon => weapon.id === 'ff-longwatch')!, zoom = createScopeZoom();
  expect(zoom.read(rifle)).toEqual({ value: 4, min: 2, max: 4 });
  expect(zoom.step(rifle, 1)).toBe(false);
  expect(zoom.step(rifle, -1)).toBe(true);
  expect(zoom.read(rifle)?.value).toBe(2);
  expect(zoom.step(rifle, -1)).toBe(false);
  zoom.step(sniper, 1);
  expect(zoom.read({ ...rifle })?.value).toBe(2);
  expect(zoom.read(sniper)?.value).toBe(9);
  expect(scopeZoomLookScale(rifle, 2, true)).toBeCloseTo(2);
  expect(scopeZoomLookScale(rifle, 4, true)).toBeCloseTo(1);
  expect(zoom.step(rifle, 1)).toBe(true);
  expect(zoom.read(rifle)?.value).toBe(4);
});
