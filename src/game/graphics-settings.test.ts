import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFrameLimiter, DEFAULT_GRAPHICS, GRAPHICS_PRESETS, matchingPreset, renderPixelRatio, sanitizeGraphics, SHADOW_MAP_SIZE } from './graphics-settings';
import { fpsPixelRatio } from './fps-surface';
import { DEFAULT_ENVIRONMENT } from './world-events';

describe('graphics settings', () => {
  it('falls back to the defaults for anything unknown', () => {
    expect(sanitizeGraphics(null)).toEqual(DEFAULT_GRAPHICS);
    expect(sanitizeGraphics({ scale: .3, frameCap: 45, shadowDetail: 'unknown', lensEffects: 'no' })).toEqual(DEFAULT_GRAPHICS);
    expect(sanitizeGraphics({ scale: .5, frameCap: 30, shadowDetail: 'low', lensEffects: false, sightReflections: true, antialias: false }))
      .toEqual({ pixelDensity: 1.35, smaa: false, rainDetail: 'low', grassDetail: 'low', waterDetail: 'low', rainReflections: false, waterReflections: false, scale: .5, frameCap: 30, shadowDetail: 'low', lensEffects: false, bloom: false, godRays: 'off', sightReflections: true, antialias: false });
  });

  it('adds bloom to full-detail presets and doubles Ultra shadow resolution', () => {
    expect(GRAPHICS_PRESETS.filter(p => p.values.bloom).map(p => p.id)).toEqual(['ultra', 'high']);
    expect(SHADOW_MAP_SIZE.ultra).toBe(SHADOW_MAP_SIZE.high * 2);
    expect(sanitizeGraphics({ sightReflections: true }).shadowDetail).toBe('ultra');
    expect(sanitizeGraphics({ scale: .85, shadowDetail: 'low' }).bloom).toBe(false);
    expect(sanitizeGraphics({ bloom: false, shadowDetail: 'high', sightReflections: true })).toMatchObject({ bloom: false, shadowDetail: 'high' });
    const oldUltra = { ...DEFAULT_GRAPHICS, pixelDensity: undefined, smaa: undefined, godRays: undefined, bloom: undefined, sightReflections: true, rainDetail: undefined, grassDetail: undefined, waterDetail: undefined, rainReflections: undefined, waterReflections: undefined };
    expect(matchingPreset(sanitizeGraphics(oldUltra), DEFAULT_ENVIRONMENT)).toBe('ultra');
  });

  it('turns live sight reflections off for settings saved before they became Ultra-only', () => {
    expect(DEFAULT_GRAPHICS.sightReflections).toBe(false);
    expect(sanitizeGraphics({ scale: .85, reflections: true }).sightReflections).toBe(false);
    const on = GRAPHICS_PRESETS.filter(p => p.values.sightReflections).map(p => p.id);
    expect(on).toEqual(['ultra']);
    // A High player with the old setting saved still reads as High.
    expect(matchingPreset(sanitizeGraphics({ ...DEFAULT_GRAPHICS, reflections: true }), DEFAULT_ENVIRONMENT)).toBe('high');
  });

  it('upgrades saved detail presets and preserves explicit weather/grass overrides', () => {
    expect(sanitizeGraphics({ shadowDetail: 'ultra', bloom: true })).toMatchObject({ rainDetail: 'ultra', grassDetail: 'ultra', rainReflections: true, waterReflections: true });
    expect(sanitizeGraphics({ shadowDetail: 'high' })).toMatchObject({ rainDetail: 'high', grassDetail: 'high', rainReflections: false });
    expect(sanitizeGraphics({ shadowDetail: 'ultra', rainDetail: 'low', grassDetail: 'high', rainReflections: false })).toMatchObject({ rainDetail: 'low', grassDetail: 'high', rainReflections: false });
    expect(GRAPHICS_PRESETS.filter(p=>p.values.waterReflections).map(p=>p.id)).toEqual(['ultra']);
    expect(sanitizeGraphics({shadowDetail:'ultra',waterReflections:false}).waterReflections).toBe(false);
    expect(GRAPHICS_PRESETS.filter(p=>p.values.rainReflections).map(p=>p.id)).toEqual(['ultra']);
  });

  it('migrates density and smoothing by preset while preserving explicit choices', () => {
    expect(sanitizeGraphics({ shadowDetail: 'ultra' })).toMatchObject({ pixelDensity: 2, smaa: true });
    expect(sanitizeGraphics({ shadowDetail: 'high' })).toMatchObject({ pixelDensity: 1.5, smaa: false });
    expect(sanitizeGraphics({ scale: .85 })).toMatchObject({ pixelDensity: 1.35, smaa: false });
    expect(sanitizeGraphics({ shadowDetail: 'ultra', pixelDensity: 1, smaa: false })).toMatchObject({ pixelDensity: 1, smaa: false });
    expect(sanitizeGraphics({ pixelDensity: 8, smaa: 'yes' })).toEqual(DEFAULT_GRAPHICS);
  });

  it('caps first-person density at the screen density and applies render scale once', () => {
    expect(fpsPixelRatio({ pixelDensity: 2, scale: 1 }, 1)).toBe(1);
    expect(fpsPixelRatio({ pixelDensity: 2, scale: 1 }, 3)).toBe(2);
    expect(fpsPixelRatio({ pixelDensity: 1.5, scale: .7 }, 2)).toBeCloseTo(1.05);
  });

  it('scales the view’s own resolution cap', () => {
    expect(renderPixelRatio(1.35, { scale: 1 }, 3)).toBe(1.35);
    expect(renderPixelRatio(1.35, { scale: .5 }, 3)).toBeCloseTo(.675);
    expect(renderPixelRatio(1.35, { scale: .7 }, 1)).toBeCloseTo(.7);
  });

  it('starts on the High preset and recognises each preset, but not a custom mix', () => {
    expect(matchingPreset(DEFAULT_GRAPHICS, DEFAULT_ENVIRONMENT)).toBe('high');
    for (const preset of GRAPHICS_PRESETS) {
      const { shadows, occlusion, reducedEffects, ...graphics } = preset.values;
      expect(matchingPreset(graphics, { shadows, occlusion, reducedEffects })).toBe(preset.id);
    }
    expect(matchingPreset({ ...DEFAULT_GRAPHICS, lensEffects: false }, DEFAULT_ENVIRONMENT)).toBeUndefined();
    // Shadow detail is moot with shadows off.
    const low = GRAPHICS_PRESETS.find(p => p.id === 'low')!.values;
    expect(matchingPreset({ ...low, shadowDetail: 'high' }, low)).toBe('low');
  });
});

