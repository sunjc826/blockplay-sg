import * as THREE from 'three';
import { scopeReticleGlsl, type ScopeReticle } from './scope-reticles';
import { roundedRect, type SightWindow } from './weapon-sight-housings';

export interface OpticGlass {
  surface: THREE.Mesh;
  uniforms: {
    reflectionMap: { value: THREE.Texture | null };
    reflectionViewToCapture: { value: THREE.Matrix3 };
    reflectionReady: { value: number };
    reflectionTanHalfFov: { value: number };
  };
}

/** Curved coated glass shared by reflex and magnified optics. */
/** A scope's `reticle` is the etching the coating thins over; a magnified sight without one shows none. */
/** A `window` cuts the glass to that rounded rectangle instead of a disc of `radius`. */
export function createOpticGlass(radius: number, curvature: number, profile: 'reflex' | 'scope', reticle?: ScopeReticle, window?: SightWindow) {
  const scope = profile === 'scope';
  const uniforms: OpticGlass['uniforms'] = {
    reflectionMap: { value: null }, reflectionViewToCapture: { value: new THREE.Matrix3() },
    reflectionReady: { value: 0 }, reflectionTanHalfFov: { value: Math.tan(THREE.MathUtils.degToRad(55)) },
  };
  const material = new THREE.MeshPhysicalMaterial({ color: scope ? '#91bed0' : '#80c7c0', roughness: .12, metalness: .05,
    clearcoat: 1, clearcoatRoughness: .08, transparent: true, opacity: .09, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true });
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = 'varying vec2 coatingUv;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\n coatingUv = uv;');
    shader.fragmentShader = `varying vec2 coatingUv;
      uniform sampler2D reflectionMap;
      uniform mat3 reflectionViewToCapture;
      uniform float reflectionReady;
      uniform float reflectionTanHalfFov;
    ` + (scope && reticle ? scopeReticleGlsl(reticle) : '') + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `
      vec3 eye = normalize(vViewPosition);
      float grazing = pow(1.0 - abs(dot(normalize(normal), eye)), 2.0);
      ${window ? `// A rectangular pane brightens towards its edges rather than its corners.
      vec2 edgeDistance = abs(coatingUv - 0.5);
      float rim = smoothstep(0.36, 0.50, max(edgeDistance.x, edgeDistance.y));` : 'float rim = smoothstep(0.26, 0.50, length(coatingUv - 0.5));'}
      vec3 reflected = reflectionViewToCapture * reflect(-eye, normalize(normal));
      vec2 reflectionUv = 0.5 + reflected.xy / (max(-reflected.z, 0.001) * reflectionTanHalfFov) * 0.5;
      float inCapture = (1.0 - smoothstep(0.46, 0.50, max(abs(reflectionUv.x - 0.5), abs(reflectionUv.y - 0.5)))) * step(0.0, -reflected.z);
      vec3 scenery = texture2D(reflectionMap, clamp(reflectionUv, vec2(0.003), vec2(0.997))).rgb;
      vec3 coating = mix(vec3(0.64, 0.93, 0.98), vec3(1.0, 0.63, 0.30), clamp(rim * 0.65 + grazing, 0.0, 1.0));
      outgoingLight = mix(outgoingLight, scenery * coating + outgoingLight * 0.18, reflectionReady * inCapture);
      ${scope ? `
      // The scope image and etched reticle sit underneath this coating.
      // Keep them legible; let the rim carry the stronger reflection.
      ${reticle ? `vec2 p = coatingUv - 0.5;
      float etched = scopeReticle(p, max(fwidth(p.x), fwidth(p.y)));` : 'float etched = 0.0;'}
      diffuseColor.a = (0.035 + rim * 0.23 + grazing * 0.30) * (1.0 - etched * 0.8);
      ` : window ? '// A holographic window is clear, faintly tinted, and bright only where it turns from the eye.\n      diffuseColor.a = 0.035 + rim * 0.10 + grazing * 0.25;' : 'diffuseColor.a = 0.10 + rim * 0.19 + grazing * 0.25;'}
      #include <opaque_fragment>
    `);
  };
  material.customProgramCacheKey = () => `${profile}-scenery-glass-v4-${reticle ?? 'plain'}${window ? '-window' : ''}`;
  const geometry = window ? new THREE.ShapeGeometry(roundedRect(window.width, window.height, window.corner), 8) : new THREE.RingGeometry(0, radius, 48, 8);
  const vertices = geometry.attributes.position, uvs = geometry.attributes.uv;
  for (let i = 0; i < vertices.count; i++) {
    const r2 = Math.min(1, (vertices.getX(i) ** 2 + vertices.getY(i) ** 2) / radius ** 2);
    vertices.setZ(i, -curvature * (1 - r2));
    // ShapeGeometry's UVs are its coordinates; spread them over the pane.
    if (window) uvs.setXY(i, vertices.getX(i) / window.width + .5, vertices.getY(i) / window.height + .5);
  }
  geometry.computeVertexNormals();
  const surface = new THREE.Mesh(geometry, material); surface.name = 'optic-coated-glass';
  // Reflex reticles draw over the coating. Scopes instead draw the coating over
  // the opaque PiP image, with much lower opacity along the etched reticle.
  surface.renderOrder = scope ? 3 : 1;
  return { reflection: { surface, uniforms }, dispose() { geometry.dispose(); material.dispose(); } };
}
