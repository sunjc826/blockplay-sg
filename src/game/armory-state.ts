import { ARMORY_CATALOG, CONSUMABLE_LIMIT, issuedItems, itemById, type AttachmentSlot, type FittedPart, type InternalPart, type ShopItem } from './armory-catalog';
import type { VehicleKind } from './vehicle-rules';
import { progression, levelSkip, xpForLevel, ELIMINATION_XP, MAX_LEVEL } from './progression';
import { DEFAULT_RANK_SET, isRankSet, rankInsignia } from './rank-insignia';
import { DEFAULT_ENCIK_TONE, type EncikAddress, type EncikTone } from './encik-registers';
import { FPS_WEAPONS, type WeaponSpec, type WeaponTrait } from './fps-rules';
/** Hardware a variant already carries, by the slot it permanently fills. */
export const fittedParts = (variantId: string): Partial<Record<AttachmentSlot, FittedPart>> =>
  Object.fromEntries((itemById(variantId)?.fitted ?? []).map(part => [part.slot, part]));
export const slotIsFitted = (variantId: string, slot: AttachmentSlot) => !!fittedParts(variantId)[slot];
/** attachments is retained empty for v1 save compatibility; it never affects gameplay. */
export interface GunEquipment { variant: string; skin: string; attachments: Partial<Record<AttachmentSlot, string>> }
export interface ArmoryProfile { version: 1; xp: number; vehicleSkins: Record<VehicleKind, string>; credits: number; tokens: number; owned: string[]; guns: [GunEquipment, GunEquipment]; rig: string; plate: string; rewarded: string[]; exercises: number;
  /** Supplies held, by catalog id, and which one the quick-use key spends. */
  consumables: Record<string, number>; quickItem: string;
  /** Which set of rank titles and badges the profile wears. */
  rankSet: string;
  /** Whether the Encik's tone follows your rank, or stays the way he greets a recruit. */
  encikTone: EncikTone }
export const STORAGE_KEY = 'blockplay.armory.v1';
export function createProfile(): ArmoryProfile { return { version: 1, xp: 0, vehicleSkins: { car: 'paint-issued', helicopter: 'paint-issued' }, credits: 1600, tokens: 300, owned: [...issuedItems], guns: [{ variant: 'sar-issued', skin: 'skin-issued', attachments: {} }, { variant: 'ult-issued', skin: 'skin-issued', attachments: {} }], rig: 'rig-ilbv', plate: 'plate-none', rewarded: [], exercises: 0, consumables: {}, quickItem: '', rankSet: DEFAULT_RANK_SET, encikTone: DEFAULT_ENCIK_TONE }; }
const finiteBalance = (n: unknown, fallback: number) => typeof n === 'number' && Number.isFinite(n) ? Math.max(0, Math.min(1000000, Math.floor(n))) : fallback;
export function restoreProfile(raw: string | null): ArmoryProfile {
  const base = createProfile(); if (!raw) return base;
  try {
    const value = JSON.parse(raw); if (!value || value.version !== 1) return base;
    base.xp = finiteBalance(value.xp, 0);
    base.credits = finiteBalance(value.credits, base.credits); base.tokens = finiteBalance(value.tokens, base.tokens);
    base.owned = [...new Set([...issuedItems, ...(Array.isArray(value.owned) ? value.owned.filter((id: unknown) => typeof id === 'string' && !!itemById(id)) : [])])] as string[];
    const valid = (id: unknown, category: string) => typeof id === 'string' && base.owned.includes(id) && itemById(id)?.category === category;
    for (const i of [0, 1] as const) {
      const gun = value.guns?.[i]; if (!gun) continue;
      if (valid(gun.variant, 'weapon') && itemById(gun.variant)?.family === i) base.guns[i].variant = gun.variant;
      if (valid(gun.skin, 'skin')) base.guns[i].skin = gun.skin;
      // Modular attachments were retired; both slots keep their empty defaults.
    }
    for (const kind of ['car', 'helicopter'] as const) if (valid(value.vehicleSkins?.[kind], 'vehicleSkin')) base.vehicleSkins[kind] = value.vehicleSkins[kind];
    if (valid(value.rig, 'rig')) base.rig = value.rig;
    if (valid(value.plate, 'plate')) base.plate = value.plate;
    base.rewarded = Array.isArray(value.rewarded) ? value.rewarded.filter((id: unknown) => typeof id === 'string').slice(-100) : [];
    base.exercises = finiteBalance(value.exercises, 0);
    if (value.consumables && typeof value.consumables === 'object') for (const [id, held] of Object.entries(value.consumables)) {
      if (itemById(id)?.category !== 'consumable') continue;
      const count = typeof held === 'number' && Number.isFinite(held) ? Math.max(0, Math.min(CONSUMABLE_LIMIT, Math.floor(held))) : 0;
      if (count) base.consumables[id] = count;
    }
    if (typeof value.quickItem === 'string' && itemById(value.quickItem)?.category === 'consumable') base.quickItem = value.quickItem;
    // A set registered by code that is no longer loaded falls back to the default.
    if (isRankSet(value.rankSet)) base.rankSet = value.rankSet;
    if (value.encikTone === 'recruit' || value.encikTone === 'rank') base.encikTone = value.encikTone;
    return base;
  } catch { return base; }
}
export function purchase(profile: ArmoryProfile, id: string) {
  const item = itemById(id);
  if (!item) return { profile, message: 'Item unavailable.' };
  const supply = item.category === 'consumable';
  if (!supply && profile.owned.includes(id)) return { profile, message: 'Already owned. Equip it below.' };
  if (progression(profile.xp).level < (item.requiredLevel || 1)) return { profile, message: `Unlocks at level ${item.requiredLevel}. Earn XP in the range.` };
  if (profile[item.currency] < item.price) return { profile, message: `Not enough ${item.currency}.` };
  if (supply) {
    const held = profile.consumables[id] || 0;
    if (held >= CONSUMABLE_LIMIT) return { profile, message: `You can carry ${CONSUMABLE_LIMIT} of those.` };
    return { profile: { ...profile, [item.currency]: profile[item.currency] - item.price,
      consumables: { ...profile.consumables, [id]: held + 1 }, quickItem: profile.quickItem || id },
      message: `${item.name} added to your supplies.` };
  }
  return { profile: { ...profile, [item.currency]: profile[item.currency] - item.price, owned: [...profile.owned, id] }, message: `${item.name} unlocked permanently.` };
}

