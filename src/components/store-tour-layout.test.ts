import { expect, it } from 'vitest';
import { placeStoreTour, type TourRect } from './store-tour-layout';

it.each([
  { width: 1440, height: 1000, target: { left: 700, top: 100, right: 900, bottom: 150 } },
  { width: 390, height: 844, target: { left: 20, top: 20, right: 370, bottom: 100 } },
  { width: 390, height: 844, target: { left: 20, top: 740, right: 370, bottom: 820 } },
  { width: 844, height: 390, target: { left: 30, top: 120, right: 200, bottom: 180 } },
])('keeps the coach visible and clear of the target at $width × $height', ({ width, height, target }) => {
  const panel = { width: Math.min(360, width - 24), height: 300 };
  const position = placeStoreTour(target, panel, { width, height });
  expect(position.left).toBeGreaterThanOrEqual(12);
  expect(position.top).toBeGreaterThanOrEqual(12);
  expect(position.left + panel.width).toBeLessThanOrEqual(width - 12);
  expect(position.top + panel.height).toBeLessThanOrEqual(height - 12);
  const box: TourRect = { left: position.left, right: position.left + panel.width, top: position.top, bottom: position.top + panel.height };
  expect(box.left >= target.right || box.right <= target.left || box.top >= target.bottom || box.bottom <= target.top).toBe(true);
});
it('keeps an oversized coach anchored inside a very short viewport for scrolling', () => {
  const layout = placeStoreTour({ left: 5, top: 20, right: 200, bottom: 50 }, { width: 280, height: 340 }, { width: 320, height: 240 });
  expect(layout.top).toBeGreaterThanOrEqual(12);
  expect(layout.top + layout.maxHeight).toBeLessThanOrEqual(228);
  expect(layout.left).toBeGreaterThanOrEqual(12);
});

it('shortens the coach to keep a centered mobile target usable after manual scrolling', () => {
  const target = { left: 20, top: 344, right: 190, bottom: 500 };
  const layout = placeStoreTour(target, { width: 360, height: 350 }, { width: 390, height: 844 });
  expect(layout.maxHeight).toBeLessThan(350);
  expect(layout.top >= target.bottom || layout.top + layout.maxHeight <= target.top).toBe(true);
});
