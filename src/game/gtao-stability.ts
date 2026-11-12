import type { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';

/**
 * Three's GTAO rebuilds each pixel's normal from the depth buffer, taking the
 * one-sided difference whose neighbour best continues a straight line. A
 * feature one or two pixels wide (paving strips a centimetre proud of the
 * slab, grout, kerb lips, railings far off) fools that test on both sides, so
 * the normal tips over, the pixel reads as a deep crease and the denoiser
 * smears it into a dark blot that crawls as the camera moves.
 *
 * Depth-buffer values are linear in screen space across any plane, so each
 * one-pixel step either side of the centre is a sample of the surface's slope.
 * The replacement takes the median of the four steps as the slope and uses
 * whichever of the back, forward or centred difference agrees with it: the
 * centred one steps over a single odd pixel, and on smooth surfaces all three
 * agree, so ordinary shading is unchanged. Same nine depth fetches.
 */
export const STABLE_NORMAL_GLSL = /* glsl */`
vec3 stableDepthDerivative(float m2, float m1, float c, float p1, float p2, vec3 back, vec3 forward, vec3 centred) {
  float s0 = m1 - m2, s1 = c - m1, s2 = p1 - c, s3 = p2 - p1;
  float lo = min(min(s0, s1), min(s2, s3)), hi = max(max(s0, s1), max(s2, s3));
  float slope = (s0 + s1 + s2 + s3 - lo - hi) * .5;
  float eb = abs(s1 - slope), ef = abs(s2 - slope), ec = abs((p1 - m1) * .5 - slope);
  return ec < min(eb, ef) ? centred : eb < ef ? back : forward;
}
vec3 computeNormalFromDepth(const vec2 uv) {
  vec2 size = vec2(textureSize(tDepth, 0));
  ivec2 p = ivec2(uv * size);
  float c0 = fetchDepth(p);
  float l2 = fetchDepth(p - ivec2(2, 0)), l1 = fetchDepth(p - ivec2(1, 0));
  float r1 = fetchDepth(p + ivec2(1, 0)), r2 = fetchDepth(p + ivec2(2, 0));
  float b2 = fetchDepth(p - ivec2(0, 2)), b1 = fetchDepth(p - ivec2(0, 1));
  float t1 = fetchDepth(p + ivec2(0, 1)), t2 = fetchDepth(p + ivec2(0, 2));
  vec2 dx = vec2(1.0 / size.x, 0.0), dy = vec2(0.0, 1.0 / size.y);
  vec3 ce = getViewPosition(uv, c0).xyz;
  vec3 l = getViewPosition(uv - dx, l1).xyz, r = getViewPosition(uv + dx, r1).xyz;
  vec3 b = getViewPosition(uv - dy, b1).xyz, t = getViewPosition(uv + dy, t1).xyz;
  vec3 dpdx = stableDepthDerivative(l2, l1, c0, r1, r2, ce - l, r - ce, (r - l) * .5);
  vec3 dpdy = stableDepthDerivative(b2, b1, c0, t1, t2, ce - b, t - ce, (t - b) * .5);
  return normalize(cross(dpdx, dpdy));
}
`;

/**
 * The choice `stableDepthDerivative` makes, for tests: which difference it
 * uses given five depth samples along one axis (two back, centre, two forward).
 */
export function stableDepthChoice(m2: number, m1: number, c: number, p1: number, p2: number): 'back' | 'forward' | 'centred' {
  const s = [m1 - m2, c - m1, p1 - c, p2 - p1];
  const slope = (s[0] + s[1] + s[2] + s[3] - Math.min(...s) - Math.max(...s)) * .5;
  const eb = Math.abs(s[1] - slope), ef = Math.abs(s[2] - slope), ec = Math.abs((p1 - m1) * .5 - slope);
  return ec < Math.min(eb, ef) ? 'centred' : eb < ef ? 'back' : 'forward';
}

const NORMAL_FUNCTION = /vec3 computeNormalFromDepth\(const vec2 uv\) \{[\s\S]*?return normalize\(cross\(dpdx, dpdy\)\);\s*\}/;

/** Swaps the replacement into a GLSL source, or returns it unchanged when the function is not found. */
export function withStableNormals(source: string) {
  return NORMAL_FUNCTION.test(source) ? source.replace(NORMAL_FUNCTION, STABLE_NORMAL_GLSL.trim()) : source;
}

/** Applies the stable normal reconstruction to a GTAO pass's AO and denoise shaders. */
export function stabilizeGtao(pass: GTAOPass) {
  for (const material of [pass.gtaoMaterial, pass.pdMaterial]) {
    const patched = withStableNormals(material.fragmentShader);
    if (patched !== material.fragmentShader) { material.fragmentShader = patched; material.needsUpdate = true; }
  }
}
