import { useSyncExternalStore } from 'react';
import { worldDetail, type WorldDetail } from './environment-quality';
import type { SunRayQuality } from './sun-rays';
import type { EnvironmentSettings } from './world-events';

/**
 * Rendering costs a player can trade away on a weak device, kept apart from the
 * world conditions. Sun shadows on/off, ambient occlusion and reduced effects
 * predate this and stay in the environment settings, where the atmosphere reads
 * them; the presets here set both stores. Saved per browser, so a phone and a
 * desktop keep their own choices.
 */
export type RenderScale = 1 | .85 | .7 | .5;
export type FrameCap = 0 | 60 | 30;
export type ShadowDetail = 'ultra' | 'high' | 'low';
export interface GraphicsSettings {
  /** Share of the view's usual drawing-buffer resolution. */
  scale: RenderScale;
  /** Frames per second at most; 0 follows the display. */
  frameCap: FrameCap;
  shadowDetail: ShadowDetail;
  rainDetail: WorldDetail;
  grassDetail: WorldDetail;
  waterDetail: WorldDetail;
  /** Reflections of visible scenery on exposed wet pavement. */
  rainReflections: boolean;
  waterReflections: boolean;
  /** Sun flare, haze dust and raindrops on the lens. */
  lensEffects: boolean;
  /** Subtle glow around bright world lights, before the weapon and reticle draw. */
  bloom: boolean;
  /** Screen-space sunlight shafts, using the world depth buffer. */
  godRays: SunRayQuality;
  /**
   * Live scenery captured into reflex and scope glass: a second render of the
   * world every frame. Off, the glass keeps its coating and catches sun and sky
   * highlights from its clearcoat. Only the Ultra preset turns it on.
   */
  sightReflections: boolean;
  /** Multisampling. The canvas is made with it, so a change waits for the next game. */
  antialias: boolean;
}

export const RENDER_SCALES: readonly { value: RenderScale; name: string }[] = [
  { value: 1, name: '100% · Full' }, { value: .85, name: '85%' }, { value: .7, name: '70%' }, { value: .5, name: '50% · Blurry, fastest' },
];
export const FRAME_CAPS: readonly { value: FrameCap; name: string }[] = [
  { value: 0, name: 'Match display' }, { value: 60, name: '60 fps' }, { value: 30, name: '30 fps · Saves battery' },
];
export const DEFAULT_GRAPHICS: Readonly<GraphicsSettings> = { scale: 1, frameCap: 0, shadowDetail: 'high', rainDetail: 'high', grassDetail: 'high', waterDetail: 'high', rainReflections: false, waterReflections: false, lensEffects: true, bloom: true, godRays: 'low', sightReflections: false, antialias: true };
/** Shadow texture size for each detail level. */
export const SHADOW_MAP_SIZE: Readonly<Record<ShadowDetail, number>> = { ultra: 4096, high: 2048, low: 1024 };

export function sanitizeGraphics(value: unknown): GraphicsSettings {
  const v = value && typeof value === 'object' ? value as Partial<GraphicsSettings> : {};
  const scale = RENDER_SCALES.some(s => s.value === v.scale) ? v.scale! : DEFAULT_GRAPHICS.scale;
  // Upgrade saved full-detail presets while keeping older performance presets light.
  const fullDetail = scale === 1 && v.shadowDetail !== 'low' && v.lensEffects !== false;
  const legacyUltra = v.bloom === undefined && fullDetail && v.sightReflections === true && (v.frameCap ?? 0) === 0 && v.antialias !== false;
  const detail = v.shadowDetail === 'ultra' || legacyUltra ? 'ultra' : fullDetail ? 'high' : 'low';
  return {
    waterDetail: worldDetail(v.waterDetail,detail),
    rainDetail: worldDetail(v.rainDetail, detail), grassDetail: worldDetail(v.grassDetail, detail),
    waterReflections: typeof v.waterReflections === 'boolean' ? v.waterReflections : detail === 'ultra',
    rainReflections: typeof v.rainReflections === 'boolean' ? v.rainReflections : detail === 'ultra',
    scale,
    frameCap: FRAME_CAPS.some(c => c.value === v.frameCap) ? v.frameCap! : DEFAULT_GRAPHICS.frameCap,
    shadowDetail: v.shadowDetail === 'ultra' || legacyUltra ? 'ultra' : v.shadowDetail === 'low' ? 'low' : 'high',
    godRays: v.godRays === 'off' || v.godRays === 'low' || v.godRays === 'high' ? v.godRays : detail === 'ultra' ? 'high' : fullDetail ? 'low' : 'off',
    bloom: typeof v.bloom === 'boolean' ? v.bloom : fullDetail,
    // A setting saved as `reflections` (on by default) is dropped, so live capture is off until chosen again.
    lensEffects: v.lensEffects !== false, sightReflections: v.sightReflections === true, antialias: v.antialias !== false,
  };
}

