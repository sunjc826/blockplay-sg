import { afterAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildHarbourfrontScene, HARBOURFRONT_BOUNDS } from './harbourfront-scene';
import { buildSentosaScene, SENTOSA_BOUNDS } from './sentosa-scene';
import { HARBOURFRONT_CONTOUR_PATH, harbourfrontGroundHeight, sentosaGroundHeight, SENTOSA_FORT_GROUND } from './harbourfront-sentosa-ground';
import { createVerticalMovement } from './vertical-movement';
import { getWalkSurfaces, getTraversalObstacles } from './vertical-routes';
import { sceneFlightObstacles } from './flight-obstacles';
import { canFly } from './vehicle-rules';

const harbour = buildHarbourfrontScene(), sentosa = buildSentosaScene();
harbour.scene.updateMatrixWorld(true); sentosa.scene.updateMatrixWorld(true);
afterAll(() => { harbour.dispose(); sentosa.dispose(); });

describe('distinct coastal ground', () => {
  it('keeps quays, shores, displayed roads and bridge approaches at their existing ground datum', () => {
    for (const [x,z] of [[20,134],[109,165],[60,108],[-185,-20],[-230,-85],[130,30]]) expect(harbourfrontGroundHeight(x,z)).toBe(0);
    for (const [x,z] of [[108,-192],[-90,75],[-187,-60],[-90,20],[-101,20],[-86,20],[-150,-45]]) expect(sentosaGroundHeight(x,z)).toBe(0);
    expect(harbourfrontGroundHeight(-185,-85)).toBe(22);
    expect(sentosaGroundHeight(-90,-48)).toBe(12.2);
    expect(sentosaGroundHeight(0,192)).toBeCloseTo(.33);
  });

  it('uses the same triangles for connected shoulders and movement, including the level ridge rest pad', () => {
    for (const [world, name, height, samples] of [
      [harbour,'harbourfront',harbourfrontGroundHeight,[[-210,-60],[-163,-90],[-207,-84],[-185,-85]]],
      [sentosa,'sentosa',sentosaGroundHeight,[[-130,-45],[-119,-68],[-56,-45]]],
    ] as const) {
      const mesh = world.scene.getObjectByName(`${name} connected coastal hillside`)!;
      for (const [x,z] of samples) {
        const expected=height(x,z), ray=new THREE.Raycaster(new THREE.Vector3(x,expected+.25,z),new THREE.Vector3(0,-1,0),0,.5);
        expect(ray.intersectObject(mesh)[0]?.point.y,`${name}: ${x},${z}`).toBeCloseTo(expected,5);
      }
    }
    for(const x of [-210,-207,-204]) for(const z of [-87,-84,-81]) expect(harbourfrontGroundHeight(x,z)).toBeCloseTo(12.1);
  });

  it('has one surface owner beneath fort terraces and the ridge stair, with no coplanar shoulder fill', () => {
    const terrain=sentosa.scene.getObjectByName('sentosa connected coastal hillside')!;
    for(const f of SENTOSA_FORT_GROUND.floors) {
      const ray=new THREE.Raycaster(new THREE.Vector3(f.x,f.y+.2,f.z+.23),new THREE.Vector3(0,-1,0),0,.3);
      expect(ray.intersectObject(terrain)).toHaveLength(0);
      const tops=ray.intersectObject(sentosa.scene,true).filter(h=>h.face!.normal.y>.99 && h.point.y>=f.y-1e-5);
      expect(tops, f.id).toHaveLength(1);
      expect(tops[0].point.y).toBeCloseTo(f.y);
    }
    const x=-185,z=-61.37,y=harbourfrontGroundHeight(x,z);
    const ray=new THREE.Raycaster(new THREE.Vector3(x,y+.3,z),new THREE.Vector3(0,-1,0),0,.4);
    expect(ray.intersectObject(harbour.scene.getObjectByName('harbourfront connected coastal hillside')!)).toHaveLength(0);
    const top=ray.intersectObject(harbour.scene,true).find(h=>h.face!.normal.y>.99)!;
    expect(top.point.y-y).toBeGreaterThanOrEqual(-1e-5);
    expect(top.point.y-y).toBeLessThanOrEqual(.15);
  });

  it('walks both the direct ridge stair and the contour route in both directions', () => {
    const movement=createVerticalMovement({bounds:HARBOURFRONT_BOUNDS,obstacles:harbour.obstacles,surfaces:getWalkSurfaces(harbour.scene),traversalObstacles:getTraversalObstacles(harbour.scene)});
    const paths=[[{x:-185,z:-30},{x:-185,z:-80},{x:-185,z:-96}],HARBOURFRONT_CONTOUR_PATH];
    for(const radius of [.38,.65]) for(const points of paths) for(const route of [points,[...points].reverse()]) {
      let state={...route[0],y:harbourfrontGroundHeight(route[0].x,route[0].z),velocityY:0};
      for(const target of route.slice(1)) {
        const next=movement.move(state,target.x-state.x,target.z-state.z,0,radius,1.8);
        expect(Math.hypot(next.x-target.x,next.z-target.z),JSON.stringify({state,target,radius})).toBeLessThan(.05);
        expect(next.y).toBeCloseTo(harbourfrontGroundHeight(target.x,target.z));
        state=next;
      }
    }
  });

  it('keeps airspace above shoulders open and trail seats solid at their real terrace height', () => {
    const flight=sceneFlightObstacles(sentosa.scene);
    expect(canFly(-90,4.2,20,flight,SENTOSA_BOUNDS)).toBe(true);
    const x=-90,z=-16,y=sentosaGroundHeight(x,z);
    expect(canFly(x,y+.2,z,flight,SENTOSA_BOUNDS)).toBe(true);
    expect(canFly(x,y-.2,z,flight,SENTOSA_BOUNDS)).toBe(false);
    const movement=createVerticalMovement({bounds:SENTOSA_BOUNDS,obstacles:sentosa.obstacles,surfaces:getWalkSurfaces(sentosa.scene),traversalObstacles:getTraversalObstacles(sentosa.scene)});
    for(const [x,z,y] of [[-111,-7,4],[-110,-25,8],[-99,-49,12.2]]) {
      expect(movement.canOccupy(x,y,z,.38,1.8)).toBe(false);
      expect(movement.canOccupy(x,y,z+1.5,.38,1.8)).toBe(true);
    }
  });
});
