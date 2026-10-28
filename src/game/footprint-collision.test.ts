import { describe, expect, it } from 'vitest';
import { arenaWallDistance, createArena } from './arena-rules';
import { shootAndLand } from './arena-test-shots';
import { createRegionMovement, overlapsObstacleRect } from './region-collision';
import { canFly, createVehicle, driveVehicle } from './vehicle-rules';
import { clearVehicleSpawn } from './world-vehicles';
import type { WalkSurface } from './vertical-routes';

const bounds = { minX: -40, maxX: 40, minZ: -40, maxZ: 40 };
const triangle = [{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 0, z: 10 }];
const solid = { minX: 0, maxX: 10, minZ: 0, maxZ: 10, minY: 0, maxY: 8, footprint: triangle };

describe('authored convex collision across gameplay systems', () => {
  it('keeps vehicle half-extents separate when testing a footprint', () => {
    expect(overlapsObstacleRect(solid,8,8,1.25,2.35)).toBe(false);
    expect(overlapsObstacleRect(solid,8,8,4,3)).toBe(true);
    expect(overlapsObstacleRect(solid,3,3,1.25,2.35)).toBe(true);
  });

  it('drives and spawns in empty bounding-box corners, but stops at real terrain', () => {
    const car = { ...createVehicle('car'), x: 8, z: 8, yaw: 0, speed: 4 };
    const moved = driveVehicle(car,1,0,false,.05,[solid],bounds);
    expect(moved.blocked).toBe(false);
    expect(moved.state.z).toBeLessThan(car.z);
    expect(clearVehicleSpawn('car',car,[solid],[],bounds)).toBe(true);
    const blocked = driveVehicle({ ...car,x:3,z:3 },1,0,false,.05,[solid],bounds);
    expect(blocked.blocked).toBe(true);
    expect(canFly(8,1,8,[solid],bounds)).toBe(true);
    expect(canFly(3,1,3,[solid],bounds)).toBe(false);
  });

  it('clips host sight/shot rays to either footprint winding and to vertical limits', () => {
    for (const footprint of [triangle,[...triangle].reverse()]) {
      const obstacle = { ...solid,footprint };
      expect(arenaWallDistance({x:8,y:10,z:8},{x:0,y:-1,z:0},[obstacle])).toBe(Infinity);
      expect(arenaWallDistance({x:10,y:2,z:8},{x:-1,y:0,z:0},[obstacle])).toBeCloseTo(8);
      expect(arenaWallDistance({x:10,y:9,z:8},{x:-1,y:0,z:0},[obstacle])).toBe(Infinity);
      expect(arenaWallDistance({x:1,y:10,z:1},{x:0,y:-1,z:0},[obstacle])).toBe(2);
      expect(arenaWallDistance({x:1,y:2,z:1},{x:1,y:0,z:0},[obstacle])).toBe(0);
    }
  });

  it('allows authoritative rounds past terrain cutaways while its real earth still shields actors', () => {
    // The edge x + z = 10 cuts the square bounding box diagonally.
    // A shot from x=8 to x=12 stays outside it at z=8, and crosses earth at z=0.
    for (const z of [8,0]) for (const slope of [false,true]) {
      const surface: WalkSurface = { ...solid,id:'hill',routeId:'hill',axis:'x',startHeight:slope?4:8,endHeight:8,solidBelow:true };
      const terrain = { bounds,obstacles:[],surfaces:[surface],traversalObstacles:[] };
      const arena = createArena([],0,'mixed',{
        bounds,move:createRegionMovement(bounds).move,spawns:[{x:12,z},{x:8,z}],
      },undefined,terrain);
      arena.addPlayer('one','One'); arena.addPlayer('two','Two');
      const [a,b]=arena.snapshot().actors;
      const length=Math.hypot(b.x-a.x,b.y-.6-a.y,b.z-a.z);
      const hit=shootAndLand(arena,a.id,a,{x:(b.x-a.x)/length,y:(b.y-.6-a.y)/length,z:(b.z-a.z)/length},a.weapon);
      expect(hit.hitId,`z=${z}, slope=${slope}`).toBe(z===8?'two':null);
    }
  });
});
