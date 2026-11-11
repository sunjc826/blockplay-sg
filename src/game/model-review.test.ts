import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { getReviewAsset, REVIEW_ASSETS } from './review-assets';
import { modelAnchorWorld, modelMeshPath, modelRevision, pickModelAnchor } from './model-review';
import { emptyReview, mergeReviews, parseReview } from './level-review';
import notes from '../../docs/level-reviews/asset-notes.json';

describe('model review anchors', () => {
  it('anchors the actual ray hit in mesh-local coordinates and follows transformed models', () => {
    const root = new THREE.Group(), parent = new THREE.Group(), mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
    root.add(parent); parent.add(mesh); parent.position.set(2, 1, 0);
    const camera = new THREE.PerspectiveCamera(45, 1, .01, 100); camera.position.set(2, 1, 5); camera.lookAt(2, 1, 0);
    const view = { yaw: .7, pitch: .2, zoom: 1 }, anchor = pickModelAnchor(root, camera, new THREE.Vector2(), view)!;
    expect(anchor.surface!.meshPath).toEqual([0, 0]); expect(anchor.x).toBeCloseTo(0); expect(anchor.surface!.y).toBeCloseTo(0); expect(anchor.z).toBeCloseTo(.5);
    view.yaw = 2; expect(anchor.surface!.view.yaw).toBe(.7);
    root.rotation.y = 1; root.scale.setScalar(2); root.position.set(-3, 4, 5); root.updateMatrixWorld(true);
    expect(modelAnchorWorld(root, anchor)!.distanceTo(mesh.localToWorld(new THREE.Vector3(0, 0, .5)))).toBeLessThan(1e-9);
    expect(pickModelAnchor(root, camera, new THREE.Vector2(20, 20), view)).toBeNull();
    expect(modelMeshPath(root, new THREE.Group())).toBeNull();
    expect(modelAnchorWorld(root, { ...anchor, surface: { ...anchor.surface!, meshPath: [99] } })).toBeNull();
    mesh.geometry.dispose(); mesh.material.dispose();
  });
  it('changes geometry revisions when geometry, transforms or materials change, without using transient IDs', () => {
    const a = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ color: 'red' }));
    const b = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ color: 'red' }));
    expect(modelRevision(a)).toBe(modelRevision(b));
    b.material.color.set('blue'); expect(modelRevision(a)).not.toBe(modelRevision(b));
    b.material.color.set('red'); b.position.y = 1; expect(modelRevision(a)).not.toBe(modelRevision(b));
    a.geometry.dispose(); b.geometry.dispose(); a.material.dispose(); b.material.dispose();
  });
  it('builds every catalog subject, retains stable unique IDs, and validates published rationale', () => {
    expect(REVIEW_ASSETS.length).toBe(37); expect(new Set(REVIEW_ASSETS.map(a => a.id)).size).toBe(37);
    for (const asset of REVIEW_ASSETS) {
      const model = asset.build(); try {
        const bounds = new THREE.Box3().setFromObject(model.root);
        expect(bounds.isEmpty(), asset.id).toBe(false); expect(bounds.getSize(new THREE.Vector3()).length(), asset.id).toBeGreaterThan(0);
        expect(modelRevision(model.root), asset.id).toMatch(/^model-[a-f0-9]+$/);
      } finally { model.dispose(); }
    }
    for (const thread of parseReview(JSON.stringify(notes)).threads) {
      const asset = getReviewAsset(thread.asset!)!, model = asset.build();
      try { expect(modelRevision(model.root)).toBe(thread.mapRevision); } finally { model.dispose(); }
    }
  });
  it('round-trips model surfaces and prevents map/model collection mixing', () => {
    const doc = parseReview(JSON.stringify(notes));
    doc.threads[0].anchor = { x: .1, z: .2, level: 'Front panel', surface: { y: 1, meshPath: [0, 1], view: { yaw: .3, pitch: .1, zoom: 2 } } };
    expect(parseReview(JSON.stringify(doc))).toEqual(doc);
    expect(mergeReviews(emptyReview('asset'), doc, doc)).toEqual(doc);
    expect(() => mergeReviews(emptyReview(), doc)).toThrow('separate collections');
    for (const change of [
      () => { doc.threads[0].district = 'marina-bay'; },
      () => { delete doc.threads[0].district; doc.threads[0].anchor.surface!.meshPath = [-1]; },
      () => { doc.threads[0].anchor.surface!.meshPath = [0]; doc.threads[0].anchor.surface!.view.zoom = 0; },
    ]) { change(); expect(() => parseReview(JSON.stringify(doc))).toThrow(); }
  });
});