/** Street vendors sell carried supplies only and put the purchase straight in the quick slot. */
export interface VendorPurchaseResult { profile: ArmoryProfile; message: string; purchased: boolean }
export function purchaseFromVendor(profile: ArmoryProfile, id: string, price?: number): VendorPurchaseResult {
  const item = itemById(id);
  if (item?.category !== 'consumable') return { profile, message: 'That item is not sold by this vendor.', purchased: false };
  const cost = typeof price === 'number' && Number.isFinite(price) ? Math.max(1, Math.floor(price)) : item.price;
  if (progression(profile.xp).level < (item.requiredLevel || 1)) return { profile, message: `Unlocks at level ${item.requiredLevel}. Earn XP in the range.`, purchased: false };
  if (profile[item.currency] < cost) return { profile, message: `Not enough ${item.currency}.`, purchased: false };
  const held = profile.consumables[id] || 0;
  if (held >= CONSUMABLE_LIMIT) return { profile, message: `You can carry ${CONSUMABLE_LIMIT} of those.`, purchased: false };
  const next = { ...profile, [item.currency]: profile[item.currency] - cost,
    consumables: { ...profile.consumables, [id]: held + 1 }, quickItem: id };
  return { profile: next, message: `${item.name} bought for ${cost} ${item.currency === 'tokens' ? 'TK' : 'CR'} and readied.`, purchased: true };
}
/**
 * Buys the XP standing between a profile and its next level. The wallet pays
 * for exactly the gap `levelSkip` priced and the XP lands on the threshold, so
 * a bought level opens at zero progress rather than carrying a remainder
 * nobody paid for, and buying twice costs what the two gaps cost separately.
 *
 * A level still only unlocks the right to buy: the item's own price is
 * untouched, so this shortens the climb to a gate rather than opening it.
 */
export function purchaseLevel(profile: ArmoryProfile) {
  const skip = levelSkip(profile.xp);
  if (skip.atMax) return { profile, message: `Level ${MAX_LEVEL} is the ceiling.` };
  if (profile.tokens < skip.price) return { profile, message: `Not enough tokens. Level ${skip.next} costs ${skip.price}.` };
  return { profile: { ...profile, tokens: profile.tokens - skip.price, xp: xpForLevel(skip.next) },
    message: `Level ${skip.next} reached. Its equipment is purchasable now.` };
}
/**
 * Who the Encik is addressing. The rank is the *title* rather than the graded
 * label, because "Nice work, Corporal III" is not how anybody speaks, and a
 * set with no titles at all falls back to what he calls a stranger.
 */
