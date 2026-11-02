import {describe,it,expect} from 'vitest';
import {BOAT_BERTHS,boatAutopilot,boatLegClear,planBoatRoute} from './dragon-boat-autopilot';
import {createVehicle,paddleVehicle,vehicleBounds} from './vehicle-rules';
import {canPaddle,DRAGON_BOAT_SPAWNS} from './marina-water';

describe('dragon boat water navigation',()=>{
  it.each(['dragon-boat-red','dragon-boat-gold'] as const)('sails %s from its narrow jetty to an island berth and reverses back into a shore berth',(kind)=>{
    let v=createVehicle(kind);
    const run=(island:boolean)=>{
      const route=planBoatRoute(v,BOAT_BERTHS.filter(b=>b.island===island));expect(route).not.toBeNull();
      let index=0;
      for(let i=0;i<7000&&index<route!.points.length;i++){
        const control=boatAutopilot(v,route!.points[index]);
        if(control.arrived){index++;continue;}
        v=paddleVehicle(v,control.input.forward,control.input.steer,control.input.brake,.05,3).state;
        expect(canPaddle(v.x,v.z,v.yaw)).toBe(true);
      }
      expect(index,JSON.stringify({v,route,index})).toBe(route!.points.length);
      expect(Math.hypot(v.x-route!.berth.pose.x,v.z-route!.berth.pose.z)).toBeLessThan(.5);
      return route!;
    };
    run(true);const home=run(false);expect(home.points.at(-1)?.reverse).toBe(true);
  });
  it('finds another landing when a parked hull blocks the preferred island berth',()=>{
    const v=createVehicle('dragon-boat-red'),parked={...v,x:0,z:2};
    const route=planBoatRoute(v,BOAT_BERTHS.filter(b=>b.island),[vehicleBounds(parked)]);
    expect(route).not.toBeNull();expect(route!.berth.id).not.toBe('island-south');
    let from={x:v.x,z:v.z};
    for(const point of route!.points){expect(boatLegClear(from,point,point.yaw,[vehicleBounds(parked)])).toBe(true);from=point;}
  });
  it('refuses blocked goals and never treats a line across the island as open water',()=>{
    expect(boatLegClear({x:0,z:2},{x:0,z:-26},0)).toBe(false);
    const block={minX:-48,maxX:48,minZ:-54,maxZ:30};
    expect(planBoatRoute({...DRAGON_BOAT_SPAWNS['dragon-boat-red']},BOAT_BERTHS,[block])).toBeNull();
  });
  it('brakes before turns and docking, and never commands a boat weapon',()=>{
    const v=createVehicle('dragon-boat-red'),point={x:v.x,z:v.z-10,yaw:0,reverse:false};
    expect(boatAutopilot(v,point).input).toMatchObject({forward:1,fire:false});
    expect(boatAutopilot({...v,yaw:1},point).input).toMatchObject({forward:0,brake:true});
    expect(boatAutopilot({...v,speed:4},{...point,z:v.z-.6}).input.brake).toBe(true);
  });
});
