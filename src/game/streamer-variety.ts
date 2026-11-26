import arenaCatalog from './arena-catalog.json' with {type:'json'};
import { only, record } from './cast-contract.ts';
import { REGION_NAMES, isRegionId } from './region-ids.ts';
import { MODE_NAMES, GAME_LIMIT, arenaMode, count, validLocation, validStats,
  type PlayedGame, type GameLocation, type GameStats, type SoloMode } from './streamer-history.ts';
import type { MenuAction, MenuScreen } from './streamer-contract.ts';

// Every eligible destination keeps a positive baseline, however often it was played.
export const BASE_WEIGHT = 1;
// Add the whole bonus for an unplayed destination, half after one play, a third after two.
export const NOVELTY_BONUS = 4;
// Multiply the last game's destination weight by this fraction to discourage immediate repeats.
export const LAST_GAME_FACTOR = 0.35;
export const POLL_VOTE_SECONDS = 5;
export const VIEWER_VOTE_POINTS = 25;

const arenaRegions = new Map(Object.values(arenaCatalog).map(area => [area.region,area]));
function pickerMode(screenId:string):SoloMode|undefined {
  if (!screenId.endsWith('-districts')) return;
  const mode = screenId.slice(0,-'-districts'.length);
  if (Object.hasOwn(MODE_NAMES,mode)) return mode as SoloMode;
}
export function destinationLabel(screenId:string,id:string):string|undefined {
  if (screenId === 'training-menu') return id === 'training' ? 'Live-fire range' : undefined;
  if (screenId === 'single-player') {
    if (id === 'training-menu') return MODE_NAMES.training;
    return id !== 'training' && Object.hasOwn(MODE_NAMES,id) ? MODE_NAMES[id as SoloMode] : undefined;
  }
  const mode = pickerMode(screenId);
  if (!mode || !id.startsWith('district-')) return;
  const region = id.slice('district-'.length);
  if (!isRegionId(region)) return;
  if (!arenaMode(mode)) return REGION_NAMES[region];
  const area = arenaRegions.get(region);
  if (area && (mode !== 'hardpoint' || area.hardpoint)) return area.name.split(' · ')[1];
}
function destinations(screen:MenuScreen) {
  return screen.actions.filter(a => a.state !== 'disabled' && destinationLabel(screen.screenId,a.id));
}
function destinationId(screenId:string,game:PlayedGame) {
  const mode = pickerMode(screenId);
  if (mode) return arenaMode(mode) && !game.arena ? undefined : 'district-'+game.region;
  return game.mode === 'training' && screenId === 'single-player' ? 'training-menu' : game.mode;
}
function playedCounts(screen:MenuScreen,games:readonly PlayedGame[]) {
  const counts = new Map<string,number>();
  for (const game of games) {
    const id = destinationId(screen.screenId,game);
    if (id) counts.set(id,(counts.get(id) ?? 0)+1);
  }
  return counts;
}

type RecentGame = GameLocation & GameStats;
export interface PlaySummary { recent:RecentGame[]; most?:{id:string;count:number}; unseen:string[]; more:number }
export function summarizeGames(screen:MenuScreen,games:readonly PlayedGame[]):PlaySummary|undefined {
  const options = destinations(screen);
  if (!options.length) return;
  const counts = playedCounts(screen,games);
  const recent = games.slice(-2).reverse().map(({started:_time,seconds:_duration,...game}) => game);
  const unseen = options.filter(a => !counts.has(a.id)).map(a => a.id);
  let most:PlaySummary['most'];
  for (const {id} of options) {
    const n = counts.get(id) ?? 0;
    if (n > (most?.count ?? 0)) most = {id,count:n};
  }
  return {recent,...(most ? {most} : {}),unseen:unseen.slice(0,3),more:Math.max(0,unseen.length-3)};
}

export interface PollRow { id:string; share:number }
export function rollPoll(screen:MenuScreen,games:readonly PlayedGame[],random:()=>number):PollRow[] {
  const counts = playedCounts(screen,games);
  const last = games.at(-1), lastId = last && destinationId(screen.screenId,last);
  const pool = destinations(screen).map(({id}) => ({id,
    weight:(BASE_WEIGHT + NOVELTY_BONUS/(1+(counts.get(id) ?? 0))) * (id === lastId ? LAST_GAME_FACTOR : 1)}));
  const ids:string[] = [];
  while (pool.length && ids.length < 3) {
    let draw = random()*pool.reduce((sum,a) => sum+a.weight,0);
    let index = 0;
    while (index < pool.length-1 && draw >= pool[index].weight) draw -= pool[index++].weight;
    ids.push(pool.splice(index,1)[0].id);
  }
  if (ids.length <= 1) return ids.map(id => ({id,share:100}));
  const leader = ids.length === 2 ? 51+Math.floor(random()*21) : 37+Math.floor(random()*25);
  const rest = 100-leader, low = Math.ceil(rest/2), high = Math.min(leader-1,rest-1);
  const second = ids.length === 2 ? rest : low+Math.floor(random()*(high-low+1));
  return ids.map((id,i) => ({id,share:[leader,second,rest-second][i]}));
}

