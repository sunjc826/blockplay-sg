import type { InternalPart, ShopItem } from '../game/armory-catalog';
import { hardwareByPart } from '../game/weapon-hardware';
import { visionSpec, PALETTE_LABELS } from '../game/vision-devices';
import { grenadeEffectLines } from '../game/grenade-catalog';
import { foodEffectLines } from '../game/food-effects';
import type { MotorVehicleKind } from '../game/vehicle-rules';

function partCredits(part: InternalPart) {
  const signed = (value: number, unit = '', digits = 0) => `${value > 0 ? '+' : ''}${value.toFixed(digits)}${unit}`;
  const credits: string[] = [];
  if (part.damage) credits.push(`${signed(part.damage)} damage`);
  if (part.capacity) credits.push(`${signed(part.capacity)} rounds`);
  if (part.interval) credits.push(`${Math.abs(part.interval * 1000).toFixed(0)}ms ${part.interval < 0 ? 'quicker' : 'slower'} between shots`);
  if (part.reload) credits.push(`${signed(part.reload, 's', 2)} reload`);
  if (part.recoil) credits.push(`${signed(part.recoil * 1000, '', 1)} recoil`);
  if (part.recoilRecovery) credits.push(`${signed(part.recoilRecovery * 100, '%', 0)} recoil recovery`);
  if (part.mobility && part.mobility !== 1) credits.push(`${signed((part.mobility - 1) * 100, '%', 0)} movement`);
  if (part.ballistics) credits.push(`${part.ballistics.velocity} u/s muzzle velocity`);
  for (const trait of part.traits ?? []) {
    if (trait.kind === 'falloff') credits.push(`full damage to ${trait.near} m`);
    if (trait.kind === 'precision') credits.push(`${trait.multiplier}x on a precise hit`);
  }
  return credits.join(' · ');
}
export function FixedBuildDetails({ item }: { item: ShopItem }) {
  const fittings = hardwareByPart(item.id);
  if (!item.build?.length && !item.fitted?.length) return null;
  return <section className="loadout-stack"><h3>Built from</h3>
    {item.build?.map(part => <div key={part.id}><strong>{part.name}</strong><small className="loadout-part-effect">{partCredits(part)}</small><p>{part.description}</p>{fittings.has(part.id) && <small>On the model: {fittings.get(part.id)!.visual}.</small>}</div>)}
    {item.fitted?.map(part => <div key={part.slot}><strong>{part.name}</strong><small className="loadout-part-effect">{part.slot} slot · fixed</small><p>{part.description}</p>{fittings.has(`fitted:${part.slot}`) && <small>On the model: {fittings.get(`fitted:${part.slot}`)!.visual}.</small>}</div>)}
    <p>This is a complete, fixed configuration. Choose another weapon variant to change its performance.</p>
  </section>;
}
export function VisionDeviceDetails({ item }: { item: ShopItem }) {
  const spec = visionSpec(item.id);
  return <section className="loadout-stack"><h3>{!spec ? 'Naked eye' : spec.kind === 'iff' ? `Friend or foe / IFF-${spec.generation}` : spec.kind === 'nvg' ? `Image intensifier / Gen ${spec.generation}${spec.iff ? ' + IFF' : ''}` : `Thermal core / T${spec.generation}`}</h3>
    <p>{!spec ? 'Full view, no grain, and only the light that is there.' : spec.kind === 'iff' ? 'Boxes everyone in sight: red for hostile, green for friendly, white for neutral. Clear glass leaves the view and light unchanged; walls and smoke still hide people.' : spec.kind === 'nvg' ? `Amplifies available light, most at night. Lamps and muzzle flashes bloom into halos; the image circle narrows the view.${spec.iff ? ' Its IFF reader boxes hostiles red, friendlies green and neutrals white, inside the circle.' : ''}` : `Sees heat: people and running engines stand out day or night, through smoke but not glass. ${spec.palettes.map(p => PALETTE_LABELS[p]).join(' / ')}.`}</p>
    <p>{!spec ? 'Equip a device, then press N in the field (the eye button on touch).' : `N switches it on${spec.palettes.length > 1 ? ', J cycles palettes' : spec.kind === 'nvg' && spec.iff ? ', J switches between tube with IFF and IFF only' : ''}. It takes ${spec.warmup.toFixed(1)} s to come up.${spec.calibration ? ` Freezes ${spec.calibration.hold.toFixed(1)} s every ${spec.calibration.every} s to recalibrate.` : ''}`}</p>
  </section>;
}
export function SupplyDetails({ item }: { item: ShopItem }) {
  return <section className="loadout-stack"><h3>{item.grenade ? 'Grenade effects' : item.foodEffects?.length ? 'Food effects' : 'What one use restores'}</h3>
    {item.effect && <p>{[item.effect.health && `${item.effect.health} health`, item.effect.armor && `${item.effect.armor} armor points`, item.effect.reserve && '2 compatible magazines', item.effect.ammoRefill && 'Full weapon + all empty rig pouches'].filter(Boolean).join(' · ')}</p>}
    {item.grenade ? <><ul>{grenadeEffectLines(item.grenade).map(line => <li key={line}>{line}</li>)}</ul><p>{item.weightKg} kg · {item.grenade.throwSpeed} m/s · {item.grenade.fuse} s fuse. Tap G to ready, hold G to choose. Hold fire to cook; release to throw. Hold aim for a lob.</p></> : item.foodEffects?.length ? <><ul>{foodEffectLines(item.foodEffects).map(line => <li key={line}>{line}</li>)}</ul><p>Effects start when you finish eating. Eating something that gives an effect already running keeps the stronger and the longer of the two; it never stacks. Hold F to choose this meal; tap F to eat.</p></> : item.effect?.ammoRefill ? <p>1.8 s to refill the weapon in your hands and every empty rig pouch. Existing spare magazines stay put. Hold F to choose; tap F to use. Cancelling before the effect keeps the refill.</p> : <p>Armor is restored only up to the protection your inserts provide. Ammo pouches refill empty rig pouches automatically when R needs a spare magazine. Hold F to choose recovery items; tap F to use.</p>}
  </section>;
}
export function VehicleFinishDetails({ vehicle }: { vehicle: MotorVehicleKind }) {
  return <section className="loadout-stack"><h3>{vehicle === 'car' ? 'Utility 01 / 4×4' : 'Falcon 01 / Rotorcraft'}</h3><p>{vehicle === 'car' ? '72 km/h top speed · WASD to drive · Space to brake' : 'Hover, climb and cruise · Space to ascend · C / Ctrl to descend'}</p><p>Rented wraps fit both vehicles. Equip each separately; the preview shows your selected vehicle. Cosmetic finish only; performance stays unchanged.</p></section>;
}
