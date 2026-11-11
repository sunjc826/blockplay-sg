import * as THREE from 'three';
import type { RegionDefinition, RegionWorld } from './regions';
import { ANIMAL_SITES } from './animal-sites';
import { animateAnimal, createAnimalKit, type AnimalKind } from './singapore-animals';
import { isWaterObject } from './water';
import { getWorldZone, WORLD_GATEWAYS } from './world-zones';
import { zoneSectors } from './zone-sectors';
import { getFpsDistrict } from './fps-districts';
import { getVerticalPlaces } from './vertical-places';
import { getVerticalRoutes } from './vertical-routes';
import { overlapsObstacle } from './region-collision';

export interface AnimalPlacement { site: string; feature: string; kind: AnimalKind; x: number; y: number; z: number; yaw: number; swimming: boolean; phase: number }
export const ANIMAL_LIMIT = 16;
export const animalRadius = (kind: AnimalKind) => kind === 'water-monitor' ? 1.2 : kind === 'smooth-coated-otter' ? .85 : kind === 'community-cat' ? .45 : .3;

/** All translated motion stays inside the tested water pocket; ground animals
 * only look, peck or flick their tails, keeping feet and navigation stable. */
export function animalPosition(p: AnimalPlacement, time: number) {
  const t = Math.max(0, Number.isFinite(time) ? time : 0) * .13 + p.phase;
  return p.swimming ? { x: p.x + Math.sin(t) * 2, y: p.y - .16, z: p.z + Math.cos(t) * .55, yaw: Math.atan2(2 * Math.cos(t), -.55 * Math.sin(t)) } : { x: p.x, y: p.y, z: p.z, yaw: p.yaw };
}

export function animalPlacements(region: RegionDefinition, world: RegionWorld) {
  const result: AnimalPlacement[] = [], audit: {site: string; reason: string}[] = [];
  const zone = getWorldZone(region.id), range = getFpsDistrict(region.id);
  const protectedPoints = [region.spawn, zone.spawn, ...region.stamps, ...zone.encounterSpawns, ...zoneSectors(region.id).flatMap(s => [...s.anchors, ...s.foodAnchors ?? []]), range.spawn, ...range.targets, ...Object.values(range.vehicles), ...WORLD_GATEWAYS.filter(g => g.from === region.id).map(g => g.position)];
  const access = getVerticalPlaces(world.scene).flatMap(p => p.connections.map(c => ({ a: c.from, b: c.to, width: c.width })));
  for (const route of getVerticalRoutes(world.scene)) for (let i = 1; i < route.points.length; i++) access.push({ a: route.points[i-1], b: route.points[i], width: route.width });
  const distance = (x: number, z: number, a: {x:number;z:number}, b: {x:number;z:number}) => {
    const dx = b.x-a.x, dz = b.z-a.z, l = dx*dx+dz*dz, t = l ? THREE.MathUtils.clamp(((x-a.x)*dx+(z-a.z)*dz)/l,0,1) : 0;
    return Math.hypot(x-a.x-t*dx,z-a.z-t*dz);
  };
  const ground = region.bounds.groundHeight ?? (() => 0), ray = new THREE.Raycaster(), down = new THREE.Vector3(0,-1,0);
  world.scene.updateMatrixWorld(true);
  const candidates: THREE.Object3D[] = [];
  const collect = (o: THREE.Object3D) => { if (!o.visible || o.userData.fpsEffect) return; if (o instanceof THREE.Mesh) candidates.push(o); for (const child of o.children) collect(child); };
  collect(world.scene);
  const surface = (x: number, z: number) => {
    ray.set(new THREE.Vector3(x, ground(x,z)+1.6, z), down); ray.far = 2.5;
    return ray.intersectObjects(candidates, false).find(h => h.object.visible);
  };
  for (const site of ANIMAL_SITES[region.id] ?? []) {
    const swimming = site.habitat === 'water', radius = animalRadius(site.kind), margin = radius + (swimming ? 2 : .3);
    let reason = 'placed'; const group: AnimalPlacement[] = [];
    for (const [x,z] of site.points) {
      const b = region.bounds;
      if (x-margin<b.minX || x+margin>b.maxX || z-margin<b.minZ || z+margin>b.maxZ) { reason='bounds'; break; }
      if (protectedPoints.some(p => Math.hypot(p.x-x,p.z-z)<8+margin)) { reason='gameplay'; break; }
      if (region.mapRoads.some(r=>r.points.slice(1).some((p,i)=>distance(x,z,r.points[i],p)<region.roadWidth/2+margin+2))) { reason='road'; break; }
      if (access.some(c=>distance(x,z,c.a,c.b)<c.width/2+margin+2)) { reason='access'; break; }
      const hit = surface(x,z);
      if (!hit || isWaterObject(hit.object)!==swimming || (!swimming && Math.abs(hit.point.y-ground(x,z))>.65)) { reason='surface'; break; }
      const y = hit.point.y;
      if (!swimming && !region.canOccupy(x,z,margin,world.obstacles.filter(o=>(o.minY??-Infinity)<y+.65 && (o.maxY??Infinity)>y+.05))) { reason='obstacle'; break; }
      if (swimming && world.obstacles.some(o=>(o.maxY??Infinity)>.4 && (o.minY??-Infinity)<1 && overlapsObstacle(o,x,z,margin))) { reason='water-obstacle'; break; }
      // Validate the entire movement rectangle plus body and tail, not only its centre.
      for (const ox of [-margin,0,margin]) for (const oz of [-(swimming ? .55+radius : radius),0,swimming ? .55+radius : radius]) {
        const h = surface(x+ox,z+oz);
        if (!h || isWaterObject(h.object)!==swimming || Math.abs(h.point.y-y)>.055) reason='uneven-or-edge';
      }
      if (reason!=='placed') break;
      group.push({ site:site.id, feature:site.feature, kind:site.kind, x,y,z,yaw:site.yaw,swimming,phase:swimming ? 0 : group.length * 1.7 });
    }
    if (result.length+group.length>ANIMAL_LIMIT) reason='budget';
    audit.push({site:site.id,reason}); if(reason==='placed') result.push(...group);
  }
  world.scene.userData.animalSiteAudit = audit;
  return result;
}

export function withAnimals<T extends RegionWorld>(world:T, region:RegionDefinition):T {
  if (!ANIMAL_SITES[region.id]?.length) { world.scene.userData.animalPlacements=[];world.scene.userData.animalSiteAudit=[];return world; }
  const placements = animalPlacements(region,world), kit = createAnimalKit(), root = new THREE.Group();
  root.name='Singapore habitat animals'; root.userData.fpsEffect=true;
  const animals = placements.map(p=> {
    const model=kit.create(p.kind),lod=new THREE.LOD();lod.name=model.name;lod.userData.fpsEffect=true;lod.userData.site=p.site;
    lod.addLevel(model,0);lod.addLevel(new THREE.Group(),65,.1);root.add(lod);return {p,model,lod};
  });
  world.scene.add(root); world.scene.userData.animalPlacements=placements;
  const animate=world.animate, dispose=world.dispose;
  function update(time:number) { for(const {p,model,lod} of animals) { const pose=animalPosition(p,time); lod.position.set(pose.x,pose.y,pose.z); lod.rotation.y=pose.yaw; animateAnimal(model,p.kind,time+p.phase); } }
  update(0);
  world.animate=time=>{animate(time);update(time);};
  world.dispose=()=>{root.removeFromParent();kit.dispose();dispose();};
  return world;
}
