import type { ArenaSnapshot } from './arena-rules';

export function scoreboardActors(snapshot:ArenaSnapshot) {
 const score=snapshot.hardpoint??snapshot.teamDeathmatch,hp=!!snapshot.hardpoint,points=snapshot.score?.players;
 const pts=(a:{id:string})=>points?.[a.id]?.score??0;
 return [...snapshot.actors].sort((a,b)=>(hp?(b.controlSeconds??0)-(a.controlSeconds??0):0)||(score&&points?pts(b)-pts(a):0)||b.kills-a.kills||(points?pts(b)-pts(a):0)||a.deaths-b.deaths||a.name.localeCompare(b.name));
}
