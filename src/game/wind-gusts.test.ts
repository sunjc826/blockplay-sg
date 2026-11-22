import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { GUST_SPEED, gustFactor, gustSheet, gustWave } from './wind-gusts';
import { createRainEffects, LAMP_RAIN } from './rain-effects';
import { rainRefraction } from './fps-lens';

describe('gust fronts', () => {
  it('stays in range, averages to the weather wind and travels downwind at the fronts\' speed', () => {
    let sum = 0, low = 1, high = 0;
    for (let i = 0; i < 4000; i++) {
      const wave = gustWave(i * 3.7 % 500, i * 1.3 % 300, i * .37);
      low = Math.min(low, wave); high = Math.max(high, wave); sum += gustFactor(wave);
      expect(Math.abs(gustSheet(i * 2.1, i * .7, i * .2))).toBeLessThanOrEqual(1);
    }
    expect(low).toBeGreaterThanOrEqual(0); expect(high).toBeLessThanOrEqual(1);
    expect(low).toBeLessThan(.05); expect(high).toBeGreaterThan(.95);
    expect(sum / 4000).toBeGreaterThan(.85); expect(sum / 4000).toBeLessThan(1.15);
    expect(gustFactor(0)).toBeCloseTo(.45); expect(gustFactor(1)).toBeCloseTo(2.21);
    // The slow term drifts with time alone, so one second on is close, not identical.
    expect(gustWave(40 + .984 * GUST_SPEED, 10 + .177 * GUST_SPEED, 6)).toBeCloseTo(gustWave(40, 10, 5), 1);
  });
});

describe('rain in gusts', () => {
  const lean = (effects: ReturnType<typeof createRainEffects>) => {
    const p = effects.streaks.geometry.attributes.position, g = effects.streaks.geometry.attributes.rainGust;
    let slope = 0, alpha = 0, n = 0;
    for (let i = 0; i < effects.streaks.geometry.drawRange.count; i += 2) {
      // Near the origin only: a front is some 140 m from crest to crest.
      const fall = p.getY(i) - p.getY(i + 1); if (fall < .3 || Math.hypot(p.getX(i), p.getZ(i)) > 10) continue;
      slope += (p.getX(i + 1) - p.getX(i)) / fall; alpha += g.getX(i); n++;
    }
    return { slope: slope / n, alpha: alpha / n };
  };
  // Two moments 1 m apart in a storm: a lull and the height of a gust over the origin.
  const times = Array.from({ length: 400 }, (_, i) => i * .1), at = (t: number) => gustWave(0, 0, t);
  const lull = times.reduce((a, b) => at(a) < at(b) ? a : b), peak = times.reduce((a, b) => at(a) > at(b) ? a : b);

  it('slants, thickens and throws spray as a front passes, and falls thin and straighter in the lull', () => {
    const effects = createRainEffects(new THREE.Scene(), () => 0), eye = new THREE.Vector3(0, 1.7, 0);
    effects.update(.016, eye, 1, 6, false, 'high', lull); const quiet = lean(effects), quietSpray = effects.spray.geometry.attributes.spray.getY(0);
    for (let i = 0; i < 30; i++) effects.update(.016, eye, 1, 6, false, 'high', peak);
    const blown = lean(effects);
    expect(effects.sprayCount).toBe(240); expect(effects.spray.visible).toBe(true);
    expect(blown.slope).toBeGreaterThan(quiet.slope * 2.5); expect(blown.slope).toBeGreaterThan(.4);
    expect(blown.alpha).toBeGreaterThan(quiet.alpha * 1.6);
    let spray = 0; const look = effects.spray.geometry.attributes.spray;
    for (let i = 0; i < effects.sprayCount; i++) spray = Math.max(spray, look.getY(i));
    expect(spray).toBeGreaterThan(quietSpray * 3); expect(spray).toBeLessThan(.13);
    effects.dispose();
  });
  it('keeps a steady fall with no spray under reduced effects, on low detail and in still air', () => {
    const effects = createRainEffects(new THREE.Scene(), () => 0), eye = new THREE.Vector3(0, 1.7, 0), g = effects.streaks.geometry.attributes.rainGust;
    effects.update(.016, eye, 1, 6, true, 'ultra', peak); expect(effects.sprayCount).toBe(0); expect(g.getX(0)).toBeLessThanOrEqual(1); expect(g.getX(0)).toBeGreaterThan(.54);
    effects.update(.016, eye, 1, 6, false, 'low', peak); expect(effects.sprayCount).toBe(0);
    effects.update(.016, eye, 1, 0, false, 'ultra', peak); expect(effects.sprayCount).toBe(0); expect(g.getX(0)).toBeLessThanOrEqual(1); expect(g.getX(0)).toBeGreaterThan(.54); expect(effects.spray.visible).toBe(false);
    effects.dispose();
  });
  it('never draws spray under the surface it blows across', () => {
    const roof = (x: number) => x > 5 ? 6 : 0, effects = createRainEffects(new THREE.Scene(), roof), eye = new THREE.Vector3(0, 1.7, 0);
    for (let i = 0; i < 240; i++) effects.update(.033, eye, 1, 7, false, 'ultra', peak + i * .033);
    const p = effects.spray.geometry.attributes.position, look = effects.spray.geometry.attributes.spray;
    for (let i = 0; i < effects.sprayCount; i++) if (look.getY(i) > 0) expect(p.getY(i)).toBeGreaterThan(roof(p.getX(i)) - .3);
    effects.dispose();
  });
});

