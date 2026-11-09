import * as THREE from 'three';

/**
 * Fade authored trim once its width falls below a drawing-buffer pixel.
 * Derivatives follow camera zoom, resolution and instance scale without CPU
 * per-object updates. Only decorative trim uses this; collision stays intact.
 * Solid facade trim blends toward its backing colour; free-standing wires
 * blend coverage and do not write an invisible depth silhouette.
 */
export function filterThinDetail(source: THREE.MeshStandardMaterial, width: number, backing?: THREE.Color) {
  const material = source.clone();
  material.name = `${source.name || 'Marina trim'} filtered ${width}`;
  material.userData.thinDetail = { width, backing: backing?.getHex() ?? null };
  if (!backing) { material.transparent = true; material.depthWrite = false; }
  const before = source.onBeforeCompile, key = source.customProgramCacheKey();
  const colour = backing ? `diffuseColor.rgb = mix(vec3(${backing.toArray().map(v => v.toFixed(8)).join(',')}), diffuseColor.rgb, detailCoverage);` : 'diffuseColor.a *= detailCoverage;';
  material.onBeforeCompile = function(shader, renderer) {
    before.call(this, shader, renderer);
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      // Remove depth variation along the surface: a grazing wire must not fade as if it were farther away.
      vec2 detailRay = vViewPosition.xy / max(vViewPosition.z, 0.00001);
      vec2 detailDx = dFdx(vViewPosition.xy) - detailRay * dFdx(vViewPosition.z);
      vec2 detailDy = dFdy(vViewPosition.xy) - detailRay * dFdy(vViewPosition.z);
      float detailFootprint = max(length(detailDx), length(detailDy));
      float detailCoverage = smoothstep(0.35, 1.5, ${width.toFixed(8)} / max(detailFootprint, 0.00001));
      ${colour}
    `);
  };
  material.customProgramCacheKey = () => `${key}|thin-detail-v1|${width}|${backing?.getHex() ?? 'coverage'}`;
  return material;
}
