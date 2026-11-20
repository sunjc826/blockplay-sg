import { useEffect, useRef } from 'react';
import { PRECISION_STRIKE } from '../game/precision-strike';
import { Radio, Radar, Shield, Crosshair, Plane, ScanLine, Bot, Check, Lock, Package, ZapOff, Bomb, Rocket } from 'lucide-react';
import { BARRAGE, STREAKS, orderStreaks, streakAvailable, validStreakLoadout, type StreakId, type StreakMode, type StreakProgress, type StreakEffect } from '../game/match-streaks';
import { tapProps } from './touch-tap';
import './match-streaks.css';

const icons = { recon: Radar, jammer: Radio, interceptor: Shield, supply: Package, hunter: Plane, strike: Crosshair, sentry: ScanLine, blackout: ZapOff, barrage: Bomb, gunship: Rocket };
const ROLES: Record<StreakId, string> = { recon: 'Intel', jammer: 'Counter-intel', interceptor: 'Defence', supply: 'Support', hunter: 'Lethal', strike: 'Lethal', sentry: 'Area denial', blackout: 'Counter-intel', barrage: 'Lethal', gunship: 'Air support' };
const STORE = 'blockplay-streak-loadouts';
/** A bot in the match and the three rewards it drew. */
export interface StreakFieldEntry { id: string; name: string; loadout: StreakId[]; side: 'ally' | 'enemy' }

/** The player's last confirmed choice for a mode, if it is still a legal one. */
export function savedStreaks(mode: StreakMode): StreakId[] | null {
  try { const value: unknown = JSON.parse(localStorage.getItem(STORE) ?? '{}')?.[mode]; return validStreakLoadout(value, mode) ? orderStreaks(value) : null; } catch { return null; }
}
export function saveStreaks(mode: StreakMode, ids: StreakId[]) {
  try { localStorage.setItem(STORE, JSON.stringify({ ...JSON.parse(localStorage.getItem(STORE) ?? '{}'), [mode]: ids })); } catch { /* Private browsing: the choice lasts this match only. */ }
}
/** Rewards cost points, not kills: a kill is 100, and in TDM and FFA headshots, assists and medals add to it. */
const price = (id: StreakId) => `${STREAKS[id].cost} pts`;

/** Carry the last confirmed choice into a new match, once, while it can still be changed. */
export function useSavedStreaks(mode: StreakMode, progress: StreakProgress | undefined, locked: boolean, onChange: (ids: StreakId[]) => void) {
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current || locked || !progress) return;
    restored.current = true;
    const saved = savedStreaks(mode);
    if (saved && saved.join() !== orderStreaks(progress.loadout).join()) onChange(saved);
  }, [locked, progress, mode, onChange]);
}
export const streakTitle = (mode: StreakMode) => mode === 'hardpoint' ? 'Objective streaks' : 'Scorestreaks';
/** "Kestrel Recon · Hunter Drone · Precision Strike", for a one-line summary of what is carried. */
export const streakSummary = (ids: readonly StreakId[]) => ids.map(id => STREAKS[id].name).join(' · ');

/**
 * The streak row of the deployment locker: every reward the mode allows as a
 * card in the locker's own style, three of them carried. The locker owns the
 * draft and saves it with the weapons; once the match clock runs it is read-only.
 */
