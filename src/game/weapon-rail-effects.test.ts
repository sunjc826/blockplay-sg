import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { laserShotLine, laserSpill, laserSpotPixels } from './weapon-rail-effects';

describe('a laser at night', () => {
  it('throws no light back by day and a little by night, more through an intensifier', () => {
    expect(laserSpill(0)).toBe(0);
    expect(laserSpill(.3)).toBeLessThan(laserSpill(1) * .1);
    expect(laserSpill(1)).toBeGreaterThan(0);
    expect(laserSpill(1, true)).toBeGreaterThan(laserSpill(1));
    expect(laserSpill(4)).toBe(laserSpill(1)); expect(laserSpill(-1)).toBe(0);
  });
  it('draws a spot with a hot centre, a speckled body and a clean rim', () => {
    const size = 96, pixels = laserSpotPixels(size, false);
    const at = (x: number, y: number) => { const o = (y * size + x) * 4; return { r: pixels[o], g: pixels[o + 1], a: pixels[o + 3] }; };
    // A clean point in the middle: fully lit right across it, with a hard edge.
    for (const [x, y] of [[48, 48], [45, 48], [51, 48], [48, 45], [48, 51]]) { expect(at(x, y).a).toBe(255); expect(at(x, y).g).toBe(at(48, 48).g); }
    // Opaque and hotter in the middle, red around it.
    expect(at(48, 48).a).toBe(255); expect(at(48, 48).g).toBeGreaterThan(90);
    expect(at(60, 48).r).toBe(255); expect(at(60, 48).g).toBeLessThan(90);
    // Nothing on the sprite's edge, where a square would otherwise show.
    for (let i = 0; i < size; i++) for (const [x, y] of [[i, 0], [i, size - 1], [0, i], [size - 1, i]]) expect(at(x, y).a).toBeLessThan(8);
    // Not a smooth disc: around one ring of the body the brightness goes up and down.
    const ring = Array.from({ length: 48 }, (_, k) => at(Math.round(48 + Math.cos(k / 48 * Math.PI * 2) * 11), Math.round(48 + Math.sin(k / 48 * Math.PI * 2) * 11)).a);
    expect(Math.max(...ring) - Math.min(...ring)).toBeGreaterThan(40);
    expect(laserSpotPixels(size, false)).toEqual(pixels);
  });
  it('sends a hip shot down the laser and an aimed one down the sights', () => {
    const crosshair = () => new THREE.Vector3(0, 0, -1), laser = new THREE.Vector3(.05, -.02, -1).normalize();
    expect(laserShotLine(crosshair(), laser, 0).distanceTo(laser)).toBeCloseTo(0);
    expect(laserShotLine(crosshair(), laser, 1).distanceTo(crosshair())).toBeCloseTo(0);
    const between = laserShotLine(crosshair(), laser, .5);
    expect(between.length()).toBeCloseTo(1); expect(between.x).toBeGreaterThan(0); expect(between.x).toBeLessThan(laser.x);
  });
  it('shows white through an intensifier', () => {
    const size = 32, pixels = laserSpotPixels(size, true), o = (16 * size + 16) * 4;
    expect(pixels[o]).toBe(pixels[o + 1]); expect(pixels[o]).toBe(pixels[o + 2]);
  });
});
