import { PLAYER_FACTION } from './arena-factions';
import type { FacilitySite } from './facilities';
import { WORLD_GATEWAYS, getWorldZone, type WorldZoneId, type ZonePosition } from './world-zones';
import { zoneSectors } from './zone-sectors';
import type { VehicleKind, VehicleSpawn } from './vehicle-rules';

/** Use the district's authored, reachable anchors and validated motor pools. */
export function districtFacilitySites(zone: WorldZoneId, fleet: Record<VehicleKind, VehicleSpawn>, clear: (x: number, z: number) => boolean, reserved: readonly ZonePosition[] = [], groundHeight: (x: number, z: number) => number = () => 0): FacilitySite[] {
  const district = getWorldZone(zone), sectors = zoneSectors(zone), sites: FacilitySite[] = [];
  const protectedPoints = [...reserved, district.spawn, ...WORLD_GATEWAYS.flatMap(g => [...(g.from === zone ? [g.position] : []), ...(g.to === zone ? [g.arrival] : [])])];
  const away = (p: ZonePosition) => protectedPoints.every(r => Math.hypot(p.x - r.x, p.z - r.z) > 3) && sites.every(s => Math.hypot(p.x - s.x, p.z - s.z) > 12);
  const anchors = sectors.flatMap(s => s.anchors).concat(district.encounterSpawns).flatMap(p => [{ x: p.x + 3, z: p.z }, { x: p.x - 3, z: p.z }, { x: p.x, z: p.z + 3 }, p]);
  const distance = (p: ZonePosition) => Math.hypot(p.x - district.spawn.x, p.z - district.spawn.z);
  const addPost = (enemy: boolean) => {
    const p = [...anchors].sort((a, b) => enemy ? distance(b) - distance(a) : distance(a) - distance(b)).find(p => clear(p.x, p.z) && away(p) && Object.values(fleet).every(v => Math.hypot(v.x - p.x, v.z - p.z) > 14));
    if (!p) return;
    const name = sectors.find(s => p.x >= s.bounds.minX && p.x <= s.bounds.maxX && p.z >= s.bounds.minZ && p.z <= s.bounds.maxZ)?.name ?? district.name;
    sites.push({ ...p, y: groundHeight(p.x,p.z), id: `${zone}-${enemy ? 'enemy' : 'allied'}-post`, name: `${name} post`, kind: 'command', initialOwner: enemy ? 'mercenaries' : PLAYER_FACTION,
      deployment: { x: p.x, z: p.z, yaw: enemy ? Math.PI : 0 } });
  };
  addPost(false); addPost(true);
  for (const kind of ['car', 'helicopter'] as const) {
    const spawn = fleet[kind], radius = kind === 'car' ? 6 : 10;
    const candidates = Array.from({ length: 32 }, (_, i) => ({ x: spawn.x + Math.sin(i * Math.PI / 16) * radius, z: spawn.z + Math.cos(i * Math.PI / 16) * radius }));
    const p = candidates.find(p => clear(p.x, p.z) && away(p));
    if (!p) continue;
    sites.push({ ...p, y: groundHeight(p.x,p.z), id: `${zone}-${kind === 'car' ? 'garage' : 'helipad'}`, name: kind === 'car' ? 'Motor pool garage' : 'Air transport helipad',
      kind: kind === 'car' ? 'garage' : 'helipad', initialOwner: kind === 'car' ? 'mercenaries' : null, deployment: { ...spawn } });
  }
  // Farthest-point placement gives the fronts different parts of the district,
  // using the same authored, reachable anchors as patrols and exploration.
  for (const [index, kind] of (['command', 'command', 'supply'] as const).entries()) {
    const gap = (p: ZonePosition) => Math.min(...sites.map(s => Math.hypot(p.x-s.x,p.z-s.z)));
    const candidates = anchors.filter(p => away(p) && clear(p.x,p.z) && Object.values(fleet).every(v => Math.hypot(v.x-p.x,v.z-p.z)>14));
    const p = candidates.sort((a,b) => gap(b)-gap(a))[0];
    if (!p || gap(p) < 32) continue;
    const sector = [...sectors].filter(s => p.x>=s.bounds.minX && p.x<=s.bounds.maxX && p.z>=s.bounds.minZ && p.z<=s.bounds.maxZ)
      .sort((a,b) => (a.bounds.maxX-a.bounds.minX)*(a.bounds.maxZ-a.bounds.minZ)-(b.bounds.maxX-b.bounds.minX)*(b.bounds.maxZ-b.bounds.minZ))[0];
    sites.push({ ...p, y:groundHeight(p.x,p.z), id:`${zone}-front-${index+1}`, name:`${sector?.name ?? district.name} ${kind === 'supply' ? 'supply depot' : 'forward post'}`,
      kind, initialOwner:null, initiallyBuilt:true, deployment:{...p,yaw:0} });
  }
  return sites;
}
