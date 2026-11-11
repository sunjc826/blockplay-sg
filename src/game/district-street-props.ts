import * as THREE from 'three';
import { getFpsDistrict } from './fps-districts';
import type { RegionDefinition, RegionWorld } from './regions';
import { overlapsObstacle } from './region-collision';
import { createPropMotion, createStreetPropKit, streetPropSpec, type PropMotion, type StreetPropKind } from './street-props';

const collections: Partial<Record<RegionDefinition['id'], readonly StreetPropKind[]>> = {
  'chinatown': ['crate','stool','flower-pot','vending','wheelie-bin','trolley'],
  'little-india': ['flower-pot','crate','stool','vending','trolley','bollard'],
  'kampong-glam': ['flower-pot','stool','bench','wheelie-bin','crate','bollard'],
  'katong-joo-chiat': ['flower-pot','stool','vending','trolley','crate','bench'],
  'tuas': ['cabinet','cone','trolley','bollard','crate','wheelie-bin'],
  'harbourfront': ['cabinet','trolley','cone','bollard','crate','bench'],
  'marina-bay': ['planter','bench','bollard','bike-rack','cone','flower-pot'],
  'raffles-place': ['planter','bench','vending','bollard','wheelie-bin','cone'],
  'pulau-ubin': ['bench','crate','flower-pot','stool','wheelie-bin','bike-rack'],
};
const defaultCollection: readonly StreetPropKind[] = ['bench','planter','vending','bike-rack','stool','cone','flower-pot','wheelie-bin','cabinet','trolley','crate','bollard'];
export interface StreetPropPlacement { kind: StreetPropKind; x:number; y:number; z:number; yaw:number }

/** Deterministic roadside candidates. Wide keepouts leave existing circulation intact.
 * Only level, unobstructed ground is accepted; this is authored decoration, not a
 * claim that a particular fixture exists at this geographic location. */
export function streetPropPlacements(region: Pick<RegionDefinition,'id'|'bounds'|'mapRoads'|'roadWidth'|'spawn'|'stamps'|'canOccupy'>, world: RegionWorld) {
  const result:StreetPropPlacement[]=[], kinds=collections[region.id]??defaultCollection;
  const ground=region.bounds.groundHeight??(()=>0), bounds=region.bounds;
  const range=getFpsDistrict(region.id),reserved=[range.spawn,...range.targets,...Object.values(range.vehicles)];
  const rangeBounds={minX:Math.min(...reserved.map(p=>p.x))-10,maxX:Math.max(...reserved.map(p=>p.x))+10,minZ:Math.min(...reserved.map(p=>p.z))-10,maxZ:Math.max(...reserved.map(p=>p.z))+10};
  for(const road of region.mapRoads)for(let i=1;i<road.points.length;i++) {
    const a=road.points[i-1],b=road.points[i],length=Math.hypot(b.x-a.x,b.z-a.z);if(length<18)continue;
    const dx=(b.x-a.x)/length,dz=(b.z-a.z)/length;
    for(let along=9;along<length-8;along+=22)for(const side of [-1,1]) {
      if(result.length>=24)return result;
      const kind=kinds[result.length%kinds.length],spec=streetPropSpec(kind),margin=Math.max(spec.width,spec.depth)/2+2;
      const offset=Math.max(9,region.roadWidth/2)+4;
      const x=a.x+dx*along-dz*offset*side,z=a.z+dz*along+dx*offset*side,y=ground(x,z)+.025;
      if(x<bounds.minX+margin||x>bounds.maxX-margin||z<bounds.minZ+margin||z>bounds.maxZ-margin)continue;
      if(overlapsObstacle(rangeBounds,x,z,margin))continue;
      if([region.spawn,...region.stamps].some(p=>Math.hypot(x-p.x,z-p.z)<10))continue;
      if(world.obstacles.some(o=>overlapsObstacle(o,x,z,margin))||!region.canOccupy(x,z,margin,world.obstacles))continue;
      if(result.some(p=>Math.hypot(x-p.x,z-p.z)<5))continue;
      if([[-margin,-margin],[margin,margin],[-margin,margin],[margin,-margin]].some(([ox,oz])=>Math.abs(ground(x+ox,z+oz)-(y-.025))>.1))continue;
      // Protect every crossing, including curved/polyline roads.
      if(region.mapRoads.some(r=>r.points.slice(1).some((q,j)=>{
        const p=r.points[j],vx=q.x-p.x,vz=q.z-p.z,sq=vx*vx+vz*vz;
        const t=sq?THREE.MathUtils.clamp(((x-p.x)*vx+(z-p.z)*vz)/sq,0,1):0;
        return Math.hypot(x-p.x-t*vx,z-p.z-t*vz)<Math.max(9,region.roadWidth/2)+1.5;
      })))continue;
      result.push({kind,x,y,z,yaw:Math.atan2(-dz*side,dx*side)});
    }
  }
  return result;
}

