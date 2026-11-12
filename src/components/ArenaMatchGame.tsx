import { useEffect, useState, type ComponentProps } from 'react';
import { ArrowLeft } from 'lucide-react';
import FpsGame from './FpsGame';
import PlayLoading from './PlayLoading';
import { DEFAULT_ARENA_MATCH, tdmArea, type ArenaMatch } from '../game/arena-match';
import { connectArenaMatch } from '../game/arena-match-session';
import { matchSummary } from '../game/match-menu';

export default function ArenaMatchGame(props: ComponentProps<typeof FpsGame> & {arena: NonNullable<ComponentProps<typeof FpsGame>['arena']>}) {
  const {arena}=props;
  const [match,setMatch]=useState<ArenaMatch>();
  const [waiting,setWaiting]=useState(false);
  useEffect(()=>{
    const stop=connectArenaMatch(arena.session,arena.match??DEFAULT_ARENA_MATCH,setMatch);
    const timer=setTimeout(()=>setWaiting(true),8000);
    return ()=>{stop();clearTimeout(timer);};
  },[arena.session,arena.match]);
  if(!match)return <section className="lan-lobby" role="status"><h2>Waiting for the host’s match</h2><p>{waiting?'Waiting for the host’s connection. You can stay here or return to your room.':'Receiving the mode and district area…'}</p><button onClick={props.onReturnRoom??props.onLeaveArena}>{props.onReturnRoom?'Return to room':'Leave match'}</button></section>;
  const solo = arena.session.role === 'solo';
  const info = matchSummary(match);
  const back = props.onReturnRoom ?? props.onLeaveArena;
  const backLabel = props.onReturnRoom ? solo ? 'Setup' : 'Room' : 'Leave match';
  return <PlayLoading mode="arena" district={info.map} heading={`${solo ? 'SINGLE PLAYER' : 'MULTIPLAYER'} · ${info.name.toUpperCase()}`}
    back={back && <button className="play-nav-back" onClick={back}><ArrowLeft size={16} /> {backLabel}</button>}>
    {(onLoaded, loadScreen) => <FpsGame {...props} arena={{ ...arena, match }} region={match.area ? tdmArea(match.area)!.region : 'marina-bay'}
      onLoaded={onLoaded} loadScreen={loadScreen} />}
  </PlayLoading>;
}
