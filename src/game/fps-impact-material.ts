import * as THREE from 'three';

const smooth = (lo: number, hi: number, value: number) => {
  const t = Math.max(0, Math.min(1, (value - lo) / (hi - lo)));
  return t * t * (3 - 2 * t);
};
/** A recessed bowl with an uneven chipped lip, in tangent-space coordinates. */
export function craterHeight(x: number, y: number) {
  const angle = Math.atan2(y, x);
  const edge = .65 + .045 * Math.sin(angle * 5) + .025 * Math.cos(angle * 11);
  const r = Math.hypot(x, y) / edge;
  const cavity = -.22 * (1 - smooth(.12, .95, r));
  const rim = .055 * Math.exp(-Math.pow((r - 1) / .12, 2));
  return cavity + rim;
}
/** Procedural paired maps: colour is sRGB; the normal and cavity mask are linear data. */
export function createBulletHoleTextures(size = 128) {
  const colour = new Uint8Array(size * size * 4), normal = new Uint8Array(colour.length);
  const step = 2 / size;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = (x + .5) * step - 1, v = (y + .5) * step - 1;
    const h = craterHeight(u, v), i = (y * size + x) * 4;
    const dx = (craterHeight(u + step, v) - craterHeight(u - step, v)) / (2 * step);
    const dy = (craterHeight(u, v + step) - craterHeight(u, v - step)) / (2 * step);
    const length = Math.hypot(dx, dy, 1);
    normal[i] = Math.round((-.5 * dx / length + .5) * 255);
    normal[i + 1] = Math.round((-.5 * dy / length + .5) * 255);
    normal[i + 2] = Math.round((.5 / length + .5) * 255);
    // Cavity mask gives the deeper variants stronger local occlusion too.
    normal[i + 3] = Math.round(Math.max(0, -h / .22) * 255);
    const grain = Math.sin(u * 173 + Math.cos(v * 113)) * Math.sin(v * 157 + u * 71);
    const shade = .32 + h * 1.1 + grain * .025;
    colour[i] = colour[i + 1] = colour[i + 2] = Math.round(shade * 255);
    const angle = Math.atan2(v, u);
    const radius = Math.hypot(u, v) / (.84 + .035 * Math.sin(angle * 5));
    colour[i + 3] = Math.round((1 - smooth(.82, 1, radius)) * 255);
  }
  const texture = (bytes: Uint8Array, colourSpace: THREE.ColorSpace) => {
    const map = new THREE.DataTexture(bytes, size, size, THREE.RGBAFormat);
    map.colorSpace = colourSpace;
    map.magFilter = THREE.LinearFilter; map.minFilter = THREE.LinearMipmapLinearFilter;
    map.generateMipmaps = true; map.needsUpdate = true;
    return map;
  };
  return { map: texture(colour, THREE.SRGBColorSpace), normalMap: texture(normal, THREE.NoColorSpace) };
}

/** The pool can fade each decal/puff without changing the opacity of its neighbours. */
export function withInstanceOpacity<T extends THREE.Material>(material: T): T {
  material.onBeforeCompile = shader => {
    shader.vertexShader = 'attribute float effectOpacity; varying float vEffectOpacity;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvEffectOpacity = effectOpacity;');
    shader.fragmentShader = 'varying float vEffectOpacity;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a *= vEffectOpacity;');
  };
  material.customProgramCacheKey = () => 'impact-opacity-v1';
  return material;
}

export function createBulletHoleMaterial(textures: ReturnType<typeof createBulletHoleTextures>) {
  const material = withInstanceOpacity(new THREE.MeshStandardMaterial({
    ...textures, color: '#ffffff', roughness: .95, metalness: 0,
    transparent: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  }));
  const opacityPatch = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    opacityPatch.call(material, shader, renderer);
    shader.vertexShader = 'attribute float impactDepth; varying float vImpactDepth;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvImpactDepth = impactDepth;');
    shader.fragmentShader = 'varying float vImpactDepth;\n' + shader.fragmentShader;
    // Stock lighting, tangent basis and shadows, with per-instance normal strength.
    shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>',
      THREE.ShaderChunk.normal_fragment_maps.replace('mapN.xy *= normalScale;', 'mapN.xy *= normalScale * vImpactDepth;'));
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      float cavity = texture2D(normalMap, vNormalMapUv).a;
      diffuseColor.rgb *= mix(1.0, 1.0 / (1.0 + vImpactDepth * .55), cavity);`);
  };
  material.customProgramCacheKey = () => 'impact-crater-v1';
  return material;
}
