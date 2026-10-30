import { useEffect, useRef, useState } from 'react';
import PublicLobby from './PublicLobby';
import FpsGame from './FpsGame';
import type { ArmoryStore } from '../game/use-armory';
import type { LanSession } from '../game/lan-peer';
import { transitionTo } from '../lib/route-transition';
import { DebugMode } from '../lib/debug-mode';

export default function MultiplayerGame({ armory, suspended = false }: { armory: ArmoryStore; suspended?: boolean }) {
  const owned = useRef<LanSession | null>(null);
  const [arena, setArena] = useState<{ session: LanSession; botCount: number; composition: string }>();
  useEffect(() => () => { owned.current?.close(); }, []);
  const leave = () => { owned.current?.close(); owned.current = null; setArena(undefined); };
  return <div className={`game-screen game-screen-multiplayer ${arena ? 'has-match' : 'has-lobby'}`}><main className="game-screen-body"><DebugMode.Provider value={false}>
    {arena ? <FpsGame suspended={suspended} key={arena.session.id} region="marina-bay" arena={arena} profile={armory.profile} onReward={armory.award} onElimination={armory.awardElimination} onConsume={armory.consume} onOpenShop={() => transitionTo('store', 'Store')} onLeaveArena={leave} /> : <PublicLobby onBack={() => transitionTo('menu', 'Menu')} onLaunch={(session, bots, squad) => { owned.current = session; setArena({ session, botCount: bots, composition: squad }); }} />}
  </DebugMode.Provider></main></div>;
}
