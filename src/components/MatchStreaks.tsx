import { useEffect, useRef, useState } from 'react';
import { PRECISION_STRIKE } from '../game/precision-strike';
import { Radio, Radar, Shield, Crosshair, Plane, ScanLine, Bot, Check, Lock, X } from 'lucide-react';
import { STREAKS, defaultStreaks, orderStreaks, streakAvailable, validStreakLoadout, type StreakId, type StreakMode, type StreakProgress, type StreakEffect } from '../game/match-streaks';
import { tapProps } from './touch-tap';
import './match-streaks.css';

const icons = { recon: Radar, jammer: Radio, interceptor: Shield, hunter: Plane, strike: Crosshair, sentry: ScanLine };
const ROLES: Record<StreakId, string> = { recon: 'Intel', jammer: 'Counter-intel', interceptor: 'Defence', hunter: 'Lethal', strike: 'Lethal', sentry: 'Area denial' };
const MODE_NAMES: Record<StreakMode, string> = { 'free-for-all': 'Free-for-all', 'team-deathmatch': 'Team deathmatch', hardpoint: 'Hardpoint' };
const STORE = 'blockplay-streak-loadouts';
/** A bot in the match and the three rewards it drew. */
export interface StreakFieldEntry { id: string; name: string; loadout: StreakId[]; side: 'ally' | 'enemy' }

/** The player's last confirmed choice for a mode, if it is still a legal one. */
export function savedStreaks(mode: StreakMode): StreakId[] | null {
  try { const value: unknown = JSON.parse(localStorage.getItem(STORE) ?? '{}')?.[mode]; return validStreakLoadout(value, mode) ? orderStreaks(value) : null; } catch { return null; }
}
function saveStreaks(mode: StreakMode, ids: StreakId[]) {
  try { localStorage.setItem(STORE, JSON.stringify({ ...JSON.parse(localStorage.getItem(STORE) ?? '{}'), [mode]: ids })); } catch { /* Private browsing: the choice lasts this match only. */ }
}
const price = (id: StreakId, mode: StreakMode) => mode === 'hardpoint' ? `${STREAKS[id].cost} charge` : `${STREAKS[id].cost / 100} kills`;

/**
 * The match menu's streak section and the selection menu it opens.
 *
 * The section shows the three rewards in the order they arrive. The menu is a
 * modal with every reward the mode allows as a card, a ladder showing when the
 * chosen three unlock, and the three each bot drew.
 */
