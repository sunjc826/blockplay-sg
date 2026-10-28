import { CONSUMABLE_LIMIT, itemById, type ItemTier, type ShopItem } from './armory-catalog';
import { calibreOf, weaponCalibre, type FieldLoot } from './expedition-loot';
import { supplyProfile } from './fps-healing';
import { FPS_WEAPONS, type WeaponSpec } from './fps-rules';
import { utilityKind, utilitySlot } from './utility-belt';
import { FOOD_EFFECTS } from './food-effects';

/**
 * Loot is read the way a player reads a room: things on the floor say nothing
 * until you are close enough to reach them and are looking at one. Only then
 * does its card come up, and E takes that item rather than whichever happens
 * to be nearest.
 */

/** How far a hand reaches from the feet, and how far above or below them. `ExpeditionLoot.collect` holds the same. */
export const LOOT_REACH = 2.8;
export const LOOT_STEP = 1.2;
/** The point on an item the eye goes to, above where it rests. */
const LOOT_CENTRE = .25;
/** About how big an item is, for how wide it looks at a distance. */
const ITEM_RADIUS = .45;
/** Slack round an item's own size, so a glance finds it but a look past it does not. */
const LOOK_MARGIN = 7 * Math.PI / 180;
const LOOK_LIMIT = 36 * Math.PI / 180;

export interface Vec3 { x: number; y: number; z: number }

/** Each tier's colour, shared by the card and the ring drawn round a looked-at item. */
export const LOOT_TIER_COLORS: Readonly<Record<ItemTier, string>> = {
  Issued: '#b8c9b2', Field: '#71b8d0', Elite: '#e5bb55', Ultra: '#b48cf0', Legendary: '#f09a4c', Mythic: '#ef6b6b',
};

/** The widest angle off the view that still counts as looking at an item this far from the eye. */
export const lookLimit = (distance: number) => Math.min(LOOK_LIMIT, Math.atan2(ITEM_RADIUS, Math.max(.05, distance)) + LOOK_MARGIN);

/** Inside reach of the feet, on the same level: what `collect` would allow. */
export const withinReach = (item: FieldLoot, feet: Vec3) => {
  const y = item.y ?? 0;
  return Math.abs(y - feet.y) <= LOOT_STEP && Math.hypot(item.x - feet.x, y - feet.y, item.z - feet.z) <= LOOT_REACH;
};

/**
 * The item being looked at: in reach, and inside a cone round the view that
 * widens as the item comes closer. The one nearest the crosshair, measured
 * against its own cone, wins, so two crates side by side are told apart by
 * where the player is looking rather than which is a step closer.
 */
export function focusLoot(items: readonly FieldLoot[], feet: Vec3, eye: Vec3, forward: Vec3): FieldLoot | null {
  const length = Math.hypot(forward.x, forward.y, forward.z);
  if (!(length > 0) || ![feet.x, feet.y, feet.z, eye.x, eye.y, eye.z].every(Number.isFinite)) return null;
  let best: FieldLoot | null = null, bestScore = Infinity;
  for (const item of items) {
    if (!withinReach(item, feet)) continue;
    const dx = item.x - eye.x, dy = (item.y ?? 0) + LOOT_CENTRE - eye.y, dz = item.z - eye.z, distance = Math.hypot(dx, dy, dz);
    if (!(distance > 0)) continue;
    const cos = (dx * forward.x + dy * forward.y + dz * forward.z) / (distance * length);
    const score = Math.acos(Math.max(-1, Math.min(1, cos))) / lookLimit(distance);
    if (score <= 1 && score < bestScore) { best = item; bestScore = score; }
  }
  return best;
}

