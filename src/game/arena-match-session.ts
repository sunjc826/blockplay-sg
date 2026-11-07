import type { LanSession } from './lan-peer';
import { validArenaMatch, type ArenaMatch } from './arena-match';

/** Resolve host-owned terrain before the guest builds its scene. Retries cover late joins. */
export function connectArenaMatch(session: LanSession, selected: ArenaMatch, ready: (match:ArenaMatch)=>void) {
  const authority=session.role!=='guest', host=authority?session.id:session.getPeers()[0]?.id;
  let resolved=false;
  const unsubscribe=session.subscribe((from,payload)=>{
    if(!payload || typeof payload!=='object')return;
    const packet=payload as {type?:string;match?:unknown};
    if(authority && packet.type==='arena-config-request' && session.getPeers().some(p=>p.id===from)) session.send({type:'arena-config',match:selected},from);
    if(!authority && !resolved && from===host && packet.type==='arena-config' && validArenaMatch(packet.match)) {resolved=true;ready(packet.match);}
  });
  const request=()=>{if(!authority&&!resolved)session.send({type:'arena-config-request'},host);};
  const timer=setInterval(request,1000); if(authority)ready(selected);else request();
  return ()=>{clearInterval(timer);unsubscribe();};
}