export function StreakLoadoutSection({ mode, draft, locked, busy = false, field = [], onDraft }: { mode: StreakMode; draft: StreakId[]; locked: boolean; busy?: boolean; field?: StreakFieldEntry[]; onDraft: (ids: StreakId[]) => void }) {
  const hardpoint = mode === 'hardpoint', options = (Object.keys(STREAKS) as StreakId[]).filter(id => streakAvailable(id, mode));
  const toggle = (id: StreakId) => onDraft(draft.includes(id) ? draft.filter(old => old !== id) : draft.length < 3 ? orderStreaks([...draft, id]) : draft);
  return <section className="loadout-choice loadout-streaks" data-streak-count={options.length}>
    <h3>{streakTitle(mode)} <span>{locked ? <><Lock size={11} aria-hidden /> Locked once the match starts</> : `${draft.length} of 3 chosen`}</span></h3>
    <p>{hardpoint ? '100 points per kill · +25 on the hill · +10 per uncontested second, up to 200 per life.' : 'Rewards cost points scored in one life: 100 per kill, plus headshots, assists, multikills and the other awards.'} Earned rewards survive death. Streak kills do not earn more streaks.</p>
    <div className="loadout-variants streak-cards" role="group" aria-label={`${streakTitle(mode)}: choose three`}>{options.map(id => {
      const Icon = icons[id], spec = STREAKS[id], slot = draft.indexOf(id), full = slot < 0 && draft.length === 3, seconds = id === 'recon' && mode === 'free-for-all' ? 10 : spec.seconds;
      return <button type="button" key={id} data-streak-card={id} aria-pressed={slot >= 0} aria-disabled={locked || busy || full || undefined} onClick={() => { if (!locked && !busy) toggle(id); }}>
        <i><Icon size={24} aria-hidden /></i>
        <strong>{spec.name}</strong>
        <span>{price(id)} · {ROLES[id]} · {id === 'strike' || id === 'barrage' ? `${BARRAGE.warning}s warning` : `${seconds}s`}{spec.health ? ` · ${spec.health} HP` : ''}</span>
        <small>{spec.description}</small>
        <em>{slot >= 0 ? <><Check size={11} aria-hidden /> Slot {slot + 1} · key {slot + 4}</> : locked ? 'Not carried' : full ? 'Remove one to swap' : 'Tap to carry'}</em>
      </button>;
    })}</div>
    {field.length > 0 && <details className="streak-field">
      <summary><Bot size={13} aria-hidden /> What the bots carry <span>{field.length}</span></summary><p>Each bot draws three rewards at random when it joins, and earns them the way you do.</p>
      <ul>{field.map(entry => <li key={entry.id} data-side={entry.side}><b>{entry.name}</b>{mode !== 'free-for-all' && <small>{entry.side === 'ally' ? 'Your team' : 'Enemy'}</small>}
        <span>{entry.loadout.map(id => { const Icon = icons[id]; return <i key={id} title={`${STREAKS[id].name} · ${price(id)}`} aria-label={STREAKS[id].name} role="img"><Icon size={14} aria-hidden /></i>; })}</span></li>)}</ul>
    </details>}
  </section>;
}
export function MatchStreakHud({ progress, effects, now, hardpoint, alive, touch, placement, notice, onUse, onConfirm, onCancel }: {
  progress?: StreakProgress; effects: StreakEffect[]; now: number; hardpoint: boolean; alive: boolean; touch: boolean; placement: StreakId | null; notice?: string;
  onUse: (slot: number) => void; onConfirm: () => void; onCancel: () => void;
}) {
  if (!progress) return null;
  return <>
    <div className="match-streak-hud" aria-label={hardpoint ? 'Objective streak rewards' : 'Scorestreak rewards'}>
      {progress.loadout.map((id, i) => {
        const Icon = icons[id], ready = progress.ready.includes(id), active = effects.find(e => e.kind === id), cost = STREAKS[id].cost;
        const status = active ? `${Math.max(0, Math.ceil(active.until - now))}s active` : ready ? 'READY' : progress.earned.includes(id) ? 'USED' : `${Math.floor(progress.charge)} / ${cost}`;
        return <button key={id} type="button" data-ready={ready || undefined} data-streak={id} aria-label={`${STREAKS[id].name}: ${status}`} title={`${STREAKS[id].name} · ${STREAKS[id].description}`} disabled={!alive || !ready || !!active} {...tapProps(() => onUse(i))}>
          <span><Icon size={18} />{!touch && <kbd>{i + 4}</kbd>}</span><b>{STREAKS[id].name}</b><small>{status}</small><progress max={cost} value={ready || active || progress.earned.includes(id) ? cost : progress.charge} aria-label={`${STREAKS[id].name} progress`} />
        </button>;
      })}
    </div>
    {placement && <div className="streak-placement" role="status"><strong>{STREAKS[placement].name}</strong><span>{placement === 'strike' ? `Aim at an enemy or visible ground · ${PRECISION_STRIKE.range}m range · ${PRECISION_STRIKE.radius}m blast radius` : placement === 'barrage' ? `Aim at an enemy or visible ground · ${PRECISION_STRIKE.range}m range · ${BARRAGE.shells} shells walk away from you` : 'Look down at clear ground · 8m placement range'}</span>{notice && <span className="streak-placement-notice">{notice}</span>}<div><button type="button" {...tapProps(onConfirm)}>{touch ? 'Deploy here' : 'Fire to deploy'}</button><button type="button" {...tapProps(onCancel)}>Cancel{!touch && ' · Esc'}</button></div></div>}
  </>;
}
