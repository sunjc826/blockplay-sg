import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createDistrictWater, createWaterMaterial, isWaterObject, markWater, MAX_WATER_RIPPLES, primaryWaterSurface, rippleWater, waterSurfaceLevel } from './water';
import { createWaterCoverageMap } from './water-shore';
import { createWaterSurfacePass } from './water-surface-pass';
import { REGIONS } from './regions';
import { buildMarinaScene, MARINA_BAY } from './marina-scene';
import { buildJurongLakeScene } from './jurong-lake-scene';
import { dayLighting } from './world-lighting';
import { createWorldAtmosphere } from './world-atmosphere';
import { setEnvironmentSettings } from './environment-settings';
import { DEFAULT_ENVIRONMENT } from './world-events';

const options = { deep: '#1d4750', shallow: '#3d7c84', sky: '#8db6d4', horizon: '#557788', sun: new THREE.Vector3(0, 1, 0) };

describe('water surfaces', () => {
  const slabs = () => {
    // Two lake spans at 0.12 with a bridge gap between them, and a smaller raised pond: one batched material.
    const material = createDistrictWater('#5d93a4', { sun: new THREE.Vector3(0, 1, 0), background: '#b9dcea' });
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material, 3), part = new THREE.Object3D();
    [[-30, -.06, 0, 40, .36, 40], [30, -.06, 0, 40, .36, 40], [0, .12, 60, 10, .2, 10]].forEach(([x, y, z, w, h, d], i) => {
      part.position.set(x, y, z); part.scale.set(w, h, d); part.updateMatrix(); mesh.setMatrixAt(i, part.matrix);
    });
    const scene = new THREE.Scene(); scene.add(mesh);
    return { scene, mesh, material, dispose() { mesh.geometry.dispose(); material.dispose(); mesh.dispose(); } };
  };
  it('reads a slab mesh\'s surface from its upward faces and picks the largest body as primary', () => {
    const s = slabs(), level = waterSurfaceLevel(s.mesh);
    expect(level.height).toBeCloseTo(.12, 6); expect(level.area).toBeCloseTo(3200, 3);
    expect(level.bounds.toArray()).toEqual([-50, -20, 50, 20]);
    expect(level.faces).toHaveLength(3 * 2 * 6);
    expect(primaryWaterSurface(s.scene)).toBe(s.mesh);
    // A puddle is not worth a reflection pass; a named surface always wins; a missing named one is not replaced.
    const puddle = new THREE.Scene(), small = new THREE.Mesh(new THREE.PlaneGeometry(10, 10).rotateX(-Math.PI / 2), s.material); puddle.add(small);
    expect(primaryWaterSurface(puddle)).toBeUndefined();
    const bay = new THREE.Mesh(small.geometry, s.material); bay.name = 'marina-bay-water'; s.scene.add(bay);
    expect(primaryWaterSurface(s.scene)).toBe(bay);
    s.scene.userData.primaryWater = 'absent'; expect(primaryWaterSurface(s.scene)).toBeUndefined();
    small.geometry.dispose(); s.dispose();
  });
  it('maps slab water\'s outline so waves settle to nothing at banks and never cross a gap', () => {
    const s = slabs(), bounds = new THREE.Vector4(-50, -20, 50, 65), map = createWaterCoverageMap(bounds, waterSurfaceLevel(s.mesh).faces);
    const data = map.image.data as Uint8Array, at = (x: number, z: number) => data[Math.floor((z - bounds.y) / 85 * 512) * 512 + Math.floor((x - bounds.x) / 100 * 512)];
    expect([at(0, 0), at(-9.9, 0), at(-10.1, 0), at(-49.9, 0), at(-30, 19.95), at(30, 40)]).toEqual([0, 0, 0, 0, 0, 0]);
    expect(at(-30, 0)).toBe(255); expect(at(0, 60)).toBeGreaterThan(0);
    expect(at(-12, 0)).toBeGreaterThan(0); expect(at(-12, 0)).toBeLessThan(at(-15, 0));
    map.dispose(); s.dispose();
  });
  it('gives solid district water Ultra detail and visibility without the refraction snapshot', () => {
    const s = slabs(), other = createDistrictWater('#86b6c6', { sun: new THREE.Vector3(0, 1, 0), background: '#b9dcea' });
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(4, 4).rotateX(-Math.PI / 2), other); pool.position.y = 20; s.scene.add(pool);
    const camera = new THREE.PerspectiveCamera(60, 1.5, .08, 400); camera.position.set(-30, 3, 30); camera.lookAt(-30, 0, 0); camera.updateMatrixWorld();
    const renderer = { render: vi.fn(), copyTextureToTexture: vi.fn() } as unknown as THREE.WebGLRenderer;
    const pass = createWaterSurfacePass(renderer, s.scene, camera), target = new THREE.WebGLRenderTarget(8, 8, { depthTexture: new THREE.DepthTexture(8, 8) });
    expect(pass.prepare(true)).toBe(false); expect(pass.visible).toBe(true);
    expect([s.material.uniforms.uUltra.value, other.uniforms.uUltra.value]).toEqual([1, 1]);
    pass.render(target); expect(renderer.render).toHaveBeenCalledTimes(1); expect(renderer.copyTextureToTexture).not.toHaveBeenCalled(); expect(pass.enabled).toBe(false);
    camera.position.y = -1; camera.updateMatrixWorld(); expect(pass.prepare(true)).toBe(false); expect(pass.visible).toBe(false);
    pass.prepare(false); expect([s.material.uniforms.uUltra.value, other.uniforms.uUltra.value]).toEqual([0, 0]);
    pass.dispose(); target.depthTexture!.dispose(); target.dispose(); pool.geometry.dispose(); other.dispose(); s.dispose();
  });
  it('puts every district\'s water on the one surface shader and runs it on the scene clock', () => {
    const flat: string[] = []; let surfaces = 0;
    for (const region of REGIONS) {
      const world = region.build(); world.animate(5);
      world.scene.traverse(object => {
        if (!(object instanceof THREE.Mesh) || !isWaterObject(object)) return;
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
          if (typeof material.userData.setLighting !== 'function' || material.uniforms?.uTime.value !== 5) flat.push(`${region.id}:${object.name}`);
          else surfaces++;
        }
      });
      world.dispose();
    }
    expect(flat).toEqual([]);
    expect(surfaces).toBeGreaterThan(20);
  }, 120_000);
  it('builds district water solid and still at the corners, with falls only where asked', () => {
    const lake = createDistrictWater('#5d93a4', { sun: new THREE.Vector3(0, 1, 0), background: '#b9dcea' });
    const fall = createDistrictWater('#86b6c6', { sun: new THREE.Vector3(0, 1, 0), background: '#b9dcea', falls: true });
    expect([lake.transparent, lake.depthWrite, lake.uniforms.uClarity.value, lake.uniforms.uSwell.value, lake.uniforms.uFalls.value]).toEqual([false, true, 1, 0, 0]);
    expect(fall.uniforms.uFalls.value).toBe(1);
    // The bay keeps its translucent, swelling surface over a modelled bed.
    const bay = createWaterMaterial(options);
    expect([bay.transparent, bay.depthWrite, bay.uniforms.uSwell.value]).toEqual([true, false, 1]);
    for (const material of [lake, fall, bay]) { expect(material.lights).toBe(true); material.dispose(); }
  });
  it('recognises water by its mesh or by its material, instanced or not', () => {
    const plain = new THREE.MeshStandardMaterial(), wet = markWater(new THREE.MeshStandardMaterial());
    const geometry = new THREE.BoxGeometry();
    expect(isWaterObject(new THREE.Mesh(geometry, plain))).toBe(false);
    expect(isWaterObject(new THREE.Mesh(geometry, wet))).toBe(true);
    expect(isWaterObject(new THREE.InstancedMesh(geometry, wet, 4))).toBe(true);
    const tagged = new THREE.Mesh(geometry, plain); tagged.userData.fpsWater = true;
    expect(isWaterObject(tagged)).toBe(true);
    expect(isWaterObject(new THREE.Group())).toBe(false);
  });
  it('drops each shot ripple into the shader at the current time, recycling the oldest', () => {
    const material = createWaterMaterial(options);
    const ripples = material.uniforms.uRipples.value as THREE.Vector4[];
    expect(ripples).toHaveLength(MAX_WATER_RIPPLES);
    material.userData.setTime(12);
    rippleWater(new THREE.Mesh(new THREE.PlaneGeometry(), material), 3, -4, 0.8);
    expect(ripples[0].toArray()).toEqual([3, -4, 12, 0.8]);
    for (let i = 0; i < MAX_WATER_RIPPLES; i++) material.userData.ripple(i, 0, 1);
    expect(ripples[0].x).toBe(MAX_WATER_RIPPLES - 1);
    material.dispose();
  });
  it('keeps rainfall separate from shot ripples and switches it off for reduced effects', () => {
    const material=createWaterMaterial(options);
    material.userData.setRain(.7,false);expect(material.uniforms.uRain.value).toBe(.7);
    expect((material.uniforms.uRipples.value as THREE.Vector4[]).every(r=>r.w===0)).toBe(true);
    material.userData.setRain(.7,true);expect(material.uniforms.uRain.value).toBe(0);
    material.userData.setRain(.7,false);material.userData.resetLighting();expect(material.uniforms.uRain.value).toBe(0);
    material.dispose();
  });
  it('ignores a ripple on water that has no shader surface', () => {
    expect(() => rippleWater(new THREE.Mesh(new THREE.BoxGeometry(), markWater(new THREE.MeshStandardMaterial())), 0, 0)).not.toThrow();
  });
  it('gates caustics by actual daylight, dims them in cloud and restores their authored strength', () => {
    const water=createWaterMaterial(options),u=water.uniforms,sky=new THREE.Color('#abcdef');
    water.userData.setLighting(dayLighting(13),sky,sky,1,1);expect(u.uCausticLight.value).toBe(1);
    water.userData.setLighting(dayLighting(13),sky,sky,.18,1);expect(u.uCausticLight.value).toBeCloseTo(.18*.18);
    water.userData.setLighting(dayLighting(22.5),sky,sky,1,1);expect(u.uCausticLight.value).toBe(0);
    water.userData.setLighting(dayLighting(13),sky,sky,1,.5);expect(u.uCausticLight.value).toBe(.5);
    water.userData.resetLighting();expect(u.uCausticLight.value).toBe(1);water.dispose();
  });
  it('feeds bounded finite impacts to Ultra while retaining the cheap fallback rings', () => {
    const material=createWaterMaterial(options), received:number[][]=[];
    material.userData.waveImpulse=(...args)=>received.push(args);
    material.userData.ripple(2,3,9); material.userData.ripple(NaN,3,1);
    expect(received).toEqual([[2,3,3]]);
    expect(material.uniforms.uRipples.value[0].toArray()).toEqual([2,3,0,3]);
    expect(material.uniforms.uRipples.value[1].w).toBe(0);
    material.dispose();
  });
  it('follows the night sky, dims the water body and foam, and restores authored daylight', () => {
    const material = createWaterMaterial(options), u = material.uniforms;
    const night = dayLighting(22.5), sky = new THREE.Color(night.sky);
    material.userData.setLighting(night, sky, sky, 1, 1);
    for (const key of ['uSky', 'uHorizon']) u[key].value.toArray().forEach((channel: number, i: number) => expect(channel).toBeCloseTo(sky.toArray()[i], 12));
    expect(u.uSurfaceLight.value).toBeGreaterThan(.08); expect(u.uSurfaceLight.value).toBeLessThan(.16);
    expect(u.uGlintStrength.value).toBeLessThan(.6);
    const clearNight = u.uSurfaceLight.value;
    material.userData.setLighting(night, sky, sky, .18, 1);
    expect(u.uSurfaceLight.value).toBeLessThan(clearNight * .25);
    expect(u.uSun.value.toArray()).toEqual([night.key.x, night.key.y, night.key.z]);
    // Returning to clear midday restores the authored colours, not a cumulative dark tint.
    material.userData.setLighting(dayLighting(13), new THREE.Color('#ffffff'), sky, 1, 1);
    u.uSky.value.toArray().forEach((channel: number, i: number) => expect(channel).toBeCloseTo(new THREE.Color(options.sky).toArray()[i], 12));
    expect(u.uSurfaceLight.value).toBeCloseTo(1, 12); expect(u.uGlintStrength.value).toBeCloseTo(2.4, 12);
    material.userData.resetLighting();
    expect(u.uSun.value.equals(options.sun)).toBe(true);
    material.dispose();
  });
  it('updates shared water materials through the atmosphere and resets them on disposal', () => {
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
    const material = createWaterMaterial(options);
    scene.add(new THREE.Mesh(new THREE.PlaneGeometry(), material));
    setEnvironmentSettings({ weather: 'sunny', timeOfDay: 'night', celebration: 'none' });
    const atmosphere = createWorldAtmosphere(scene, [], []);
    try {
      atmosphere.update(.1, camera);
      expect(material.uniforms.uSurfaceLight.value).toBeGreaterThan(.08);
      expect(material.uniforms.uSurfaceLight.value).toBeLessThan(.16);
      expect(material.uniforms.uSky.value.equals(scene.background)).toBe(true);
      atmosphere.dispose();
      expect(material.uniforms.uSurfaceLight.value).toBe(1);
      expect(material.uniforms.uSky.value.equals(new THREE.Color(options.sky))).toBe(true);
    } finally { atmosphere.dispose(); material.dispose(); setEnvironmentSettings({ ...DEFAULT_ENVIRONMENT }); }
  });
});

