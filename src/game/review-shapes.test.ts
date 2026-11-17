import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildDistrictShapes, disposeDistrictShapes, districtSurfaceHit } from './district-review';
import { mergeReviews, parseReview, reviewBrief, shapeLength, threadVerdict, type ReviewDocument, type ReviewShape } from './level-review';

const route: ReviewShape = { kind: 'route', tone: 'proposal', points: [{ x: 0, z: 0 }, { x: 30, z: 0 }, { x: 30, z: 40, y: 3 }] };
const review = (shape: unknown, events: unknown[] = []): ReviewDocument => ({ format: 'blockplay-level-review', version: 1, threads: [{ id: 'lane', district: 'marina-bay', title: 'Mid lane', kind: 'design-note', mapRevision: 'schematic-1',
  anchor: { x: 0, z: 0, level: 'Ground', shape } as never, events: [{ id: 'first', at: '2026-11-17T00:00:00.000Z', author: 'ai', body: 'Drawn.' }, ...events] as never }] });

describe('drawn review annotations', () => {
  it('keeps routes, areas and sightlines through a parse, a merge and the brief', () => {
    const parsed = parseReview(JSON.stringify(review({ ...route, colour: 'ignored' })));
    expect(parsed.threads[0].anchor.shape).toEqual(route);
    expect(mergeReviews(parsed, parsed)).toEqual(parsed);
    expect(reviewBrief(parsed, 'marina-bay')).toContain('proposal route through (0, 0) (30, 0) (30, 40, y=3)');
    expect(shapeLength(route)).toBeCloseTo(30 + Math.hypot(40, 3));
    expect(shapeLength({ kind: 'zone', tone: 'problem', points: [{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 10 }, { x: 0, z: 10 }] })).toBe(40);
  });
  it('rejects drawings that cannot be what they claim, and a moved drawing', () => {
    const bad = [{ ...route, kind: 'trail' }, { ...route, tone: 'idea' }, { ...route, points: [route.points[0]] }, { ...route, kind: 'zone', points: route.points.slice(0, 2) },
      { ...route, kind: 'sightline' }, { ...route, points: [{ x: 0, z: 0 }, { x: Infinity, z: 0 }] }, { ...route, points: Array.from({ length: 49 }, (_, x) => ({ x, z: 0 })) }];
    for (const shape of bad) expect(() => parseReview(JSON.stringify(review(shape))), JSON.stringify(shape).slice(0, 80)).toThrow('Invalid drawn route');
    const moved = review({ ...route, points: [{ x: 1, z: 0 }, ...route.points.slice(1)] });
    expect(() => mergeReviews(review(route), moved)).toThrow('conflicting locations');
    expect(() => parseReview(JSON.stringify({ ...review(route), format: 'blockplay-asset-review', threads: [{ ...review(route).threads[0], district: undefined, asset: 'prop/vending', anchor: { x: 0, z: 0, level: 'Whole model', shape: route } }] }))).toThrow('Invalid drawn route');
  });
  it('reads the designer\'s latest verdict and ignores one claimed by the AI', () => {
    const at = (n: number) => `2026-11-17T00:00:0${n}.000Z`;
    const thread = parseReview(JSON.stringify(review(route, [{ id: 'a', at: at(1), author: 'designer', body: 'Agree.', verdict: 'agree' }, { id: 'b', at: at(2), author: 'ai', body: 'Done.', verdict: 'disagree' },
      { id: 'c', at: at(3), author: 'designer', body: 'The bridge end is wrong.', verdict: 'rework' }, { id: 'd', at: at(4), author: 'designer', body: 'More detail.' }]))).threads[0];
    expect(threadVerdict(thread)).toBe('rework');
    expect(threadVerdict(parseReview(JSON.stringify(review(route))).threads[0])).toBeUndefined();
    expect(() => parseReview(JSON.stringify(review(route, [{ id: 'a', at: at(1), author: 'designer', body: 'Hm.', verdict: 'maybe' }])))).toThrow('Invalid or duplicate comment');
  });
  it('draws into the scene without becoming a surface that pins or picks can land on', () => {
    const bounds = { minX: -100, maxX: 100, minZ: -100, maxZ: 100 }, scene = new THREE.Scene();
    const group = buildDistrictShapes([{ shape: route }, { shape: { kind: 'zone', tone: 'problem', points: [{ x: -20, z: -20 }, { x: 20, z: -20 }, { x: 0, z: 20 }] }, selected: true },
      { shape: { kind: 'sightline', tone: 'existing', points: [{ x: 0, z: 0, y: 60 }, { x: 80, z: 0 }] } }], bounds);
    scene.add(group); scene.updateMatrixWorld(true);
    expect(group.children.length).toBeGreaterThan(10);
    const box = new THREE.Box3().setFromObject(group);
    expect(box.max.y).toBeGreaterThan(60); expect(box.min.y).toBeGreaterThan(-2);
    const ray = new THREE.Raycaster(new THREE.Vector3(15, 50, 0), new THREE.Vector3(0, -1, 0)); ray.camera = new THREE.PerspectiveCamera();
    expect(ray.intersectObject(scene, true).length).toBeGreaterThan(0);
    expect(districtSurfaceHit(scene, ray, bounds)).toBeNull();
    disposeDistrictShapes(group); expect(scene.children).toHaveLength(0);
  });
});
