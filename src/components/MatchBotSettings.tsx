import { useStreamerActive } from './StreamerMode';
import { useId } from 'react';

export const MATCH_SQUADS = ['mixed', 'assault', 'tank', 'heavy', 'sniper'] as const;
export type MatchSquad = typeof MATCH_SQUADS[number];

export default function MatchBotSettings({ bots, squad, onBots, onSquad }: {
  bots: number;
  squad: MatchSquad;
  onBots: (bots: number) => void;
  onSquad: (squad: MatchSquad) => void;
}) {
  const id = useId(), streaming = useStreamerActive();
  if (streaming) return <fieldset><legend>Bot opponents</legend>
    {[0,1,2,3,4,5,6].map(n => <button key={n} data-ai-action={'bots-'+n} data-ai-kind="select" aria-pressed={n === bots} onClick={()=>onBots(n)}>{n} bots</button>)}
    {MATCH_SQUADS.map(value => <button key={value} data-ai-action={'squad-'+value} data-ai-kind="select" aria-pressed={squad === value} disabled={!bots} onClick={()=>onSquad(value)}>{value} squad</button>)}
  </fieldset>;
  return <details className="public-options">
    <summary>Bot settings <span>{bots} bots</span></summary>
    <div className="lan-bot-control">
      <div><label htmlFor={id}>Bot opponents</label><output>{bots}</output></div>
      <input id={id} type="range" min={0} max={6} value={bots} onChange={event => onBots(Number(event.target.value))} />
    </div>
    <div className="lan-squad-control">
      <label htmlFor={`${id}-squad`}>Bot squad</label>
      <select id={`${id}-squad`} value={squad} onChange={event => onSquad(event.target.value as MatchSquad)} disabled={!bots}>
        {MATCH_SQUADS.map(value => <option value={value} key={value}>{value[0].toUpperCase() + value.slice(1)}{value === 'heavy' ? ' MG' : ''} squad</option>)}
      </select>
    </div>
  </details>;
}
