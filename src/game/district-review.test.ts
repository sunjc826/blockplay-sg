import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { clampDistrictView, detachedDistrictPins, districtAnchorWorld, districtOverview, DISTRICT_REVIEW_FOV, panDistrictView, pickDistrictAnchor, placeDistrictCamera } from './district-review';
import { mergeReviews, parseReview, reviewBrief, type ReviewAnchor, type ReviewDocument, type ReviewThread } from './level-review';

const bounds = { minX: -100, maxX: 100, minZ: -80, maxZ: 80 };
function district() {
  const scene = new THREE.Scene(), material = new THREE.MeshBasicMaterial();
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400).rotateX(-Math.PI / 2), material); ground.name = 'Ground';
  const tower = new THREE.Mesh(new THREE.BoxGeometry(20, 60, 20), material); tower.position.set(30, 30, -10); tower.name = 'Tower';
  const collider = new THREE.Mesh(new THREE.BoxGeometry(40, 200, 40), material); collider.position.set(30, 100, -10); collider.visible = false;
  const sky = new THREE.Mesh(new THREE.SphereGeometry(3000), new THREE.MeshBasicMaterial({ side: THREE.BackSide }));
  const marker = new THREE.Sprite(); marker.position.set(-40, 10, 0); marker.scale.setScalar(30);
  scene.add(ground, tower, collider, sky, marker); scene.updateMatrixWorld(true);
  return scene;
}
function camera(view = districtOverview(bounds)) {
  const c = new THREE.PerspectiveCamera(DISTRICT_REVIEW_FOV, 1.5, .5, 6000); placeDistrictCamera(c, view); return c;
}
const ndc = (point: THREE.Vector3, c: THREE.Camera) => { const p = point.clone().project(c); return new THREE.Vector2(p.x, p.y); };
const thread = (anchor: ReviewAnchor, id = 'roof'): ReviewThread => ({ id, district: 'marina-bay', title: 'Roof access', kind: 'discussion', anchor, mapRevision: 'schematic-1', events: [{ id: `${id}-1`, at: '2026-11-14T00:00:00.000Z', author: 'designer', body: 'Too exposed.' }] });

