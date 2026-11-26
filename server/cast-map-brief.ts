import { MARINA_WATER, MARINA_CAMP_DECKS, MARINA_BRIDGE_PIERS } from '../src/game/marina-water.ts';
import furniture from '../src/data/cast-map-index.json' with { type: 'json' };
import { REGION_STAMPS } from '../src/data/region-stamps.ts';
import { districtNavalSites } from '../src/game/naval-landing-sites.ts';
import { getWorldZone, WORLD_GATEWAYS, type ZonePosition } from '../src/game/world-zones.ts';
import { sectorAt, zoneSectors } from '../src/game/zone-sectors.ts';
import type { RegionId } from '../src/game/region-ids.ts';
import type { RegionBounds } from '../src/game/region-collision.ts';

const centre = (b:RegionBounds) => ({x:(b.minX+b.maxX)/2,z:(b.minZ+b.maxZ)/2});
function location(p: ZonePosition, b: RegionBounds) {
  const third = (v:number, min:number, max:number) => (v-min)/(max-min);
  const x = third(p.x,b.minX,b.maxX), z = third(p.z,b.minZ,b.maxZ);
  return (z < 1/3 ? 'N' : z > 2/3 ? 'S' : '') + (x < 1/3 ? 'W' : x > 2/3 ? 'E' : '') || 'central';
}
const touches = (a:RegionBounds,b:RegionBounds) =>
  a.minX <= b.maxX && a.maxX >= b.minX && a.minZ <= b.maxZ && a.maxZ >= b.minZ;

export function mapBrief(region:RegionId): string {
  const sectors = zoneSectors(region);
  if (!sectors.length) return '';
  const district = getWorldZone(region), index = furniture[region];
  const features = [
    ...REGION_STAMPS[region],
    ...(region === 'marina-bay' ? [
      {...centre(MARINA_WATER),name:'open bay'},
      {...centre(MARINA_BRIDGE_PIERS[0]),name:'Helix Bridge'},
      ...MARINA_CAMP_DECKS.map(deck => ({...centre(deck),name:deck.id === 'camp' ? 'Merlion islet' : deck.id.replace('-',' ')})),
    ] : []),
    ...WORLD_GATEWAYS.filter(g => g.from === region).map(g => ({...g.position,name:g.name})),
    ...districtNavalSites(region).map(s => ({...s.rally,name:s.name+' landing'})),
    ...index.facilities.map(p => ({...p,name:'expedition: '+p.name})),
    ...index.controls.map(p => ({...p,name:'hardpoint: '+p.name})),
  ];
  const bySector = new Map<string,string[]>(), outside:string[] = [];
  for (const p of features) {
    const here = sectorAt(region,p.x,p.z);
    if (!here) { outside.push(location(p,index.bounds)+' '+p.name); continue; }
    if (here.name.toLowerCase() === p.name.toLowerCase()) continue;
    const list = bySector.get(here.id) ?? [];
    list.push(p.name); bySector.set(here.id,list);
  }
  const rows = sectors.map(s => {
    const b = s.bounds, position = location(centre(b),index.bounds);
    const adjacent = sectors.filter(other => other !== s && touches(b,other.bounds)).map(other => other.id);
    return [s.name+' ['+s.id+']', position+', '+s.cover+' cover', adjacent.length && 'meets '+adjacent.join(', '),
      ...(bySector.get(s.id) ?? [])].filter(Boolean).join(' · ');
  });
  return [district.name+' district map. '+district.description, ...rows, outside.length && 'Between sectors · '+outside.join(', ')].filter(Boolean).join('\n');
}
