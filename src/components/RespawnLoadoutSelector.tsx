import { useEffect, useRef, useState } from 'react';
import { ARMORY_CATALOG, isShopFamily } from '../game/armory-catalog';
import { expireRentals, fittedVariantSpec, type ArmoryProfile } from '../game/armory-state';
import { EXTRA_SLOT_ID, isMainWeapon, SIDEARM_FAMILY } from '../game/armory-slots';
import { DEFAULT_VARIANTS, FPS_WEAPONS } from '../game/fps-rules';
import { applyRespawnLoadout, selectedRespawnLoadout, type RespawnLoadoutSelection } from '../game/respawn-loadout';
import { hasItemAccess, rentalTimeLeft } from '../game/weapon-rentals';
import { armoryThumbnailFile } from '../game/armory-thumbnails';
import './respawn-loadout.css';

export default function RespawnLoadoutSelector({ inventory, selected, onSave, onClose, deployment = false }: {
  deployment?: boolean; inventory: ArmoryProfile; selected: ArmoryProfile;
  onSave: (selection: RespawnLoadoutSelection) => Promise<boolean>; onClose: () => void;
}) {
  const [draft, setDraft] = useState(() => selectedRespawnLoadout(selected));
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const root = useRef<HTMLDivElement>(null), heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);
  const ready = expireRentals(inventory), valid = !!applyRespawnLoadout(ready, draft);
  const platforms = FPS_WEAPONS.flatMap((weapon, family) => isMainWeapon(family) && isShopFamily(family) ? [{ family, name: weapon.name }] : []);
  const chooseFamily = (slot: 'main' | 'extra', raw: string) => {
    const family = raw === '' ? null : Number(raw);
    setDraft(current => {
      const carry = { ...current.carry, [slot]: family };
      if (slot === 'main' && family === carry.extra) carry.extra = null;
      const variants = [...current.variants];
      if (family !== null && !hasItemAccess(ready, variants[family])) variants[family] = DEFAULT_VARIANTS[family];
      return { carry, variants };
    }); setError('');
  };
  const slot = (title: string, family: number | null, kind?: 'main' | 'extra') => <section className="loadout-choice" key={title}>
    <h3>{title}</h3>
    {kind && <label>Platform<select disabled={busy} aria-label={`${title} platform`} value={family ?? ''} onChange={event => chooseFamily(kind, event.target.value)}>
      {kind === 'extra' && <option value="">Empty · travel lighter</option>}
      {platforms.map(platform => <option key={platform.family} value={platform.family} disabled={kind === 'extra' && platform.family === draft.carry.main}>{platform.name}</option>)}
    </select></label>}
    {family !== null && <div className="loadout-variants" role="group" aria-label={`${title} variant`}>{ARMORY_CATALOG.filter(item => item.category === 'weapon' && item.family === family && hasItemAccess(ready, item.id)).map(item => {
      const spec = fittedVariantSpec(item)!;
      return <button type="button" disabled={busy} key={item.id} data-loadout-variant={item.id} aria-pressed={draft.variants[family] === item.id} onClick={() => { setDraft(current => { const variants = [...current.variants]; variants[family] = item.id; return { ...current, variants }; }); setError(''); }}>
        <img src={`${import.meta.env.BASE_URL}images/armory/${armoryThumbnailFile(item, family)}`} alt="" width={480} height={240} />
        <strong>{item.name}</strong><span>{spec.damage} DMG · {spec.capacity} rounds</span>
        <small>{ready.owned.includes(item.id) ? 'Issued' : rentalTimeLeft(ready.rentals[item.id])}</small>
      </button>;
    })}</div>}
    {family !== null && !hasItemAccess(ready, draft.variants[family]) && <p role="alert">Rental expired. Choose an available weapon.</p>}
  </section>;
  return <div ref={root} className="respawn-loadout-screen" role="dialog" aria-modal="true" aria-labelledby="loadout-screen-title" onKeyDown={event => {
    if (event.key === 'Escape') { event.stopPropagation(); onClose(); }
    if (event.key !== 'Tab') return;
    const controls = [...root.current!.querySelectorAll<HTMLElement>('button:not(:disabled), select:not(:disabled)')];
    const first = controls[0], last = controls[controls.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === heading.current)) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }}>
    <div className="respawn-loadout-panel"><header><span>DEPLOYMENT LOCKER</span><h2 ref={heading} tabIndex={-1} id="loadout-screen-title">{deployment?'Choose your starting loadout':'Choose your next loadout'}</h2>
      <p>{deployment?'These weapons are equipped when you enter the match.':'Queued weapons arrive on your next respawn. Your current life keeps its gear. The fight and respawn timer continue.'}</p>
      <button type="button" aria-label="Close loadout selector" onClick={onClose}>Close</button></header>
      <div className="respawn-loadout-columns">
        {slot('Main weapon', draft.carry.main, 'main')}
        {hasItemAccess(ready, EXTRA_SLOT_ID) ? slot('Extra main', draft.carry.extra, 'extra') : <section className="loadout-choice loadout-slot-locked"><h3>Extra main</h3><p>Rent the extra main slot in the Store to carry a second main weapon.</p></section>}
        {slot('Sidearm', SIDEARM_FAMILY)}
      </div>
      <footer><div><p>{error || (!valid ? 'Select available weapons in each carried slot.' : 'Only issued weapons and active rentals from your locker are shown.')}</p><small>Your Store loadout stays saved. These choices last for this session.</small></div>
        <button type="button" onClick={onClose}>Cancel</button><button type="button" data-testid="queue-loadout" disabled={busy || !valid} onClick={async () => {
          setBusy(true); setError('');
          try { if (await onSave(draft)) onClose(); else setError(deployment ? 'Loadout could not be saved. Check your rental time and try again.' : 'Loadout could not be queued. Check your connection and rental time, then try again.'); }
          catch { setError('Loadout could not be queued. Try again.'); }
          finally { setBusy(false); }
        }}>{busy ? 'Saving…' : deployment ? 'Use for this match' : 'Use on next respawn'}</button></footer>
    </div>
  </div>;
}
