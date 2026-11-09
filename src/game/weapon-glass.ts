import * as THREE from 'three';
import { scopeReticleGlsl, type ScopeReticle } from './scope-reticles';
import { windowShape, type SightWindow } from './weapon-sight-housings';

export interface OpticGlass {
  surface: THREE.Mesh;
  uniforms: {
    reflectionMap: { value: THREE.Texture | null };
    reflectionViewToCapture: { value: THREE.Matrix3 };
    reflectionReady: { value: number };
    reflectionTanHalfFov: { value: number };
    aiming: { value: number };
  };
}

/** Convex backing for generic telescopes when their live aiming image fades out. */
export function createScopeBacking(radius: number) {
  const geometry = new THREE.RingGeometry(0, radius, 48, 8);
  const vertices = geometry.attributes.position;
  for (let i = 0; i < vertices.count; i++) {
    const r2 = (vertices.getX(i) ** 2 + vertices.getY(i) ** 2) / radius ** 2;
    vertices.setZ(i, .0012 * (1 - Math.min(1, r2)));
  }
  geometry.computeVertexNormals();
  const material = new THREE.MeshPhysicalMaterial({ color: '#18343e', roughness: .16, metalness: .28,
    clearcoat: 1, clearcoatRoughness: .08, side: THREE.DoubleSide });
  const surface = new THREE.Mesh(geometry, material); surface.name = 'scope-recessed-glass';
  return { surface, dispose() { geometry.dispose(); material.dispose(); } };
}

/**
 * A window's whole outline as concentric rings around its centre. A shape's own
 * triangulation has no vertices inside its edge, which a curved pane needs.
 */
function windowPane(window: SightWindow, rings = 6) {
  const outline = windowShape(window).getPoints(8);
  outline.pop(); // The last point closes the outline on the first.
  const positions = [0, 0, 0], indices: number[] = [], n = outline.length;
  for (let ring = 1; ring <= rings; ring++) for (const point of outline) positions.push(point.x * ring / rings, point.y * ring / rings, 0);
  const at = (ring: number, i: number) => 1 + (ring - 1) * n + (i % n);
  for (let i = 0; i < n; i++) {
    indices.push(0, at(1, i), at(1, i + 1));
    for (let ring = 1; ring < rings; ring++) indices.push(at(ring, i), at(ring + 1, i), at(ring + 1, i + 1), at(ring, i), at(ring + 1, i + 1), at(ring, i + 1));
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(positions.length / 3 * 2), 2));
  geometry.setIndex(indices);
  return geometry;
}

