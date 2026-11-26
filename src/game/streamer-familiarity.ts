import { isRegionId, type RegionId } from './region-ids.ts';
import { zoneSectors } from './zone-sectors.ts';

export const THROUGH_SECONDS = 2;
export const WELL_SECONDS = 150;
export const WELL_VISITS = 3;
export const INCIDENT_SECONDS = 8;
export const SAMPLE_SECONDS = 1;
export const LEVELS = ['heard of','been through','knows well'] as const;
export type FamiliarityLevel = typeof LEVELS[number];
export type SectorLevels = Record<string,FamiliarityLevel>;
interface Counters { seconds:number; visits:number; incidents:number }
type Districts = Partial<Record<RegionId,Record<string,Counters>>>;
const record = (v:unknown):v is Record<string,unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const level = (c:Counters):FamiliarityLevel => c.visits >= WELL_VISITS || c.seconds+c.incidents*INCIDENT_SECONDS >= WELL_SECONDS
  ? 'knows well' : c.seconds >= THROUGH_SECONDS || c.incidents > 0 ? 'been through' : 'heard of';

export function validLevels(region:RegionId,v:unknown):v is SectorLevels {
  const sectors = zoneSectors(region);
  return record(v) && Object.entries(v).every(([id,l]) => sectors.some(s => s.id === id) && LEVELS.includes(l as FamiliarityLevel));
}

export function readLearning(raw:string|null):Districts {
  try {
    const value = JSON.parse(raw ?? 'null');
    if (!record(value) || Object.keys(value).length !== 2 || value.version !== 1 || !record(value.districts)) return {};
    const result:Districts = {};
    for (const [region,rows] of Object.entries(value.districts)) {
      if (!isRegionId(region) || !record(rows)) continue;
      for (const sector of zoneSectors(region)) {
        const c = rows[sector.id];
        if (!record(c) || Object.keys(c).length !== 3 || ![c.seconds,c.visits,c.incidents].every(n => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0)) continue;
        (result[region] ??= {})[sector.id] = {seconds:Number(c.seconds),visits:Number(c.visits),incidents:Number(c.incidents)};
      }
    }
    return result;
  } catch { return {}; }
}

export function learningSummary(districts:Districts) {
  const rows = Object.values(districts).filter(rows => Object.keys(rows).length);
  const known = rows.flatMap(rows => Object.values(rows)).filter(c => level(c) === 'knows well').length;
  return rows.length ? 'Knows '+rows.length+' district'+(rows.length === 1 ? '' : 's')+', '+known+' sector'+(known === 1 ? '' : 's')+' well' : 'Nothing learned yet';
}

/** Gameplay clock, scoped to the current visit. Suspensions break the clock without inventing a return. */
export function familiarity(seed:Districts = {}) {
  const districts = structuredClone(seed);
  let visit = '', since = 0, counted = false, last:number|undefined;
  function leave() { visit = ''; last = undefined; }
  return {
    leave, suspend() { last = undefined; },
    sample(region:RegionId,sector:string|null,time:number,active:boolean,incident=false) {
      if (!active || !Number.isFinite(time)) { last = undefined; return; }
      if (!sector) { leave(); return; }
      const key = region+'/'+sector;
      if (visit !== key) {
        if (!zoneSectors(region).some(s => s.id === sector)) { leave(); return; }
        visit = key; since = 0; counted = false; last = time;
      }
      if (last === undefined || time < last) last = time;
      const elapsed = Math.max(0,Math.floor(time-last));
      if (elapsed < SAMPLE_SECONDS && !incident) return;
      last += elapsed;
      const rows = districts[region] ??= {};
      const c = rows[sector] ??= {seconds:0,visits:0,incidents:0};
      const before = level(c);
      since += elapsed; c.seconds += elapsed;
      if (incident) c.incidents++;
      if (!counted && (since >= THROUGH_SECONDS || incident)) { c.visits++; counted = true; }
      const after = level(c);
      return {promoted:before !== after ? after : undefined};
    },
    levels(region:RegionId):SectorLevels {
      return Object.fromEntries(Object.entries(districts[region] ?? {}).map(([id,c]) => [id,level(c)]));
    },
    serialize:() => JSON.stringify({version:1,districts}),
  };
}
