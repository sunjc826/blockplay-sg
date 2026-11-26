import index from '../src/data/cast-map-index.json' with { type:'json' };
import { REGION_STAMPS } from '../src/data/region-stamps.ts';
import { WORLD_GATEWAYS } from '../src/game/world-zones.ts';
import { districtNavalSites } from '../src/game/naval-landing-sites.ts';
import { MARINA_CAMP_DECKS, MARINA_SWIM_EXITS } from '../src/game/marina-water.ts';
import { MERLION } from '../src/game/merlion-gameplay.ts';
import { borderingSectors, sectorAt, zoneSectors, foodCounterId, type ZoneSector } from '../src/game/zone-sectors.ts';
import type { PlayTurn } from '../src/game/streamer-contract.ts';
import type { RememberedPlace } from '../src/game/pilot-strategy-contract.ts';
import type { RegionId } from '../src/game/region-ids.ts';

export interface MapFeature {
  id:string; name:string; x:number; z:number; y?:number;
  well?:boolean; scenery?:boolean; mode?:PlayTurn['mode']; area?:string; hardpoint?:boolean;
}
export const SECTOR_CHARS = 360, DETAIL_CHARS = 1100;
type Feature = MapFeature & {sectorId:string};
const catalog = new Map<RegionId,Feature[]>();
// Placement IDs sometimes encode authoring coordinates or faction names. Keep them opaque.
function placeId(key:string) {
  let hash = 2166136261;
  for (const char of key) hash = Math.imul(hash ^ char.charCodeAt(0),16777619);
  return 'p-'+(hash >>> 0).toString(36);
}
function districtPlaces(region:RegionId) {
  let places = catalog.get(region);
  if (places) return places;
  const facts:MapFeature[] = [
    ...zoneSectors(region).flatMap(s => (s.foodAnchors ?? []).map((p,i) => ({...p,id:foodCounterId(s.id,i),name:'Food pickup counter',mode:'expedition' as const}))),
    ...WORLD_GATEWAYS.filter(g => g.from === region).map(g => ({...g.position,id:g.id,name:g.name,mode:'expedition' as const})),
    ...districtNavalSites(region).map(s => ({...s.ramp.to,id:s.id,name:s.name+' landing ramp',mode:'expedition' as const})),
    ...index[region].places as MapFeature[],
    ...REGION_STAMPS[region].map(s => ({...s,id:'stamp-'+s.name})),
  ];
  if (region === 'marina-bay') {
    facts.unshift({...MERLION.cache,id:'merlion-cache',name:'Merlion field dressing cache',mode:'expedition'});
    for (const d of MARINA_CAMP_DECKS.filter(d => d.id !== 'camp')) {
      const name = d.id.replace('-',' ');
      facts.push({id:d.id,name,x:(d.minX+d.maxX)/2,z:(d.minZ+d.maxZ)/2});
      const ladder = MARINA_SWIM_EXITS.find(p => p.x >= d.minX && p.x <= d.maxX && p.z >= d.minZ && p.z <= d.maxZ);
      if (ladder) facts.push({...ladder,id:d.id+'-ladder',name:'Swim ladder at the '+name,well:true});
    }
  }
  places = facts.flatMap(p => {
    const sector = sectorAt(region,p.x,p.z);
    return sector ? [{...p,sectorId:sector.id}] : [];
  });
  catalog.set(region,places);
  return places;
}
function side(p:MapFeature,s:ZoneSector) {
  const b=s.bounds, x=(p.x-b.minX)/(b.maxX-b.minX), z=(p.z-b.minZ)/(b.maxZ-b.minZ);
  return (z<.33 ? 'north' : z>.67 ? 'south' : '')+(x<.33 ? 'west' : x>.67 ? 'east' : '') || 'centre';
}
function rememberedLocation(p:Feature, sector:ZoneSector, features:Feature[]) {
  const compass = side(p,sector);
  if (!p.id.startsWith('stamp-')) {
    const distance = (s:Feature) => Math.hypot(s.x-p.x,s.z-p.z);
    const stamp = features.filter(s => s.sectorId === sector.id && s.id.startsWith('stamp-') && distance(s) <= 35)
      .sort((a,b) => distance(a)-distance(b))[0];
    if (stamp && !p.name.toLowerCase().includes(stamp.name.toLowerCase())) {
      if (distance(stamp) <= 7) return p.name+' by '+stamp.name;
      const bearings = ['east','southeast','south','southwest','west','northwest','north','northeast'];
      const octant = Math.round(Math.atan2(p.z-stamp.z,p.x-stamp.x)*4/Math.PI);
      return p.name+' '+bearings[(octant+8)%8]+' of '+stamp.name;
    }
  }
  return p.name+' ('+compass+')';
}
type DetailTurn = Pick<PlayTurn,'regionId'|'mode'|'familiarity'|'destinationSector'|'destinationPlace'|'arenaArea'|'notes'> & {
  observation:{position:{x:number;z:number}}; hud:Pick<PlayTurn['hud'],'match'>;
};
export function learnedMap(turn:DetailTurn) {
  const choices = new Map<string,RememberedPlace>();
  if (turn.mode === 'tutorial') return {text:'',choices};
  const {regionId:region,observation:{position}} = turn;
  const sectors = zoneSectors(region), here = sectorAt(region,position.x,position.z);
  const destination = sectors.find(s => s.id === turn.destinationSector);
  const nearby = [...new Set([here,destination,...sectors.filter(s => here && borderingSectors(s,here))])].filter((s):s is ZoneSector => !!s);
  const header = (s:ZoneSector) => s.name+' ('+(turn.familiarity?.[s.id] ?? 'heard of')+(s === destination ? ', destination' : '')+')';
  const knownCount = nearby.filter(s => turn.familiarity?.[s.id] && turn.familiarity[s.id] !== 'heard of').length;
  const roomPerSector = Math.floor((DETAIL_CHARS-nearby.reduce((n,s) => n+header(s).length+1,0))/Math.max(1,knownCount));
  const arena = index[region].arenas.find(a => a.id === turn.arenaArea)?.bounds;
  const rows:string[] = [];
  const features = knownCount ? districtPlaces(region).filter(p => !arena ||
    p.x >= arena.minX && p.x <= arena.maxX && p.z >= arena.minZ && p.z <= arena.maxZ) : [];
  for (const s of nearby) {
    const level = turn.familiarity?.[s.id] ?? 'heard of';
    let row = header(s);
    const limit = Math.min(SECTOR_CHARS,row.length+roomPerSector);
    let candidates:Feature[] = [];
    if (level !== 'heard of') candidates = features.filter(p =>
      p.sectorId === s.id && (!p.well || level === 'knows well') &&
      (!p.mode || p.mode === turn.mode) && (!p.hardpoint || turn.hud.match?.mode === 'hardpoint') &&
      (!p.area || p.area === turn.arenaArea));
    const emptied = (p:Feature) => turn.notes.includes('Emptied this session ['+p.id+']');
    const priority = (p:Feature) => placeId(region+'/'+p.id) === turn.destinationPlace ? -4 : emptied(p) ? -3 : p.well ? -1 : 0;
    // Reserve an early slot for an obvious place even in sectors rich in cover.
    const ordered = candidates.sort((a,b) => priority(a)-priority(b) || Math.hypot(a.x-position.x,a.z-position.z)-Math.hypot(b.x-position.x,b.z-position.z));
    const firstObvious = ordered.find(p => !p.well && (p.id.startsWith('food-') || p.id.startsWith('vendor-') || p.id === 'range-stock')) ?? ordered.find(p => !p.well && !p.scenery);
    if (firstObvious && ordered.indexOf(firstObvious)>1) { ordered.splice(ordered.indexOf(firstObvious),1); ordered.splice(1,0,firstObvious); }
    const labels = new Set<string>();
    for (const p of ordered) {
      const id = placeId(region+'/'+p.id), name = rememberedLocation(p,s,features);
      const label = name+(id === turn.destinationPlace ? ' · heading here' : '')+(emptied(p) ? ' · emptied this session' : '');
      if (labels.has(label)) continue;
      const entry = ' · '+label+(p.scenery ? '' : ' ['+id+']');
      if (row.length+entry.length > limit) continue;
      labels.add(label); row += entry;
      if (!p.scenery) choices.set(id,{id,sectorId:s.id,name:p.name,x:p.x,z:p.z,...(p.y !== undefined ? {y:p.y} : {})});
    }
    rows.push(row);
  }
  return {text:rows.join('\n') || 'Between named sectors.',choices};
}
