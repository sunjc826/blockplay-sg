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
 * - `mil-dot`: classic round-dot telescope crosshair for the XM8 Sharpshooter,
 *   based on Leupold's Mil Dot description and 2025 catalog (reticles p. 71).
 * - `tmr`: SCAR 20S telescope, visually adapted from Leupold's TMR: alternating
 *   whole/half divisions, fine outer divisions, heavy posts and an open centre.
 *   Sources: https://www.leupold.com/media/EN_2025_Leupold_Catalog.pdf
 *   and https://www.leupold.com/reticle/tmr . These are display adaptations:
 *   spacing/line weight suit the game's small fixed-power lens, not calibrated
 *   angular ranging or a claim about either platform's original factory sight.
 * - `prism-chevron`: the fictional 4x prism sight on the Two Eyes Open SAR 21,
 *   in the manner of fixed-power combat prisms generally rather than any one
 *   model: an open chevron whose apex is the aim, a post under it with
 *   narrowing holdover bars, and short hairlines out to the field stop.
 */
export type ScopeReticle = 'g36-zf' | 'sar21-ring' | 'match-duplex' | 'mil-dot' | 'tmr' | 'prism-chevron';

export function scopeReticleFor(weapon: WeaponSpec, built: EnemyOptic | undefined): ScopeReticle {
  if (built) return built.reticle ?? 'g36-zf';
  if (weapon.accessories?.sight === 'prism') return 'prism-chevron';
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
  'mil-dot': `
float scopeReticle(vec2 p, float aa) {
  const float division = 0.065;
  float axis = min(abs(p.x), abs(p.y));
  float reach = max(abs(p.x), abs(p.y));
  float ink = reticleStroke(axis, 0.0018, aa);
  // Four round dots on each arm, with the heavy posts at the fifth division.
  for (int i = 1; i <= 4; i++) {
    float at = float(i) * division;
    vec2 q = abs(p);
    float dotDistance = min(length(q - vec2(at, 0.0)), length(q - vec2(0.0, at)));
    ink = max(ink, reticleStroke(dotDistance, division * 0.10, aa));
  }
  return max(ink, reticleStroke(axis, 0.009, aa) * smoothstep(0.318, 0.332, reach));
}
`,
  'tmr': `
float scopeReticle(vec2 p, float aa) {
  const float division = 0.065;
  vec2 q = abs(p);
  float axis = min(q.x, q.y), reach = max(q.x, q.y);
  // The tiny open intersection leaves a distant target visible at the aim point.
  float ink = reticleStroke(axis, 0.0028, aa) * smoothstep(0.002, 0.005, reach);
  for (int i = 1; i <= 8; i++) {
    float at = float(i) * division * 0.5;
    float halfLength = i % 2 == 0 ? 0.014 : 0.008;
    float hash = min(reticleSegment(q, vec2(at, 0.0), vec2(at, halfLength)),
                     reticleSegment(q, vec2(0.0, at), vec2(halfLength, at)));
    ink = max(ink, reticleStroke(hash, 0.0028, aa));
  }
  // Finer divisions at the outer ends of the scale, before the heavy posts.
  for (int i = 1; i <= 4; i++) {
    float at = (4.0 + float(i) * 0.2) * division;
    float hash = min(reticleSegment(q, vec2(at, 0.0), vec2(at, 0.006)),
                     reticleSegment(q, vec2(0.0, at), vec2(0.006, at)));
    ink = max(ink, reticleStroke(hash, 0.0023, aa));
  }
  return max(ink, reticleStroke(axis, 0.009, aa) * smoothstep(0.318, 0.332, reach));
}
`,
  'prism-chevron': `
float scopeReticle(vec2 p, float aa) {
  // The apex sits on the aiming point; the arms open downward.
  float ink = reticleStroke(reticleSegment(p, vec2(0.0), vec2(-0.034, -0.042)), 0.0048, aa);
  ink = max(ink, reticleStroke(reticleSegment(p, vec2(0.0), vec2(0.034, -0.042)), 0.0048, aa));
  ink = max(ink, reticleStroke(reticleSegment(p, vec2(0.0, -0.065), vec2(0.0, -0.3)), 0.0026, aa));
  for (int i = 0; i < 4; i++) {
    float y = -0.095 - float(i) * 0.045, w = 0.026 - float(i) * 0.0045;
    ink = max(ink, reticleStroke(reticleSegment(p, vec2(-w, y), vec2(w, y)), 0.0026, aa));
  }
  for (int s = 0; s < 2; s++) {
    float side = s == 0 ? 1.0 : -1.0;
    ink = max(ink, reticleStroke(reticleSegment(p, vec2(side * 0.14, 0.0), vec2(side * 0.5, 0.0)), 0.0022, aa));
  }
  return ink;
}
`,
};

/** Fragment-shader declarations defining `float scopeReticle(vec2 p, float aa)`. */
export const scopeReticleGlsl = (reticle: ScopeReticle) => HELPERS + PATTERNS[reticle];
