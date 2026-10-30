import { expect, it } from 'vitest';
import * as THREE from 'three';
import { deploymentMarkers, overviewFrame } from './deployment-overview';
import { WORLD_ZONES } from './world-zones';
import { getRegion } from './regions';

it('fits every district into desktop, portrait and landscape aerial views above its roofs', () => {
  for (const zone of WORLD_ZONES) for (const [w, h] of [[1280, 800], [390, 844], [844, 390]]) {
    const bounds = getRegion(zone.id).bounds, frame = overviewFrame(bounds, w, h, 180);
    const camera = new THREE.PerspectiveCamera(65, w / h, .08, frame.far);
    camera.position.set(frame.x, frame.y, frame.z); camera.rotation.set(-Math.PI / 2, 0, 0); camera.updateMatrixWorld(true);
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
    const camera = new THREE.PerspectiveCamera(65, 1280 / 800, .08, frame.far);
    camera.position.set(frame.x, frame.y, frame.z); camera.rotation.set(-Math.PI / 2, 0, 0); camera.updateMatrixWorld(true);
    const marker = deploymentMarkers([point], camera)[0], ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(marker.x / 50 - 1, 1 - marker.y / 50), camera);
    const hit = ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -.4), new THREE.Vector3())!;
    expect(hit.x).toBeCloseTo(point.x, 6); expect(hit.z).toBeCloseTo(point.z, 6);
  }
});
