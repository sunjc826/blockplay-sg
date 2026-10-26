import type { WeaponSpec } from './fps-rules';
import type { EnemyOptic } from './enemy-weapon-layout';

/**
 * The etched pattern a magnified sight shows. Each is drawn in lens UVs
 * centred on the aiming point (y up, the lens edge at 0.5), so it stays sharp
 * at any on-screen lens size and needs no texture.
 *
 * - `g36-zf`: the Hensoldt ZF 3×4° main reticle, proportioned from the
 *   Wikimedia diagram HKG36Reticle.svg: a hairline across with heavy outer
 *   posts, a 200 m ring and crosshair, holdover crosses below, and the
 *   8-6-4-2 range-finding steps lower left (a 1.75 m man fits under the step).
 * - `sar21-ring`: the SAR 21's factory-zeroed 1.5× sight, measured from a
 *   through-the-sight photo the owner supplied (25 Oct 2026): a fine crosshair
 *   to the field stop, broken by a small heavy ring whose clear centre holds
 *   a pinpoint dot.
 * - `match-duplex`: the marksman variant's fictional match scope, a duplex.
 * - `xm8-mil`: the XM8 sharpshooter's 3.5x telescope. No reference image was
 *   reviewed, so this is a generic pattern rather than the prototype's: a fine
 *   crosshair with heavy outer posts and an open centre, mil ticks along both
 *   hairs, and three holdover bars under the centre for longer shots.
 */
export type ScopeReticle = 'g36-zf' | 'sar21-ring' | 'match-duplex' | 'xm8-mil';

export function scopeReticleFor(weapon: WeaponSpec, built: EnemyOptic | undefined): ScopeReticle {
  if (built) return built.reticle ?? 'g36-zf';
  return weapon.optic === 'precision' ? 'match-duplex' : 'sar21-ring';
}

const HELPERS = `
float reticleSegment(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0));
}
// A stroke narrower than a pixel keeps a one-pixel footprint and fades
// instead, so hairlines read as faint lines rather than shimmering dashes.
float reticleStroke(float d, float w, float aa) {
  float wide = max(w, aa * 0.5);
  return (1.0 - smoothstep(wide, wide + aa, d)) * min(1.0, w / (aa * 0.5));
}
`;

/** A seven-segment numeral: `on` flags segments a-d, `rest` e-g. */
const DIGIT = `
float reticleDigit(vec2 p, vec2 c, vec2 h, vec4 on, vec3 rest, float w, float aa) {
  vec2 tl = c + vec2(-h.x, h.y), tr = c + h, ml = c - vec2(h.x, 0.0), mr = c + vec2(h.x, 0.0), bl = c - h, br = c + vec2(h.x, -h.y);
  float ink = on.x * reticleStroke(reticleSegment(p, tl, tr), w, aa);
  ink = max(ink, on.y * reticleStroke(reticleSegment(p, tr, mr), w, aa));
  ink = max(ink, on.z * reticleStroke(reticleSegment(p, mr, br), w, aa));
  ink = max(ink, on.w * reticleStroke(reticleSegment(p, bl, br), w, aa));
  ink = max(ink, rest.x * reticleStroke(reticleSegment(p, ml, bl), w, aa));
  ink = max(ink, rest.y * reticleStroke(reticleSegment(p, tl, ml), w, aa));
  return max(ink, rest.z * reticleStroke(reticleSegment(p, ml, mr), w, aa));
}
`;

