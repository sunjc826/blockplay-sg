import * as THREE from 'three';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { buildQueenstownScene } from './queenstown-scene';
import { QUEENSTOWN_BANKS, QUEENSTOWN_LANDSCAPE_PLACES } from './queenstown-landscape';
import { QUEENSTOWN_BOUNDS } from './queenstown-collision';
import { createVerticalMovement } from './vertical-movement';
import { getTraversalObstacles, getWalkSurfaces } from './vertical-routes';
import { createSceneCover } from './scene-cover';
import { accelerateInstancedRaycasts } from './instanced-raycast';
import { analyseSceneCover } from './scene-cover-metrics';

let world: ReturnType<typeof buildQueenstownScene>, movement: ReturnType<typeof createVerticalMovement>;
beforeAll(() => {
  world = buildQueenstownScene(); accelerateInstancedRaycasts(world.scene);
  movement = createVerticalMovement({bounds:QUEENSTOWN_BOUNDS,obstacles:world.obstacles,surfaces:getWalkSurfaces(world.scene),traversalObstacles:getTraversalObstacles(world.scene)});
});
afterAll(() => world.dispose());

it.each(QUEENSTOWN_BANKS)('$id is solid earth, interrupts low fire and supports ascent and descent', bank => {
  const cover = createSceneCover(world.scene);
  // Two perpendicular long rays pass through each bank before the next landmark.
  for (const axis of ['x','z'] as const) {
    const length = axis === 'x' ? bank.width : bank.depth;
    const from: {x:number;y:number;z:number} = {x:bank.x,y:1.15,z:bank.z}; from[axis] -= length/2+2;
    const direction = {x:axis==='x'?1:0,y:0,z:axis==='z'?1:0};
    for (const eye of [.55,1.15,1.75].filter(y=>y<bank.height)) {
      expect(cover.distance({...from,y:eye},direction,length+4),`eye ${eye}`).toBeLessThan(length/2+2);
    }
    const place = QUEENSTOWN_LANDSCAPE_PLACES.find(p=>p.id===`queenstown-${bank.id}-terrain`)!;
    for (const connection of place.connections.filter(c=>c.id.startsWith(`slope-${axis}`))) {
      for (const radius of [.38,.65]) {
        let state = {...connection.from,velocityY:0};
        expect(movement.canOccupy(state.x,state.y,state.z,radius),`${bank.id} entrance`).toBe(true);
        for (const to of [connection.to,connection.from]) {
          const moved = movement.move(state,to.x-state.x,to.z-state.z,0,radius);
          expect(Math.hypot(moved.x-to.x,moved.y-to.y,moved.z-to.z),`${bank.id}/${connection.id}`).toBeLessThan(.05);
          state=moved;
        }
      }
    }
  }
});

it('shrubbery conceals a low silhouette while bullets pass; standing eyes clear it', () => {
  const cover = createSceneCover(world.scene), from = {x:-196,y:1.15,z:-108.5}, direction={x:0,y:0,z:1};
  expect(cover.sightDistance(from,direction,10)).toBeLessThan(10);
  expect(cover.distance(from,direction,10)).toBe(10);
  expect(cover.sightDistance({...from,y:1.75},direction,10)).toBe(10);
  // Thermal replaces materials. Classification must survive that render-only change.
  const replacement=new THREE.MeshBasicMaterial(), originals=new Map<THREE.Mesh,THREE.Material|THREE.Material[]>();
  world.scene.traverse(node=>{if(node instanceof THREE.Mesh&&node.userData.visualCover){originals.set(node,node.material);node.material=replacement;}});
  try {
    expect(originals.size).toBeGreaterThan(0);
    expect(cover.distance(from,direction,10)).toBe(10);
    expect(cover.sightDistance(from,direction,10)).toBeLessThan(10);
  } finally { originals.forEach((material,mesh)=>{mesh.material=material;});replacement.dispose(); }
});

it('keeps the cover tail bounded and visual cover at least as accessible as solid cover', () => {
  const analysis = analyseSceneCover(world.scene,QUEENSTOWN_BOUNDS,world.obstacles);
  const report = analysis.measure();
  expect(report.crouch.solid!.mean).toBeLessThan(13);
  expect(report.crouch.solid!.p90).toBeLessThan(25);
  expect(report.prone.visual!.mean).toBeLessThan(11.5);
  for (const posture of ['stand','crouch','prone'] as const) {
    expect(report[posture].visual!.samples).toBe(report[posture].solid!.samples);
    expect(report[posture].visual!.mean).toBeLessThanOrEqual(report[posture].solid!.mean);
  }
},30000);
