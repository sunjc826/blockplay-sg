import { queenstownTerrainHeight } from './queenstown-terrain';
import { afterAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildQueenstownScene } from './queenstown-scene';
import { QUEENSTOWN_BOUNDS } from './queenstown-collision';
import { HDB_CORE_OFFSET, HDB_GALLERY_LEVELS, QUEENSTOWN_HDB_BLOCKS, QUEENSTOWN_HOUSING_PLACES } from './queenstown-housing';
import { createVerticalMovement } from './vertical-movement';
import { getTraversalObstacles, getWalkSurfaces, type RoutePoint } from './vertical-routes';
import { createVerticalNavigator } from './vertical-navigation';

const world = buildQueenstownScene();
const input = { bounds: QUEENSTOWN_BOUNDS, obstacles: world.obstacles, surfaces: getWalkSurfaces(world.scene), traversalObstacles: getTraversalObstacles(world.scene) };
const movement = createVerticalMovement(input);
world.scene.updateMatrixWorld(true);
afterAll(() => world.dispose());

function walk(points: RoutePoint[], radius: number) {
  points=points.map(p=>({...p,y:p.y+queenstownTerrainHeight(p.x,p.z)}));
  let state = { ...points[0], velocityY: 0 };
  for (const target of points.slice(1)) {
    const next = movement.move(state, target.x-state.x, target.z-state.z, 0, radius, 1.8);
    expect(Math.hypot(next.x-target.x,next.z-target.z), JSON.stringify({state,target,radius})).toBeLessThan(.05);
    expect(next.y).toBeCloseTo(target.y);
    expect(next.grounded).toBe(true);
    state = next;
  }
}

describe.each(QUEENSTOWN_HDB_BLOCKS)('$label housing', block => {
  const {x,z}=block,base=queenstownTerrainHeight(x,z);
  it('supports cross-deck and through-deck routes under a real ceiling', () => {
    for (const radius of [.38,.65]) {
      const across = [{x:x-28,y:0,z},{x:x+10,y:0,z},{x:x+10,y:0,z:z+3.8},{x:x+28,y:0,z:z+3.8}];
      const through = [{x:x-6,y:0,z:z-10},{x:x-6,y:0,z:z+11}];
      for (const path of [across,through]) { walk(path,radius); walk([...path].reverse(),radius); }
    }
    const roofRay = new THREE.Raycaster(new THREE.Vector3(x-6,base+1.8,z),new THREE.Vector3(0,1,0),0,3);
    const roof = roofRay.intersectObject(world.scene.getObjectByName('Connected elevated places')!,true)[0];
    expect(roof).toBeDefined();
    expect(roof.point.y).toBeCloseTo(base+3.14);
    expect(movement.move({x:x-6,y:base,z,velocityY:8},0,0,.8).y).toBeLessThanOrEqual(base+3.14-1.8+.001);
  });

  it('walks both sheltered return stairs and connected residential corridors in both modes', () => {
    const west=x-HDB_CORE_OFFSET,east=x+HDB_CORE_OFFSET;
    const path: RoutePoint[]=[{x:west-2.1,y:0,z:z+6.5}];
    let base=0;
    for (const y of HDB_GALLERY_LEVELS) {
      const mid=(base+y)/2;
      path.push({x:west-2.1,y:base,z:z+4.5},{x:west-2.1,y:mid,z},
        {x:west-2.1,y:mid,z:z-1.25},{x:west+2.1,y:mid,z:z-1.25},
        {x:west+2.1,y:mid,z},{x:west+2.1,y,z:z+4.5},{x:west+2.1,y,z:z+6.5});
      if (y===3.4) path.push({x:west-2.1,y,z:z+6.5});
      base=y;
    }
    path.push({x:east+2.1,y:6.2,z:z+6.5});
    for (const [top,bottom] of [[6.2,3.4],[3.4,0]]) {
      const mid=(top+bottom)/2;
      path.push({x:east+2.1,y:top,z:z+4.5},{x:east+2.1,y:mid,z},
        {x:east+2.1,y:mid,z:z-1.25},{x:east-2.1,y:mid,z:z-1.25},
        {x:east-2.1,y:mid,z},{x:east-2.1,y:bottom,z:z+4.5},{x:east-2.1,y:bottom,z:z+6.5});
      if (bottom===3.4) path.push({x:east+2.1,y:bottom,z:z+6.5});
    }
    for (const radius of [.38,.65]) { walk(path,radius); walk([...path].reverse(),radius); }
  });

  it('blocks private flats and parapets without projecting ground columns into corridors', () => {
    for (const level of HDB_GALLERY_LEVELS) {
      const y=base+level;
      expect(movement.canOccupy(x,y,z,.65,1.8)).toBe(false);
      expect(movement.canOccupy(x,y,z+5.8,.65,1.8)).toBe(true);
      expect(movement.canOccupy(x,y,z+8.4,.38,1.8)).toBe(false);
      const moved=movement.move({x,y,z:z+6.5,velocityY:0},0,5,1);
      expect(moved.z).toBeLessThan(z+8.4);
      expect(moved.y).toBe(y);
    }
  });
});

