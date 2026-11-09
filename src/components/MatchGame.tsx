import { useCallback, useEffect, useState } from 'react';
import PublicLobby from './PublicLobby';
import ArenaMatchGame from './ArenaMatchGame';
import type { ArenaMatch } from '../game/arena-match';
import type { ArmoryStore } from '../game/use-armory';
import { createSoloSession, type LanSession } from '../game/lan-peer';
import { transitionTo } from '../lib/route-transition';
import { DebugMode } from '../lib/debug-mode';
import { setMusicCue } from '../lib/music';
import type { RoomPresence } from '../game/room-presence';

type Props = {
  armory: ArmoryStore;
  onBack: (approved?: boolean) => void;
  backLabel: string;
  suspended?: boolean;
} & ({ kind: 'solo'; match: ArenaMatch } | { kind: 'online'; match?: ArenaMatch });

/** Load solo maps immediately; keep online arenas mounted when returning to a room. */
export default function MatchGame({ armory, kind, match, onBack, backLabel, suspended = false }: Props) {
  const [arena, setArena] = useState<{ session: LanSession; botCount: number; composition: string; match: ArenaMatch }>();
  const [inMatch, setInMatch] = useState(false);
  const [leaveRequest, setLeaveRequest] = useState(0);
  const [phase, setPhase] = useState('loading');
  const profile = armory.profile;
  const status: RoomPresence = !inMatch ? 'In room' : phase === 'loading' ? 'Loading' : phase === 'ready' ? 'Ready' : phase === 'complete' ? 'Match complete' : 'In match';
  const onPhase = useCallback((next: string) => setPhase(next), []);
  useEffect(() => setMusicCue(inMatch ? null : 'menu'), [inMatch]);
  useEffect(() => {
    if (kind !== 'solo' || !match) return;
    const session = createSoloSession('Operator');
    setArena({ session, botCount: 3, composition: 'mixed', match });
    setInMatch(true);
    return () => session.close();
  }, [kind, match]);
  const launch = (session: LanSession, botCount: number, composition: string, match: ArenaMatch) => {
    if (arena?.session !== session) {
      setPhase('loading');
      setArena({ session, botCount, composition, match });
    }
    setInMatch(true);
  };
  const disconnect = () => { setArena(undefined); setInMatch(false); };
  const leave = () => {
    if (kind === 'solo') {
      arena?.session.close();
      disconnect();
      onBack(true);
    } else {
      setInMatch(false);
      setLeaveRequest(n => n + 1);
    }
  };
  const setup = { active: !inMatch, hasMatch: !!arena, onBack, backLabel };

  return <div className={`game-screen game-screen-match ${inMatch ? 'has-match' : 'has-lobby'}`}>
    <main className="game-screen-body"><DebugMode.Provider value={false}>
      <div style={{ display: inMatch ? 'none' : 'contents' }}>
        {kind === 'online' && <PublicLobby {...setup} match={match} status={status} leaveRequest={leaveRequest} onDisconnect={disconnect} onLaunch={launch} />}
      </div>
      {arena && <div style={{ display: inMatch ? 'contents' : 'none' }} aria-hidden={!inMatch}>
        <ArenaMatchGame key={arena.session.id} roomView={!inMatch} suspended={suspended || !inMatch} onPhaseChange={onPhase}
          onReturnRoom={kind === 'online' ? () => setInMatch(false) : undefined} region="marina-bay" arena={arena} profile={profile} onReward={armory.award}
          onElimination={armory.awardElimination} onConsume={armory.consume} onRentalTime={armory.advanceRentalTime}
          onOpenShop={() => transitionTo('store')} onLeaveArena={leave} />
      </div>}
    </DebugMode.Provider></main>
  </div>;
}
