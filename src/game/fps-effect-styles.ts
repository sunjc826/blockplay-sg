import { itemById } from './armory-catalog';
import type { EquippedWeapon } from './armory-state';

/**
 * What a shot looks like, as data. `fps-effects` draws whatever it is handed,
 * so changing how a weapon fires is a matter of declaring a style rather than
 * editing the renderer: a premium rifle flares in its own colour, throws its
 * own brass and draws its own tracer, and nothing in the engine knows why.
 *
 * Resolution runs base -> accent -> registered patch, so the three ways to
 * extend this get weaker as they get more specific and none of them need the
 * others:
 *
 *  1. A weapon's catalog tier picks the base style, so a new Elite variant is
 *     premium-looking the day it is added, with no code at all.
 *  2. Its `accent` — the same colour the armoury already paints its receiver —
 *     is mixed through the flare, the tracer and the sparks, so the shot
 *     matches the weapon in your hands.
 *  3. `registerEffectStyle` patches any part of it by catalog id, for a weapon
 *     or a skin that wants something the first two cannot express.
 *
 * Nothing here imports three.js: colours are strings and the numbers are plain
 * multipliers, so the whole resolution is testable without a renderer.
 */
export interface FlareStyle {
  /** The near-white heart of the flash, the petals around it and the cone down the bore. */
  core: string; star: string; cone: string;
  /** Colour of the point lights the flash throws into the viewmodel and the map. */
  light: string;
  /** Multipliers on the flare's size and on how far its light reaches. */
  size: number; reach: number;
}
export interface SparkStyle { hot: string; cold: string; streak: number }
export interface RingStyle { surface: string; target: string }
export interface BrassStyle { colour: string; metalness: number; roughness: number }
export interface TracerStyle { colour: string; opacity: number }

export interface EffectStyle {
  /** Stable, derived from the loadout that resolved it; effects tag spawns with it. */
  id: string;
  name: string;
  flare: FlareStyle;
  tracer: TracerStyle;
  spark: SparkStyle;
  ring: RingStyle;
  dust: string; dustScale: number;
  smoke: string;
  brass: BrassStyle;
  /** How much of a struck surface's own colour a scorch takes away, 0..1. */
  scorch: number;
}
/** Every field optional and one level deep, which is as deep as a style goes. */
export type EffectStylePatch = {
  name?: string;
  flare?: Partial<FlareStyle>; tracer?: Partial<TracerStyle>; spark?: Partial<SparkStyle>;
  ring?: Partial<RingStyle>; brass?: Partial<BrassStyle>;
  dust?: string; dustScale?: number; smoke?: string; scorch?: number;
};

/** Issued kit: the look every weapon had before styles existed. */
export const ISSUED_STYLE: EffectStyle = Object.freeze({
  id: 'issued', name: 'Issued',
  flare: { core: '#ffe6b4', star: '#ffd489', cone: '#ffbf6a', light: '#ffca7a', size: 1, reach: 1 },
  tracer: { colour: '#ffe8b0', opacity: .7 },
  spark: { hot: '#fff4d2', cold: '#ff5714', streak: 1 },
  ring: { surface: '#ffd7a0', target: '#fff4e2' },
  dust: '#bfb49c', dustScale: 1,
  smoke: '#8d949b',
  brass: { colour: '#c9a656', metalness: .85, roughness: .34 },
  scorch: .7,
}) as EffectStyle;

/** Field kit: cleaner powder, so a tighter and slightly whiter flash. */
const FIELD_STYLE: EffectStyle = {
  ...ISSUED_STYLE, id: 'field', name: 'Field',
  flare: { core: '#fff0cf', star: '#ffdc9c', cone: '#ffc978', light: '#ffd493', size: .94, reach: 1.05 },
  tracer: { colour: '#ffeec6', opacity: .74 },
  spark: { hot: '#fff8e2', cold: '#ff6a1e', streak: 1.05 },
  brass: { colour: '#cfae5f', metalness: .88, roughness: .3 },
};
/** Elite kit: a hotter, shorter, brighter flash that carries its accent. */
const ELITE_STYLE: EffectStyle = {
  ...ISSUED_STYLE, id: 'elite', name: 'Elite',
  flare: { core: '#fff6e4', star: '#ffe0a4', cone: '#ffcb72', light: '#ffdca2', size: 1.12, reach: 1.3 },
  tracer: { colour: '#fff1cd', opacity: .82 },
  spark: { hot: '#ffffff', cold: '#ff7a22', streak: 1.2 },
  ring: { surface: '#ffe3ba', target: '#fffaf0' },
  brass: { colour: '#d9bc74', metalness: .92, roughness: .26 },
  scorch: .74,
};
const TIERS: Record<string, EffectStyle> = { Issued: ISSUED_STYLE, Field: FIELD_STYLE, Elite: ELITE_STYLE };
/** How far each part of the shot is pulled towards the weapon's accent colour. */
const ACCENT_MIX: Record<string, number> = { star: .34, cone: .42, light: .3, core: .1, tracer: .3, sparkCold: .26 };