it('has short, sheltered flights with mesh support and standing headroom', () => {
  const structure = world.scene.getObjectByName('Connected elevated places')!;
  for (const place of QUEENSTOWN_HOUSING_PLACES) for (const stair of place.connections) {
    expect(Math.hypot(stair.to.x-stair.from.x,stair.to.z-stair.from.z)).toBeLessThan(5);
    const p=new THREE.Vector3((stair.from.x+stair.to.x)/2,(stair.from.y+stair.to.y)/2,(stair.from.z+stair.to.z)/2);
    const floor=new THREE.Raycaster(p.clone().add(new THREE.Vector3(0,.3,0)),new THREE.Vector3(0,-1,0),0,.6).intersectObject(structure,true)[0];
    expect(floor,stair.id).toBeDefined();
    expect(Math.abs(floor.point.y-p.y)).toBeLessThan(.16);
    const roof=new THREE.Raycaster(p.clone().add(new THREE.Vector3(0,1.8,0)),new THREE.Vector3(0,1,0),0,4).intersectObject(structure,true)[0];
    expect(roof,stair.id).toBeDefined();
    expect(roof.distance).toBeGreaterThan(.1);
  }
});

it('uses the actual modern-tower ground footprint and preserves the high podium overhang', () => {
  expect(movement.canOccupy(-195.5,queenstownTerrainHeight(-195.5,-72),-72,.65,1.8)).toBe(true);
  expect(movement.canOccupy(-195.5,queenstownTerrainHeight(-195.5,-72)+5,-72,.65,1.8)).toBe(false);
  expect(movement.canOccupy(-210,queenstownTerrainHeight(-210,-75),-75,.65,1.8)).toBe(false);
});

it('routes bots from the void-deck stair entrance to the second residential corridor', () => {
  const navigator=createVerticalNavigator(input),block=QUEENSTOWN_HDB_BLOCKS[0];
  const from={x:block.x-HDB_CORE_OFFSET-2.1,y:queenstownTerrainHeight(block.x,block.z),z:block.z+6.5},to={x:block.x,y:queenstownTerrainHeight(block.x,block.z)+6.2,z:block.z+6.5};
  const route=navigator.route(from,to);
  expect(route.length).toBeGreaterThan(3);
  walk([from,...route].map(p=>({...p,y:p.y-queenstownTerrainHeight(p.x,p.z)})),.4);
  const back=navigator.route(to,from);
  expect(back.length).toBeGreaterThan(3);
  walk([to,...back].map(p=>({...p,y:p.y-queenstownTerrainHeight(p.x,p.z)})),.4);
},30000);