export function encikAddress(profile: ArmoryProfile): EncikAddress {
  const level = progression(profile.xp).level;
  return { level, rank: rankInsignia(level, profile.rankSet).title, tone: profile.encikTone };
}
export function chooseEncikTone(profile: ArmoryProfile, tone: EncikTone): ArmoryProfile {
  return tone !== profile.encikTone && (tone === 'rank' || tone === 'recruit') ? { ...profile, encikTone: tone } : profile;
}
/** Rank sets are a free choice of dress, not a purchase; an unknown id is ignored. */
export function chooseRankSet(profile: ArmoryProfile, id: string): ArmoryProfile {
  return isRankSet(id) && id !== profile.rankSet ? { ...profile, rankSet: id } : profile;
}
export function equip(profile: ArmoryProfile, id: string, family: number, vehicle: VehicleKind = 'car'): ArmoryProfile {
  const item = itemById(id);
  // Supplies are held by count rather than owned, so they select on that instead.
  if (item?.category === 'consumable') return profile.consumables[id] ? { ...profile, quickItem: id } : profile;
  if (!item || !profile.owned.includes(id) || (family !== 0 && family !== 1)) return profile;
  if (item.category === 'vehicleSkin') return { ...profile, vehicleSkins: { ...profile.vehicleSkins, [vehicle]: id } };
  if (item.category === 'rig' || item.category === 'plate') return { ...profile, [item.category]: id };
  if (item.category === 'weapon' && item.family !== family) return profile;
  const gun: GunEquipment = { ...profile.guns[family], attachments: {} };
  if (item.category === 'weapon') gun.variant = id;
  if (item.category === 'skin') gun.skin = id;
  const guns: ArmoryProfile['guns'] = [...profile.guns]; guns[family] = gun; return { ...profile, guns };
}
/** Spends one of a held supply. Unknown or empty ids leave the profile untouched. */
export function consumeItem(profile: ArmoryProfile, id: string): ArmoryProfile {
  const held = profile.consumables[id] || 0;
  if (!held) return profile;
  const consumables = { ...profile.consumables };
  if (held > 1) consumables[id] = held - 1; else delete consumables[id];
  return { ...profile, consumables };
}
export function isEquipped(profile: ArmoryProfile, item: ShopItem, family: number, vehicle: VehicleKind = 'car') {
  const gun = profile.guns[family];
  if (item.category === 'consumable') return profile.quickItem === item.id;
  return item.category === 'vehicleSkin' ? profile.vehicleSkins[vehicle] === item.id : item.category === 'rig' ? profile.rig === item.id : item.category === 'plate' ? profile.plate === item.id : item.category === 'weapon' ? gun.variant === item.id : item.category === 'skin' ? gun.skin === item.id :
    false;
}
/** Fixed trait precedence: platform, variant build, then variant fittings. */
export const collectTraits = (...sources: readonly (readonly WeaponTrait[] | undefined)[]) => sources.flatMap(source => source ?? []);
/**
 * Builds a variant's figures from the platform and the hardware it is made of,
 * so a number in the shop is the sum of named parts rather than a value written
 * beside the weapon's name. Deltas add; mobility multiplies; ballistics replace.
 * Internal hardware shifts the platform's figures; fixed fittings then scale them.
 */
export function applyBuild(base: WeaponSpec, parts: readonly InternalPart[] = []): WeaponSpec {
  const spec: WeaponSpec = { ...base, traits: [...base.traits ?? []] };
  for (const part of parts) {
    spec.damage += part.damage ?? 0; spec.capacity += part.capacity ?? 0;
    spec.interval += part.interval ?? 0; spec.reload += part.reload ?? 0; spec.recoil += part.recoil ?? 0;
    spec.recoilRecovery += part.recoilRecovery ?? 0;
    spec.mobility *= part.mobility ?? 1;
    if (part.ballistics) spec.ballistics = part.ballistics;
    if (part.traits) spec.traits = [...spec.traits ?? [], ...part.traits];
  }
  return spec;
}
/** A variant as it leaves the armoury, before its fixed fittings are applied. */
export const variantSpec = (item: ShopItem) =>
  item.category === 'weapon' && item.family !== undefined ? applyBuild(FPS_WEAPONS[item.family], item.build) : null;
export interface EquippedWeapon extends WeaponSpec { equipment: GunEquipment; accent?: string; traits: readonly WeaponTrait[] }
/**
 * What a rig and its inserts cost in movement. `mobility` scales walking speed;
 * carrying weight also costs vertical reach and time to aim in, so protection is
 * a decision rather than a free 100 points.
 */
