import { useCallback, useEffect, useState } from 'react';
import PublicLobby from './PublicLobby';
import ArenaMatchGame from './ArenaMatchGame';
import type { ArenaMatch } from '../game/arena-match';
import type { ArmoryStore } from '../game/use-armory';
import type { LanSession } from '../game/lan-peer';
import { applyRespawnLoadout, type RespawnLoadoutSelection } from '../game/respawn-loadout';
import { transitionTo } from '../lib/route-transition';
import { DebugMode } from '../lib/debug-mode';
import { setMusicCue } from '../lib/music';
import type { RoomPresence } from '../game/room-presence';

/** Room owns the connection; switching views never destroys the authority or player. */
export default function MultiplayerGame({ armory, suspended = false }: { armory: ArmoryStore; suspended?: boolean }) {
  const [arena,setArena]=useState<{session:LanSession;botCount:number;composition:string;match:ArenaMatch}>();
  const [inMatch,setInMatch]=useState(false),[leaveRequest,setLeaveRequest]=useState(0),[phase,setPhase]=useState('loading');
  const [selection,setSelection]=useState<RespawnLoadoutSelection>();
  const profile=selection?applyRespawnLoadout(armory.profile,selection)??armory.profile:armory.profile;
  const status:RoomPresence=!inMatch?'In room':phase==='loading'?'Loading':phase==='ready'?'Ready':phase==='complete'?'Match complete':'In match';
  const onPhase=useCallback((next:string)=>setPhase(next),[]);
  useEffect(()=>setMusicCue(inMatch?null:'menu'),[inMatch]);
  const leave=()=>{setInMatch(false);setLeaveRequest(n=>n+1);};
  return <div className={`game-screen game-screen-multiplayer ${inMatch?'has-match':'has-lobby'}`}><main className="game-screen-body"><DebugMode.Provider value={false}>
    <div style={{display:inMatch?'none':'contents'}}><PublicLobby active={!inMatch} hasMatch={!!arena} status={status} leaveRequest={leaveRequest} onDisconnect={()=>{setArena(undefined);setInMatch(false);}} profile={profile} onLoadout={async next=>{if(!applyRespawnLoadout(armory.profile,next))return false;setSelection(next);return true;}} onBack={()=>transitionTo('menu')} onLaunch={(session,bots,squad,match)=>{if(arena?.session!==session){setPhase('loading');setArena({session,botCount:bots,composition:squad,match});}setInMatch(true);}}/></div>
    {arena && <div style={{display:inMatch?'contents':'none'}} aria-hidden={!inMatch}><ArenaMatchGame key={arena.session.id} roomView={!inMatch} suspended={suspended||!inMatch} onPhaseChange={onPhase} onReturnRoom={()=>setInMatch(false)} region="marina-bay" arena={arena} profile={profile} onReward={armory.award} onElimination={armory.awardElimination} onConsume={armory.consume} onRentalTime={armory.advanceRentalTime} onOpenShop={()=>transitionTo('store')} onLeaveArena={leave}/></div>}
  </DebugMode.Provider></main></div>;
}