export function MatchStreakLoadout({ mode, progress, disabled, field = [], onChange }: { mode: StreakMode; progress?: StreakProgress; disabled: boolean; field?: StreakFieldEntry[]; onChange: (ids: StreakId[]) => void }) {
  const loadout = progress?.loadout ?? defaultStreaks(mode), hardpoint = mode === 'hardpoint';
  const dialog = useRef<HTMLDialogElement>(null), restored = useRef(false);
  const [draft, setDraft] = useState<StreakId[]>(loadout);
  // Carry the last confirmed choice into a new match while it can still be changed.
  useEffect(() => {
    if (restored.current || disabled || !progress) return;
    restored.current = true;
    const saved = savedStreaks(mode);
    if (saved && saved.join() !== orderStreaks(progress.loadout).join()) onChange(saved);
  }, [disabled, progress, mode, onChange]);
  const open = () => { setDraft(orderStreaks(loadout)); dialog.current?.showModal(); };
  const close = () => dialog.current?.close();
  const toggle = (id: StreakId) => setDraft(current => current.includes(id) ? current.filter(old => old !== id) : current.length < 3 ? orderStreaks([...current, id]) : current);
  const confirm = () => { if (draft.length !== 3 || disabled) return; onChange(draft); saveStreaks(mode, draft); close(); };
  const options = (Object.keys(STREAKS) as StreakId[]).filter(id => streakAvailable(id, mode));
  const title = hardpoint ? 'Objective streaks' : 'Killstreaks';
  const rules = `${hardpoint ? '100 charge per kill · +25 on the hill · +10 per uncontested second, up to 200 per life.' : 'Earn rewards with kills in one life.'} Earned rewards survive death. Streak kills do not earn more streaks.`;
  return <section className="arena-menu-section streak-loadout">
    <header><h3>{title}</h3><button type="button" className="streak-loadout-open" onClick={open}>{disabled ? 'View' : 'Change'}</button></header>
    <ol className="streak-slots">{loadout.map((id, i) => { const Icon = icons[id]; return <li key={id} aria-label={`Streak slot ${i + 1}: ${STREAKS[id].name}, ${price(id, mode)}`}><Icon size={16} aria-hidden /><b>{STREAKS[id].name}</b><small>{price(id, mode)}</small></li>; })}</ol>
    {disabled && <p><Lock size={11} aria-hidden /> Streak loadouts lock when the match starts.</p>}
    <dialog ref={dialog} className="streak-menu" aria-labelledby="streak-menu-title" onKeyDown={event => event.stopPropagation()} onClick={event => { if (event.target === event.currentTarget) close(); }}>
      <div className="streak-menu-panel">
        <header><span>{MODE_NAMES[mode].toUpperCase()} · {title.toUpperCase()}</span><h2 id="streak-menu-title">Choose three rewards</h2><p>{rules}</p><button type="button" aria-label="Close streak menu" onClick={close}><X size={16} aria-hidden /></button></header>
        <ol className="streak-ladder" aria-label={`When your rewards unlock, in ${hardpoint ? 'charge' : 'kills'}`}>{[1, 2, 3, 4, 5, 6, 7].map(step => {
          const here = draft.filter(id => STREAKS[id].cost === step * 100);
          return <li key={step} data-on={here.length ? '' : undefined}><span>{here.map(id => { const Icon = icons[id]; return <i key={id} title={STREAKS[id].name}><Icon size={14} aria-hidden /><em>{STREAKS[id].name}</em></i>; })}</span><b>{hardpoint ? step * 100 : step}</b></li>;
        })}</ol>
        <div className="streak-cards" role="group" aria-label="Available rewards">{options.map(id => {
          const Icon = icons[id], spec = STREAKS[id], slot = draft.indexOf(id), full = slot < 0 && draft.length === 3, seconds = id === 'recon' && mode === 'free-for-all' ? 10 : spec.seconds;
          return <button type="button" key={id} data-streak-card={id} aria-pressed={slot >= 0} aria-disabled={disabled || full || undefined} onClick={() => { if (!disabled) toggle(id); }}>
            <span className="streak-card-top"><i><Icon size={22} aria-hidden /></i><strong>{hardpoint ? spec.cost : spec.cost / 100}<small>{hardpoint ? 'charge' : 'kills'}</small></strong></span>
            <b>{spec.name}</b><em>{ROLES[id]}</em>
            <span className="streak-card-text">{spec.description}</span>
            <span className="streak-card-stats"><span>{id === 'strike' ? `${seconds}s warning` : `${seconds}s active`}</span><span>{spec.health ? `${spec.health} HP` : 'Cannot be shot down'}</span></span>
            <span className="streak-card-state">{slot >= 0 ? <><Check size={12} aria-hidden /> Slot {slot + 1} · key {slot + 4}</> : disabled ? 'Not carried' : full ? 'Remove one to swap' : 'Tap to carry'}</span>
          </button>;
        })}</div>
        {field.length > 0 && <section className="streak-field" aria-label="Bot streak loadouts">
          <h3><Bot size={14} aria-hidden /> Bots in this match</h3><p>Each bot draws three rewards at random when it joins, and earns them the way you do.</p>
          <ul>{field.map(entry => <li key={entry.id} data-side={entry.side}><b>{entry.name}</b>{mode !== 'free-for-all' && <small>{entry.side === 'ally' ? 'Your team' : 'Enemy'}</small>}
            <span>{entry.loadout.map(id => { const Icon = icons[id]; return <i key={id} title={`${STREAKS[id].name} · ${price(id, mode)}`} aria-label={STREAKS[id].name} role="img"><Icon size={14} aria-hidden /></i>; })}</span></li>)}</ul>
        </section>}
        <footer><p role="status">{disabled ? 'Locked for this match.' : draft.length === 3 ? 'Three chosen. Confirm to carry them.' : `Choose ${3 - draft.length} more.`}</p>
          <button type="button" onClick={close}>{disabled ? 'Close' : 'Cancel'}</button>{!disabled && <button type="button" data-streak-confirm disabled={draft.length !== 3} onClick={confirm}>Confirm</button>}</footer>
      </div>
    </dialog>
  </section>;
}
export function MatchStreakHud({ progress, effects, now, hardpoint, alive, touch, placement, notice, onUse, onConfirm, onCancel }: {
  progress?: StreakProgress; effects: StreakEffect[]; now: number; hardpoint: boolean; alive: boolean; touch: boolean; placement: StreakId | null; notice?: string;
  onUse: (slot: number) => void; onConfirm: () => void; onCancel: () => void;
}) {
  if (!progress) return null;
  return <>
    <div className="match-streak-hud" aria-label={hardpoint ? 'Objective streak rewards' : 'Killstreak rewards'}>
      {progress.loadout.map((id, i) => {
        const Icon = icons[id], ready = progress.ready.includes(id), active = effects.find(e => e.kind === id), cost = STREAKS[id].cost;
        const status = active ? `${Math.max(0, Math.ceil(active.until - now))}s active` : ready ? 'READY' : progress.earned.includes(id) ? 'USED' : hardpoint ? `${Math.floor(progress.charge)} / ${cost}` : `${Math.floor(progress.charge / 100)} / ${cost / 100}`;
        return <button key={id} type="button" data-ready={ready || undefined} data-streak={id} aria-label={`${STREAKS[id].name}: ${status}`} title={`${STREAKS[id].name} · ${STREAKS[id].description}`} disabled={!alive || !ready || !!active} {...tapProps(() => onUse(i))}>
          <span><Icon size={18} />{!touch && <kbd>{i + 4}</kbd>}</span><b>{STREAKS[id].name}</b><small>{status}</small><progress max={cost} value={ready || active || progress.earned.includes(id) ? cost : progress.charge} aria-label={`${STREAKS[id].name} progress`} />
        </button>;
      })}
    </div>
    {placement && <div className="streak-placement" role="status"><strong>{STREAKS[placement].name}</strong><span>{placement === 'strike' ? `Aim at an enemy or visible ground · ${PRECISION_STRIKE.range}m range · ${PRECISION_STRIKE.radius}m blast radius` : 'Look down at clear ground · 8m placement range'}</span>{notice && <span className="streak-placement-notice">{notice}</span>}<div><button type="button" {...tapProps(onConfirm)}>{touch ? 'Deploy here' : 'Fire to deploy'}</button><button type="button" {...tapProps(onCancel)}>Cancel{!touch && ' · Esc'}</button></div></div>}
  </>;
}
