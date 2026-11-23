import * as THREE from 'three';

/** How far a bar's shading normal swings toward its edges (tangent of the angle), the bars it applies to, and how far the brushed grain carries the sun's highlight along a bar (sine of the angle). */
export const BAR_ROUND = { bend: 0.9, maxWidth: 0.6, minAspect: 3, grain: 0.6 } as const;

/**
 * Shade box-built bars (mullions, rails, posts, beams) as rounded sections.
 *
 * A flat face is either wholly in the sun's mirror or wholly out of it, so a
 * boxy steel bar reads as grey paint from almost everywhere. Real sections have
 * radiused edges and catch the sun as a bright line along their length. This
 * swings the shading normal across the narrow side of each long, thin face of a
 * unit box, which gives that line without any new geometry. Faces that are not
 * long and thin, and anything that is not a unit box (tubes, plates), are left
 * alone. Works for plain and instanced meshes; the silhouette stays square.
 */
export function roundMetalBars<T extends THREE.MeshStandardMaterial>(material: T): T {
  const before = material.onBeforeCompile, key = material.customProgramCacheKey();
  material.onBeforeCompile = function(shader, renderer) {
    before.call(this, shader, renderer);
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>
      varying vec3 vBarBend;
      varying vec3 vBarAxis;`).replace('#include <begin_vertex>', `#include <begin_vertex>
      vBarBend = vec3(0.0); vBarAxis = vec3(0.0);
      if (all(lessThan(abs(abs(position) - 0.5), vec3(0.001)))) {
        #ifdef USE_INSTANCING
          mat4 barMatrix = modelMatrix * instanceMatrix;
        #else
          mat4 barMatrix = modelMatrix;
        #endif
        vec3 barSize = vec3(length(barMatrix[0].xyz), length(barMatrix[1].xyz), length(barMatrix[2].xyz));
        vec3 barFace = step(0.5, abs(normal));
        vec3 barAcross = mix(barSize, vec3(1e9), barFace), barAlong = mix(barSize, vec3(0.0), barFace);
        float barThin = min(barAcross.x, min(barAcross.y, barAcross.z)), barLong = max(barAlong.x, max(barAlong.y, barAlong.z));
        vec3 barAxis = barThin == barAcross.x ? vec3(1.0, 0.0, 0.0) : barThin == barAcross.y ? vec3(0.0, 1.0, 0.0) : vec3(0.0, 0.0, 1.0);
        float barOn = step(barThin, ${BAR_ROUND.maxWidth.toFixed(3)}) * step(barThin * ${BAR_ROUND.minAspect.toFixed(1)}, barLong);
        vBarBend = normalize(mat3(viewMatrix) * (mat3(barMatrix) * barAxis)) * (dot(position, barAxis) * ${(2 * BAR_ROUND.bend).toFixed(3)} * barOn);
        vBarAxis = normalize(mat3(viewMatrix) * (mat3(barMatrix) * (vec3(1.0) - barFace - barAxis))) * barOn;
      }`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vBarBend;
      varying vec3 vBarAxis;`).replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
      normal = normalize(normal + vBarBend);
      #if NUM_DIR_LIGHTS > 0
        // Brushed along its length: the grain spreads the sun's highlight along the bar,
        // so the normal follows the half vector in that direction and only has to meet it across.
        if (dot(vBarAxis, vBarAxis) > 0.25) {
          vec3 barGrain = normalize(vBarAxis);
          float barAlong = clamp(dot(normalize(directionalLights[0].direction + normalize(vViewPosition)), barGrain), -${BAR_ROUND.grain.toFixed(2)}, ${BAR_ROUND.grain.toFixed(2)});
          vec3 barRound = normal - barGrain * dot(normal, barGrain);
          normal = normalize(normalize(barRound) * sqrt(1.0 - barAlong * barAlong) + barGrain * barAlong);
        }
      #endif
      // A bar a pixel or two wide turns its whole rounded section inside one pixel; without this the
      // highlight lands on some pixels and misses their neighbours, and the line breaks into beads.
      if (dot(vBarBend, vBarBend) > 0.0 || dot(vBarAxis, vBarAxis) > 0.25) {
        vec3 barDx = dFdx(normal), barDy = dFdy(normal);
        float barAlpha = roughnessFactor * roughnessFactor;
        roughnessFactor = sqrt(sqrt(min(1.0, barAlpha * barAlpha + min(2.0 * max(dot(barDx, barDx), dot(barDy, barDy)), 0.18))));
      }`);
  };
  material.customProgramCacheKey = () => `${key}|round-bars-v3`;
  return material;
}