/** Coated glass: positive curvature is concave towards the eye, negative is convex, zero is flat. See docs/OPTIC-GLASS.md. */
/** A scope's `reticle` is the etching the coating thins over; a magnified sight without one shows none. */
/** A `window` cuts the glass to that outline instead of a disc of `radius`, which should then just reach its corners. */
export function createOpticGlass(radius: number, curvature: number, profile: 'reflex' | 'holo' | 'scope', reticle?: ScopeReticle, window?: SightWindow) {
  const scope = profile === 'scope', holo = profile === 'holo';
  const uniforms: OpticGlass['uniforms'] = {
    reflectionMap: { value: null }, reflectionViewToCapture: { value: new THREE.Matrix3() },
    reflectionReady: { value: 0 }, reflectionTanHalfFov: { value: Math.tan(THREE.MathUtils.degToRad(55)) },
    aiming: { value: 0 },
  };
  const material = new THREE.MeshPhysicalMaterial({ color: scope ? '#91bed0' : holo ? '#e6eeee' : '#80c7c0', roughness: holo ? .06 : .12, metalness: holo ? 0 : .05,
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
      uniform float aiming;
    ` + (scope && reticle ? scopeReticleGlsl(reticle) : '') + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `
      vec3 eye = normalize(vViewPosition);
      float grazing = pow(1.0 - abs(dot(normalize(normal), eye)), 2.0);
      ${window ? `// A windowed pane brightens towards its edges rather than its corners.
      vec2 edgeDistance = abs(coatingUv - 0.5);
      float rim = smoothstep(0.36, 0.50, max(edgeDistance.x, edgeDistance.y));` : 'float rim = smoothstep(0.26, 0.50, length(coatingUv - 0.5));'}
      vec3 reflected = reflectionViewToCapture * reflect(-eye, normalize(normal));
      vec2 reflectionUv = 0.5 + reflected.xy / (max(-reflected.z, 0.001) * reflectionTanHalfFov) * 0.5;
      float inCapture = (1.0 - smoothstep(0.46, 0.50, max(abs(reflectionUv.x - 0.5), abs(reflectionUv.y - 0.5)))) * step(0.0, -reflected.z);
      vec3 scenery = texture2D(reflectionMap, clamp(reflectionUv, vec2(0.003), vec2(0.997))).rgb;
      ${holo ? `// Flat holographic glass has a neutral sight picture; the cool
      // coating becomes apparent as the pane turns away from the eye.
      vec3 coating = mix(vec3(0.98, 1.0, 1.0), vec3(0.83, 0.94, 1.0), grazing);` : 'vec3 coating = mix(vec3(0.64, 0.93, 0.98), vec3(1.0, 0.63, 0.30), clamp(rim * 0.65 + grazing, 0.0, 1.0));'}
      outgoingLight = mix(outgoingLight, scenery * coating + outgoingLight * 0.18, reflectionReady * inCapture);
      ${scope ? `
      // The scope image and etched reticle sit underneath this coating.
      // Raised glass leaves the aiming picture clear, with only a faint outer
      // border. Lowered glass has a strong coating so the recessed lens reads.
      ${reticle ? `vec2 p = coatingUv - 0.5;
      float etched = scopeReticle(p, max(fwidth(p.x), fwidth(p.y)));` : 'float etched = 0.0;'}
      float aimRim = smoothstep(0.39, 0.50, ${window ? 'max(edgeDistance.x, edgeDistance.y)' : 'length(coatingUv - 0.5)'});
      float hipCoating = 0.24 + rim * 0.24 + grazing * 0.20 + reflectionReady * inCapture * 0.25;
      diffuseColor.a = mix(hipCoating, aimRim * 0.055, aiming) * (1.0 - etched * 0.8);
      ` : holo ? '// Keep the aiming area clear; reflections reveal the rim and oblique pane.\n      diffuseColor.a = 0.018 + rim * 0.065 + grazing * 0.30;' : 'diffuseColor.a = 0.10 + rim * 0.19 + grazing * 0.25;'}
      // Live capture (Ultra) shows more of the glass where it reflects scenery,
      // keeping a scope's centre and a holographic window's aiming area clear.
      ${scope ? '' : `diffuseColor.a = min(1.0, diffuseColor.a + reflectionReady * inCapture * ${holo ? '(0.015 + 0.12 * grazing)' : '0.14'});`}
      #include <opaque_fragment>
    `);
  };
  material.customProgramCacheKey = () => `${profile}-scenery-glass-v7-${reticle ?? 'plain'}${window ? '-window' : ''}`;
  const geometry = window ? windowPane(window) : new THREE.RingGeometry(0, radius, 48, 8);
  const vertices = geometry.attributes.position, uvs = geometry.attributes.uv;
  for (let i = 0; i < vertices.count; i++) {
    const r2 = Math.min(1, (vertices.getX(i) ** 2 + vertices.getY(i) ** 2) / radius ** 2);
    // Scope mounts place this surface just in front of an opaque end cap.
    // Keep the deepest point at that plane for either curvature: the centre
    // of a concave surface, or the rim of a convex one. Simply negating z
    // would bury the convex rim in the cap and clip its reflection.
    vertices.setZ(i, scope && curvature >= 0 ? curvature * r2 : -curvature * (1 - r2));
    // Spread the UVs over the pane, so its rim follows the window's edges.
    if (window) uvs.setXY(i, vertices.getX(i) / window.width + .5, vertices.getY(i) / window.height + .5);
  }
  geometry.computeVertexNormals();
  // A window's triangles are uneven, so averaged normals would facet its reflection: use the curve's own.
  if (window) {
    const normals = geometry.attributes.normal, slope = 2 * curvature / radius ** 2;
    for (let i = 0; i < vertices.count; i++) {
      const nx = -slope * vertices.getX(i), ny = -slope * vertices.getY(i), length = Math.hypot(nx, ny, 1);
      normals.setXYZ(i, nx / length, ny / length, 1 / length);
    }
  }
  const surface = new THREE.Mesh(geometry, material); surface.name = 'optic-coated-glass';
  // Reflex reticles draw over the coating. Scopes instead draw the coating over
  // the opaque PiP image, with much lower opacity along the etched reticle.
  surface.renderOrder = scope ? 3 : 1;
  return { reflection: { surface, uniforms }, dispose() { geometry.dispose(); material.dispose(); } };
}
