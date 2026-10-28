import { useEffect, useRef, useState } from 'react';
import PublicLobby from './PublicLobby';
import FpsGame from './FpsGame';
import type { ArmoryStore } from '../game/use-armory';
import type { LanSession } from '../game/lan-peer';
import { navigate } from '../lib/routes';
import { DebugMode } from '../lib/debug-mode';

export default function MultiplayerGame({ armory }: { armory: ArmoryStore }) {
  const owned = useRef<LanSession | null>(null);
  const [arena, setArena] = useState<{ session: LanSession; botCount: number; composition: string }>();
  useEffect(() => () => { owned.current?.close(); }, []);
  const leave = () => { owned.current?.close(); owned.current = null; setArena(undefined); };
  return <div className="game-screen game-screen-multiplayer"><main className="game-screen-body"><DebugMode.Provider value={false}>
    {arena ? <FpsGame key={arena.session.id} region="marina-bay" arena={arena} profile={armory.profile} onReward={armory.award} onElimination={armory.awardElimination} onConsume={armory.consume} onOpenShop={() => navigate('store')} onLeaveArena={leave} /> : <PublicLobby onBack={() => navigate('menu')} onLaunch={(session, bots, squad) => { owned.current = session; setArena({ session, botCount: bots, composition: squad }); }} />}
  </DebugMode.Provider></main></div>;
}
