import * as THREE from 'three';
import { expect, it } from 'vitest';
import { projectSunRays, type SunRayLight } from './sun-rays';
import { GRAPHICS_PRESETS, sanitizeGraphics } from './graphics-settings';
const daylight: SunRayLight = { direction: { x: 0, y: .15, z: -1 }, color: '#ffffff', elevation: 12, sunlight: 1, reduced: false };
function camera() { const c = new THREE.PerspectiveCamera(60, 16 / 9, .1, 500); c.updateMatrixWorld(); return c; }
it('projects a directional sun independently of camera translation and follows camera rotation', () => {
  const c = camera(), uv = new THREE.Vector2();
  expect(projectSunRays(c, daylight, uv)).toBeGreaterThan(.5);
  const first = uv.clone(); c.position.set(300, 50, -900); c.updateMatrixWorld();
  projectSunRays(c, daylight, uv); expect(uv.distanceTo(first)).toBeLessThan(1e-10);
  c.rotation.y = Math.PI; c.updateMatrixWorld(); expect(projectSunRays(c, daylight, uv)).toBe(0);
});
it('fades at the image edge and rejects night, reduced effects and unavailable sunlight', () => {
  const c = camera(), uv = new THREE.Vector2();
  for (const patch of [{ elevation: -1 }, { reduced: true }, { sunlight: 0 }, { direction: { x: 10, y: 1, z: -1 } }])
    expect(projectSunRays(c, { ...daylight, ...patch }, uv)).toBe(0);
  expect(projectSunRays(c, undefined, uv)).toBe(0);
  const edge = { ...daylight, direction: { x: 1.05, y: 0, z: -1 } };
  expect(projectSunRays(c, edge, uv)).toBeGreaterThan(0);
  expect(projectSunRays(c, edge, uv)).toBeLessThan(projectSunRays(c, daylight, uv));
  expect(projectSunRays(c, { ...daylight, sunlight: .18 }, uv)).toBeLessThan(.04);
});
it('keeps rays optional and preserves old performance presets and explicit quality overrides', () => {
  expect(GRAPHICS_PRESETS.map(p => [p.id, p.values.godRays])).toEqual([['ultra','high'],['high','low'],['balanced','off'],['low','off'],['battery','off']]);
  expect(sanitizeGraphics({ scale: .85, shadowDetail: 'low' }).godRays).toBe('off');
  expect(sanitizeGraphics({ shadowDetail: 'ultra', godRays: 'off' }).godRays).toBe('off');
  expect(sanitizeGraphics({ godRays: 'invalid' }).godRays).toBe('low');
});
