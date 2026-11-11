import * as THREE from 'three';
import { batchStreetProps } from './street-prop-batches';
import { getWorldZone, WORLD_GATEWAYS } from './world-zones';
import { getVerticalPlaces } from './vertical-places';
import { getVerticalRoutes, getTraversalObstacles } from './vertical-routes';
import { zoneSectors } from './zone-sectors';
import { getFpsDistrict } from './fps-districts';
import type { RegionDefinition, RegionWorld } from './regions';
import { overlapsObstacle } from './region-collision';
import { createPropMotion, createStreetPropKit, streetPropSpec, type PropMotion, type StreetPropKind } from './street-props';

type Cluster = readonly (readonly [StreetPropKind, number, number, number?])[];
const clusters = {
  seating: [['picnic-table',0,0],['flower-pot',-1.8,.7],['wheelie-bin',1.8,.6]],
  cafe: [['cafe-table',0,0],['stool',-1.05,0],['stool',1.05,0],['stool',0,-1.05],['parasol',0,1.25]],
  delivery: [['pallet-stack',0,0],['crate',1.4,0],['crate',1.5,1.25],['trolley',-1.35,.1],['sack-stack',0,1.7]],
  service: [['cabinet',0,0],['drum',1.15,0],['cone',-1.2,.35],['cone',-1.2,1.35],['sack-stack',1.4,1.45]],
  garden: [['bench',0,0],['planter',-2.2,0],['flower-pot',1.65,.15],['notice-board',3.2,.1]],
  civic: [['recycling-station',0,0],['bike-rack',2.3,0],['bollard',-1.45,.35],['bollard',4.05,.35]],
  refreshment: [['vending',0,0],['bench',1.85,.25],['wheelie-bin',-1.25,0],['flower-pot',3.6,.2]],
} as const satisfies Record<string,Cluster>;
type ClusterKind = keyof typeof clusters;
const themes: Partial<Record<RegionDefinition['id'],readonly ClusterKind[]>> = {
  chinatown:['cafe','delivery','cafe','refreshment','garden'],
  'little-india':['delivery','cafe','garden','refreshment'],
  'kampong-glam':['cafe','garden','refreshment','delivery'],
  'katong-joo-chiat':['garden','cafe','delivery','refreshment'],
  tuas:['service','delivery','service','civic','refreshment'],
  harbourfront:['delivery','service','civic','seating','refreshment'],
  'marina-bay':['garden','seating','civic','cafe','refreshment'],
  'raffles-place':['civic','garden','refreshment','cafe'],
  'pulau-ubin':['seating','garden','delivery','cafe'],
};
const residential:readonly ClusterKind[]=['garden','seating','refreshment','civic','cafe','delivery','service'];
export const STREET_PROP_LIMIT=240;
export interface StreetPropPlacement { kind: StreetPropKind; x:number; y:number; z:number; yaw:number; cluster:string }
type DressingRegion=Pick<RegionDefinition,'id'|'bounds'|'mapRoads'|'roadWidth'|'spawn'|'stamps'|'canOccupy'>;
const hash=(x:number,z:number,salt=0)=>{const n=Math.sin(x*12.9898+z*78.233+salt*37.13)*43758.5453;return n-Math.floor(n);};

/** Distribute authored little scenes across the whole district, then use clear
 * interior space for a second layer. Candidate sorting removes road-order bias.
 * All randomness is a coordinate hash, so every mode builds identical cover. */
