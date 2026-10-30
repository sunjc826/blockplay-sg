import StoreTutorial from './StoreTutorial';
import { grenadeEffectLines } from '../game/grenade-catalog';
import { bipodDescription } from '../game/weapon-support';
import ArmoryCarrySlots from './ArmoryCarrySlots';
import { equipmentMovement } from '../game/fps-encumbrance';
import { startingAmmoPools } from '../game/ammo-pools';
import { useState, type ReactNode } from 'react';
import { ArrowRight, Check, Coins, Crosshair, Eye, Gem, Map as MapIcon, Shield, CarFront, Plane, SlidersHorizontal } from 'lucide-react';
import { utilityKind, utilitySlot } from '../game/utility-belt';
import { ARMORY_CATALOG, byUnlock, consumableLimit, isEnemyIssue, isShopFamily, itemById, type InternalPart, type ItemTier, type ShopItem } from '../game/armory-catalog';
import { fittedParts, isEquipped, previewLoadout, resolveLoadout, SHOP_CATEGORIES, variantSpec } from '../game/armory-state';
import type { ArmoryStore } from '../game/use-armory';
import type { VehicleKind } from '../game/vehicle-rules';
import { ELIMINATION_CREDITS, ELIMINATION_XP, levelSkip, progression, skipCostFrom, xpForLevel, XP_PER_TOKEN } from '../game/progression';
import { rankInsignia } from '../game/rank-insignia';
import RankBadge from './RankBadge';
import ArmoryPreview from './ArmoryPreview';
import FalloffCurve from './FalloffCurve';
import SprayPattern from './SprayPattern';
import { FPS_WEAPONS, hitDamage, opticMagnification } from '../game/fps-rules';
import { hardwareByPart } from '../game/weapon-hardware';
import { THREAT_CLASSES, THREAT_NAMES } from '../game/armor-inserts';
import { visionFigures, visionSpec, PALETTE_LABELS } from '../game/vision-devices';
import { foodEffectLines } from '../game/food-effects';

