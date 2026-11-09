import { Radio, Radar, Shield, Crosshair, Plane, ScanLine } from 'lucide-react';
import { STREAKS, defaultStreaks, streakAvailable, type StreakId, type StreakMode, type StreakProgress, type StreakEffect } from '../game/match-streaks';
import { tapProps } from './touch-tap';
import './match-streaks.css';

const icons = { recon: Radar, jammer: Radio, interceptor: Shield, hunter: Plane, strike: Crosshair, sentry: ScanLine };
export function MatchStreakLoadout({ mode, progress, disabled, onChange }: { mode: StreakMode; progress?: StreakProgress; disabled: boolean; onChange: (ids: StreakId[]) => void }) {
  const loadout = progress?.loadout ?? defaultStreaks(mode);
  return <details className="arena-menu-section streak-loadout"><summary>{mode === 'hardpoint' ? 'Objective streaks' : 'Killstreaks'} · choose three</summary>
    <p>{mode === 'hardpoint' ? '100 charge per kill · +25 on the hill · +10 per uncontested second, up to 200 per life.' : 'Earn rewards with kills in one life.'} Earned rewards survive death. Streak kills do not earn more streaks.</p>
    {loadout.map((id, i) => <label key={i}>Slot {i + 1}<select aria-label={`Streak slot ${i + 1}`} value={id} disabled={disabled} onChange={e => onChange(loadout.map((old, n) => n === i ? e.target.value as StreakId : old))}>
      {(Object.keys(STREAKS) as StreakId[]).filter(option => streakAvailable(option, mode)).map(option => <option key={option} value={option} disabled={option !== id && loadout.includes(option)}>{STREAKS[option].name} · {mode === 'hardpoint' ? `${STREAKS[option].cost} charge` : `${STREAKS[option].cost / 100} kills`}</option>)}
    </select><small>{STREAKS[id].description}</small></label>)}
    {disabled && <p>Streak loadouts lock when the match starts.</p>}
  </details>;
}
export function MatchStreakHud({ progress, effects, now, hardpoint, alive, touch, placement, onUse, onConfirm, onCancel }: {
  progress?: StreakProgress; effects: StreakEffect[]; now: number; hardpoint: boolean; alive: boolean; touch: boolean; placement: StreakId | null;
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
    {placement && <div className="streak-placement" role="status"><strong>{STREAKS[placement].name}</strong><span>Aim at clear ground · {placement === 'strike' ? '100m range · 5m blast' : '8m placement range'}</span><div><button type="button" {...tapProps(onConfirm)}>{touch ? 'Deploy here' : 'Fire to deploy'}</button><button type="button" {...tapProps(onCancel)}>Cancel{!touch && ' · Esc'}</button></div></div>}
  </>;
}