const PATTERNS: Record<ScopeReticle, string> = {
  'g36-zf': DIGIT + `
float scopeReticle(vec2 p, float aa) {
  const float hair = 0.00415;
  float ink = reticleStroke(abs(p.y), hair, aa);
  ink = max(ink, reticleStroke(reticleSegment(p, vec2(-0.6, 0.0), vec2(-0.358, 0.0)), 0.0083, aa));
  ink = max(ink, reticleStroke(reticleSegment(p, vec2(0.358, 0.0), vec2(0.6, 0.0)), 0.0083, aa));
  // 200 m: the ring, quartered by the vertical stroke inside it.
  ink = max(ink, reticleStroke(abs(length(p) - 0.039), hair, aa));
  ink = max(ink, reticleStroke(reticleSegment(p, vec2(0.0, -0.0398), vec2(0.0, 0.0398)), hair, aa));
  // Holdover crosses for the longer ranges.
  for (int i = 0; i < 2; i++) {
    vec2 c = vec2(0.0, i == 0 ? -0.0593 : -0.1545);
    ink = max(ink, reticleStroke(reticleSegment(p, c - vec2(0.0226, 0.0), c + vec2(0.0226, 0.0)), 0.0043, aa));
    ink = max(ink, reticleStroke(reticleSegment(p, c - vec2(0.0, 0.0226), c + vec2(0.0, 0.0226)), 0.0043, aa));
  }
  // Range finder: a man's head on the top rule, his feet on a step.
  ink = max(ink, reticleStroke(reticleSegment(p, vec2(-0.365, -0.1367), vec2(-0.216, -0.1367)), hair, aa));
  ink = max(ink, reticleStroke(reticleSegment(p, vec2(-0.366, -0.1685), vec2(-0.323, -0.1685)), hair, aa));
  ink = max(ink, reticleStroke(reticleSegment(p, vec2(-0.331, -0.1859), vec2(-0.288, -0.1859)), hair, aa));
  ink = max(ink, reticleStroke(reticleSegment(p, vec2(-0.296, -0.2041), vec2(-0.255, -0.2041)), hair, aa));
  ink = max(ink, reticleStroke(reticleSegment(p, vec2(-0.255, -0.2414), vec2(-0.215, -0.2414)), hair, aa));
  vec2 h = vec2(0.0054, 0.0103);
  const float fine = 0.0018;
  ink = max(ink, reticleDigit(p, vec2(-0.3477, -0.111), h, vec4(1.0), vec3(1.0), fine, aa));
  ink = max(ink, reticleDigit(p, vec2(-0.3109, -0.111), h, vec4(1.0, 0.0, 1.0, 1.0), vec3(1.0), fine, aa));
  ink = max(ink, reticleDigit(p, vec2(-0.2788, -0.111), h, vec4(0.0, 1.0, 1.0, 0.0), vec3(0.0, 1.0, 1.0), fine, aa));
  ink = max(ink, reticleDigit(p, vec2(-0.2337, -0.111), h, vec4(1.0, 1.0, 0.0, 1.0), vec3(1.0, 0.0, 1.0), fine, aa));
  return ink;
}
`,
  'sar21-ring': `
float scopeReticle(vec2 p, float aa) {
  float r = length(p);
  // The crosshair stops at the ring, so the ring's centre stays clear.
  float ink = reticleStroke(min(abs(p.x), abs(p.y)), 0.0028, aa) * step(0.03, r);
  ink = max(ink, reticleStroke(abs(r - 0.0375), 0.0139, aa));
  return max(ink, reticleStroke(r, 0.0035, aa));
}
`,
  'match-duplex': `
float scopeReticle(vec2 p, float aa) {
  float ink = reticleStroke(reticleSegment(p, vec2(-0.2, 0.0), vec2(0.2, 0.0)), 0.0032, aa);
  ink = max(ink, reticleStroke(reticleSegment(p, vec2(0.0, -0.2), vec2(0.0, 0.2)), 0.0032, aa));
  ink = max(ink, reticleStroke(reticleSegment(p, vec2(0.2, 0.0), vec2(0.6, 0.0)), 0.0095, aa));
  ink = max(ink, reticleStroke(reticleSegment(p, vec2(-0.6, 0.0), vec2(-0.2, 0.0)), 0.0095, aa));
  ink = max(ink, reticleStroke(reticleSegment(p, vec2(0.0, 0.2), vec2(0.0, 0.6)), 0.0095, aa));
  return max(ink, reticleStroke(reticleSegment(p, vec2(0.0, -0.6), vec2(0.0, -0.2)), 0.0095, aa));
}
`,
  'xm8-mil': `
float scopeReticle(vec2 p, float aa) {
  const float hair = 0.0028;
  // A gap at the centre leaves the target clear; a pinpoint marks the aim.
  float ink = reticleStroke(min(abs(p.x), abs(p.y)), hair, aa) * step(0.012, length(p)) * (1.0 - step(0.3, max(abs(p.x), abs(p.y))));
  ink = max(ink, reticleStroke(length(p), 0.0022, aa));
  for (int i = 0; i < 4; i++) {
    vec2 a = vec2(i == 0 ? 0.3 : i == 1 ? -0.6 : 0.0, i == 2 ? 0.3 : i == 3 ? -0.6 : 0.0);
    vec2 b = a + (i < 2 ? vec2(0.3, 0.0) : vec2(0.0, 0.3));
    ink = max(ink, reticleStroke(reticleSegment(p, a, b), 0.011, aa));
  }
  // Mil ticks: every 0.05 along each hair, the fifth one longer.
  for (int i = 1; i <= 5; i++) {
    float at = float(i) * 0.05, tick = i == 5 ? 0.012 : 0.006;
    for (int s = 0; s < 2; s++) {
      float d = s == 0 ? at : -at;
      ink = max(ink, reticleStroke(reticleSegment(p, vec2(d, -tick), vec2(d, tick)), hair, aa));
      if (d > 0.0) ink = max(ink, reticleStroke(reticleSegment(p, vec2(-tick, d), vec2(tick, d)), hair, aa));
    }
  }
  // Holdover bars below the centre, narrowing with range.
  for (int i = 0; i < 3; i++) {
    float y = -0.075 - float(i) * 0.06, w = 0.03 - float(i) * 0.007;
    ink = max(ink, reticleStroke(reticleSegment(p, vec2(-w, y), vec2(w, y)), 0.0034, aa));
  }
  return ink;
}
`,
};

/** Fragment-shader declarations defining `float scopeReticle(vec2 p, float aa)`. */
export const scopeReticleGlsl = (reticle: ScopeReticle) => HELPERS + PATTERNS[reticle];