describe('Marina Bay water', () => {
  it('is a tagged surface standing below the quay over a deeper bed', () => {
    const world = buildMarinaScene();
    try {
      const bay = world.scene.getObjectByName('marina-bay-water') as THREE.Mesh;
      expect(bay).toBeDefined();
      expect(isWaterObject(bay)).toBe(true);
      expect(bay.position.y).toBe(MARINA_BAY.surface);
      expect(MARINA_BAY.surface).toBeLessThan(0);
      expect(MARINA_BAY.bed).toBeLessThan(MARINA_BAY.surface - 1.5);
      expect(isWaterObject(world.scene.getObjectByName('marina-pond-water')!)).toBe(true);
      // A downward ray into the middle of the bay meets water first, not a floor.
      world.scene.updateMatrixWorld(true);
      // Sample open water west of the new central floating campsite.
      const ray = new THREE.Raycaster(new THREE.Vector3(-30, 10, -20), new THREE.Vector3(0, -1, 0));
      const [first] = ray.intersectObjects(world.scene.children, true);
      expect(isWaterObject(first.object)).toBe(true);
      expect(first.point.y).toBeCloseTo(MARINA_BAY.surface, 5);
    } finally { world.dispose(); }
  });
});

describe('district water', () => {
  it('stays recognisable after static batching', () => {
    const world = buildJurongLakeScene();
    try {
      let found = 0;
      world.scene.traverse(object => { if (isWaterObject(object)) found++; });
      expect(found).toBeGreaterThan(0);
    } finally { world.dispose(); }
  });
});
