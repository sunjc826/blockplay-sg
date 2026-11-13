import { expect, it } from 'vitest';
import { WATER_WAVES, createSwimmerWake, waterWaveOrigin, waterWaveSteps, type WaterImpulse } from './water-wave-state';

it('keeps wave propagation stable and frame-rate independent, bounding long frames', () => {
  expect(WATER_WAVES.speed*WATER_WAVES.step/(WATER_WAVES.span/WATER_WAVES.size)).toBeLessThan(1/Math.sqrt(2));
  for (const fps of [30,60,144]) {
    let remainder=0,total=0;
    for(let i=0;i<fps*2;i++){const schedule=waterWaveSteps(1/fps,remainder);total+=schedule.steps;remainder=schedule.remainder;}
    expect(total).toBe(120); expect(remainder).toBeLessThan(1e-7);
  }
  expect(waterWaveSteps(.3,0).steps).toBe(WATER_WAVES.maxSteps);
  expect(waterWaveSteps(0,0).steps).toBe(0);
  for(const gap of [1,-1,NaN,Infinity]) expect(waterWaveSteps(gap,0).reset).toBe(true);
});

it('scrolls in whole texels, retaining the same sample positions in world space', () => {
  const a=waterWaveOrigin(-3.4,6.1),b=waterWaveOrigin(-2.8,6.9);
  expect(a).not.toEqual(b);
  const texel=WATER_WAVES.span/WATER_WAVES.size;
  for(const axis of ['x','z'] as const)expect(Number.isInteger((b[axis]-a[axis])/texel)).toBe(true);
  expect(waterWaveOrigin(0,.1)).toEqual(waterWaveOrigin(.4,.8));
});

it('spaces swimmer disturbances by distance instead of rendering frequency', () => {
  const run=(fps:number)=>{
    const wake=createSwimmerWake(),events:WaterImpulse[]=[];
    wake.update({x:0,z:0,active:true},1/fps,e=>events.push(e));
    for(let frame=1;frame<=fps*3;frame++)wake.update({x:frame/fps*1.25,z:0,active:true},1/fps,e=>events.push(e));
    return events;
  };
  const a=run(30),b=run(144);expect(a.length).toBeGreaterThan(30);expect(a).toHaveLength(b.length);
  a.forEach((p,i)=>{expect(p.x).toBeCloseTo(b[i].x,8);expect(p.z).toBeCloseTo(b[i].z,8);expect(p.height).toBe(b[i].height);});
});

it('does not draw wake lines for dry motion, teleportation or a pause', () => {
  const wake=createSwimmerWake(),events:WaterImpulse[]=[];const emit=(e:WaterImpulse)=>events.push(e);
  wake.update({x:0,z:0,active:false},.1,emit);expect(events).toHaveLength(0);
  wake.update({x:0,z:0,active:true},.1,emit);expect(events).toHaveLength(1);
  wake.update({x:50,z:0,active:true},.1,emit);expect(events).toHaveLength(1);
  wake.update({x:50,z:0,active:false},0,emit);
  wake.update({x:50,z:0,active:true},.1,emit);expect(events).toHaveLength(1);
  for(let i=0;i<15;i++)wake.update({x:50,z:0,active:true},.1,emit);
  expect(events).toHaveLength(2);expect(Math.abs(events[1].height)).toBeLessThan(Math.abs(events[0].height));
  wake.update({x:50,z:0,active:false},.1,emit);wake.update({x:50,z:0,active:true},.1,emit);
  expect(events).toHaveLength(3);
});
