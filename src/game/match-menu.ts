import { ARENA_DURATION, ARENA_KILL_LIMIT } from './arena-rules';
import { DEFAULT_FFA_AREA, TDM_RULES, tdmArea, validArenaMatch, type ArenaMatch } from './arena-match';
import { HARDPOINT_RULES } from './hardpoint';
export const MATCH_MODES: readonly {mode:ArenaMatch['mode'];name:string;description:string;format:string}[] = [
  {mode:'team-deathmatch',name:'Team Deathmatch',description:'Work together. Each enemy elimination earns your team a point.',format:'4 vs 4 · 5 minutes'},
  {mode:'hardpoint',name:'Hardpoint',description:'Hold rotating control stations. Enemies inside stop scoring.',format:'4 vs 4 · 6 minutes'},
  {mode:'free-for-all',name:'Free for all',description:'Every operator for themselves. Get the most eliminations.',format:'Individual · 3 minutes'},
];
export const defaultMatchFor=(mode:ArenaMatch['mode']):ArenaMatch=>mode==='hardpoint'?{mode,area:'smith-street'}:mode==='team-deathmatch'?{mode,area:'dragon-courtyard'}:{mode:'free-for-all',area:DEFAULT_FFA_AREA};
export function matchSummary(match:ArenaMatch){
 const mode=MATCH_MODES.find(m=>m.mode===match.mode)!;
 return {...mode,map:match.area?tdmArea(match.area)!.name:'Marina Bay',
  rules:match.mode==='hardpoint'?`${HARDPOINT_RULES.scoreLimit} points · ${HARDPOINT_RULES.duration/60} minutes · 1 point per uncontested second · Rotates every 60 seconds`:match.mode==='team-deathmatch'?`${TDM_RULES.scoreLimit} team eliminations · ${TDM_RULES.duration/60} minutes · Friendly fire off`:`${ARENA_KILL_LIMIT} eliminations · ${ARENA_DURATION/60} minutes`,
  capacity:match.mode==='free-for-all'?'Up to 4 human players · Optional bots':'4 vs 4 · Up to 4 human players · Bots fill both teams'};
}
export function readMatchPreference():ArenaMatch {try{const value=JSON.parse(localStorage.getItem('blockplay.match-choice')??'null');if(validArenaMatch(value))return value;}catch{/* Storage is optional. */}return defaultMatchFor('team-deathmatch');}
export function saveMatchPreference(match:ArenaMatch){try{localStorage.setItem('blockplay.match-choice',JSON.stringify(match));}catch{/* Storage is optional. */}}
