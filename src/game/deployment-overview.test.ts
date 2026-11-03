import { expect, it } from 'vitest';
import * as THREE from 'three';
import { deploymentMarkers, overviewFrame, overviewPanDelta } from './deployment-overview';
import { WORLD_ZONES } from './world-zones';
import { getRegion } from './regions';

it('fits every district into desktop, portrait and landscape aerial views above its roofs', () => {
  for (const zone of WORLD_ZONES) for (const [w, h] of [[1280, 800], [390, 844], [844, 390]]) {
    const bounds = getRegion(zone.id).bounds, frame = overviewFrame(bounds, w, h, 180);
    const camera = new THREE.PerspectiveCamera(frame.fov, w / h, .08, frame.far);
    camera.position.set(frame.x, frame.y, frame.z); camera.rotation.set(frame.pitch, frame.yaw, 0, 'YXZ'); camera.updateMatrixWorld(true);
    const points = [{x:bounds.minX,z:bounds.minZ},{x:bounds.maxX,z:bounds.maxZ}].map((p, i) => ({...p,id:String(i),name:String(i),yaw:0,pitch:0}));
    expect(frame.y).toBeGreaterThanOrEqual(240);
    for (const point of deploymentMarkers(points, camera)) {
      expect(point.visible, `${zone.id}/${w}/${point.id}`).toBe(true);
      if (h < 500) expect(point.x * w / 100).toBeLessThan(w - 300);
      expect(point.y * h / 100).toBeGreaterThan(h < 500 ? 100 : 140);
      expect(point.y * h / 100).toBeLessThan(h - (w < 600 ? 195 : h < 500 ? 25 : 160));
    }
  }
});

it('keeps the landing marker anchored to the actual world coordinate when zooming and panning', () => {
  const bounds = {minX:-200,maxX:200,minZ:-150,maxZ:150}, point = {id:'p',name:'Park',x:20,z:-15,yaw:0,pitch:0};
  for (const zoom of [1, 2, 4]) {
    const frame = overviewFrame(bounds, 1280, 800, 100, zoom, {x:40,z:-20});
    const camera = new THREE.PerspectiveCamera(frame.fov, 1280 / 800, .08, frame.far);
    camera.position.set(frame.x, frame.y, frame.z); camera.rotation.set(frame.pitch, frame.yaw, 0, 'YXZ'); camera.updateMatrixWorld(true);
    const marker = deploymentMarkers([point], camera)[0], ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(marker.x / 50 - 1, 1 - marker.y / 50), camera);
    const hit = ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -.4), new THREE.Vector3())!;
    expect(hit.x).toBeCloseTo(point.x, 6); expect(hit.z).toBeCloseTo(point.z, 6);
  }
});

it('reserves UI space throughout the cursor orbit without changing the lens or distance', () => {
  for (const zone of WORLD_ZONES) for (const [w, h] of [[1280, 800], [390, 844], [844, 390]]) {
    const bounds = getRegion(zone.id).bounds;
    const neutral = overviewFrame(bounds, w, h, 180);
    for (const x of [-1, -.5, 0, .5, 1]) for (const y of [-1, 0, 1]) {
      const frame = overviewFrame(bounds, w, h, 180, 1, { x: 0, z: 0 }, { x, y });
      const camera = new THREE.PerspectiveCamera(frame.fov, w / h, .08, frame.far);
      camera.position.set(frame.x, frame.y, frame.z); camera.rotation.set(frame.pitch, frame.yaw, 0, 'YXZ'); camera.updateMatrixWorld(true);
      expect(frame.fov).toBe(38); expect(frame.metresPerPixel).toBe(neutral.metresPerPixel);
      for (const px of [bounds.minX, bounds.maxX]) for (const pz of [bounds.minZ, bounds.maxZ]) for (const py of [0, 180]) {
        const p = new THREE.Vector3(px, py, pz).project(camera), sx = (p.x + 1) * w / 2, sy = (1 - p.y) * h / 2;
        expect(sx).toBeGreaterThan(40); expect(sx).toBeLessThan(w - (h < 500 ? 340 : 40));
        expect(sy).toBeGreaterThan(h < 500 ? 100 : 145);
        expect(sy).toBeLessThan(h - (w < 600 ? 200 : h < 500 ? 30 : 165));
      }
    }
  }
});

it('keeps a grabbed ground point under the pointer while panning a tilted and zoomed camera', () => {
  for (const zoom of [1, 2, 4]) {
    const frame = overviewFrame({ minX: -200, maxX: 200, minZ: -150, maxZ: 150 }, 1280, 800, 100, zoom, {x: 0, z: 0}, {x: .8, y: -.7});
    const camera = new THREE.PerspectiveCamera(frame.fov, 1280 / 800, .08, frame.far);
    camera.position.set(frame.x, frame.y, frame.z); camera.rotation.set(frame.pitch, frame.yaw, 0, 'YXZ'); camera.updateMatrixWorld(true);
    const from = { x: 420, y: 350 }, to = { x: 510, y: 390 }, ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(from.x / 640 - 1, 1 - from.y / 400), camera);
    const grabbed = ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), new THREE.Vector3())!;
    const delta = overviewPanDelta(camera, 1280, 800, from, to);
    camera.position.x += delta.x; camera.position.z += delta.z; camera.updateMatrixWorld(true);
    const projected = grabbed.project(camera);
    expect((projected.x + 1) * 640).toBeCloseTo(to.x, 6); expect((1 - projected.y) * 400).toBeCloseTo(to.y, 6);
  }
});