describe('district review camera', () => {
  it('frames the whole district and looks at its centre from the south-east', () => {
    const view = districtOverview(bounds), c = camera(view);
    expect(view).toMatchObject({ x: 0, y: 0, z: 0 });
    expect(c.position.x).toBeGreaterThan(0); expect(c.position.z).toBeGreaterThan(0); expect(c.position.y).toBeGreaterThan(0);
    for (const [x, z] of [[-100, -80], [100, -80], [-100, 80], [100, 80]]) { const p = new THREE.Vector3(x, 0, z).project(c); expect(Math.abs(p.x)).toBeLessThan(1); expect(Math.abs(p.y)).toBeLessThan(1); }
  });
  it('keeps a saved view byte-for-byte when it is already valid', () => {
    const view = { x: 15, y: 4.5, z: -12, yaw: .55, pitch: .8, distance: 120.25 };
    expect(clampDistrictView(view, bounds)).toEqual(view);
    expect(clampDistrictView({ ...view, yaw: 7, pitch: 3, distance: .1, x: 9000 }, bounds)).toMatchObject({ pitch: 1.5, distance: 3 });
    // The looked-at point may leave the playable bounds by a quarter of the district's half-diagonal, no further.
    expect(clampDistrictView({ ...view, x: 9000 }, bounds).x).toBeCloseTo(100 + Math.hypot(200, 160) / 8, 6);
    expect(Math.abs(clampDistrictView({ ...view, yaw: 7 }, bounds).yaw)).toBeLessThanOrEqual(Math.PI);
  });
  it('slides the ground with the drag: the grabbed point stays under the pointer', () => {
    const view = { x: 0, y: 0, z: 0, yaw: .4, pitch: 1.1, distance: 150 }, before = camera(view);
    const grabbed = new THREE.Vector3(0, 0, 0), start = ndc(grabbed, before);
    const after = camera(panDistrictView(view, .1, .05)), end = ndc(grabbed, after);
    // Screen fractions of the viewport height: NDC spans 2 over the height and 2 * aspect over the same pixels across.
    expect(end.x - start.x).toBeCloseTo(.1 * 2 / 1.5, 1); expect(start.y - end.y).toBeCloseTo(.05 * 2, 1);
  });
});
describe('district review pins', () => {
  it('pins the surface that is drawn, with its world height and the view it was seen from', () => {
    const scene = district(), view = { x: 30, y: 0, z: -10, yaw: .3, pitch: .9, distance: 200 }, c = camera(view);
    const roof = pickDistrictAnchor(scene, c, ndc(new THREE.Vector3(30, 60, -10), c), view, bounds)!;
    expect(roof.x).toBeCloseTo(30, 1); expect(roof.z).toBeCloseTo(-10, 1); expect(roof.space!.y).toBeCloseTo(60, 1);
    expect(roof.level).toBe('Deck or roof · y=60 m, 60 m above ground · Tower'); expect(roof.space!.view).toEqual(view);
    const ground = pickDistrictAnchor(scene, c, ndc(new THREE.Vector3(-60, 0, 40), c), view, bounds)!;
    expect(ground.space!.y).toBeCloseTo(0, 5); expect(ground.level).toBe('Ground · y=0 m · Ground');
    expect(districtAnchorWorld(roof, bounds).y).toBeCloseTo(60, 1);
  });
  it('names walls, and follows graded ground when judging height', () => {
    const scene = district(), view = { x: 30, y: 30, z: -10, yaw: 0, pitch: .05, distance: 120 }, c = camera(view);
    const wall = pickDistrictAnchor(scene, c, ndc(new THREE.Vector3(30, 30, 0), c), view, { ...bounds, groundHeight: () => 12 })!;
    expect(wall.z).toBeCloseTo(0, 1); expect(wall.level).toBe('Wall · y=30 m, 18 m above ground · Tower');
  });
  it('ignores hidden colliders, sprites and the sky', () => {
    const scene = district(), view = { x: 30, y: 0, z: -10, yaw: 0, pitch: .05, distance: 300 }, c = camera(view);
    expect(pickDistrictAnchor(scene, c, ndc(new THREE.Vector3(30, 150, -10), c), view, bounds)).toBeNull();
    const above = { x: -40, y: 0, z: 0, yaw: 0, pitch: 1.5, distance: 100 }, top = camera(above);
    expect(pickDistrictAnchor(scene, top, ndc(new THREE.Vector3(-40, 10, 0), top), above, bounds)!.level).toContain('Ground');
  });
  it('draws schematic pins on the ground because they carry no height', () => {
    expect(districtAnchorWorld({ x: 5, z: 6, level: 'SkyPark / y=66.4' }, { ...bounds, groundHeight: (x, z) => x + z }).toArray()).toEqual([5, 11, 6]);
  });
  it('reports only the 3D pins whose surface is gone', () => {
    const scene = district(), view = districtOverview(bounds), c = camera(view), space = (y: number) => ({ y, view });
    const threads = [thread({ x: 30, z: -10, level: 'Roof', space: space(60) }, 'roof'), thread({ x: 30, z: 0, level: 'Wall', space: space(30) }, 'wall'),
      thread({ x: -60, z: 40, level: 'Removed bridge', space: space(25) }, 'bridge'), thread({ x: -60, z: 40, level: 'Schematic' }, 'flat')];
    expect(detachedDistrictPins(scene, threads, bounds, c)).toEqual(['bridge']);
  });
});
describe('3D positions in the review file', () => {
  const view = { x: 30, y: 0, z: -10, yaw: .3, pitch: .9, distance: 200 };
  const file = (anchor: unknown): ReviewDocument => ({ format: 'blockplay-level-review', version: 1, threads: [{ ...thread({ x: 30, z: -10, level: 'Roof' }), anchor: anchor as ReviewAnchor }] });
  it('round-trips, merges idempotently and reaches the AI brief', () => {
    const document = file({ x: 30, z: -10, level: 'Roof', space: { y: 60, view } }), parsed = parseReview(JSON.stringify(document));
    expect(parsed).toEqual(document); expect(mergeReviews(parsed, document)).toEqual(document);
    expect(reviewBrief(parsed, 'marina-bay')).toContain('x=30, z=-10 · y=60 (placed on the 3D scene) · view {"x":30,"y":0,"z":-10,"yaw":0.3,"pitch":0.9,"distance":200} · Roof');
  });
  it('treats the height as part of the immutable location', () => {
    const at = (y: number) => file({ x: 30, z: -10, level: 'Roof', space: { y, view } });
    expect(() => mergeReviews(at(60), at(61))).toThrow('conflicting locations');
    expect(() => mergeReviews(at(60), file({ x: 30, z: -10, level: 'Roof' }))).toThrow('conflicting locations');
  });
  it.each([
    { y: Infinity, view }, { y: 60 }, { y: 60, view: { ...view, distance: 0 } }, { y: 60, view: { ...view, pitch: 2 } }, { y: 60, view: { ...view, x: '30' } }, 'roof',
  ])('rejects a malformed position %#', space => {
    expect(() => parseReview(JSON.stringify(file({ x: 30, z: -10, level: 'Roof', space })))).toThrow('Invalid 3D district position');
  });
  it('keeps district positions out of model reviews', () => {
    const model = { format: 'blockplay-asset-review', version: 1, threads: [{ ...thread({ x: 0, z: 0, level: 'Whole model', space: { y: 1, view } }), district: undefined, asset: 'prop/vending' }] };
    expect(() => parseReview(JSON.stringify(model))).toThrow('Invalid 3D district position');
  });
});
