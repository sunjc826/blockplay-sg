import { itemById, type FittedPart, type InternalPart } from './armory-catalog';
import { FPS_WEAPONS, type WeaponSpec } from './fps-rules';

/**
 * Hardware a variant wears, derived from the parts its figures are built from.
 *
 * A tier is bought for what its parts do, so this reads the parts rather than a
 * second list keyed on weapon ids: a part that adds damage is a heavier barrel,
 * one that adds rounds is a longer magazine or a deeper drum, one that shortens
 * the cycle is a gas system. A variant added to the catalog tomorrow therefore
 * arrives wearing its build, with nothing here to update.
 *
 * Pure on purpose: `weapon-fittings` turns this into geometry for the shop
 * preview and the viewmodel, and the shop prints the same plan as words beside
 * the stat each part paid for.
 */
export type HardwareKind = 'barrel' | 'gas' | 'magazine' | 'freefloat' | 'bipod' | 'buffer';
export interface WeaponHardware {
  kind: HardwareKind;
  /** The part responsible, by catalog id, or `fitted:<slot>` for installed hardware. */
  part: string;
  name: string;
  /**
   * How pronounced the change is, as a fraction of the platform's own figure
   * over what reads as the heaviest hardware on the ladder. Clamped to ±1, and
   * negative where the part takes something away instead of adding it.
   */
  weight: number;
  /** The part carries its own muzzle velocity, so the barrel is long and ported. */
  extended: boolean;
  /** Weight taken out rather than added: cuts and vents, not a thicker profile. */
  lightened: boolean;
  /** Two or three words for the chip the preview prints over the model. */
  label: string;
  /** What to look for on the model, in the words the dossier prints. */
  visual: string;
}
/**
 * The share of a platform's own figure a part has to shift to look as heavy as
 * hardware gets. Relative to the platform rather than to the rest of the
 * catalog, so adding a heavier barrel later cannot quietly reshape every
 * weapon already on the shelf.
 */
const REFERENCE = { barrel: .7, gas: .2, magazine: .4, recoil: .4 };
const clamp = (value: number) => Math.max(-1, Math.min(1, value));
/** Fitted hardware is named for what it is, and the name is what it looks like. */
const FITTED_LOOK: readonly (readonly [RegExp, HardwareKind])[] = [[/bipod/i, 'bipod'], [/free.?float/i, 'freefloat']];

function barrelLabel(weight: number, extended: boolean, lightened: boolean) {
  if (lightened) return 'Vented barrel';
  if (extended) return 'Match barrel';
  return weight > .45 ? 'Heavy barrel' : 'Lined barrel';
}
function barrelVisual(weight: number, extended: boolean, lightened: boolean) {
  if (lightened) return 'a slotted lightweight barrel shroud';
  if (extended) return 'a long fluted match barrel behind a ported muzzle brake';
  return weight > .45 ? 'a noticeably thicker barrel with a machined chamber collar' : 'a heavier barrel profile and a threaded muzzle collar';
}
const magazineLabel = (weight: number, drum: boolean) =>
  drum ? weight < 0 ? 'Lighter drum' : 'Deeper drum' : weight < 0 ? 'Short magazine' : 'Extended magazine';
function magazineVisual(weight: number, drum: boolean) {
  if (weight < 0) return drum ? 'a shallower, lighter drum' : 'a shorter magazine';
  return drum ? 'a deeper drum with an accent capacity band' : 'a longer magazine on an extended baseplate';
}
type FixedKind = Exclude<HardwareKind, 'barrel' | 'magazine'>;
const LABEL: Record<FixedKind, string> = { gas: 'Gas system', freefloat: 'Free-float nut', bipod: 'Bipod', buffer: 'Buffer pad' };
const VISUAL: Record<FixedKind, string> = {
  gas: 'a gas block and regulator above the barrel',
  freefloat: 'a barrel nut with daylight between barrel and handguard',
  bipod: 'a bipod folded forward under the barrel',
  buffer: 'a buffer pad on the butt',
};

function fromBuild(part: InternalPart, base: WeaponSpec, drum: boolean): WeaponHardware | null {
  const shared = { part: part.id, name: part.name, extended: false, lightened: false };
  // Order matters where a part does two things at once: the lightened Ultimax
  // barrel also quickens the cycle, and it is still a barrel.
  if (part.damage || part.ballistics) {
    const weight = clamp((part.damage ?? 0) / base.damage / REFERENCE.barrel);
    const extended = !!part.ballistics, lightened = (part.mobility ?? 1) > 1;
    return { ...shared, kind: 'barrel', weight, extended, lightened, label: barrelLabel(weight, extended, lightened), visual: barrelVisual(weight, extended, lightened) };
  }
  if (part.capacity) {
    const weight = clamp(part.capacity / base.capacity / REFERENCE.magazine);
    return { ...shared, kind: 'magazine', weight, label: magazineLabel(weight, drum), visual: magazineVisual(weight, drum) };
  }
  if (part.interval) {
    const weight = clamp(-part.interval / base.interval / REFERENCE.gas);
    return { ...shared, kind: 'gas', weight, label: LABEL.gas, visual: VISUAL.gas };
  }
  return null;
}
function fromFitted(part: FittedPart): WeaponHardware | null {
  if (part.slot !== 'handling') return null;
  const kind = (FITTED_LOOK.find(([pattern]) => pattern.test(part.name))?.[1] ?? 'buffer') as FixedKind;
  const weight = clamp((1 - (part.modifiers?.recoil ?? 1)) / REFERENCE.recoil);
  return { kind, part: `fitted:${part.slot}`, name: part.name, weight, extended: false, lightened: false, label: LABEL[kind], visual: VISUAL[kind] };
}
/** Everything a variant wears beyond the issued platform, in the order it is built up. */
export function weaponHardware(variantId: string): WeaponHardware[] {
  const item = itemById(variantId);
  if (!item || item.category !== 'weapon' || item.family === undefined) return [];
  const base = FPS_WEAPONS[item.family];
  if (!base) return [];
  // The support platform feeds from a drum, so the same extra rounds read as a
  // deeper drum there and a longer magazine on the rifle.
  const drum = item.family === 1;
  return [
    ...(item.build ?? []).map(part => fromBuild(part, base, drum)),
    ...(item.fitted ?? []).map(fromFitted),
  ].filter((entry): entry is WeaponHardware => !!entry).map(entry =>
    item.family! >= 3 && entry.kind === 'magazine'
      ? { ...entry, label: 'Extended belt box', visual: 'a deeper ammunition box for the longer belt' }
      : entry);
}
/** What each part changes on the model, by the id the dossier lists parts under. */
export const hardwareByPart = (variantId: string) => new Map(weaponHardware(variantId).map(entry => [entry.part, entry]));