/** One figure on a card, with which way it moves against what the player has now. */
export interface LootStat { label: string; value: string; trend?: 'up' | 'down' }
/** Everything the card over a looked-at item shows. */
export interface LootCard {
  id: string; name: string; tier: ItemTier; kind: FieldLoot['kind'];
  /** What sort of thing it is, under the name. */
  type: string;
  description: string;
  stats: LootStat[];
  /** The verb on the key chip. */
  action: string;
  /** What taking it changes: what it replaces, or where on the belt it goes. */
  detail: string;
  /** A line on what comes with it, under the figures. */
  note?: string;
  /** Why it cannot be taken just now, if it cannot. */
  blocked?: string;
}
/** The most rounds a gun's reserve holds. */
export const MAX_RESERVE = 999;
/** A carried gun as loose rounds see it. */
export interface CarriedGun { family: number; spec: WeaponSpec; reserve: number }
const fires = (gun: CarriedGun, caliberMm: number | undefined) => caliberMm === undefined || Math.abs(gun.spec.caliberMm - caliberMm) < .01;
/**
 * The carried gun loose rounds go into: the one in hand if it fires them,
 * otherwise the first that does, as long as its reserve has room.
 */
export function ammoTarget(caliberMm: number | undefined, carried: readonly CarriedGun[], inHand: number): CarriedGun | null {
  const fit = carried.filter(gun => fires(gun, caliberMm) && gun.reserve < MAX_RESERVE);
  return fit.find(gun => gun.family === inHand) ?? fit[0] ?? null;
}
/** Why loose rounds cannot be taken, if they cannot. */
export function ammoBlocked(caliberMm: number | undefined, carried: readonly CarriedGun[], inHand: number) {
  if (ammoTarget(caliberMm, carried, inHand)) return undefined;
  return carried.some(gun => fires(gun, caliberMm)) ? 'Reserve full' : `No ${calibreOf(caliberMm)?.mm ?? caliberMm} mm gun carried`;
}
export interface LootCardContext {
  /** Each family's figures as carried now. */
  weapons: readonly WeaponSpec[];
  /** The figures a found variant would have once in hand, fittings and all. */
  variantSpec: (item: ShopItem) => WeaponSpec | null;
  /** The family a found weapon of `family` would put down. */
  replaces: (family: number) => number;
  /** The variant a family is set to now. */
  variantOf: (family: number) => string;
  /** The inserts worn now. */
  plate?: ShopItem;
  /** Supplies on the belt, by catalogue id. */
  belt: Readonly<Record<string, number>>;
  /** The guns carried, with their reserves, and the family in hand. */
  carried: readonly CarriedGun[]; inHand: number;
}

/** Room left on the belt for one more of `id`. */
export const beltRoom = (belt: Readonly<Record<string, number>>, id: string) => Math.max(0, CONSUMABLE_LIMIT - (belt[id] ?? 0));

const trend = (now: number, was: number, higherIsBetter = true): LootStat['trend'] =>
  Math.abs(now - was) < 1e-6 ? undefined : (now > was) === higherIsBetter ? 'up' : 'down';
const rpm = (spec: WeaponSpec) => Math.round(60 / Math.max(.01, spec.interval));