export function streetPropPlacements(region:DressingRegion,world:RegionWorld) {
  const result:StreetPropPlacement[]=[],theme=themes[region.id]??residential;
  const ground=region.bounds.groundHeight??(()=>0),bounds=region.bounds;
  const range=getFpsDistrict(region.id),reserved=[range.spawn,...range.targets,...Object.values(range.vehicles)];
  const rangeBounds={minX:Math.min(...reserved.map(p=>p.x))-10,maxX:Math.max(...reserved.map(p=>p.x))+10,minZ:Math.min(...reserved.map(p=>p.z))-10,maxZ:Math.max(...reserved.map(p=>p.z))+10};
  const access=getVerticalPlaces(world.scene).flatMap(p=>p.connections.map(c=>({minX:Math.min(c.from.x,c.to.x)-c.width/2-1.5,maxX:Math.max(c.from.x,c.to.x)+c.width/2+1.5,minZ:Math.min(c.from.z,c.to.z)-c.width/2-1.5,maxZ:Math.max(c.from.z,c.to.z)+c.width/2+1.5})));
  for(const route of getVerticalRoutes(world.scene))for(let i=1;i<route.points.length;i++){
    const a=route.points[i-1],b=route.points[i],r=route.width/2+1.5;
    access.push({minX:Math.min(a.x,b.x)-r,maxX:Math.max(a.x,b.x)+r,minZ:Math.min(a.z,b.z)-r,maxZ:Math.max(a.z,b.z)+r});
  }
  const traversal=getTraversalObstacles(world.scene);
  const zone=getWorldZone(region.id);
  const protectedPoints=[region.spawn,zone.spawn,...region.stamps,...zone.encounterSpawns,...zoneSectors(region.id).flatMap(s=>s.anchors),...WORLD_GATEWAYS.filter(g=>g.from===region.id).map(g=>g.position)];
  const segments=region.mapRoads.flatMap(r=>r.points.slice(1).map((b,i)=>{const a=r.points[i],dx=b.x-a.x,dz=b.z-a.z;return {a,b,dx,dz,length:Math.hypot(dx,dz)};}));
  const roadClearance=Math.max(9,region.roadWidth/2)+1.5;
  const roadDistance=(x:number,z:number)=>Math.min(...segments.map(({a,dx,dz,length})=>{
    const t=length?THREE.MathUtils.clamp(((x-a.x)*dx+(z-a.z)*dz)/(length*length),0,1):0;
    return Math.hypot(x-a.x-t*dx,z-a.z-t*dz);
  }));
  type Candidate={x:number;z:number;yaw:number;interior:boolean};
  const edges:Candidate[]=[],interiors:Candidate[]=[];
  for(const {a,dx,dz,length} of segments){
    if(length<18)continue;
    for(let along=10;along<length-9;along+=18)for(const side of [-1,1]){
      const offset=roadClearance+3.8;
      edges.push({x:a.x+dx/length*along-dz/length*offset*side,z:a.z+dz/length*along+dx/length*offset*side,yaw:Math.atan2(-dz*side,dx*side),interior:false});
    }
  }
  for(let x=bounds.minX+14;x<bounds.maxX-14;x+=22)for(let z=bounds.minZ+14;z<bounds.maxZ-14;z+=22){
    const px=x+(hash(x,z)-.5)*9,pz=z+(hash(z,x)-.5)*9;
    if(roadDistance(px,pz)>roadClearance+9)interiors.push({x:px,z:pz,yaw:Math.floor(hash(x,z,4)*4)*Math.PI/2,interior:true});
  }
  const order=(a:Candidate,b:Candidate)=>hash(a.x,a.z,3)-hash(b.x,b.z,3);
  edges.sort(order);interiors.sort(order);
  // Alternate edge/interior groups, reserving density for both kinds of space.
  const candidates:Candidate[]=[];
  for(let i=0;i<Math.max(edges.length,interiors.length);i++){if(edges[i])candidates.push(edges[i]);if(interiors[i])candidates.push(interiors[i]);}
  const centers:Candidate[]=[];let reactive=0;
  for(const candidate of candidates){
    if(result.length>=STREET_PROP_LIMIT)break;
    if(centers.some(p=>Math.hypot(p.x-candidate.x,p.z-candidate.z)<12))continue;
    const clusterKind=theme[Math.floor(hash(candidate.x,candidate.z,8)*theme.length)];
    const clusterId=`${clusterKind}:${centers.length}`,before=result.length;
    const c=Math.cos(candidate.yaw),sn=Math.sin(candidate.yaw);
    for(const [kind,ox,oz] of clusters[clusterKind]){
      if(result.length>=STREET_PROP_LIMIT)break;
      const spec=streetPropSpec(kind);if(spec.behavior!=='fixed'&&reactive>=80)continue;
      const x=candidate.x+ox*c+oz*sn,z=candidate.z-ox*sn+oz*c,y=ground(x,z)+.025;
      const radius=Math.max(spec.width,spec.depth)/2,margin=radius+1.4;
      if(x<bounds.minX+margin||x>bounds.maxX-margin||z<bounds.minZ+margin||z>bounds.maxZ-margin)continue;
      if(overlapsObstacle(rangeBounds,x,z,margin)||protectedPoints.some(p=>Math.hypot(x-p.x,z-p.z)<5+radius))continue;
      if([region.spawn,...region.stamps].some(p=>Math.hypot(x-p.x,z-p.z)<10))continue;
      if(world.obstacles.some(o=>overlapsObstacle(o,x,z,margin))||!region.canOccupy(x,z,margin,world.obstacles))continue;
      if(access.some(o=>overlapsObstacle(o,x,z,radius))||traversal.some(o=>o.minY<y+spec.height&&o.maxY>y&&overlapsObstacle(o,x,z,radius+.5)))continue;
      if(roadDistance(x,z)<roadClearance+radius)continue;
      if(result.some(p=>Math.hypot(x-p.x,z-p.z)<(kind==='parasol'?.3:radius)+(p.kind==='parasol'?.3:Math.max(streetPropSpec(p.kind).width,streetPropSpec(p.kind).depth)/2)+.25))continue;
      if([[-radius,-radius],[radius,radius],[-radius,radius],[radius,-radius]].some(([px,pz])=>Math.abs(ground(x+px,z+pz)-(y-.025))>.1))continue;
      result.push({kind,x,y,z,yaw:candidate.yaw+(kind==='crate'?(hash(x,z,9)-.5)*.2:0),cluster:clusterId});
      if(spec.behavior!=='fixed')reactive++;
    }
    if(result.length>before)centers.push(candidate);
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
