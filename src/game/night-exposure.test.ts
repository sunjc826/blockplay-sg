import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { bakeNightExposure, collectNightBlockers, createExposureQuery, createNightExposure, skyVisibility } from './night-exposure';

function box(scene: THREE.Scene, x: number, y: number, z: number, w: number, h: number, d: number) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color: '#888888' }));
  mesh.position.set(x, y, z); scene.add(mesh); return mesh;
}

describe('natural night visibility', () => {
  it('distinguishes open moonlight, building shadow and a roof without needing GPU shadows', () => {
    const scene = new THREE.Scene();
    box(scene, 1, 7, 0, 2, 14, 20);
    box(scene, -18, 4, 0, 12, .3, 12);
    const query = createExposureQuery(collectNightBlockers(scene)), moon = { x: Math.SQRT1_2, y: Math.SQRT1_2, z: 0 };
    expect(query.moon({ x: 8, y: 1.5, z: 0 }, moon)).toBe(1);
    expect(query.moon({ x: -8, y: 1.5, z: 0 }, moon)).toBe(0);
    expect(query.sky({ x: -8, y: 1.5, z: 0 })).toBeGreaterThan(0);
    expect(query.sky({ x: -18, y: 1.5, z: 0 })).toBe(0);
    expect(query.moon({ x: -18, y: 1.5, z: 0 }, { x: 0, y: 1, z: 0 })).toBe(0);
    expect(query.sky({ x: -18, y: 5, z: 0 })).toBeGreaterThan(.5);
    expect(skyVisibility(0)).toBeGreaterThan(.1); expect(skyVisibility(.4)).toBeLessThan(.35);
  });
  it('uses oriented boxes so rotated walls do not fill the corners of their bounding rectangles', () => {
    const scene = new THREE.Scene(), wall = box(scene, 0, 4, 0, 14, 8, 2); wall.rotation.y = Math.PI / 4;
    const query = createExposureQuery(collectNightBlockers(scene));
    expect(query.moon({ x: 4, y: 1, z: 4 }, { x: 0, y: 1, z: 0 })).toBe(1);
    expect(query.moon({ x: 0, y: 1, z: 0 }, { x: 0, y: 1, z: 0 })).toBe(0);
  });
  it('retains instanced roofs, excludes effects, and lets some light through foliage', () => {
    const scene = new THREE.Scene();
    const roof = new THREE.InstancedMesh(new THREE.BoxGeometry(10, .3, 10), new THREE.MeshStandardMaterial(), 1);
    roof.setMatrixAt(0, new THREE.Matrix4().makeTranslation(0, 4, 0)); scene.add(roof);
    const effect = box(scene, 20, 4, 0, 12, 4, 12); effect.userData.fpsEffect = true;
    box(scene, 40, 4, 0, 12, 4, 12).visible = false;
    const canopy = box(scene, -20, 5, 0, 10, 4, 10); (canopy.material as THREE.MeshStandardMaterial).color.set('#17602a');
    const blockers = collectNightBlockers(scene); expect(blockers).toHaveLength(2);
    const query = createExposureQuery(blockers), up = { x: 0, y: 1, z: 0 };
    expect(query.moon({ x: 0, y: 1, z: 0 }, up)).toBe(0);
    expect(query.moon({ x: 20, y: 1, z: 0 }, up)).toBe(1);
    expect(query.moon({ x: -20, y: 1, z: 0 }, up)).toBeCloseTo(.35);
  });
  it('lights an exposed sloping deck without letting moonlight through its underside', () => {
    const scene = new THREE.Scene(), geometry = new THREE.BufferGeometry();
    const top = [[0,0,-2],[10,5,-2],[10,5,2],[0,0,2]];
    geometry.setAttribute('position',new THREE.Float32BufferAttribute([...top,...top.map(([x,y,z])=>[x,y-.22,z])].flat(),3));
    geometry.setIndex([0,2,1,0,3,2,4,5,6,4,6,7,0,1,5,0,5,4,1,2,6,1,6,5,2,3,7,2,7,6,3,0,4,3,4,7]);
    scene.add(new THREE.Mesh(geometry,new THREE.MeshStandardMaterial()));
    const query=createExposureQuery(collectNightBlockers(scene)),up={x:0,y:1,z:0};
    expect(query.moon({x:1,y:.8,z:0},up)).toBe(1);
    expect(query.moon({x:8,y:4.3,z:0},up)).toBe(1);
    expect(query.moon({x:8,y:2,z:0},up)).toBe(0);
  });
  it('bakes height-aware shelter, and updates moon direction independently of sky exposure', () => {
    const scene = new THREE.Scene(); box(scene, 0, 4, 0, 20, .3, 20);
    const blockers = collectNightBlockers(scene), bounds = new THREE.Box3(new THREE.Vector3(-48, 0, -48), new THREE.Vector3(48, 40, 48));
    const field = bakeNightExposure(blockers, bounds, { x: 0, y: 1, z: 0 });
    expect(field.sample({ x: 0, y: 1.5, z: 0 }).sky).toBe(0);
    expect(field.sample({ x: 0, y: 1.5, z: 0 }).moon).toBe(0);
    expect(field.sample({ x: 0, y: 11.5, z: 0 }).sky).toBe(1);
    const sky = field.data.filter((_, i) => i % 4 === 0); field.updateMoon({ x: .98, y: .2, z: 0 });
    expect(field.data.filter((_, i) => i % 4 === 0)).toEqual(sky);
    const old = new Uint8Array(field.data), next = field.prepareMoon({ x: 0, y: 1, z: 0 });
    expect(next()).toBe(false); expect(field.data).toEqual(old);
    while (!next()) { /* complete the bounded update */ }
    expect(field.sample({ x: 0, y: 1.5, z: 0 }).moon).toBe(0);
  });
  it('chains and restores existing material hooks without modifying emission', () => {
    const scene = new THREE.Scene(), mesh = box(scene, 0, 4, 0, 10, .3, 10), material = mesh.material as THREE.Material;
    const compile = material.onBeforeCompile, key = material.customProgramCacheKey;
    const exposure = createNightExposure(scene);
    expect(material.onBeforeCompile).not.toBe(compile);
    exposure.update(1, { x: 0, y: 1, z: 0 }, .1);
    expect(exposure.sample({ x: 0, y: 1.5, z: 0 }).moon).toBe(0);
    exposure.dispose(); expect(material.onBeforeCompile).toBe(compile); expect(material.customProgramCacheKey).toBe(key);
  });
});
