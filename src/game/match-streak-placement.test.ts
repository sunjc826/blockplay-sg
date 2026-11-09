import * as THREE from 'three';
import { expect, it } from 'vitest';
import { createStreakVisuals } from './match-streak-visuals';
import { firstVisibleHit } from './fps-raycast';
import { createSceneCover } from './scene-cover';

it('keeps Guardian placement on the floor across frames instead of hitting its own preview', () => {
  const scene = new THREE.Scene(), geometry = new THREE.PlaneGeometry(40, 40), material = new THREE.MeshBasicMaterial({side:THREE.DoubleSide});
  const ground = new THREE.Mesh(geometry, material); ground.rotation.x = -Math.PI / 2; scene.add(ground);
  const visuals = createStreakVisuals(scene, () => {});
  const origin = new THREE.Vector3(0, 1.75, 9), direction = new THREE.Vector3(0, -1.75, -3.2).normalize();
  // Move the crosshair onto the previous target's coverage ring.
  visuals.preview({ x: 0, y: 0, z: 0 }, 'interceptor', true);
  const ray = new THREE.Raycaster(origin, direction, .3, 8);
  try {
    for (let frame = 0; frame < 90; frame++) {
      scene.updateMatrixWorld(true);
      const hit = firstVisibleHit(ray, scene.children.filter(o => !o.userData.fpsEffect));
      expect(hit?.object, `frame ${frame}`).toBe(ground);
      expect(hit!.point.y).toBeCloseTo(0);
      visuals.preview(hit!.point, 'interceptor', true);
    }
  } finally { visuals.dispose(); geometry.dispose(); material.dispose(); }
});
it('excludes streak visuals from authoritative cover so a device cannot block its own interception ray', () => {
  const scene = new THREE.Scene(), visuals = createStreakVisuals(scene, () => {});
  visuals.update({players:{},effects:[{id:'streak-1',kind:'interceptor',owner:'one',x:0,y:.7,z:0,yaw:0,start:0,until:20,health:60,contacts:[],pulse:0,remaining:3,shots:0}]},[],null,0);
  const cover = createSceneCover(scene);
  try { expect(cover.distance({x:0,y:.7,z:0},{x:0,y:1,z:0},5)).toBe(5); }
  finally { visuals.dispose(); }
});
