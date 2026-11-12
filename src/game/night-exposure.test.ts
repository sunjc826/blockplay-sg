import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { bakeNightExposure, collectNightBlockers, createExposureQuery, createNightExposure, GROUND_RANGE, skyVisibility, sparseParts, upFacingShare } from './night-exposure';

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
  it('bakes daytime sky visibility in bounded steps, with walls and roofs reading the open air beside them', () => {
    const scene = new THREE.Scene();
    box(scene, 0, 12, 0, 16, 24, 16); // a tower
    box(scene, 40, 4, 0, 20, .4, 20); // a deck on stilts
    const blockers = collectNightBlockers(scene), bounds = new THREE.Box3(new THREE.Vector3(-64, 0, -64), new THREE.Vector3(64, 60, 64));
    const field = bakeNightExposure(blockers, bounds, { x: 0, y: 1, z: 0 }), step = field.prepareDay();
    expect(step(0)).toBe(false);
    while (!step(50)) { /* bounded steps */ }
    const day = (x: number, y: number, z: number) => field.sample({ x, y, z }).day;
    expect(day(-50, 1, -50)).toBeGreaterThan(.9);
    expect(day(40, 1.5, 0)).toBeLessThan(.4);          // under the deck
    expect(day(40, 1.5, 0)).toBeLessThan(day(-50, 1.5, -50));
    // Beside the tower's wall, and on its roof, the solid inside never pulls the value to zero.
    expect(day(8.4, 2.5, 0)).toBeGreaterThan(.25);
    expect(day(0, 24.4, 0)).toBeGreaterThan(.8);
    // The foot of a wall sees less sky than its top.
    expect(day(12, .5, 0)).toBeLessThan(day(12, 23.5, 0));
    // Moonlight updates leave the daytime channel alone.
    const before = field.data.filter((_, i) => i % 4 === 2), moon = field.prepareMoon({ x: .6, y: .8, z: 0 });
    while (!moon()) { /* complete */ }
    expect(field.data.filter((_, i) => i % 4 === 2)).toEqual(before);
  });
  it('splices a district look into lit materials only when asked', () => {
    const scene = new THREE.Scene(), mesh = box(scene, 0, 4, 0, 10, .3, 10), material = mesh.material as THREE.MeshStandardMaterial;
    const extension = { uniforms: { lookTest: { value: 1 } }, declarations: 'uniform float lookTest;', indirect: '/*indirect*/', specular: '/*specular*/', fog: '/*fog*/' };
    const shader = () => ({ uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader } as unknown as THREE.WebGLProgramParametersWithUniforms);
    const plain = createNightExposure(scene), a = shader(); material.onBeforeCompile(a, {} as THREE.WebGLRenderer); plain.dispose();
    expect(a.fragmentShader).toContain('#include <fog_fragment>'); expect(a.fragmentShader).not.toContain('/*fog*/');
    const look = createNightExposure(scene, extension), b = shader(); material.onBeforeCompile(b, {} as THREE.WebGLRenderer);
    expect(b.fragmentShader).not.toContain('#include <fog_fragment>');
    expect(b.fragmentShader.indexOf('/*fog*/')).toBeLessThan(b.fragmentShader.indexOf('#include <tonemapping_fragment>'));
    expect(b.fragmentShader).toContain('/*indirect*/'); expect(b.uniforms).toHaveProperty('lookTest');
    expect(look.dayReady).toBe(false); look.finishDay(); expect(look.dayReady).toBe(true);
    look.dispose();
  });
  it('splices surface variation after the colour and roughness steps, and skips roughness where a material has none', () => {
    const scene = new THREE.Scene(), mesh = box(scene, 0, 4, 0, 10, .3, 10);
    const extension = { uniforms: {}, declarations: '', indirect: '', specular: '', fog: '',
      vertexDeclarations: '/*vdecl*/', vertex: '/*vertex*/', albedo: '/*albedo*/', roughness: '/*roughness*/' };
    const shader = (kind: 'standard' | 'lambert') => ({ uniforms: {}, vertexShader: THREE.ShaderLib[kind].vertexShader, fragmentShader: THREE.ShaderLib[kind].fragmentShader } as unknown as THREE.WebGLProgramParametersWithUniforms);
    const exposure = createNightExposure(scene, extension), s = shader('standard');
    (mesh.material as THREE.Material).onBeforeCompile(s, {} as THREE.WebGLRenderer);
    expect(s.vertexShader.indexOf('/*vdecl*/')).toBeLessThan(s.vertexShader.indexOf('void main'));
    expect(s.vertexShader.indexOf('/*vertex*/')).toBeGreaterThan(s.vertexShader.indexOf('#include <project_vertex>'));
    expect(s.fragmentShader.indexOf('/*albedo*/')).toBeGreaterThan(s.fragmentShader.indexOf('#include <color_fragment>'));
    expect(s.fragmentShader.indexOf('/*roughness*/')).toBeGreaterThan(s.fragmentShader.indexOf('#include <roughnessmap_fragment>'));
    expect(s.fragmentShader.indexOf('/*albedo*/')).toBeLessThan(s.fragmentShader.indexOf('/*roughness*/'));
    exposure.dispose();
    const lambert = new THREE.MeshLambertMaterial(); (mesh as THREE.Mesh).material = lambert;
    const again = createNightExposure(scene, extension), l = shader('lambert');
    lambert.onBeforeCompile(l, {} as THREE.WebGLRenderer);
    expect(l.fragmentShader).toContain('/*albedo*/'); expect(l.fragmentShader).not.toContain('/*roughness*/');
    again.dispose();
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

describe('natural light on graded and merged geometry', () => {
  /** A 60 m hill draped as one up-facing sheet, 10 m high in the middle. */
  function hill(scene: THREE.Scene) {
    const geometry = new THREE.PlaneGeometry(60, 60, 12, 12).rotateX(-Math.PI / 2), position = geometry.getAttribute('position');
    for (let i = 0; i < position.count; i++) position.setY(i, 10 * Math.max(0, 1 - Math.hypot(position.getX(i), position.getZ(i)) / 30));
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: '#7a8a60' })); scene.add(mesh); return mesh;
  }
  it('leaves draped terrain out, where its enclosing box would roof every street on the hill', () => {
    const scene = new THREE.Scene(), mesh = hill(scene);
    expect(upFacingShare(mesh.geometry, mesh.matrixWorld)).toBeGreaterThan(.95);
    expect(collectNightBlockers(scene)).toHaveLength(0);
    const query = createExposureQuery(collectNightBlockers(scene));
    expect(query.daySky({ x: 15, y: 6, z: 0 })).toBe(1);
    expect(query.inside({ x: 15, y: 6, z: 0 })).toBe(false);
    // A closed solid faces up with half its area at most, and a flat slab stays a blocker as before.
    const solid = box(new THREE.Scene(), 0, 5, 0, 10, 10, 10);
    expect(upFacingShare(solid.geometry, solid.matrixWorld)).toBeLessThan(.5);
    const slab = new THREE.Scene(); box(slab, 0, 0, 0, 40, .3, 40);
    expect(collectNightBlockers(slab)).toHaveLength(1);
  });
  it('splits merged furniture scattered across an estate into its pieces, but keeps a compact building whole', () => {
    const pieces = Array.from({ length: 6 }, (_, i) => new THREE.BoxGeometry(2, 1, 2).translate((i % 3) * 40 - 40, i < 3 ? .5 : 9.5, Math.floor(i / 3) * 60 - 30));
    const scattered = mergeGeometries(pieces);
    expect(sparseParts(scattered)).toHaveLength(6);
    const scene = new THREE.Scene(); scene.add(new THREE.Mesh(scattered, new THREE.MeshStandardMaterial()));
    const blockers = collectNightBlockers(scene);
    expect(blockers).toHaveLength(6);
    // Open ground between the benches keeps its sky.
    expect(createExposureQuery(blockers).sky({ x: -20, y: 1.5, z: 0 })).toBe(1);
    // A tower with a podium is two pieces that fill their box: one blocker, as before.
    const tower = mergeGeometries([new THREE.BoxGeometry(40, 4, 40).translate(0, 2, 0), new THREE.BoxGeometry(20, 40, 20).translate(0, 24, 0)]);
    expect(sparseParts(tower)).toBeNull();
    // Small sparse hulls (a facade's frames) are left to stand for their building.
    expect(sparseParts(mergeGeometries([new THREE.BoxGeometry(1, 1, 1), new THREE.BoxGeometry(1, 1, 1).translate(20, 3, 0)]))).toBeNull();
    pieces.forEach(g => g.dispose());
  });
  it('carries the ground height under each cell in A, and only reads it where a district has graded ground', () => {
    const scene = new THREE.Scene(); box(scene, 0, 4, 0, 20, 8, 20);
    const bounds = new THREE.Box3(new THREE.Vector3(-40, -4, -40), new THREE.Vector3(40, 20, 40));
    const graded = bakeNightExposure(collectNightBlockers(scene), bounds, { x: 0, y: 1, z: 0 }, (x) => Math.max(0, x) * .25);
    expect(graded.sample({ x: 30, y: 9, z: 0 }).ground).toBeCloseTo(7.5, 0);
    expect(graded.sample({ x: -30, y: 1, z: 0 }).ground).toBe(0);
    const flat = bakeNightExposure(collectNightBlockers(scene), bounds, { x: 0, y: 1, z: 0 });
    expect(flat.sample({ x: 30, y: 1, z: 0 }).ground).toBe(0);
    // The sky and moon channels do not depend on the ground.
    expect(flat.sample({ x: 15, y: 1, z: 5 }).sky).toBeCloseTo(graded.sample({ x: 15, y: 1, z: 5 }).sky, 6);
    const without = createNightExposure(scene), withGround = createNightExposure(scene, undefined, () => 3);
    expect(without.field.data[3]).toBe(0);
    expect(withGround.field.data[3]).toBe(Math.round(3 / GROUND_RANGE * 255));
    without.dispose(); withGround.dispose();
  });
});