describe('frame limiter', () => {
  const run = (fps: number, hz: number, ms: number) => {
    const ready = createFrameLimiter(); let drawn = 0;
    for (let i = 0; i < ms * hz / 1000; i++) { const t = i * 1000 / hz; if (ready(t + Math.sin(i * 12.9898) * .6, fps)) drawn++; }
    return drawn;
  };
  it('lets every frame through without a cap', () => { expect(run(0, 120, 1000)).toBe(120); });
  it('holds the cap on faster displays, despite jitter', () => {
    expect(run(30, 60, 1000)).toBeGreaterThanOrEqual(29); expect(run(30, 60, 1000)).toBeLessThanOrEqual(31);
    expect(run(60, 120, 1000)).toBeGreaterThanOrEqual(59); expect(run(60, 120, 1000)).toBeLessThanOrEqual(61);
    expect(run(30, 120, 1000)).toBeLessThanOrEqual(31);
  });
  it('does not slow a display already under the cap', () => { expect(run(60, 60, 1000)).toBe(60); });
});

describe('graphics storage', () => {
  let saved: Map<string, string>;
  beforeEach(() => {
    vi.resetModules(); saved = new Map();
    vi.stubGlobal('localStorage', { getItem: (key: string) => saved.get(key) ?? null, setItem: (key: string, value: string) => saved.set(key, value) });
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('keeps choices after reloading and tells subscribers', async () => {
    const settings = await import('./graphics-settings');
    const listener = vi.fn();
    settings.subscribeGraphics(listener);
    settings.setGraphicsSettings({ scale: .7, frameCap: 30, pixelDensity: 2, smaa: true });
    expect(listener).toHaveBeenCalledTimes(1);
    vi.resetModules();
    expect((await import('./graphics-settings')).getGraphicsSettings()).toMatchObject({ scale: .7, frameCap: 30, lensEffects: true, pixelDensity: 2, smaa: true });
  });
});
