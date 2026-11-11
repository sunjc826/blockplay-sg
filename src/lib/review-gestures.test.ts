import { describe, expect, it } from 'vitest';
import { gestureMapView, gestureModelView, reviewCameraDistance } from './review-gestures';
import { minimapProjection } from '../game/minimap';

const gesture = { from: { x: .35, y: .4 }, to: { x: .48, y: .47 }, scale: 1.6 };
describe('review gestures', () => {
  it('keeps the model screen-plane point under the moving pinch midpoint', () => {
    const aspect = .7, original = { yaw: .7, pitch: .22, zoom: 1.2, pan: { x: .1, y: -.2 } };
    const next = gestureModelView(original, aspect, gesture);
    const point = (view: typeof original, p: { x: number; y: number }) => { const span = 2 * reviewCameraDistance(aspect, view.zoom) * Math.tan(35 * Math.PI / 360); return { x: view.pan.x + (p.x - .5) * span * aspect, y: view.pan.y + (.5 - p.y) * span }; };
    const before = point(original, gesture.from), after = point(next as typeof original, gesture.to);
    expect(after.x).toBeCloseTo(before.x); expect(after.y).toBeCloseTo(before.y);
    expect(next.yaw).toBe(original.yaw); expect(next.pitch).toBe(original.pitch);
    const reversed = gestureModelView(next, aspect, { from: gesture.to, to: gesture.from, scale: 1 / gesture.scale });
    expect(reversed.zoom).toBeCloseTo(original.zoom); expect(reversed.pan!.x).toBeCloseTo(original.pan.x); expect(reversed.pan!.y).toBeCloseTo(original.pan.y);
  });
  it('keeps map world coordinates under the moving pinch midpoint', () => {
    const bounds = { minX: -200, maxX: 400, minZ: -100, maxZ: 300 }, width = 390, height = 500;
    const original = { zoom: 2, center: { x: 100, z: 100 } }, next = gestureMapView(bounds, width, height, original, gesture);
    const world = (view: typeof original, p: { x: number; y: number }) => { const x = 300 / view.zoom, z = 200 / view.zoom; const m = minimapProjection({ minX: view.center.x - x, maxX: view.center.x + x, minZ: view.center.z - z, maxZ: view.center.z + z }, width, height, 24); return { x: (p.x * width - m.offsetX) / m.scale, z: (p.y * height - m.offsetY) / m.scale }; };
    expect(world(next, gesture.to).x).toBeCloseTo(world(original, gesture.from).x); expect(world(next, gesture.to).z).toBeCloseTo(world(original, gesture.from).z);
    const reversed = gestureMapView(bounds, width, height, next, { from: gesture.to, to: gesture.from, scale: 1 / gesture.scale });
    expect(reversed.zoom).toBeCloseTo(original.zoom); expect(reversed.center.x).toBeCloseTo(original.center.x); expect(reversed.center.z).toBeCloseTo(original.center.z);
  });
  it('bounds extreme gestures and supports old views without pan', () => {
    const huge = { from: { x: 0, y: 0 }, to: { x: 100, y: 100 }, scale: 100 };
    expect(gestureModelView({ yaw: 0, pitch: 0, zoom: 1 }, 1, huge)).toEqual({ yaw: 0, pitch: 0, zoom: 8, pan: { x: -10, y: 10 } });
    expect(gestureModelView({ yaw: 0, pitch: 0, zoom: 1 }, 1, { ...huge, scale: .001 }).zoom).toBe(.4);
    const bounds = { minX: -100, maxX: 100, minZ: -100, maxZ: 100 };
    expect(gestureMapView(bounds, 400, 400, { zoom: 1, center: { x: 0, z: 0 } }, huge)).toEqual({ zoom: 8, center: { x: -100, z: -100 } });
  });
});