export function lootCard(loot: FieldLoot, context: LootCardContext): LootCard {
  const item = itemById(loot.catalogId ?? '');
  const base = { id: loot.id, name: loot.name, tier: loot.tier, kind: loot.kind, description: item?.flavorText ?? item?.description ?? '' };
  if (loot.kind === 'weapon' && item?.category === 'weapon' && item.family !== undefined) {
    const next = context.variantSpec(item), family = item.family, putDown = context.replaces(family), held = context.weapons[putDown];
    const sameVariant = context.variantOf(family) === item.id && context.carried.some(gun => gun.family === family);
    // A found gun brings its magazine. More rounds are a pickup of their own,
    // unless it is fed from the reserve already carried for the gun it replaces.
    const calibre = weaponCalibre(item), kept = context.carried.find(gun => gun.family === putDown);
    const keeps = kept && calibre && Math.abs(kept.spec.caliberMm - calibre.mm) < .01 ? kept.reserve : 0;
    const stats: LootStat[] = next ? [
      { label: 'DMG', value: `${Math.round(next.damage)}`, trend: held && trend(next.damage, held.damage) },
      { label: 'RPM', value: `${rpm(next)}`, trend: held && trend(rpm(next), rpm(held)) },
      { label: 'MAG', value: `${next.capacity}`, trend: held && trend(next.capacity, held.capacity) },
      { label: 'RELOAD', value: `${next.reload.toFixed(1)}s`, trend: held && trend(next.reload, held.reload, false) },
    ] : [];
    const type = [next?.role ?? 'Weapon', calibre && `${calibre.mm} mm`].filter(Boolean).join(' · ');
    if (sameVariant) return { ...base, type, stats: stats.map(({ label, value }) => ({ label, value })), action: 'Take ammo', detail: `+${next?.capacity ?? 0} rounds to your reserve` };
    return { ...base, type, stats, action: held ? 'Swap' : 'Pick up', detail: held ? `Puts down ${held.name}` : '',
      note: keeps ? `Magazine loaded · keeps your ${keeps} × ${calibre!.mm} mm` : calibre ? `Magazine loaded · no ${calibre.mm} mm in reserve` : 'Magazine loaded' };
  }
  if (loot.kind === 'armor' && item?.category === 'plate') {
    const worn = context.plate, same = worn?.id === item.id, protection = item.protection ?? 0, wornProtection = worn?.protection ?? 0;
    return { ...base, type: 'Armor inserts', action: same ? 'Refit' : 'Equip',
      stats: [
        { label: 'ARMOR', value: `${protection}`, trend: same ? undefined : trend(protection, wornProtection) },
        { label: 'ABSORB', value: `${Math.round((item.absorption ?? 0) * 100)}%`, trend: same ? undefined : trend(item.absorption ?? 0, worn?.absorption ?? 0) },
        { label: 'WEIGHT', value: `${item.weightKg ?? 0}kg`, trend: same ? undefined : trend(item.weightKg ?? 0, worn?.weightKg ?? 0, false) },
      ],
      detail: same ? 'Same as worn · restores your armor' : wornProtection > 0 && worn ? `Replaces ${worn.name}` : 'Fits the empty vest' };
  }
  if (loot.kind === 'ammo') {
    const calibre = calibreOf(loot.caliberMm), gun = ammoTarget(loot.caliberMm, context.carried, context.inHand);
    const guns = [...new Set(FPS_WEAPONS.filter(spec => calibre && Math.abs(spec.caliberMm - calibre.mm) < .01).map(spec => spec.name))];
    return { ...base, type: 'Ammunition', description: guns.length ? `Loose rounds for the ${guns.join(', ')}.` : base.description, action: 'Pick up',
      stats: [{ label: 'ROUNDS', value: `+${loot.amount}` }, ...(gun ? [{ label: 'RESERVE', value: `${gun.reserve} → ${Math.min(MAX_RESERVE, gun.reserve + loot.amount)}`, trend: 'up' as const }] : [])],
      detail: gun ? `Into ${gun.spec.name}` : '', ...(gun ? {} : { blocked: ammoBlocked(loot.caliberMm, context.carried, context.inHand) }) };
  }
  // Everything else is a supply, and it goes on the belt to be used later.
  const kind = utilityKind(item), slot = kind ? utilitySlot(kind) : undefined;
  const held = item ? context.belt[item.id] ?? 0 : 0, room = item ? beltRoom(context.belt, item.id) : 0;
  const { health = 0, armor = 0, reserve = 0 } = item?.effect ?? {};
  const stats: LootStat[] = [
    ...(health ? [{ label: 'HEALTH', value: `+${health}` }] : []), ...(armor ? [{ label: 'ARMOR', value: `+${armor}` }] : []),
    ...(reserve ? [{ label: 'ROUNDS', value: `+${reserve}` }] : []),
    ...(item?.foodEffects ?? []).map(effect => ({ label: FOOD_EFFECTS[effect.kind].label.toUpperCase(), value: `${effect.seconds}s`, trend: 'up' as const })),
    ...(item?.category === 'consumable' ? [{ label: 'USE', value: `${supplyProfile(item).seconds.toFixed(1)}s` }] : []),
    { label: 'CARRIED', value: `${held}/${CONSUMABLE_LIMIT}` },
  ];
  const type = item?.supplyType === 'food' ? 'Food' : 'Medical';
  return { ...base, type, stats, action: 'Pick up',
    detail: slot ? `To belt slot ${slot.key} · ${slot.label}` : 'To your belt',
    ...(item && slot && !room ? { blocked: `${slot.label} slot full` } : {}) };
}
