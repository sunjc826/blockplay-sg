import type { LanSession } from './lan-peer';
export type RoomPresence='In room'|'Loading'|'Ready'|'In match'|'Match complete';
const valid=(v:unknown):v is RoomPresence=>['In room','Loading','Ready','In match','Match complete'].includes(String(v));
/** Host relays authenticated member status; guests can only describe themselves. */
export function connectRoomPresence(session:LanSession,changed:(states:Record<string,RoomPresence>)=>void){
 const authority=session.role!=='guest',host=authority?session.id:session.getPeers()[0]?.id;
 let own:RoomPresence='In room',states:Record<string,RoomPresence>={[session.id]:own};
 const publish=()=>{const ids=new Set([session.id,...session.getPeers().map(p=>p.id)]);states=Object.fromEntries(Object.entries(states).filter(([id])=>ids.has(id)));states[session.id]=own;changed({...states});if(authority)session.send({type:'room-roster',states});else session.send({type:'room-presence',status:own},host);};
 const stop=session.subscribe((from,payload)=>{
  if(!payload||typeof payload!=='object')return;const p=payload as {type?:string;status?:unknown;states?:unknown};
  if(authority&&p.type==='room-presence'&&session.getPeers().some(peer=>peer.id===from)&&valid(p.status)){states[from]=p.status;publish();}
  if(!authority&&from===host&&p.type==='room-roster'&&p.states&&typeof p.states==='object'){
   const ids=new Set([session.id,...session.getPeers().map(p=>p.id)]);states=Object.fromEntries(Object.entries(p.states).filter(([id,status])=>ids.has(id)&&valid(status))) as Record<string,RoomPresence>;states[session.id]=own;changed({...states});
  }
 });
 const peers=session.onPeers(publish),timer=setInterval(publish,2000);publish();
 return {set(status:RoomPresence){own=status;publish();},dispose(){clearInterval(timer);stop();peers();}};
}
