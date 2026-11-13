import { expect, it } from 'vitest';
import { boatWakeCoverage, boatWaveFade, createBoatWake, type WaterBoat } from './boat-wake';
import type { WaterImpulse } from './water-wave-state';

const boat = (pose: Partial<WaterBoat> = {}): WaterBoat => ({id:'red',x:0,z:0,yaw:0,speed:4,active:true,revision:0,wakeBlend:0,...pose});
const run = (fps: number, speed=4) => {
  const trail=createBoatWake(),events:(WaterImpulse & {at:number})[]=[];
  trail.update(boat({speed}),1/fps,()=>{});
  for(let i=1;i<=fps*2;i++)trail.update(boat({speed,z:-speed*i/fps}),1/fps,(p,delay)=>events.push({...p,at:i/fps+delay}));
  return events;
};

it('places bow, stern and turbulence stamps at the same positions and times across render rates',()=>{
  const reference=run(60);expect(reference.length).toBeGreaterThan(80);
  for(const fps of [30,144]){
    const events=run(fps);expect(events).toHaveLength(reference.length);
    events.forEach((p,i)=>{for(const key of ['x','z','radius','height','at'] as const)expect(p[key]).toBeCloseTo(reference[i][key],7);});
  }
  const [left,right,stern,turbulence]=reference;
  expect(left.x).toBe(-right.x);expect(left.z).toBe(right.z);expect(left.height).toBeGreaterThan(0);
  expect(stern.z).toBeGreaterThan(left.z+7);expect(stern.height).toBeLessThan(0);
  expect(turbulence.z).toBeGreaterThan(stern.z);
});

it('scales by actual movement and speed, remaining silent when docked or turning in place',()=>{
  expect(Math.max(...run(60,1).map(p=>Math.abs(p.height)))).toBeLessThan(Math.max(...run(60,4).map(p=>Math.abs(p.height)))*.2);
  const trail=createBoatWake(),events:WaterImpulse[]=[];
  for(let i=0;i<120;i++)trail.update(boat({yaw:i/60}),1/60,p=>events.push(p));
  expect(events).toHaveLength(0);
});

it('reverses bow and stern in reverse gear and leaves old stamps in world space on turns',()=>{
  const reverse=run(60,-1.6);
  expect(reverse[0].z).toBeGreaterThan(reverse[2].z);
  const trail=createBoatWake(),events:WaterImpulse[]=[];
  trail.update(boat({yaw:Math.PI-.01}),.1,()=>{});
  trail.update(boat({z:.4,yaw:-Math.PI+.01}),.1,p=>events.push(p));
  expect(events).toHaveLength(4);expect(events[0].z).toBeGreaterThan(3);
  const old=structuredClone(events);
  trail.update(boat({x:-.4,z:.4,yaw:Math.PI/2}),.1,p=>events.push(p));
  expect(events.slice(0,4)).toEqual(old);
});

it('resets without drawing a line after respawn, pause, teleport, despawn or invalid data',()=>{
  for(const pose of [boat({z:30}),boat({z:-.4,revision:1}),boat({z:-.4,active:false}),boat({x:NaN})]){
    const trail=createBoatWake(),events:WaterImpulse[]=[];
    trail.update(boat(),.1,()=>{});trail.update(pose,.1,p=>events.push(p));expect(events).toHaveLength(0);
  }
  const trail=createBoatWake(),events:WaterImpulse[]=[];
  trail.update(boat(),.1,()=>{});trail.update(boat({z:-.4}),0,p=>events.push(p));
  trail.update(boat({z:-1}),1,p=>events.push(p));expect(events).toHaveLength(0);
  trail.reset();trail.update(boat({z:-1.4}),.1,p=>events.push(p));expect(events).toHaveLength(0);
});

it('bounds long-frame work and smoothly fades at the local simulation boundary',()=>{
  const trail=createBoatWake(),events:WaterImpulse[]=[];
  trail.update(boat(),.1,()=>{});trail.update(boat({z:-3,speed:6}),.5,p=>events.push(p));
  expect(events.length).toBeLessThanOrEqual(32);
  const origin={x:-16,y:-16};expect(boatWakeCoverage(boat(),origin)).toBe(1);
  expect(boatWakeCoverage(boat({x:15}),origin)).toBe(0);
  expect(boatWaveFade(13,0,origin)).toBeGreaterThan(boatWaveFade(14,0,origin));
  expect(boatWaveFade(14,0,origin)).toBeGreaterThan(0);expect(boatWaveFade(15,0,origin)).toBe(0);
});