function Silhouette({ item }: { item: ShopItem }) {
  const armor = item.category === 'rig' || item.category === 'plate';
  if (item.category === 'vision') return <VisionSilhouette item={item} />;
  return <svg className="armory-silhouette" viewBox="0 0 240 88" aria-hidden="true" style={{ color: item.palette?.[1] || item.accent || (armor ? '#889577' : '#849095') }}>
    {item.category === 'consumable' ? item.supplyType === 'food' ? <><path d="M63 38h92l-10 36H73z" fill="currentColor" /><path d="M58 31h102v11H58z" fill="currentColor" opacity=".72" /><path d="M170 31h25v43h-25zM168 25h29v8h-29z" fill="currentColor" /><path d="M92 25c-8-7 8-10 0-17m25 17c-8-7 8-10 0-17" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" /></> : <><path d="M65 22h110l9 52H56z" fill="currentColor" /><path d="M75 12h90v18H75z" fill="currentColor" opacity=".72" /><path d="M111 37h18v25h-18zM101 45h38v9h-38z" fill="#eff2e8" opacity=".9" /></> : armor ? <><path d="M88 10h18l5 13h18l5-13h18l12 24-10 43H86L76 34z" fill="currentColor" /><path d="M97 33h46v36H97z" fill="#172225" opacity=".65" /><path d="M101 42h38m-38 9h38m-38 9h38" stroke="currentColor" strokeWidth="4" />{item.category === 'plate' && <path d="M162 28h20l8 10v39h-36V38z" fill="currentColor" stroke="#a4b9b4" />}</> : item.family === 2 ? <><path d="M69 23h112v22h-62l-9 33H82l7-33H69z" fill="currentColor" /><path d="M123 47h24v17h-28" fill="none" stroke="currentColor" strokeWidth="6" /><path d="M78 18h12v6h-12zM163 18h8v6h-8z" fill="currentColor" /></> : (item.family ?? 0) >= 3 ? <><path d="M38 30h88v24H38zM126 35h94v9h-94zM29 38h13v39H29zM48 51h40v27H48z" fill="currentColor" /><path d="M104 52l-16 27m16-27l14 27" stroke="currentColor" strokeWidth="5" /></> : <><path d="M21 37h98l13-9h32l10 8h48v7h-48l-7 8h-53l-7 22H91l4-22H68l-2 17H47l-4-17H21z" fill="currentColor" /><path d="M70 28h52v7H70zM82 20h26v9H82z" fill="currentColor" opacity=".7" /><path d="M29 41h54m45-4h27" stroke="#1c2527" strokeWidth="3" /></>}
  </svg>;
}
/** Silhouette ink by rarity; the tiers below Elite share the issued grey. */
const TIER_INK: Partial<Record<ItemTier, string>> = { Elite: '#b8a676', Ultra: '#7cc9d6', Legendary: '#b494e8', Mythic: '#e8866a' };
/** A head-mounted device by its tube count, or a thermal housing with its dark window. */
function VisionSilhouette({ item }: { item: ShopItem }) {
  const spec = visionSpec(item.id), tubes = spec?.kind === 'nvg' ? [[120], [100, 140], [72, 102, 138, 168]][spec.generation - 1] : [];
  return <svg className="armory-silhouette" viewBox="0 0 240 88" aria-hidden="true" style={{ color: TIER_INK[item.tier] ?? '#8f9a84' }}>
    <path d="M96 10h48v12h-48zM112 22h16v14h-16z" fill="currentColor" opacity=".72" />
    {spec?.kind === 'nvg' && <><path d={`M${Math.min(...tubes) - 16} 34h${Math.max(...tubes) - Math.min(...tubes) + 32}v14H${Math.min(...tubes) - 16}z`} fill="currentColor" />{tubes.map(x => <g key={x}><circle cx={x} cy={60} r={spec.generation === 3 ? 13 : 16} fill="currentColor" /><circle cx={x} cy={60} r={spec.generation === 3 ? 8 : 10} fill="#1c3b33" /></g>)}</>}
    {spec?.kind === 'thermal' && <><path d={spec.generation === 1 ? 'M98 34h44v42H98z' : 'M80 34h80v42H80z'} fill="currentColor" /><circle cx={spec.generation === 1 ? 120 : 104} cy={55} r={13} fill="#2c2735" />{spec.generation === 2 && <circle cx={140} cy={55} r={8} fill="#1c3b33" />}</>}
  </svg>;
}
/** What a part is responsible for, in the same terms the stat rows use. */
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
/** The grid card's one-line summary of a device. */
function visionTag(id: string) {
  const spec = visionSpec(id);
  return !spec ? 'Naked eye' : spec.kind === 'nvg' ? `Gen ${spec.generation} · ${spec.gain.toFixed(1)}× gain` : `Thermal · ${spec.rows} lines`;
}
/** Device figures against the one worn now, or against the naked eye. */
function VisionDossier({ item, current }: { item: ShopItem; current?: string }) {
  const spec = visionSpec(item.id), worn = visionSpec(current), next = visionFigures(spec), now = visionFigures(worn);
  const thermal = spec?.kind === 'thermal' || worn?.kind === 'thermal';
  return <>
    <div className="armory-vehicle-spec"><b>{!spec ? 'NAKED EYE' : spec.kind === 'nvg' ? `IMAGE INTENSIFIER / GEN ${spec.generation}` : `THERMAL CORE / T${spec.generation}`}</b>
      <p>{!spec ? 'No picture to manage: full view, no grain, and only the light that is there.' : spec.kind === 'nvg' ? 'Amplifies the light there is, most at night. Lamps and muzzle flashes bloom into halos; the image circle narrows the view.' : `Sees heat: people and running engines stand out day or night, through smoke but not glass. ${spec.palettes.map(p => PALETTE_LABELS[p]).join(' / ')}.`}</p>
      <small>{!spec ? 'Equip a device from this tab, then press N in the field (the eye button on touch).' : `N switches it on${spec.palettes.length > 1 ? ', J cycles palettes' : ''}. It ${spec.warmup >= 1 ? 'takes' : 'needs only'} ${spec.warmup.toFixed(1)} s to come up.${spec.calibration ? ` Freezes ${spec.calibration.hold.toFixed(1)} s every ${spec.calibration.every} s to recalibrate.` : ''}`}</small></div>
    {spec?.kind !== 'thermal' && <Stat label="Light gain at night" value={next.gain} current={now.gain} unit="×" digits={1} />}
    <Stat label="Screen inside the image" value={next.view} current={now.view} unit="%" />
    <Stat label="Sharpness" value={next.sharpness} current={now.sharpness} unit="%" />
    <Stat label="Grain at full gain" value={next.grain} current={now.grain} unit="%" lower />
    {spec?.kind !== 'thermal' && <Stat label="Halo around lights" value={next.halo} current={now.halo} unit="%" lower />}
    {thermal && <Stat label="Sensor lines" value={next.lines} current={now.lines} />}
    {thermal && <Stat label="Palettes" value={next.palettes} current={now.palettes} />}
    <Stat label="Warm-up" value={next.warmup} current={now.warmup} unit="s" digits={1} lower />
  </>;
}
function Stat({ label, value, current, unit = '', lower = false, digits = 0 }: { label: string; value: number; current: number; unit?: string; lower?: boolean; digits?: number }) {
  const delta = Number((value - current).toFixed(digits)), good = lower ? delta < 0 : delta > 0;
  return <div className="armory-stat"><span>{label}</span><b>{value.toFixed(digits)}<small>{unit}</small></b><em className={delta ? good ? 'better' : 'worse' : ''}>{delta ? `${delta > 0 ? '+' : ''}${delta.toFixed(digits)}${unit}` : '—'}</em></div>;
}
/** A way out of the store into play: a mode and where it starts. */
export type Deployment = { id: string; label: string; detail: string; onDeploy: () => void };

export default function ArmoryShop({ store, nav, deployments, onEnterRange, rangeLabel = 'Marina FPS', tutorial }: { tutorial?: { onComplete: () => void; onExit: () => void }; store: ArmoryStore; nav?: ReactNode; deployments?: readonly Deployment[]; onEnterRange?: () => void; rangeLabel?: string }) {
  const exits = deployments ?? (onEnterRange ? [{ id: 'range', label: 'Deploy to', detail: rangeLabel, onDeploy: onEnterRange }] : []);
  const [vehicle, setVehicle] = useState<VehicleKind>('car');
  const [category, setCategory] = useState<(typeof SHOP_CATEGORIES)[number]['id']>('weapon'), [family, setFamily] = useState(0), [selectedId, setSelectedId] = useState('sar-vanguard');
  const { profile } = store;
  const level = progression(profile.xp);
  // Tokens buy the XP gap rather than the level, so the price moves as it closes.
  const skip = levelSkip(profile.xp), skipShort = Math.max(0, skip.price - profile.tokens);
  const insignia = rankInsignia(level.level, profile.rankSet);
  const items = ARMORY_CATALOG.filter(i => category === 'armor' ? i.category === 'rig' || i.category === 'plate' : category === 'food' ? i.category === 'consumable' && i.supplyType === 'food' : category === 'utility' ? i.category === 'consumable' && i.supplyType !== 'food' : i.category === category && !isEnemyIssue(i) && (i.family === undefined || i.family === family));
  // Weapons are shelved by when they unlock, then by rarity; the other tabs keep the catalog's order.
  if (category === 'weapon') items.sort(byUnlock);
  const item = items.find(i => i.id === selectedId) || items[0];
  const current = resolveLoadout(profile), preview = previewLoadout(profile, item, family), weapon = preview.weapons[family], equippedWeapon = current.weapons[family];
  // Supplies stack rather than unlocking, so they are held by count and the
  // purchase stays available until the carry limit.
  const supply = item.category === 'consumable', held = profile.consumables[item.id] || 0;
  const previewMovement = equipmentMovement(preview, family), currentMovement = equipmentMovement(current, family);
  const currentReserves = startingAmmoPools(current.weapons, current.carriedFamilies), previewReserves = startingAmmoPools(preview.weapons, preview.carriedFamilies);
  const owned = !supply && profile.owned.includes(item.id), equipped = isEquipped(profile, item, family, vehicle);
  const affordable = profile[item.currency] >= item.price, full = supply && held >= consumableLimit(item);
  const vehiclePaint = category === 'vehicleSkin';
  const armor = category === 'armor', vision = category === 'vision', locked = !owned && level.level < (item.requiredLevel || 1);
  const nextUnlocks = ARMORY_CATALOG.filter(i => (i.requiredLevel || 1) > level.level);
  const nextLevel = Math.min(...nextUnlocks.map(i => i.requiredLevel!));
  const unlockNote = level.level >= 50 ? 'Maximum level reached · all equipment level requirements met.' : nextUnlocks.length ? `Level ${nextLevel} unlocks: ${nextUnlocks.filter(i => i.requiredLevel === nextLevel).map(i => i.name).join(' · ')}` : 'All equipment level requirements met. Keep climbing to level 50.';
  // The preview shows the build; this says which part of it each line paid for.
  const fittings = hardwareByPart(item.id);
  // The selected item's one action, shared by the dossier and the dock.
  const unit = item.currency === 'tokens' ? 'TK' : 'CR', short = `Need ${item.price - profile[item.currency]} more ${unit}`;
  const action = supply
    ? { disabled: locked || full || !affordable, run: () => store.buy(item.id), label: locked ? `Unlocks at level ${item.requiredLevel}` : full ? `Carrying ${consumableLimit(item)}, the most you can` : !affordable ? short : <>Buy one{held ? ` (you hold ${held})` : ''} <ArrowRight size={15} /></> }
    : { disabled: equipped || locked || (!owned && !affordable), run: () => owned ? store.equipItem(item.id, family, vehicle) : store.buy(item.id), label: equipped ? <><Check size={15} /> Equipped</> : owned ? <>Equip {vehiclePaint ? (vehicle === 'car' ? 'on Utility 01' : 'on Falcon 01') : armor ? 'armor' : vision ? 'device' : `on ${FPS_WEAPONS[family].name}`} <ArrowRight size={15} /></> : locked ? `Unlocks at level ${item.requiredLevel}` : !affordable ? short : <>Unlock for {item.price} {unit} <ArrowRight size={15} /></> };
  const quickSlot = { disabled: equipped || !held, run: () => store.equipItem(item.id, family, vehicle), label: equipped ? <><Check size={15} /> In your quick slot</> : held ? 'Put in quick slot' : 'Buy one to carry it' };
  return <section className="armory" aria-label="Equipment shop">
    {/* One row: the way out, your level and your wallet. Profile settings
        (insignia, Encik) live on their own screen (ArmorySettings). */}
    <div className="armory-header">{nav ?? <div className="armory-title"><span className="armory-kicker">blockplaySG / ARMORY 01</span><h2>Field exchange<span>®</span></h2></div>}
      <div className="armory-progression"><div className="armory-level-badge" style={{ color: insignia.accent }}><RankBadge insignia={insignia} size={30} /><span>{insignia.emblem.kind === 'numeral' ? 'LEVEL' : `LV ${level.level}`}</span></div><div className="armory-xp"><div><strong>{insignia.label}</strong><span>{level.xp.toLocaleString()} XP {level.level < 50 && ` / ${level.next.toLocaleString()}`}</span></div><progress value={level.progress} max={1} aria-label={level.level >= 50 ? 'Maximum level reached' : 'Progress to next level'} /><small title={unlockNote}>{unlockNote}</small></div>{!skip.atMax && <button className="armory-level-buy" data-testid="buy-level" disabled={!!skipShort} onClick={store.buyLevel} title={`${skip.remaining.toLocaleString()} XP stand between you and level ${skip.next}. Tokens buy XP at ${XP_PER_TOKEN} XP each, so the price falls as you earn.`}><Gem size={13} /><span><strong>{skipShort ? `${skipShort.toLocaleString()} TK short` : `Skip to level ${skip.next}`}</strong><small>{skip.price.toLocaleString()} TK · {skip.remaining.toLocaleString()} XP</small></span></button>}</div>
      <div className="armory-wallet"><span title="Earned from eliminations and completed FPS exercises"><Coins size={15} /><b data-testid="credits">{profile.credits.toLocaleString()}</b><small>CR</small></span><span className="premium"><Gem size={15} /><b data-testid="tokens">{profile.tokens.toLocaleString()}</b><small>TK</small></span><button className="armory-demo" title="Demo wallet · no real payments" aria-label="+250 demo tokens" onClick={store.demoTopUp}>+250<span> demo tokens</span></button></div>
    </div>
    {tutorial && <StoreTutorial category={category} onComplete={tutorial.onComplete} onExit={tutorial.onExit} />}
    <div className="armory-navigation"><div role="tablist" aria-label="Equipment categories">{SHOP_CATEGORIES.map(c => <button role="tab" id={`shop-tab-${c.id}`} aria-controls="shop-panel" key={c.id} aria-selected={category === c.id} onClick={() => setCategory(c.id)}>{c.label}{c.id === 'armor' && <Shield size={13} />}</button>)}</div></div>
    <ArmoryCarrySlots store={store} />
    <div className="armory-body" id="shop-panel" role="tabpanel" aria-labelledby={`shop-tab-${category}`}>
      <div className="armory-main"><div className="armory-section-heading"><span>{vehiclePaint ? 'MOTOR POOL / COSMETIC WRAPS' : armor ? 'CARRYING RIGS & INSERTS' : vision ? 'NIGHT VISION & THERMAL / HEAD-MOUNTED' : supply ? category === 'food' ? 'KOPITIAM & HAWKER FAVOURITES' : 'FIELD UTILITIES / SPENT WHEN USED' : category === 'weapon' ? 'SELECT YOUR PLATFORM' : 'CUSTOMIZE YOUR PLATFORM'}</span>{vehiclePaint && <div className="armory-family">{(['car', 'helicopter'] as const).map(kind => <button key={kind} aria-pressed={vehicle === kind} onClick={() => setVehicle(kind)}>{kind === 'car' ? 'Utility 01' : 'Falcon 01'}</button>)}</div>}{!armor && !vehiclePaint && !supply && !vision && <div className="armory-family">{FPS_WEAPONS.map(({ name }, i) => isShopFamily(i) && <button key={name} aria-pressed={family === i} onClick={() => setFamily(i)}>{name}</button>)}</div>}</div>
        <div className={`armory-showcase tier-${item.tier.toLowerCase()}`}><div className="armory-showcase-label"><span>{item.tier.toUpperCase()} / {item.category === 'skin' || vehiclePaint ? 'COSMETIC FINISH' : item.category.toUpperCase()}</span><b>{owned ? 'IN YOUR LOCKER' : 'PREVIEW'}</b></div><ArmoryPreview item={item} weapon={weapon} vehicle={vehicle} /><div className="armory-showcase-title"><h3>{item.name}</h3><span>{item.tier === 'Elite' && item.category !== 'skin' && !vehiclePaint ? 'ENHANCED STATS' : item.category === 'skin' || vehiclePaint ? 'COSMETIC ONLY' : 'FIELD EQUIPMENT'}</span></div></div>
        <div className="armory-grid">{items.map(i => <button className={`armory-item tier-${i.tier.toLowerCase()} ${i.id === item.id ? 'selected' : ''}`} key={i.id} data-item={i.id} aria-pressed={i.id === item.id} onClick={() => setSelectedId(i.id)}><div className="armory-item-top"><span>{i.category === 'consumable' ? i.supplyType === 'food' ? 'FOOD' : 'UTILITY' : i.tier} · LV {i.requiredLevel || 1}</span>{isEquipped(profile, i, family, vehicle) ? <span><Check size={11} /> {i.category === 'consumable' ? 'Quick slot' : 'Equipped'}</span> : i.category !== 'consumable' && profile.owned.includes(i.id) ? <span>Owned</span> : <span>{level.level < (i.requiredLevel || 1) ? 'LOCKED' : i.category === 'consumable' ? 'CONSUMABLE' : i.category === 'plate' ? 'INSERT' : i.category === 'rig' ? 'RIG' : i.category === 'vision' ? 'DEVICE' : 'PERMANENT'}</span>}</div>{vehiclePaint ? <div className="armory-vehicle-icon" style={{ color: i.palette?.[1] || '#819572' }}>{vehicle === 'car' ? <CarFront size={65} strokeWidth={1.1} /> : <Plane size={65} strokeWidth={1.1} />}</div> : <Silhouette item={i} />}<strong>{i.name}</strong><div className="armory-item-bottom"><span>{i.category === 'consumable' ? `x${profile.consumables[i.id] || 0} held` : i.category === 'skin' || vehiclePaint ? 'Cosmetic' : i.category === 'weapon' ? `${variantSpec(i)?.damage ?? 0} DMG` : i.category === 'plate' ? `${i.protection} AP` : i.category === 'rig' ? `+${i.carry} reserve` : i.category === 'vision' ? visionTag(i.id) : i.slot}</span><b>{i.category !== 'consumable' && profile.owned.includes(i.id) ? 'OWNED' : `${i.price.toLocaleString()} ${i.currency === 'tokens' ? 'TK' : 'CR'}`}</b></div></button>)}</div>
      </div>
      <aside className="armory-details"><span className="armory-kicker">EQUIPMENT DOSSIER</span><h3>{item.name}</h3>{item.flavorText && <p className="armory-flavor">“{item.flavorText}”</p>}<p>{item.description}</p>{locked && <div className="armory-level-lock">LEVEL {item.requiredLevel} REQUIRED<small>{Math.max(0, xpForLevel(item.requiredLevel || 1) - level.xp).toLocaleString()} XP to unlock purchasing, or {skipCostFrom(profile.xp, item.requiredLevel || 1).toLocaleString()} TK of levels above. Either way the item still costs its own price.</small></div>}
        {supply ? <div className="armory-purchase"><div><span>SUPPLY · SPENT WHEN USED</span><b>{`${item.price.toLocaleString()} ${unit} each`}</b></div>
          <button data-testid="shop-action" disabled={action.disabled} onClick={action.run}>{action.label}</button>
          <button className="armory-secondary" data-testid="shop-select" disabled={quickSlot.disabled} onClick={quickSlot.run}>{quickSlot.label}</button>
          <small>Supplies do not carry between exercises once spent. Buying is repeatable.</small></div> : <div className="armory-purchase"><div><span>{owned ? 'PERMANENT UNLOCK' : 'ONE-TIME UNLOCK'}</span><b>{owned ? 'Owned' : `${item.price.toLocaleString()} ${unit}`}</b></div><button data-testid="shop-action" disabled={action.disabled} onClick={action.run}>{action.label}</button><small>{item.currency === 'credits' && !owned ? `Every elimination pays ${ELIMINATION_CREDITS} CR. A completed FPS exercise adds 250–450 CR; counter-fire adds 100 more.` : 'Keep forever. Equip before entering the range.'}</small></div>}
{(!!item.build?.length || !!item.fitted?.length) && <div className="armory-fitted"><span className="armory-kicker">BUILT FROM</span>
          {item.build?.map(part => <div key={part.id}><strong>{part.name}</strong><small>{partCredits(part)}</small><p>{part.description}</p>{fittings.has(part.id) && <em>On the model: {fittings.get(part.id)!.visual}.</em>}</div>)}
          {item.fitted?.map(part => <div key={part.slot}><strong>{part.name}</strong><small>{part.slot} slot · fixed</small><p>{part.description}</p>{fittings.has(`fitted:${part.slot}`) && <em>On the model: {fittings.get(`fitted:${part.slot}`)!.visual}.</em>}</div>)}
          <small className="armory-fitted-note">This is a complete, fixed configuration. Buy another weapon variant to change its performance.</small></div>}
        <div className="armory-stat-heading"><SlidersHorizontal size={13} /> {vehiclePaint ? 'VEHICLE PAINT JOB' : armor ? 'COMPLETE ARMOR LOADOUT' : vision ? 'WHAT THE DEVICE SEES' : supply ? item.grenade ? 'GRENADE EFFECTS' : 'WHAT ONE USE RESTORES' : 'RESULTING WEAPON STATS'}</div><small className="armory-compare-note">{vehiclePaint ? 'Body finish only · Performance unchanged' : supply ? `On the utility belt · ${utilitySlot(utilityKind(item) ?? '')?.label ?? 'Supply'} slot, key ${utilitySlot(utilityKind(item) ?? '')?.key ?? 'G'} · You hold ${held} of ${consumableLimit(item)}` : 'Change versus your equipped loadout'}</small>
                {vision ? <VisionDossier item={item} current={current.vision?.id} /> : supply ? <div className="armory-vehicle-spec"><b>{item.name.toUpperCase()}</b><p>{[item.effect?.health && `${item.effect.health} health`, item.effect?.armor && `${item.effect.armor} armor points`, item.effect?.reserve && `${item.effect.reserve} reserve rounds`].filter(Boolean).join(' · ')}</p>{item.grenade ? <><ul className="armory-food-effects">{grenadeEffectLines(item.grenade).map(line => <li key={line}>{line}</li>)}</ul><small>{item.weightKg} kg · {item.grenade.throwSpeed} m/s · {item.grenade.fuse} s fuse. Tap 9 to ready, hold 9 to choose. Hold fire to cook; release to throw. Hold aim for a lob.</small></> : item.foodEffects?.length ? <><ul className="armory-food-effects">{foodEffectLines(item.foodEffects).map(line => <li key={line}>{line}</li>)}</ul><small>Effects start when you finish eating. Eating something that gives an effect already running keeps the stronger and the longer of the two; it never stacks. Tap 4 to eat; hold 4 in the field to pick which food the slot hands out.</small></> : <small>Armor is restored only up to the protection your inserts provide. Reserve rounds go to the shared calibre pool of the weapon in your hands.</small>}</div> : vehiclePaint ? <div className="armory-vehicle-spec"><b>{vehicle === 'car' ? 'UTILITY 01 / 4×4' : 'FALCON 01 / ROTORCRAFT'}</b><p>{vehicle === 'car' ? '72 km/h top speed · WASD to drive · Space to brake' : 'Hover, climb and cruise · Space to ascend · C / Ctrl to descend'}</p><small>Unlocked wraps fit both vehicles. Equip each separately; the preview shows your selected vehicle.</small></div> : armor ? <><Stat label="Armor pool" value={preview.armor} current={current.armor} unit=" AP" /><Stat label="Absorption" value={preview.absorption * 100} current={current.absorption * 100} unit="%" /><div className="armory-stat"><span>Rated for</span><b>{THREAT_NAMES[preview.insert.stops]}</b><em className={THREAT_CLASSES.indexOf(preview.insert.stops) > THREAT_CLASSES.indexOf(current.insert.stops) ? 'better' : THREAT_CLASSES.indexOf(preview.insert.stops) < THREAT_CLASSES.indexOf(current.insert.stops) ? 'worse' : ''}>{preview.insert.stops === current.insert.stops ? '—' : `vs ${THREAT_NAMES[current.insert.stops]}`}</em></div>{preview.insert.deflect > 0 && <Stat label="Rounds glanced off" value={preview.insert.deflect * 100} current={current.insert.deflect * 100} unit="%" />}{preview.insert.scent && <div className="armory-stat"><span>Smell</span><b>On opponents&rsquo; maps</b><em className="worse">gives you away</em></div>}<Stat label="Rig / insert mobility" value={preview.mobility * 100} current={current.mobility * 100} unit="%" /><Stat label="Jump height" value={previewMovement.jumpVelocity ** 2 * 100} current={currentMovement.jumpVelocity ** 2 * 100} unit="%" /><Stat label="Aim-in speed" value={previewMovement.aimSpeed * 100} current={currentMovement.aimSpeed * 100} unit="%" />{Object.entries(previewReserves).map(([calibre, reserve]) => <Stat key={calibre} label={`${Number(calibre)} mm shared reserve`} value={reserve} current={currentReserves[calibre] ?? 0} />)}</> : <><FalloffCurve weapon={weapon} equipped={equippedWeapon} /><SprayPattern weapon={weapon} equipped={equippedWeapon} /><Stat label="Caliber" value={weapon.caliberMm} current={equippedWeapon.caliberMm} unit=" mm" digits={2} /><Stat label="Damage" value={weapon.damage} current={equippedWeapon.damage} /><Stat label="Fire rate" value={60 / weapon.interval} current={60 / equippedWeapon.interval} unit=" RPM" /><Stat label="Magazine" value={weapon.capacity} current={equippedWeapon.capacity} /><Stat label="Reload" value={weapon.reload} current={equippedWeapon.reload} unit="s" digits={2} lower /><Stat label="Recoil" value={weapon.recoil * 1000} current={equippedWeapon.recoil * 1000} digits={1} lower /><Stat label="Recoil recovery" value={weapon.recoilRecovery * 100} current={equippedWeapon.recoilRecovery * 100} unit="%" /><Stat label="Damage at 60 m" value={hitDamage(weapon, 60)} current={hitDamage(equippedWeapon, 60)} /><Stat label="Precision hit" value={hitDamage(weapon, 15, 'head')} current={hitDamage(equippedWeapon, 15, 'head')} /><Stat label="Sight magnification" value={opticMagnification(weapon)} current={opticMagnification(equippedWeapon)} unit="×" digits={2} /><Stat label="Weapon weight" value={weapon.weightKg ?? 0} current={equippedWeapon.weightKg ?? 0} unit=" kg" digits={2} lower /></>}
        {item.category === 'weapon' && weapon.bipod && <p className="armory-description" data-testid="bipod-policy">{bipodDescription(weapon.bipod)}</p>}
        {!supply && !vehiclePaint && <div className="armory-stats" aria-label="Equipment movement penalties"><Stat label="Total carried weight" value={previewMovement.totalKg} current={currentMovement.totalKg} unit=" kg" digits={1} lower /><Stat label="Carried-load mobility" value={previewMovement.carried * 100} current={currentMovement.carried * 100} unit="%" /><Stat label="Weapon-in-hand mobility" value={previewMovement.inHand * 100} current={currentMovement.inHand * 100} unit="%" /><Stat label="Combined movement" value={previewMovement.movement * 100} current={currentMovement.movement * 100} unit="%" /><small>Slotted weapons, armor, full ammunition and held supplies. Owned gear outside this loadout adds no weight. Switching weapons changes handling; the carried load stays.</small></div>}
        <div className="armory-equipped"><span className="armory-kicker">CURRENT LOADOUT / {vehiclePaint ? 'MOTOR POOL' : FPS_WEAPONS[family].name.toUpperCase()}</span>{vehiclePaint ? <div className="armory-vehicle-equipped"><p>Utility 01 · {itemById(profile.vehicleSkins.car)?.name}</p><p>Falcon 01 · {itemById(profile.vehicleSkins.helicopter)?.name}</p></div> : <><b>{equippedWeapon.name}</b><p>{itemById(profile.guns[family].skin)?.name}</p><small>Fixed weapon configuration · change it by buying a variant.</small>{(['optic', 'magazine', 'handling'] as const).map(slot => { const part = fittedParts(profile.guns[family].variant)[slot]; return <div className="armory-slot fitted" key={slot}><span>{slot}<em>fixed</em><strong>{part?.name || (slot === 'optic' ? equippedWeapon.optic === 'iron' ? 'Iron sights · 1×' : family === 0 ? 'Integrated 1.5× · PiP' : 'Issued red dot · 1×' : slot === 'magazine' ? `${equippedWeapon.capacity}-round ${equippedWeapon.feed ?? 'magazine'}` : 'Variant factory hardware')}</strong></span></div>; })}<div className="armory-rig-summary"><Shield size={16} /><span>{current.rigName}<small>{current.plateName} · {current.armor} AP</small></span></div><div className="armory-rig-summary"><Eye size={16} /><span>{current.vision?.name ?? 'No head-mounted device'}<small>{current.vision ? `${visionTag(current.vision.id)} · N to switch on` : 'Night vision & thermal tab'}</small></span></div></>}</div>
      </aside>
    </div>
    <div className="armory-footer armory-dock">
      <div role="status">{store.saveError ? 'Browser storage unavailable. Purchases will last for this session only.' : store.message || `${ARMORY_CATALOG.length} permanent unlocks · Earn ${ELIMINATION_CREDITS} CR and ${ELIMINATION_XP} XP per elimination plus completion bonuses`}<small>Fictional game stats. Protection replenishes each exercise.</small></div>
      <div className="armory-dock-item"><span><small>SELECTED</small>{item.name}</span><button data-testid="dock-action" disabled={action.disabled} onClick={action.run}>{action.label}</button>{supply && held > 0 && !equipped && <button className="armory-secondary" onClick={quickSlot.run}>{quickSlot.label}</button>}</div>
      {!!exits.length && <nav className="armory-deploy" aria-label="Deploy">{exits.map(exit => <button key={exit.id} data-deploy={exit.id} onClick={exit.onDeploy}>{exit.id === 'world' ? <MapIcon size={16} /> : <Crosshair size={16} />}<span>{exit.label} <small>{exit.detail}</small></span><ArrowRight size={15} /></button>)}</nav>}
    </div>
  </section>;
}