/** Pixel ratio for a view that would otherwise use `min(devicePixelRatio, cap)`. */
export function renderPixelRatio(cap: number, settings: Pick<GraphicsSettings, 'scale'> = getGraphicsSettings(), deviceRatio = typeof devicePixelRatio === 'number' ? devicePixelRatio : 1) {
  return Math.min(deviceRatio || 1, cap) * settings.scale;
}

type PresetValues = GraphicsSettings & Pick<EnvironmentSettings, 'shadows' | 'occlusion' | 'reducedEffects'>;
export const GRAPHICS_PRESETS: readonly { id: string; name: string; description: string; values: PresetValues }[] = [
  { id: 'ultra', name: 'Ultra', description: 'Longest detail range + wet-ground reflections', values: { ...DEFAULT_GRAPHICS, godRays: 'high', shadowDetail: 'ultra', rainDetail: 'ultra', grassDetail: 'ultra', waterDetail: 'ultra', rainReflections: true, waterReflections: true, sightReflections: true, shadows: true, occlusion: true, reducedEffects: false } },
  { id: 'high', name: 'High', description: 'Dense grass, distant rain + sunlight shafts', values: { ...DEFAULT_GRAPHICS, shadows: true, occlusion: true, reducedEffects: false } },
  { id: 'balanced', name: 'Balanced', description: 'Lighter shadows, no AO', values: { scale: .85, frameCap: 60, shadowDetail: 'low', rainDetail: 'low', grassDetail: 'low', waterDetail: 'low', rainReflections: false, waterReflections: false, lensEffects: true, bloom: false, godRays: 'off', sightReflections: false, antialias: true, shadows: true, occlusion: false, reducedEffects: false } },
  { id: 'low', name: 'Low', description: 'For older phones', values: { scale: .7, frameCap: 60, shadowDetail: 'low', rainDetail: 'low', grassDetail: 'low', waterDetail: 'low', rainReflections: false, waterReflections: false, lensEffects: false, bloom: false, godRays: 'off', sightReflections: false, antialias: false, shadows: false, occlusion: false, reducedEffects: true } },
  { id: 'battery', name: 'Battery saver', description: 'Low, 50%, 30 fps', values: { scale: .5, frameCap: 30, shadowDetail: 'low', rainDetail: 'low', grassDetail: 'low', waterDetail: 'low', rainReflections: false, waterReflections: false, lensEffects: false, bloom: false, godRays: 'off', sightReflections: false, antialias: false, shadows: false, occlusion: false, reducedEffects: true } },
];
/** The preset the current choices amount to, or undefined when they are a custom mix. */
export function matchingPreset(graphics: GraphicsSettings, environment: Pick<EnvironmentSettings, 'shadows' | 'occlusion' | 'reducedEffects'>) {
  const now: Record<string, unknown> = { ...graphics, shadows: environment.shadows, occlusion: environment.occlusion, reducedEffects: environment.reducedEffects };
  return GRAPHICS_PRESETS.find(p => Object.entries(p.values).every(([key, value]) =>
    // Shadow detail does not matter while shadows are off.
    (key === 'shadowDetail' && !p.values.shadows) || now[key] === value))?.id;
}

/**
 * Decides, per animation frame, whether to draw under a frame cap. Lets a frame
 * through up to 1.5 ms early, so display jitter does not halve the rate.
 */
export function createFrameLimiter() {
  let due = -Infinity;
  return (now: number, fps: number) => {
    if (!fps) { due = -Infinity; return true; }
    if (now < due - 1.5) return false;
    const interval = 1000 / fps;
    // Keep the cadence, unless a frame or more was missed: then restart it from now.
    due = due + interval < now ? now + interval : due + interval;
    return true;
  };
}

const KEY = 'blockplay-sg-graphics-v1';
let current: GraphicsSettings | undefined;
const listeners = new Set<() => void>();
export function getGraphicsSettings(): GraphicsSettings {
  if (!current) {
    try { current = sanitizeGraphics(JSON.parse(localStorage.getItem(KEY) ?? 'null')); }
    catch { current = { ...DEFAULT_GRAPHICS }; }
  }
  return current;
}
export function setGraphicsSettings(patch: Partial<GraphicsSettings>) {
  current = sanitizeGraphics({ ...getGraphicsSettings(), ...patch });
  try { localStorage.setItem(KEY, JSON.stringify(current)); } catch { /* Play works without storage. */ }
  listeners.forEach(listener => listener());
}
export function subscribeGraphics(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
export const useGraphicsSettings = () => useSyncExternalStore(subscribeGraphics, getGraphicsSettings, getGraphicsSettings);