export const carriedWeight = (mobility: number) => 1 - (Number.isFinite(mobility) ? Math.max(0, Math.min(1, mobility)) : 1);
export const jumpScale = (mobility: number) => 1 - carriedWeight(mobility) * 2.2;
export const aimSpeedScale = (mobility: number) => 1 - carriedWeight(mobility) * 1.8;
export interface ResolvedLoadout { weapons: EquippedWeapon[]; armor: number; absorption: number; mobility: number; rigName: string; plateName: string; vehicleSkins: Record<VehicleKind, string>;
  quickItem?: ShopItem; quickCount: number }
export function resolveLoadout(profile: ArmoryProfile): ResolvedLoadout {
  const rig = itemById(profile.rig)!, plate = itemById(profile.plate)!;
  const weapons = profile.guns.map((gun, i) => {
    const variant = itemById(gun.variant)!;
    // Only the selected variant defines hardware. Ignore legacy/injected
    // attachment data even if a caller bypasses save restoration.
    const fittings = variant.fitted ?? [];
    const built = applyBuild(FPS_WEAPONS[i], variant.build);
    const spec: EquippedWeapon = { ...built, name: variant.name, equipment: { ...gun, attachments: {} }, accent: variant.accent,
      reserve: FPS_WEAPONS[i].reserve + (rig.carry || 0),
      traits: collectTraits(built.traits, ...fittings.map(part => part.traits)) };
    for (const part of fittings) {
      if (part.slot === 'optic' && part.stats?.optic) spec.optic = part.stats.optic;
      const mod = part.modifiers; if (!mod) continue;
      spec.capacity += mod.capacity || 0; spec.reload *= mod.reload || 1; spec.recoil *= mod.recoil || 1;
      spec.recoilRecovery *= mod.recoilRecovery || 1; spec.mobility *= mod.mobility || 1;
      if (mod.aimFov) spec.aimFov = mod.aimFov;
    }
    return spec;
  });
  const quickItem = itemById(profile.quickItem);
  return { weapons, vehicleSkins: { ...profile.vehicleSkins }, quickItem, quickCount: profile.consumables[profile.quickItem] || 0, armor: plate.protection || 0, absorption: plate.absorption || 0, mobility: (rig.mobility || 1) * (plate.mobility || 1), rigName: rig.name, plateName: plate.name };
}
/** Preview may temporarily own the selected item; it never mutates the actual wallet. */
export function previewLoadout(profile: ArmoryProfile, item: ShopItem, family: number) {
  return resolveLoadout(equip({ ...profile, owned: [...profile.owned, item.id] }, item.id, family));
}
export function applyArmorDamage(health: number, armor: number, amount: number, absorption: number) {
  const incoming = Math.max(0, amount), blocked = Math.min(Math.max(0, armor), incoming * Math.max(0, Math.min(1, absorption)));
  return { health: Math.max(0, health - (incoming - blocked)), armor: Math.max(0, armor - blocked), blocked };
}
export interface ExerciseReward { id: string; hits: number; shots: number; landed: number; elapsed: number; combat: boolean }
export function rewardAmount(result: ExerciseReward) {
  const accuracy = Math.min(1, result.landed / Math.max(1, result.shots));
  return 250 + Math.round(accuracy * 100) + Math.max(0, 100 - Math.floor(result.elapsed)) + (result.combat ? 100 : 0);
}
export function completionXp(result: ExerciseReward) { return 200 + Math.round(Math.min(1, result.landed / Math.max(1, result.shots)) * 100) + (result.combat ? 100 : 0); }
export function claimElimination(profile: ArmoryProfile, id: string): ArmoryProfile {
  if (!id || profile.rewarded.includes(id)) return profile;
  return { ...profile, xp: Math.min(1000000, profile.xp + ELIMINATION_XP), rewarded: [...profile.rewarded, id].slice(-100) };
}
export function claimReward(profile: ArmoryProfile, result: ExerciseReward): ArmoryProfile {
  if (result.hits !== 8 || result.shots < 8 || !Number.isFinite(result.shots) || !Number.isFinite(result.landed) || result.landed < 8 || result.landed > result.shots || !Number.isFinite(result.elapsed) || result.elapsed < 0 || !result.id || profile.rewarded.includes(result.id)) return profile;
  return { ...profile, xp: Math.min(1000000, profile.xp + completionXp(result)), credits: Math.min(1000000, profile.credits + rewardAmount(result)), rewarded: [...profile.rewarded, result.id].slice(-100), exercises: profile.exercises + 1 };
}
export const SHOP_CATEGORIES = [
  { id: 'weapon', label: 'Weapons' }, { id: 'skin', label: 'Skins' }, { id: 'armor', label: 'Armor' }, { id: 'food', label: 'Food' }, { id: 'utility', label: 'Utilities' }, { id: 'vehicleSkin', label: 'Vehicles' },
] as const;
export const catalogSize = ARMORY_CATALOG.length;
