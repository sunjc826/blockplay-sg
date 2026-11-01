import { afterAll, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildUpperThomsonScene, UPPER_THOMSON_BOUNDS, UPPER_THOMSON_MAP_ROADS } from './upper-thomson-scene';
import { buildBukitTimahScene, BUKIT_TIMAH_BOUNDS } from './bukit-timah-scene';
import { upperThomsonGroundHeight, thomsonTrailX } from './upper-thomson-ground';
import { createVerticalMovement } from './vertical-movement';
import { getWalkSurfaces, getTraversalObstacles } from './vertical-routes';
import { sceneFlightObstacles } from './flight-obstacles';
import { canFly } from './vehicle-rules';
import { getWorldZone } from './world-zones';
import { zoneSectors } from './zone-sectors';
import { UPPER_THOMSON_STAMPS } from '../data/region-stamps';

const thomson = buildUpperThomsonScene(), timah = buildBukitTimahScene();
const movement = (world: typeof thomson, bounds: typeof BUKIT_TIMAH_BOUNDS) => createVerticalMovement({
  bounds, obstacles:world.obstacles,surfaces:getWalkSurfaces(world.scene),traversalObstacles:getTraversalObstacles(world.scene),
});
const tm = movement(thomson,UPPER_THOMSON_BOUNDS), bm = movement(timah,BUKIT_TIMAH_BOUNDS);
thomson.scene.updateMatrixWorld(true); timah.scene.updateMatrixWorld(true);
afterAll(() => { thomson.dispose(); timah.dispose(); });
function walk(m: typeof tm, points: {x:number;y:number;z:number}[]) {
  for (const radius of [.38,.65]) for (const path of [points,[...points].reverse()]) {
    let state = {...path[0],velocityY:0};
    for (const p of path.slice(1)) {
      const next = m.move(state,p.x-state.x,p.z-state.z,0,radius,1.8);
      expect(Math.hypot(next.x-p.x,next.z-p.z),JSON.stringify({state,p,radius})).toBeLessThan(.03);
      expect(next.y).toBeCloseTo(p.y,4); expect(next.grounded).toBe(true); state=next;
    }
  }
}

it('matches the connected forest mesh at cross slopes and flat stopping places', () => {
  const ground = thomson.scene.getObjectByName('Thomson connected forest shoulder')!;
  for (let z = 17.31; z < 132; z += 7.13) for (let x = -157.27; x < -130; x += 2.31) {
    const y = upperThomsonGroundHeight(x,z);
    const hit = new THREE.Raycaster(new THREE.Vector3(x,4,z),new THREE.Vector3(0,-1,0),0,5).intersectObject(ground)[0];
    expect(hit).toBeDefined(); expect(hit.point.y).toBeCloseTo(y,5);
    expect(y).toBeGreaterThanOrEqual(0); expect(y).toBeLessThanOrEqual(2);
  }
  for (const [z,y] of [[60,1.2],[96,2]]) for(const x of [-152,-146,-136]) expect(upperThomsonGroundHeight(x,z)).toBeCloseTo(y);
});

it('walks the winding woodland path and lateral bank continuously in both directions', () => {
  walk(tm,Array.from({length:61},(_,i) => { const z=14+i*2,x=thomsonTrailX(z); return {x,z,y:upperThomsonGroundHeight(x,z)}; }));
  walk(tm,Array.from({length:29},(_,i) => { const x=-129-i,z=70; return {x,z,y:upperThomsonGroundHeight(x,z)}; }));
});

it('leaves the street grid and shop frontage level, with low airspace above the bank', () => {
  for (const road of UPPER_THOMSON_MAP_ROADS) for(let i=1;i<road.points.length;i++) {
    const a=road.points[i-1],b=road.points[i];
    for(let n=0;n<=20;n++) expect(upperThomsonGroundHeight(a.x+(b.x-a.x)*n/20,a.z+(b.z-a.z)*n/20)).toBe(0);
  }
  expect(upperThomsonGroundHeight(-50,-12)).toBe(0);
  const flight=sceneFlightObstacles(thomson.scene);
  expect(canFly(-146,2.13,90,flight,UPPER_THOMSON_BOUNDS)).toBe(true);
  expect(canFly(-146,1.13,90,flight,UPPER_THOMSON_BOUNDS)).toBe(false);
});

it('connects both low station approaches to the public waiting shelter', () => {
  walk(bm,[{x:84,y:0,z:100},{x:84,y:0,z:102},{x:84,y:.5,z:114},
    {x:84,y:.5,z:130},{x:100,y:.5,z:130},{x:84,y:.5,z:130},
    {x:84,y:.5,z:146},{x:84,y:0,z:158},{x:84,y:0,z:160}]);
  for (const [x,z] of [[96.13,130.21],[87.27,118.13],[87.27,141.13]]) {
    const ray=new THREE.Raycaster(new THREE.Vector3(x,.8,z),new THREE.Vector3(0,-1,0),0,.4);
    const floor=ray.intersectObject(timah.scene,true).filter(hit=>hit.face!.normal.y>.99);
    expect(floor).toHaveLength(1); expect(floor[0].point.y).toBeCloseTo(.5);
  }
});

it('reaches the same sheltered Plaza landing by direct steps and the longer side ramp', () => {
  walk(tm,[{x:85,y:0,z:-8},{x:85,y:0,z:-9},{x:85,y:.6,z:-13},{x:85,y:.6,z:-17}]);
  walk(tm,[{x:49,y:0,z:-17},{x:50,y:0,z:-17},{x:73,y:.6,z:-17},{x:85,y:.6,z:-17}]);
  for (const [x,z] of [[84.27,-16.71],[85.17,-21.12]]) {
    const ray=new THREE.Raycaster(new THREE.Vector3(x,.9,z),new THREE.Vector3(0,-1,0),0,.4);
    const floor=ray.intersectObject(thomson.scene,true).filter(hit=>hit.face!.normal.y>.99);
    expect(floor).toHaveLength(1); expect(floor[0].point.y).toBeCloseTo(.6);
  }
});

it('keeps Plaza loot, encounters and the exploration stop on clear ground beside the landing', () => {
  const sector = zoneSectors('upper-thomson').find(s => s.id === 'thomson-plaza')!;
  const inForecourt = (p: {x:number;z:number}) => p.x >= sector.bounds.minX && p.x <= sector.bounds.maxX &&
    p.z >= sector.bounds.minZ && p.z <= sector.bounds.maxZ;
  const points = [...sector.anchors, ...getWorldZone('upper-thomson').encounterSpawns.filter(inForecourt),
    UPPER_THOMSON_STAMPS.find(s => s.name === 'Thomson Plaza forecourt')!];
  for (const p of points) for (const radius of [.38,.65]) {
    expect(tm.canOccupy(p.x,0,p.z,radius,1.8), JSON.stringify(p)).toBe(true);
    expect(tm.supportHeight(p.x,p.z,0,radius,1.8), JSON.stringify(p)).toBe(0);
  }
});

it('keeps the steep reserve hill beyond the road instead of ramping up its carriageway', () => {
  expect(bm.supportHeight(-175,40,4)).toBe(0);
  walk(bm,[{x:-157,y:0,z:42},{x:-157,y:0,z:30},{x:-157,y:2,z:25},{x:-157,y:4,z:20}]);
  expect(bm.canOccupy(-175,1,25)).toBe(false);
});
