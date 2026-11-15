import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { SURFACE, applyWeaponSurface, surfaceFamily, surfacePixels, type SurfaceFamily } from './weapon-surface';

const families: SurfaceFamily[] = ['steel', 'polymer', 'rubber'];
const named = (name: string, options: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ name, ...options });

describe('weapon surface textures', () => {
  it.each(families)('%s keeps roughness centred, metal mostly intact and normals facing out', family => {
    const size = 64, { packed, normal } = surfacePixels(family, size);
    expect(packed.length).toBe(size * size * 4); expect(normal.length).toBe(size * size * 4);
    let roughness = 0, metalness = 0, occlusion = 0, flattest = 0;
    for (let i = 0; i < size * size; i++) {
      occlusion += packed[i * 4]; roughness += packed[i * 4 + 1]; metalness += packed[i * 4 + 2];
      const x = normal[i * 4] / 127.5 - 1, y = normal[i * 4 + 1] / 127.5 - 1, z = normal[i * 4 + 2] / 127.5 - 1;
      expect(Math.hypot(x, y, z)).toBeCloseTo(1, 1); expect(z).toBeGreaterThan(.3); flattest = Math.max(flattest, z);
    }
    // 128 is the value that leaves a material's own roughness alone; the average must stay near it.
    expect(roughness / (size * size)).toBeGreaterThan(112); expect(roughness / (size * size)).toBeLessThan(144);
    expect(metalness / (size * size)).toBeGreaterThan(240); expect(occlusion / (size * size)).toBeGreaterThan(150);
    expect(flattest).toBeGreaterThan(.9);
  });
  it('varies across the tile rather than being a flat fill', () => {
    for (const family of families) {
      const { packed } = surfacePixels(family, 64), values = new Set<number>();
      for (let i = 1; i < packed.length; i += 4) values.add(packed[i]);
      expect(values.size, family).toBeGreaterThan(8);
    }
  });
  it('is deterministic, so every session and screenshot gets the same grain', () => {
    expect(surfacePixels('steel', 32).packed).toEqual(surfacePixels('steel', 32).packed);
  });
  it('sizes every family as a power of two for mipmapping', () => {
    for (const family of families) expect(Math.log2(SURFACE[family].size) % 1).toBe(0);
  });
});

describe('weapon surface families', () => {
  it('sorts the gun builders\' material names', () => {
    expect(surfaceFamily(named('Metal anodised', { metalness: .65 }))).toBe('steel');
    expect(surfaceFamily(named('Parkerized steel surface'))).toBe('steel');
    expect(surfaceFamily(named('Study receiver', { metalness: .45 }))).toBe('steel');
    expect(surfaceFamily(named('Olive polymer surface'))).toBe('polymer');
    expect(surfaceFamily(named('Study furniture'))).toBe('polymer');
    expect(surfaceFamily(named('Grip texture'))).toBe('rubber');
    expect(surfaceFamily(named('Black rubber'))).toBe('rubber');
  });
  it('falls back to metalness and roughness for unnamed parts', () => {
    expect(surfaceFamily(named('', { metalness: .55 }))).toBe('steel');
    expect(surfaceFamily(named('#23292b', { roughness: .7 }))).toBe('polymer');
    expect(surfaceFamily(named('', { roughness: .96 }))).toBe('rubber');
  });
  it('leaves glass, sights, cartridges and see-through parts alone', () => {
    expect(surfaceFamily(named('Lens'))).toBeNull();
    expect(surfaceFamily(named('Sight dot', { emissive: '#e9ece4', emissiveIntensity: .35 }))).toBeNull();
    expect(surfaceFamily(named('Cartridge brass', { metalness: .65 }))).toBeNull();
    expect(surfaceFamily(named('Translucent magazine polymer', { transparent: true, opacity: .5 }))).toBeNull();
    expect(surfaceFamily(new THREE.MeshPhysicalMaterial({ name: 'Metal anodised' }))).toBeNull();
    expect(surfaceFamily(new THREE.MeshBasicMaterial())).toBeNull();
  });
});

describe('applying weapon surfaces', () => {
  const gun = () => {
    const steel = named('Metal anodised', { metalness: .6 }), lens = named('Lens'), root = new THREE.Group();
    root.add(new THREE.Mesh(new THREE.BoxGeometry(), steel), new THREE.Mesh(new THREE.BoxGeometry(), steel), new THREE.Mesh(new THREE.BoxGeometry(), lens));
    return { root, steel, lens };
  };
  const compile = (material: THREE.Material) => {
    const shader = { uniforms: {} as Record<string, THREE.IUniform>, vertexShader: THREE.ShaderLib.physical.vertexShader, fragmentShader: THREE.ShaderLib.physical.fragmentShader };
    material.onBeforeCompile(shader as never, undefined as never); return shader;
  };
  it('patches each opaque gun material once and skips the lens', () => {
    const { root, steel, lens } = gun();
    applyWeaponSurface(root);
    expect(steel.userData.weaponSurface).toBe('steel'); expect(lens.userData.weaponSurface).toBeUndefined();
    // three keys programs on the hook's source, so two patched materials still share one program.
    const other = gun(); applyWeaponSurface(other.root);
    expect(steel.customProgramCacheKey()).toMatch(/\|weapon-surface-v1$/); expect(other.steel.customProgramCacheKey()).toBe(steel.customProgramCacheKey());
    const shader = compile(steel);
    expect(shader.uniforms.surfacePacked.value).toBeInstanceOf(THREE.DataTexture);
    expect(shader.uniforms.surfaceTuning.value.x).toBeCloseTo(1 / SURFACE.steel.tile);
    // Every hook must have found its anchor in three's shader, or the detail silently goes missing.
    for (const marker of ['surfaceData.g', 'surfaceData.b', 'surfaceBend', 'surfaceShade']) expect(shader.fragmentShader, marker).toContain(marker);
    expect(shader.vertexShader).toContain('vSurfacePosition = position');
    expect(shader.fragmentShader.match(/uniform sampler2D surfacePacked/g)).toHaveLength(1);
  });
  it('keeps an earlier shader hook and gives the material back unchanged', () => {
    const { root, steel } = gun(); let earlier = 0;
    const before = steel.onBeforeCompile = () => { earlier++; };
    const strip = applyWeaponSurface(root);
    compile(steel); expect(earlier).toBe(1);
    strip();
    expect(steel.onBeforeCompile).toBe(before); expect(steel.userData.weaponSurface).toBeUndefined();
  });
});
