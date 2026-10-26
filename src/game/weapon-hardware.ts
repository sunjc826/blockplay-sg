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
export type HardwareKind = 'barrel' | 'gas' | 'magazine' | 'freefloat' | 'bipod' | 'buffer' | 'suppressor' | 'compensator' | 'laser' | 'light' | 'laser-light' | 'brace';
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
const LABEL: Record<FixedKind, string> = { gas: 'Gas system', freefloat: 'Free-float nut', bipod: 'Bipod', buffer: 'Buffer pad',
  suppressor: 'Suppressor', compensator: 'Compensator', laser: 'Laser', light: 'Weapon light', 'laser-light': 'Laser-light', brace: 'Folding brace' };
const VISUAL: Record<FixedKind, string> = {
  gas: 'a gas block and regulator above the barrel',
  freefloat: 'a barrel nut with daylight between barrel and handguard',
  bipod: 'a bipod folded beneath the barrel',
  buffer: 'a buffer pad on the butt',
  suppressor: 'a long suppressor can past the muzzle',
  compensator: 'a ported compensator block on the muzzle',
  laser: 'a laser module on the handguard, its red aperture forward',
  light: 'a torch clamped to the handguard, its lens forward',
  'laser-light': 'a laser-light housing under the dust cover',
  brace: 'a folding brace out of the backstrap to a shoulder pad',
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
  // A pistol's quicker cycle is trigger and spring work inside the slide, with nothing to see.
  if (part.interval && base.id !== 'p30-inspired') {
    const weight = clamp(-part.interval / base.interval / REFERENCE.gas);
    return { ...shared, kind: 'gas', weight, label: LABEL.gas, visual: VISUAL.gas };
  }
  return null;
}
/** An accessory is named for what it is; the dossier and the model agree on that, not on its figures. */
function accessoryKind(part: FittedPart): FixedKind | null {
  const accessories = part.accessories;
  if (part.slot === 'muzzle' && accessories?.muzzle) return accessories.muzzle;
  if (part.slot === 'rail' && accessories?.rail) return accessories.rail;
  if (part.slot === 'handling' && accessories?.brace) return 'brace';
  return null;
}
function fromFitted(part: FittedPart): WeaponHardware | null {
  const accessory = accessoryKind(part);
  if (accessory) return { kind: accessory, part: `fitted:${part.slot}`, name: part.name, weight: 0, extended: false, lightened: false, label: LABEL[accessory], visual: VISUAL[accessory] };
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
  // A drum-fed platform reads the same extra rounds as a deeper drum, a belt-fed
  // one as a deeper box, and a rifle as a longer magazine.
  const drum = base.feed === 'drum';
  return [
    ...(item.build ?? []).map(part => fromBuild(part, base, drum)),
    ...(item.fitted ?? []).map(fromFitted),
  ].filter((entry): entry is WeaponHardware => !!entry).map(entry =>
    base.feed === 'belt' && entry.kind === 'magazine'
      ? { ...entry, label: 'Extended belt box', visual: 'a deeper ammunition box for the longer belt' }
      : entry);
}
/** What each part changes on the model, by the id the dossier lists parts under. */
export const hardwareByPart = (variantId: string) => new Map(weaponHardware(variantId).map(entry => [entry.part, entry]));
