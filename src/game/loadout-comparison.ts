import type { ShopItem } from './armory-catalog';
import { fittedVariantSpec, resolveLoadout, type ArmoryProfile } from './armory-state';
import { equipLoadoutItem, loadoutEquipError, slotItem, type LoadoutTarget } from './loadout-store';
import { restoreCarrySlots } from './armory-slots';
import { equipmentMovement } from './fps-encumbrance';
import { startingAmmoPools } from './ammo-pools';
import { hitDamage, opticMagnification } from './fps-rules';
import { THREAT_CLASSES, THREAT_NAMES } from './armor-inserts';
import { visionFigures, visionSpec } from './vision-devices';

export type ComparisonRow = { label: string; current?: number | string; preview: number | string; unit?: string; digits?: number; lower?: boolean; neutral?: boolean; direction?: number };
export type ComparisonGroup = { label: string; rows: ComparisonRow[] };

/** Hypothetical equipment only: never spends currency or changes the saved profile. */
export function loadoutComparison(profile: ArmoryProfile, item: ShopItem, target: LoadoutTarget) {
  const worn = slotItem(profile, target), current = resolveLoadout(profile);
  const error = loadoutEquipError(profile, item, target);
  const previewProfile = equipLoadoutItem({ ...profile, owned: [...profile.owned, item.id] }, item.id, target).profile;
  const preview = resolveLoadout(previewProfile);
  const carry = restoreCarrySlots(profile.carry, profile.owned, profile.rentals);
  const active = worn?.category === 'weapon' ? worn.family! : carry.main;
  const beforeMovement = equipmentMovement(current, active);
  const afterMovement = equipmentMovement(preview, item.category === 'weapon' ? item.family! : active);
  const groups: ComparisonGroup[] = [];
  const row = (label: string, before: number | string | undefined, after: number | string, options: Partial<ComparisonRow> = {}): ComparisonRow => ({ label, current: before, preview: after, ...options });
  const percent = { unit: '%' }, weight = { unit: ' kg', digits: 2, lower: true };
  const weapon = fittedVariantSpec(item), equipped = worn?.category === 'weapon' ? current.weapons[worn.family!] : undefined;
  if (weapon) groups.push({ label: 'Weapon performance', rows: [
    row('Caliber', equipped?.caliberMm, weapon.caliberMm, { unit: ' mm', digits: 2, neutral: true }),
    row('Damage', equipped?.damage, weapon.damage),
    row('Fire rate', equipped && 60 / equipped.interval, 60 / weapon.interval, { unit: ' RPM' }),
    row('Magazine', equipped?.capacity, weapon.capacity),
    row('Reload', equipped?.reload, weapon.reload, { unit: ' s', digits: 2, lower: true }),
    row('Recoil', equipped && equipped.recoil * 1000, weapon.recoil * 1000, { digits: 1, lower: true }),
    row('Recoil recovery', equipped && equipped.recoilRecovery * 100, weapon.recoilRecovery * 100, percent),
    row('Damage at 60 m', equipped && hitDamage(equipped, 60), hitDamage(weapon, 60)),
    row('Precision hit', equipped && hitDamage(equipped, 15, 'head'), hitDamage(weapon, 15, 'head')),
    row('Sight magnification', equipped && opticMagnification(equipped), opticMagnification(weapon), { unit: '×', digits: 2, neutral: true }),
    row('Weapon weight', equipped?.weightKg ?? (equipped ? 0 : undefined), weapon.weightKg ?? 0, weight),
  ] });
  if (item.category === 'rig' || item.category === 'plate') {
    const beforeAmmo = startingAmmoPools(current.weapons, current.carriedFamilies), afterAmmo = startingAmmoPools(preview.weapons, preview.carriedFamilies);
    groups.push({ label: 'Complete armor loadout', rows: [
      row('Armor pool', current.armor, preview.armor, { unit: ' AP' }),
      row('Absorption', current.absorption * 100, preview.absorption * 100, percent),
      row('Rated for', THREAT_NAMES[current.insert.stops], THREAT_NAMES[preview.insert.stops], { direction: THREAT_CLASSES.indexOf(preview.insert.stops) - THREAT_CLASSES.indexOf(current.insert.stops) }),
      ...((current.insert.deflect || preview.insert.deflect) ? [row('Rounds glanced off', current.insert.deflect * 100, preview.insert.deflect * 100, percent)] : []),
      ...((current.insert.scent || preview.insert.scent) ? [row('Smell', current.insert.scent ? 'On opponents’ maps' : 'No map reveal', preview.insert.scent ? 'On opponents’ maps' : 'No map reveal', { direction: Number(current.insert.scent) - Number(preview.insert.scent) })] : []),
      row('Rig / insert mobility', current.mobility * 100, preview.mobility * 100, percent),
      row('Jump height', beforeMovement.jumpVelocity ** 2 * 100, afterMovement.jumpVelocity ** 2 * 100, percent),
      row('Aim-in speed', beforeMovement.aimSpeed * 100, afterMovement.aimSpeed * 100, percent),
      row('Magazine pouches', current.weapons[active].rigSlots ?? 6, preview.weapons[active].rigSlots ?? 6),
      ...[...new Set([...Object.keys(beforeAmmo), ...Object.keys(afterAmmo)])].map(calibre => row(`${calibre.replace(':', ' mm ')} rounds in pouches`, beforeAmmo[calibre] ?? 0, afterAmmo[calibre] ?? 0)),
      row('Equipment weight', worn?.weightKg ?? 0, item.weightKg ?? 0, weight),
    ] });
  }
  if (item.category === 'vision') {
    const nextSpec = visionSpec(item.id), nowSpec = current.vision?.spec;
    const next = visionFigures(nextSpec), now = visionFigures(nowSpec);
    groups.push({ label: 'Vision device', rows: [
      ...(nextSpec?.kind !== 'thermal' || nowSpec?.kind !== 'thermal' ? [row('Light gain at night', now.gain, next.gain, { unit: '×', digits: 1 })] : []),
      row('Screen inside the image', now.view, next.view, percent),
      row('Sharpness', now.sharpness, next.sharpness, percent),
      row('Grain at full gain', now.grain, next.grain, { ...percent, lower: true }),
      ...(nextSpec?.kind !== 'thermal' || nowSpec?.kind !== 'thermal' ? [row('Halo around lights', now.halo, next.halo, { ...percent, lower: true })] : []),
      ...(nextSpec?.kind === 'thermal' || nowSpec?.kind === 'thermal' ? [row('Sensor lines', now.lines, next.lines), row('Palettes', now.palettes, next.palettes)] : []),
      ...(nextSpec?.iff || nowSpec?.iff ? [row('IFF range', now.iffRange, next.iffRange, { unit: ' m' })] : []),
      row('Warm-up', now.warmup, next.warmup, { unit: ' s', digits: 1, lower: true }),
      row('Equipment weight', worn?.weightKg ?? 0, item.weightKg ?? 0, weight),
    ] });
  }
  if (groups.length && !error) groups.push({ label: 'Carried load & movement', rows: [
    row('Total carried weight', beforeMovement.totalKg, afterMovement.totalKg, { ...weight, digits: 1 }),
    row('Carried-load mobility', beforeMovement.carried * 100, afterMovement.carried * 100, percent),
    row('Weapon-in-hand mobility', beforeMovement.inHand * 100, afterMovement.inHand * 100, percent),
    row('Combined movement', beforeMovement.movement * 100, afterMovement.movement * 100, percent),
  ] });
  return { groups, worn, error };
}