export interface StreetPropSystem {
  /** Visual interaction only: rounds still use the authoritative cover trace. */
  shoot(from:{x:number;y:number;z:number},to:{x:number;y:number;z:number}):void;
  reset():void;
}

export function withStreetProps<T extends RegionWorld>(world:T,region:Pick<RegionDefinition,'id'|'bounds'|'mapRoads'|'roadWidth'|'spawn'|'stamps'|'canOccupy'>):T {
  const kit=createStreetPropKit(), root=new THREE.Group();root.name='District street props';
  const dynamicRoot=new THREE.Group();dynamicRoot.name='Reactive street decorations';dynamicRoot.userData.fpsEffect=true;
  const moving:PropMotion[]=[],placements=streetPropPlacements(region,world);
  for(const p of placements){
    const spec=streetPropSpec(p.kind),model=kit.create(p.kind);model.position.set(p.x,p.y,p.z);model.rotation.y=p.yaw;root.add(model);
    if(spec.behavior==='fixed'){
      // The exact rendered bounds include the angled legs and leaf tips.
      model.updateMatrixWorld(true);const local=model.userData.streetPropBounds;
      const b=new THREE.Box3(new THREE.Vector3().fromArray(local.min),new THREE.Vector3().fromArray(local.max)).applyMatrix4(model.matrixWorld);
      world.obstacles.push({minX:b.min.x,maxX:b.max.x,minZ:b.min.z,maxZ:b.max.z,minY:p.y,maxY:b.max.y});
    } else {
      dynamicRoot.add(model);
      model.userData.fpsEffect=true; // visual only, never authority cover or a navigation obstacle
      moving.push(createPropMotion(model,p.kind));
    }
  }
  world.scene.add(root,dynamicRoot);world.scene.userData.streetPropPlacements=placements;
  const ray=new THREE.Raycaster(),start=new THREE.Vector3(),direction=new THREE.Vector3(),bounds=new THREE.Box3(),point=new THREE.Vector3();
  world.streetProps={
    shoot(from,to){
      start.set(from.x,from.y,from.z);direction.set(to.x-from.x,to.y-from.y,to.z-from.z);const distance=direction.length();
      if(!Number.isFinite(distance)||distance<1e-6)return;ray.set(start,direction.normalize());ray.far=distance;
      for(const motion of moving){
        if(motion.broken||motion.active)continue;
        // Broad phase avoids triangles for distant decorations.
        if(start.distanceToSquared(motion.root.position)>(distance+2.5)**2)continue;
        motion.root.updateMatrixWorld(true);bounds.setFromObject(motion.root);
        if(!ray.ray.intersectBox(bounds,point)||point.distanceTo(start)>distance)continue;
        if(ray.intersectObject(motion.root,true).length)motion.hit(direction);
      }
    },
    reset(){moving.forEach(m=>m.reset());},
  };
  const animate=world.animate,dispose=world.dispose;let last:number|undefined;
  world.animate=time=>{animate(time);if(last!==undefined&&time<last)world.streetProps?.reset();const dt=last===undefined?0:Math.min(.05,Math.max(0,time-last));last=time;moving.forEach(m=>m.update(dt));};
  world.dispose=()=>{root.removeFromParent();dynamicRoot.removeFromParent();kit.dispose();dispose();};
  return world;
}
