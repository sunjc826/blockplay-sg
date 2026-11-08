import type { ArenaSnapshot } from '../game/arena-rules';
import { TEAM_NAMES, type ArenaTeam } from '../game/arena-match';
import { factionIdOf, listArenaFactions } from '../game/arena-factions';
export const holdTime=(seconds=0)=>`${Math.floor(seconds/60)}:${String(Math.floor(seconds%60)).padStart(2,'0')}`;
export default function ArenaScoreboard({snapshot,selfId}:{snapshot:ArenaSnapshot;selfId:string}){
 const score=snapshot.hardpoint??snapshot.teamDeathmatch,hp=!!snapshot.hardpoint,self=snapshot.actors.find(a=>a.id===selfId);
 const actors=[...snapshot.actors].sort((a,b)=>(hp?(b.controlSeconds??0)-(a.controlSeconds??0):0)||b.kills-a.kills||a.deaths-b.deaths||a.name.localeCompare(b.name));
 const teams: (ArenaTeam|undefined)[]=score?['alpha','bravo']:[undefined];
 return <div className={`arena-scoreboard ${score?'has-teams':'is-ffa'}`}><table><caption>{score?`ALPHA ${score.scores.alpha} : ${score.scores.bravo} BRAVO`:'MATCH STANDINGS'}<span>{score?(hp?'HOLD = time inside an uncontested active zone':'Team totals count enemy eliminations'):listArenaFactions().map(f=>[f,actors.filter(a=>factionIdOf(a)===f.id).length] as const).filter(([,n])=>n).map(([f,n])=>`${n} ${f.short}`).join(' · ')}</span></caption><thead><tr><th scope="col">OPERATOR</th>{hp?<th scope="col" title="Uncontested hold time">HOLD</th>:!score?<th scope="col">ROLE</th>:null}<th scope="col">K</th><th scope="col">D</th></tr></thead>
 {teams.map(team=><tbody key={team??'ffa'} data-score-team={team}>{team&&<tr className="arena-team-heading"><th colSpan={hp?4:3} scope="rowgroup">{TEAM_NAMES[team]}{self?.team===team?' · YOUR TEAM':''}<span>{score!.scores[team]} {hp?'points':'eliminations'}</span></th></tr>}{actors.filter(a=>!team||a.team===team).map((a,index)=><tr key={a.id} data-actor-id={a.id} className={a.id===selfId?'is-self':''}><td><span className="arena-place">{index+1}</span>{a.name}{a.id===selfId&&<small>YOU</small>}{a.bot&&<small>BOT</small>}</td>{hp?<td>{holdTime(a.controlSeconds)}</td>:!score?<td>{a.role==='player'?'Operator':a.role}</td>:null}<td>{a.kills}</td><td>{a.deaths}</td></tr>)}</tbody>)}
 </table></div>;
}
