import { ArrowLeft, ArrowRight } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { matchSummary } from '../game/match-menu';
import type { ArenaMatch } from '../game/arena-match';
import type { ArmoryProfile } from '../game/armory-state';
import type { RespawnLoadoutSelection } from '../game/respawn-loadout';
import MatchBotSettings, { type MatchSquad } from './MatchBotSettings';
import RespawnLoadoutSelector from './RespawnLoadoutSelector';

export default function SoloMatchSetup({ match, active, hasMatch, suspended, profile, onLoadout, backLabel, onBack, onLaunch, onEnd }: {
  match: ArenaMatch;
  active: boolean;
  hasMatch: boolean;
  suspended: boolean;
  profile: ArmoryProfile;
  onLoadout: (selection: RespawnLoadoutSelection) => Promise<boolean>;
  backLabel: string;
  onBack: () => void;
  onLaunch: (bots: number, squad: MatchSquad) => void;
  onEnd: () => void;
}) {
  const [bots, setBots] = useState(3);
  const [squad, setSquad] = useState<MatchSquad>('mixed');
  const [locker, setLocker] = useState(false);
  const primary = useRef<HTMLButtonElement>(null);
  const info = matchSummary(match);
  useEffect(() => {
    if (!active || !hasMatch) return;
    const frame = requestAnimationFrame(() => primary.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [active, hasMatch]);
  return <section className="lan-lobby solo-setup" aria-labelledby="solo-match-title">
    <nav className="lobby-navigation" aria-label="Single Player">
      <button className="play-nav-back" onClick={onBack}><ArrowLeft size={16} /> {backLabel}</button>
    </nav>
    <div className="solo-setup-body">
      <header>
        <span className="starting-eyebrow">SINGLE PLAYER</span>
        <h1 id="solo-match-title">{info.name}</h1>
        <p className="solo-arena-name">{info.map}</p>
      </header>
      {hasMatch ? <p>Return to your current match. Once started, it keeps running while you are in setup.</p> : <>
        <p>{info.description}</p>
        <p className="solo-rules">{info.rules}{match.mode !== 'free-for-all' && ' · Bots fill both teams'}</p>
        <button className="lan-secondary" onClick={() => setLocker(true)}>Choose starting loadout</button>
        {match.mode === 'free-for-all' && <MatchBotSettings bots={bots} squad={squad} onBots={setBots} onSquad={setSquad} />}
      </>}
      <button ref={primary} className="lan-deploy" disabled={suspended} onClick={() => onLaunch(bots, squad)}>
        {hasMatch ? 'Return to match' : 'Load arena'} <ArrowRight size={18} />
      </button>
      {hasMatch && <button className="lan-cancel" onClick={onEnd}>End solo match</button>}
    </div>
    {locker && <RespawnLoadoutSelector deployment inventory={profile} selected={profile} onSave={onLoadout} onClose={() => setLocker(false)} />}
  </section>;
}