const byte = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
const parseHex = (hex: string): [number, number, number] | null => {
  const body = hex.trim().replace(/^#/, '');
  const full = body.length === 3 ? body.replace(/./g, c => c + c) : body;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
  const value = parseInt(full, 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
};
/**
 * Blends two colours in sRGB, which is not physically right but is what makes
 * a gold accent read as gold rather than washing out through a linear midpoint.
 * An unparseable colour returns `a`, so a bad catalog entry cannot blank a flare.
 */
export function mixHex(a: string, b: string, t: number): string {
  const from = parseHex(a), to = parseHex(b);
  if (!from || !to) return a;
  const amount = Math.max(0, Math.min(1, t));
  return '#' + from.map((channel, i) => byte(channel + (to[i] - channel) * amount).toString(16).padStart(2, '0')).join('');
}

/** Mixes a weapon's accent through the parts of a style that should carry it. */
export function tintStyle(style: EffectStyle, accent: string): EffectStyle {
  if (!parseHex(accent)) return style;
  return {
    ...style,
    flare: {
      ...style.flare,
      // The core stays near-white whatever the accent: a flash that is entirely
      // its accent colour stops reading as ignition and starts reading as a bulb.
      core: mixHex(style.flare.core, accent, ACCENT_MIX.core),
      star: mixHex(style.flare.star, accent, ACCENT_MIX.star),
      cone: mixHex(style.flare.cone, accent, ACCENT_MIX.cone),
      light: mixHex(style.flare.light, accent, ACCENT_MIX.light),
    },
    tracer: { ...style.tracer, colour: mixHex(style.tracer.colour, accent, ACCENT_MIX.tracer) },
    spark: { ...style.spark, cold: mixHex(style.spark.cold, accent, ACCENT_MIX.sparkCold) },
  };
}

/** Lays a patch over a style, one level deep; anything the patch omits is kept. */
export function patchStyle(style: EffectStyle, patch?: EffectStylePatch): EffectStyle {
  if (!patch) return style;
  return {
    ...style, ...(patch.name ? { name: patch.name } : {}),
    flare: { ...style.flare, ...patch.flare },
    tracer: { ...style.tracer, ...patch.tracer },
    spark: { ...style.spark, ...patch.spark },
    ring: { ...style.ring, ...patch.ring },
    brass: { ...style.brass, ...patch.brass },
    dust: patch.dust ?? style.dust, dustScale: patch.dustScale ?? style.dustScale,
    smoke: patch.smoke ?? style.smoke, scorch: patch.scorch ?? style.scorch,
  };
}

const registry = new Map<string, EffectStylePatch>();
/**
 * Registers a patch against a catalog id — a weapon variant or a skin. It is
 * laid over whatever the tier and accent resolved, so a caller that only wants
 * a different tracer says only that.
 */
export function registerEffectStyle(id: string, patch: EffectStylePatch) { registry.set(id, patch); }
export function unregisterEffectStyle(id: string) { registry.delete(id); }
export function registeredEffectStyles(): string[] { return [...registry.keys()]; }

export interface EffectStyleRequest { variant?: string; skin?: string; accent?: string }
/**
 * Resolves the look of one weapon's shots. The `id` is derived from the request
 * rather than invented, so two calls for the same loadout agree and the
 * renderer can tag brass and scorches with it and still find the style that
 * made them once the player has switched weapons.
 */
export function resolveEffectStyle(request: EffectStyleRequest): EffectStyle {
  const variant = request.variant ?? '', skin = request.skin ?? '';
  const base = TIERS[itemById(variant)?.tier ?? ''] ?? ISSUED_STYLE;
  const accent = request.accent ?? itemById(variant)?.accent;
  let style = accent ? tintStyle(base, accent) : base;
  // A skin is bought for how it looks, so it has the last word over the weapon.
  style = patchStyle(patchStyle(style, registry.get(variant)), registry.get(skin));
  return { ...style, id: [base.id, variant, skin].filter(Boolean).join(':') };
}
/** The style for a resolved loadout entry, which is what the engine holds. */
export const effectStyleForWeapon = (weapon?: Pick<EquippedWeapon, 'equipment' | 'accent'>): EffectStyle =>
  resolveEffectStyle({ variant: weapon?.equipment.variant, skin: weapon?.equipment.skin, accent: weapon?.accent });
