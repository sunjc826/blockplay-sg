import { describe, expect, it } from 'vitest';
import { createVerticalMovement, type VerticalState } from './vertical-movement';
import { advanceGroundMotion, createMovementMotion, INFANTRY_GRAVITY, INFANTRY_JUMP_SPEED } from './fps-movement';
import { createProfile, resolveLoadout } from './armory-state';
import { equipmentMovement } from './fps-encumbrance';
import { campPropBounds, createCommandCamp, facilityObstacles } from './command-camp';
import { rangeResupplyObstacle } from './range-resupply';
import type { Obstacle } from './region-collision';

const bounds = { minX:-40, maxX:40, minZ:-40, maxZ:40 };
const crate: Obstacle = { minX:0, maxX:5, minZ:-2, maxZ:2, minY:0, maxY:1.25, supportsTop:true };
const movement = (obstacles: Obstacle[]) => createVerticalMovement({ bounds, obstacles, surfaces:[], traversalObstacles:[] });

describe('jumping onto solid cover', () => {
  it.each([30,60,144])('mounts cover with the heaviest movement penalty at %i fps, stays there and drops off', fps => {
    const base = resolveLoadout(createProfile());
    const kit = { ...base, mobility:0, armorWeightKg:100, suppliesWeightKg:1000,
      weapons:base.weapons.map(w=>({...w,mobility:.25})) };
    const burden = equipmentMovement(kit,0);
    const move = movement([crate]), motion = createMovementMotion();
    const start = { x:-1.2, y:0, z:0, velocityY:0 };
    expect(move.move(start,4,0,1).x).toBeLessThan(0);
    let state: VerticalState = { ...start, velocityY:INFANTRY_JUMP_SPEED*burden.jumpVelocity };
    // A running approach, then release the movement input over the crate.
    motion.x = 3;
    for(let i=0;i<fps*3;i++) {
      const onGround = state.velocityY<=0 && Math.abs(state.y-(move.supportHeight(state.x,state.z,state.y+.02)??-100))<.025;
      const delta = advanceGroundMotion(motion,state.x<1?3:0,0,onGround,burden.movement,'stand',false,1/fps);
      state = move.move(state,delta.x,delta.z,1/fps,.38,1.8,[],INFANTRY_GRAVITY);
    }
    expect(state.x).toBeGreaterThan(1); expect(state.x).toBeLessThan(5);
    expect(state.y).toBe(1.25); expect(state.velocityY).toBe(0);
    expect(move.move(state,0,0,1).grounded).toBe(true);
    expect(move.move(state,8,0,2).y).toBe(0);
  });

  it('requires an authored, finite, dry top and real headroom', () => {
    for(const obstacle of [{...crate,supportsTop:false},{...crate,maxY:Infinity},{...crate,water:true}])
      expect(movement([obstacle]).supportHeight(2,0,3)).toBeNull();
    const ceiling = { minX:-2,maxX:6,minZ:-3,maxZ:3,minY:2.4,maxY:2.6 };
    expect(movement([crate,ceiling]).supportHeight(2,0,3)).toBeNull();
    for(const extra of [false,true]) {
      const move = movement(extra?[]:[ceiling]);
      const hit = move.move({x:-1,y:0,z:0,velocityY:INFANTRY_JUMP_SPEED},0,0,.2,.38,1.8,extra?[ceiling]:[],INFANTRY_GRAVITY);
      expect(hit.y).toBeLessThanOrEqual(.6+1e-5); expect(hit.velocityY).toBeLessThanOrEqual(0);
    }
  });

  it('uses the rotated resupply lid footprint at terrain height', () => {
    const prop = rangeResupplyObstacle({x:4,z:3,yaw:Math.PI/4},2);
    const move = movement([prop]);
    expect(move.supportHeight(4,3,3)).toBeCloseTo(2.86);
    expect(move.supportHeight(prop.maxX-.02,prop.maxZ-.02,3,.01)).toBe(0);
    expect(move.move({x:4,y:4,z:3,velocityY:-2},0,0,1).y).toBeCloseTo(2.86);
  });

  it('walks slowly off cover without falling into its side or losing standing clearance', () => {
    const move = movement([crate]);
    let state: VerticalState = {x:4.8,y:1.25,z:0,velocityY:0};
    for(let i=0;i<150;i++) {
      state = move.move(state,.02,0,1/60,.38,1.8,[],INFANTRY_GRAVITY);
      expect(move.canOccupy(state.x,state.y,state.z)).toBe(true);
    }
    expect(state.x).toBeCloseTo(7.8); expect(state.y).toBe(0);
  });

  it('provides actual open-world camp cover tops, keeping shelter roofs decorative', () => {
    const camp = createCommandCamp({x:0,y:0,z:0},()=>true);
    const props = facilityObstacles({x:0,y:0,z:0,id:'camp',name:'Camp',kind:'command',initialOwner:'mercenaries',deployment:{x:0,z:0,yaw:0},camp});
    const move = movement(props);
    for(const prop of camp.props) {
      const b = campPropBounds(prop);
      if(prop.kind==='stores'||prop.kind==='barricade') {
        expect(move.supportHeight(prop.x,prop.z,b.maxY!+.01)).toBe(b.maxY);
        expect(move.move({x:prop.x,y:b.maxY!+1,z:prop.z,velocityY:-1},0,0,1).y).toBe(b.maxY);
      } else expect(b.supportsTop).toBe(false);
    }
  });
});