describe('rain bending the view', () => {
  it('follows the rain, strengthens in a gust, eases under a roof and fades looking along the fall', () => {
    expect(rainRefraction(0, 5, false, 0)).toBe(0);
    expect(rainRefraction(.85, 6, false, 0)).toBeGreaterThan(rainRefraction(.85, 1, false, 0));
    expect(rainRefraction(.85, 3, true, 0)).toBeLessThan(rainRefraction(.85, 3, false, 0) * .5);
    expect(rainRefraction(1, 7, false, 1)).toBe(0); expect(rainRefraction(1, 15, false, 0)).toBe(1);
  });
});

describe('rain under street lamps', () => {
  const lamps = () => ({ map: new THREE.DataTexture(new Uint8Array(4), 1, 1), bounds: new THREE.Vector4(-50, -50, .01, .01), light: new THREE.Color(.8, .7, .5),
    heads: new Float32Array([4, 7.4, 3, 7.4, 300, 7.4, 0, 7.4]) });
  it('fills the cone under a lit lamp nearby and nothing above its head or by day', () => {
    const effects = createRainEffects(new THREE.Scene(), () => 0), eye = new THREE.Vector3(0, 1.7, 0), light = lamps();
    effects.setLight(.14, light); effects.update(.016, eye, 1, 3, false, 'high', 12);
    const p = effects.cones.geometry.attributes.position, c = effects.cones.geometry.attributes.color, count = effects.cones.geometry.drawRange.count;
    expect(effects.cones.visible).toBe(true); expect(count).toBe(LAMP_RAIN.streaks * 2);
    let lit = 0;
    for (let i = 0; i < count; i += 2) {
      expect(p.getY(i + 1)).toBeGreaterThanOrEqual(-1e-4);
      if (c.getX(i) > 0) { lit++; expect(p.getY(i)).toBeLessThan(7.4); expect(Math.hypot(p.getX(i) - 4, p.getZ(i) - 3)).toBeLessThan(.5 + (7.4 - p.getY(i)) * LAMP_RAIN.spread); }
    }
    expect(lit).toBeGreaterThan(15);
    light.light.setRGB(0, 0, 0); effects.update(.016, eye, 1, 3, false, 'high', 12.1); expect(effects.cones.visible).toBe(false);
    light.light.setRGB(.8, .7, .5); effects.update(.016, eye, 1, 3, false, 'low', 12.2); expect(effects.cones.visible).toBe(false);
    effects.setLight(1, null); effects.update(.016, eye, 1, 3, false, 'high', 12.3); expect(effects.cones.visible).toBe(false);
    effects.dispose();
  });
});

describe('one fall of rain, near to far', () => {
  it('thins steadily with distance, with no step where near rain used to end, and stretches and speeds up far off', () => {
    const effects = createRainEffects(new THREE.Scene(), () => 0), eye = new THREE.Vector3(0, 1.7, 0);
    effects.update(0, eye, 1, 0, false, 'ultra');
    const p = effects.streaks.geometry.attributes.position, rings = new Array(13).fill(0), length = [0, 0], seen = [0, 0];
    const before = Array.from({ length: 12000 }, (_, i) => p.getY(i * 2));
    for (let i = 0; i < 12000; i++) {
      const far = Math.hypot(p.getX(i * 2), p.getZ(i * 2)); rings[Math.min(12, Math.floor(far / 10))]++;
      const tail = p.getY(i * 2) - p.getY(i * 2 + 1), band = far < 10 ? 0 : far > 70 ? 1 : -1;
      if (band >= 0 && tail > .5) { length[band] += tail; seen[band]++; }
    }
    // Drops per square metre in each 10 m ring falls every ring, and never by more than three fifths from one to the next past the first.
    const density = rings.slice(0, 13).map((n, k) => n / (Math.PI * 100 * (2 * k + 1)));
    for (let k = 1; k < 13; k++) { expect(density[k]).toBeLessThan(density[k - 1]); if (k > 1) expect(density[k]).toBeGreaterThan(density[k - 1] * .4); }
    expect(rings[0]).toBeGreaterThan(2000); expect(rings.slice(7).reduce((a, b) => a + b)).toBeGreaterThan(2000);
    expect(length[1] / seen[1]).toBeGreaterThan(length[0] / seen[0] * 4);
    effects.update(.02, eye, 1, 0, false, 'ultra');
    const fell = [0, 0], count = [0, 0];
    for (let i = 0; i < 12000; i++) {
      const far = Math.hypot(p.getX(i * 2), p.getZ(i * 2)), drop = before[i] - p.getY(i * 2), band = far < 10 ? 0 : far > 70 ? 1 : -1;
      if (band >= 0 && drop > 0 && drop < 5) { fell[band] += drop; count[band]++; }
    }
    expect(fell[1] / count[1]).toBeGreaterThan(fell[0] / count[0] * 2.2);
    effects.dispose();
  });
});
