import * as THREE from 'three';
import { batchStreetProps } from './street-prop-batches';
import { getWorldZone, WORLD_GATEWAYS } from './world-zones';
import { getVerticalPlaces } from './vertical-places';
import { getVerticalRoutes, getTraversalObstacles } from './vertical-routes';
import { SMITH_CONTROL_SITES } from './hardpoint';
import { zoneSectors } from './zone-sectors';
import { getFpsDistrict } from './fps-districts';
import type { RegionDefinition, RegionWorld } from './regions';
import { overlapsObstacle } from './region-collision';
import { createPropMotion, createStreetPropKit, streetPropSpec, type PropMotion, type StreetPropKind } from './street-props';

import { STREET_PROP_SITES, type Furnishing } from './street-prop-sites';
type Arrangement = readonly (readonly [StreetPropKind, number, number])[];
/** Furniture is selected by the use of the actual site, never the district name.
 * All members of a small arrangement must fit or the whole group is omitted. */
export const SITE_FURNITURE: Record<Furnishing,Arrangement> = {
  hawker: [['hawker-table',0,0]],
  'tray-return': [['tray-return',0,0]],
  kopitiam: [['cafe-table',0,0],['stool',-1.05,0],['stool',1.05,0],['stool',0,-1.05]],
  'outdoor-dining': [['cafe-table',0,0],['stool',-1.05,0],['stool',1.05,0],['stool',0,-1.05],['parasol',0,1.25]],
  shopfront: [['flower-pot',0,0]],
  loading: [['pallet-stack',0,0],['crate',1.5,0],['crate',1.5,1.2],['trolley',-1.4,0]],
  workshop: [['pallet-stack',0,0],['sack-stack',1.6,0],['drum',-1.3,0],['trolley',2.5,0],['cone',-2.2,1]],
  rest: [['bench',0,0],['park-bin',4,0]],
  picnic: [['picnic-table',0,0],['park-bin',4,0]],
  chess: [['chess-table',0,0]],
  mail: [['letterboxes',0,0],['notice-board',2.2,0]],
  'estate-collection': [['recycling-station',0,0]],
  'cycle-parking': [['bike-rack',0,0],['bike-rack',2.8,0]],
};
/** Rendering guard only; no attempt is made to fill this budget. */
export const STREET_PROP_LIMIT=240;
export interface StreetPropPlacement { kind: StreetPropKind; x:number; y:number; z:number; yaw:number; cluster:string; site:string; furnishing:Furnishing; feature:string }
type DressingRegion=Pick<RegionDefinition,'id'|'bounds'|'mapRoads'|'roadWidth'|'spawn'|'stamps'|'canOccupy'>;

export function streetPropPlacements(region:DressingRegion,world:RegionWorld) {
  const audit:{site:string;index:number;reason:string}[]= [];world.scene.userData.streetPropSiteAudit=audit;
  const result:StreetPropPlacement[]=[],ground=region.bounds.groundHeight??(()=>0),bounds=region.bounds;
  const range=getFpsDistrict(region.id),reserved=[range.spawn,...range.targets,...Object.values(range.vehicles)];
  const rangeBounds={minX:Math.min(...reserved.map(p=>p.x))-10,maxX:Math.max(...reserved.map(p=>p.x))+10,minZ:Math.min(...reserved.map(p=>p.z))-10,maxZ:Math.max(...reserved.map(p=>p.z))+10};
  const access=getVerticalPlaces(world.scene).flatMap(p=>p.connections.map(c=>({minX:Math.min(c.from.x,c.to.x)-c.width/2-1.5,maxX:Math.max(c.from.x,c.to.x)+c.width/2+1.5,minZ:Math.min(c.from.z,c.to.z)-c.width/2-1.5,maxZ:Math.max(c.from.z,c.to.z)+c.width/2+1.5})));
  for(const route of getVerticalRoutes(world.scene))for(let i=1;i<route.points.length;i++){
    const a=route.points[i-1],b=route.points[i],r=route.width/2+1.5;
    access.push({minX:Math.min(a.x,b.x)-r,maxX:Math.max(a.x,b.x)+r,minZ:Math.min(a.z,b.z)-r,maxZ:Math.max(a.z,b.z)+r});
  }
  const traversal=getTraversalObstacles(world.scene),zone=getWorldZone(region.id);
  const protectedPoints=[region.spawn,zone.spawn,...region.stamps,...zone.encounterSpawns,...zoneSectors(region.id).flatMap(s=>[...s.anchors,...s.foodAnchors??[]]),...(region.id==='chinatown'?SMITH_CONTROL_SITES:[]),...WORLD_GATEWAYS.filter(g=>g.from===region.id).map(g=>g.position)];
  const segments=region.mapRoads.flatMap(r=>r.points.slice(1).map((b,i)=>{const a=r.points[i],dx=b.x-a.x,dz=b.z-a.z;return {a,dx,dz,length:Math.hypot(dx,dz)};}));
  const roadClearance=Math.max(9,region.roadWidth/2)+1.5;
  const roadDistance=(x:number,z:number)=>Math.min(...segments.map(({a,dx,dz,length})=>{
    const t=length?THREE.MathUtils.clamp(((x-a.x)*dx+(z-a.z)*dz)/(length*length),0,1):0;
    return Math.hypot(x-a.x-t*dx,z-a.z-t*dz);
  }));
  let reactive=0;
  for(const site of STREET_PROP_SITES[region.id]){
    const dx=site.to[0]-site.from[0],dz=site.to[1]-site.from[1],length=Math.hypot(dx,dz),steps=Math.floor(length/site.spacing);
    const c=Math.cos(site.yaw),sn=Math.sin(site.yaw);
    for(let index=0;index<=steps;index++){
      const t=steps?index/steps:0,px=site.from[0]+dx*t,pz=site.from[1]+dz*t;
      const group:StreetPropPlacement[]=SITE_FURNITURE[site.furnishing].map(([kind,ox,oz])=>{
        const x=px+ox*c+oz*sn,z=pz-ox*sn+oz*c;
        return {kind,x,z,y:ground(x,z)+site.groundOffset,yaw:site.yaw,cluster:`${site.furnishing}:${site.id}:${index}`,site:site.id,furnishing:site.furnishing,feature:site.feature};
      });
      const dynamic=group.filter(p=>streetPropSpec(p.kind).behavior!=='fixed').length;
      if(result.length+group.length>STREET_PROP_LIMIT||reactive+dynamic>80)continue;
      let reason='placed';const reject=(value:string)=>{reason=value;return false;};
      const fits=group.every(p=>{
        const spec=streetPropSpec(p.kind),{x,y,z}=p,radius=Math.max(spec.width,spec.depth)/2,margin=radius+.6;
        if(x<bounds.minX+margin||x>bounds.maxX-margin||z<bounds.minZ+margin||z>bounds.maxZ-margin)return reject('bounds');
        if(overlapsObstacle(rangeBounds,x,z,margin)||protectedPoints.some(q=>Math.hypot(x-q.x,z-q.z)<5+radius))return reject('reserved-gameplay');
        if([region.spawn,...region.stamps].some(q=>Math.hypot(x-q.x,z-q.z)<10))return reject('spawn-or-stamp');
        // Ignore overhead solids in genuine void decks. Keep low water and
        // legacy ground obstructions even when they sit below the furniture.
        const blockers=world.obstacles.filter(o=>(o.minY??-Infinity)<y+spec.height);
        if(!region.canOccupy(x,z,margin,blockers))return reject('existing-obstacle');
        if(access.some(o=>overlapsObstacle(o,x,z,radius))||traversal.some(o=>o.minY<y+spec.height&&o.maxY>y+.05&&overlapsObstacle(o,x,z,radius+.35)))return reject('building-access');
        if(roadDistance(x,z)<roadClearance+radius)return reject('road');
        if(result.some(q=>Math.hypot(x-q.x,z-q.z)<radius+Math.max(streetPropSpec(q.kind).width,streetPropSpec(q.kind).depth)/2+.6))return reject('other-furniture');
        return ![[-radius,-radius],[radius,radius],[-radius,radius],[radius,-radius]].some(([ox,oz])=>Math.abs(ground(x+ox,z+oz)-ground(x,z))>.1);
      });
      audit.push({site:site.id,index,reason:fits?'placed':reason==='placed'?'slope':reason});
      if(fits){result.push(...group);reactive+=dynamic;}
    }
  }
  return result;
}

