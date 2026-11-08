import { useEffect, useState, type ComponentProps } from 'react';
import FpsGame from './FpsGame';
import { DEFAULT_ARENA_MATCH, tdmArea, type ArenaMatch } from '../game/arena-match';
import { connectArenaMatch } from '../game/arena-match-session';

export default function ArenaMatchGame(props: ComponentProps<typeof FpsGame> & {arena: NonNullable<ComponentProps<typeof FpsGame>['arena']>}) {
  const {arena}=props;
  const [match,setMatch]=useState<ArenaMatch>();
  const [waiting,setWaiting]=useState(false);
  useEffect(()=>{
    const stop=connectArenaMatch(arena.session,arena.match??DEFAULT_ARENA_MATCH,setMatch);
    const timer=setTimeout(()=>setWaiting(true),8000);
    return ()=>{stop();clearTimeout(timer);};
  },[arena.session,arena.match]);
  if(!match)return <section className="lan-lobby" role="status"><h2>Waiting for the host’s match</h2><p>{waiting?'The host needs to enter the match. You can stay here or return to the lobby.':'Receiving the mode and district area…'}</p><button onClick={props.onLeaveArena}>Return to lobby</button></section>;
  return <FpsGame {...props} arena={{...arena,match}} region={match.mode!=='free-for-all'?tdmArea(match.area)!.region:'marina-bay'} />;
}
