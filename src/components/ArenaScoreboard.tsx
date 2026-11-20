import type { ArenaSnapshot } from '../game/arena-rules';
import { TEAM_NAMES, type ArenaTeam } from '../game/arena-match';
import './match-score.css';
import { factionIdOf, listArenaFactions } from '../game/arena-factions';
export const holdTime=(seconds=0)=>`${Math.floor(seconds/60)}:${String(Math.floor(seconds%60)).padStart(2,'0')}`;
export default function ArenaScoreboard({snapshot,selfId}:{snapshot:ArenaSnapshot;selfId:string}){
 const score=snapshot.hardpoint??snapshot.teamDeathmatch,hp=!!snapshot.hardpoint,self=snapshot.actors.find(a=>a.id===selfId),points=snapshot.score?.players;
 const pts=(a:{id:string})=>points?.[a.id]?.score??0;
 const actors=[...snapshot.actors].sort((a,b)=>(hp?(b.controlSeconds??0)-(a.controlSeconds??0):0)||(score&&points?pts(b)-pts(a):0)||b.kills-a.kills||(points?pts(b)-pts(a):0)||a.deaths-b.deaths||a.name.localeCompare(b.name));
 const teams: (ArenaTeam|undefined)[]=score?['alpha','bravo']:[undefined];
 return <div className={`arena-scoreboard ${score?'has-teams':'is-ffa'} ${points?'has-score':''}`}><table><caption>{score?`ALPHA ${score.scores.alpha} : ${score.scores.bravo} BRAVO`:'MATCH STANDINGS'}<span>{score?(hp?'HOLD = time inside an uncontested active zone':'Team totals count enemy eliminations'):listArenaFactions().map(f=>[f,actors.filter(a=>factionIdOf(a)===f.id).length] as const).filter(([,n])=>n).map(([f,n])=>`${n} ${f.short}`).join(' · ')}</span></caption><thead><tr><th scope="col">OPERATOR</th>{hp?<th scope="col" title="Uncontested hold time">HOLD</th>:!score?<th scope="col">ROLE</th>:null}{points&&<th scope="col" title="Match score">SCORE</th>}<th scope="col" title="Eliminations">K</th>{points&&<th scope="col" title="Assists">A</th>}<th scope="col" title="Deaths">D</th></tr></thead>
 {teams.map(team=><tbody key={team??'ffa'} data-score-team={team}>{team&&<tr className="arena-team-heading"><th colSpan={(hp?4:3)+(points?2:0)} scope="rowgroup">{TEAM_NAMES[team]}{self?.team===team?' · YOUR TEAM':''}<span>{score!.scores[team]} {hp?'points':'eliminations'}</span></th></tr>}{actors.filter(a=>!team||a.team===team).map((a,index)=><tr key={a.id} data-actor-id={a.id} className={a.id===selfId?'is-self':''}><td><span className="arena-place">{index+1}</span>{a.name}{a.id===selfId&&<small>YOU</small>}{a.bot&&<small>BOT</small>}</td>{hp?<td>{holdTime(a.controlSeconds)}</td>:!score?<td>{a.role==='player'?'Operator':a.role}</td>:null}{points&&<td data-score>{pts(a)}</td>}<td>{a.kills}</td>{points&&<td>{points[a.id]?.assists??0}</td>}<td>{a.deaths}</td></tr>)}</tbody>)}
 </table></div>;
}