export interface StreetPropSystem {
  /** Visual interaction only: rounds still use the authoritative cover trace. */
  shoot(from:{x:number;y:number;z:number},to:{x:number;y:number;z:number}):void;
  reset():void;
}

export function withStreetProps<T extends RegionWorld>(world:T,region:DressingRegion):T {
  const kit=createStreetPropKit(), root=new THREE.Group();root.name='District street props';
  const dynamicRoot=new THREE.Group();dynamicRoot.name='Reactive street decorations';dynamicRoot.userData.fpsEffect=true;
  const moving:PropMotion[]=[],placements=streetPropPlacements(region,world);
  for(const p of placements){
    const spec=streetPropSpec(p.kind),model=kit.create(p.kind);model.position.set(p.x,p.y,p.z);model.rotation.y=p.yaw;root.add(model);
    if(spec.behavior==='fixed'){
      // The exact rendered bounds include the angled legs and leaf tips.
      model.updateMatrixWorld(true);const local=model.userData.streetPropBounds;
      for(const shape of model.userData.streetPropColliders??[local]) {
        const b=new THREE.Box3(new THREE.Vector3().fromArray(shape.min),new THREE.Vector3().fromArray(shape.max)).applyMatrix4(model.matrixWorld);
        world.obstacles.push({minX:b.min.x,maxX:b.max.x,minZ:b.min.z,maxZ:b.max.z,minY:b.min.y,maxY:b.max.y});
      }
    } else {
      dynamicRoot.add(model);
      model.userData.fpsEffect=true; // visual only, never authority cover or a navigation obstacle
      moving.push(createPropMotion(model,p.kind));
    }
  }
  const fixedBatches=batchStreetProps(root.children as THREE.Group[],'Street fixture instances');
  const reactiveBatches=batchStreetProps(dynamicRoot.children as THREE.Group[],'Reactive prop instances',true);
  world.scene.add(root,dynamicRoot,fixedBatches.root,reactiveBatches.root);world.scene.userData.streetPropPlacements=placements;
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
    reset(){moving.forEach(m=>m.reset());reactiveBatches.sync(moving.map(m=>m.root));},
  };
  const animate=world.animate,dispose=world.dispose;let last:number|undefined;
  world.animate=time=>{animate(time);if(last!==undefined&&time<last)world.streetProps?.reset();const dt=last===undefined?0:Math.min(.05,Math.max(0,time-last));last=time;const changed=moving.filter(m=>m.active);changed.forEach(m=>m.update(dt));reactiveBatches.sync(changed.map(m=>m.root));};
  world.dispose=()=>{root.removeFromParent();dynamicRoot.removeFromParent();fixedBatches.dispose();reactiveBatches.dispose();kit.dispose();dispose();};
  return world;
}