export function applyViewerVote(rows:readonly PollRow[],id:string):PollRow[] {
  const chosen = rows.find(row => row.id === id)!;
  const otherTotal = 100 - chosen.share;
  const remaining = Math.max(0,otherTotal - VIEWER_VOTE_POINTS);
  // Round cumulative shares so adjacent allocations always add up to the exact remainder.
  let cumulative = 0, allocated = 0;
  return rows.map(row => {
    if (row.id === id) return {id,share:100 - remaining};
    cumulative += row.share;
    const next = otherTotal ? Math.round(cumulative * remaining / otherTotal) : 0;
    const share = next - allocated;
    allocated = next;
    return {id:row.id,share};
  }).sort((a,b) => b.share - a.share);
}

export function pollVerdict(poll:readonly PollRow[],chosen:string,viewerVote?:string) {
  if (viewerVote) return viewerVote === chosen ? 'Went with your vote' : 'Overruled your vote';
  if (poll[0]?.id === chosen) return 'Went with chat';
  return poll.some(r => r.id === chosen) ? 'Overruled chat' : 'Ignored the poll';
}

interface VisitPoll { rows:PollRow[]; opened:boolean; viewerVote?:string }

/** A selection changes the preview on a picker. It does not start a new visit. */
export function pollVisit(random = Math.random) {
  let key = '', poll:VisitPoll | undefined;
  return {
    read(screen:MenuScreen,games:readonly PlayedGame[]) {
      if (key !== screen.screenId) { key = screen.screenId; poll = undefined; }
      if (!poll) {
        const rows = rollPoll(screen,games,random);
        if (!rows.length) return;
        poll = {rows,opened:false};
      }
      // A temporarily unavailable candidate cannot ride on the request. Keep the original roll for this visit.
      return poll.rows.every(row => screen.actions.some(a => a.id === row.id && a.state !== 'disabled')) ? poll : undefined;
    },
  };
}

export function chosenDestination(screen:MenuScreen,id:string) {
  if (id === 'load-district') return destinations(screen).find(a => a.state === 'selected')?.id ?? id;
  return id;
}

export function shuffledScreen(screen:MenuScreen,random:()=>number) {
  const actions:MenuAction[] = screen.actions.filter(a => a.id !== 'back');
  for (let i=actions.length-1;i>0;i--) {
    const j = Math.floor(random()*(i+1));
    [actions[i],actions[j]] = [actions[j],actions[i]];
  }
  return {...screen,actions:actions.concat(screen.actions.filter(a => a.id === 'back'))};
}

export function validAdvice(screen:MenuScreen,summary:unknown,poll:unknown,viewerVote:unknown) {
  const ids = destinations(screen).map(a => a.id);
  const allowed = (id:unknown) => typeof id === 'string' && ids.includes(id);
  if (summary !== undefined) {
    if (!ids.length || !record(summary) || !only(summary,['recent','most','unseen','more']) ||
      !Array.isArray(summary.recent) || summary.recent.length > 2 || !summary.recent.every(g => record(g) &&
        only(g,['mode','region','arena','result','kills','deaths','reached','crossings']) && validLocation(g) && validStats(g)) ||
      !Array.isArray(summary.unseen) || summary.unseen.length > 3 || !summary.unseen.every(allowed) ||
      new Set(summary.unseen).size !== summary.unseen.length || !count(summary.more,ids.length-summary.unseen.length)) return false;
    const most = summary.most;
    if ('most' in summary && (!record(most) || !only(most,['id','count']) || !allowed(most.id) ||
      summary.unseen.includes(most.id) || !count(most.count,GAME_LIMIT) || most.count === 0)) return false;
  }
  if (poll === undefined) return viewerVote === undefined;
  if (!Array.isArray(poll) || !poll.length || poll.length > 3) return false;
  const seen = new Set<string>();
  let total = 0, prev = 101;
  for (const [i,row] of poll.entries()) {
    if (!record(row) || !only(row,['id','share']) || typeof row.id !== 'string' || !allowed(row.id) || seen.has(row.id) ||
      !count(row.share,100) || row.share > prev ||
      viewerVote === undefined && (!row.share || i === 1 && row.share === prev)) return false;
    seen.add(row.id); total += row.share; prev = row.share;
  }
  return total === 100 && (viewerVote === undefined || typeof viewerVote === 'string' && seen.has(viewerVote));
}
