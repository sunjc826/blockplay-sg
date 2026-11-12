import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { getRegion } from './regions';
import { createRainReceivers } from './rain-receivers';
import { createRainSurface, createRainEffects } from './rain-effects';
import type { VehicleRainHit } from './vehicle-rain';

describe('Marina rain contacts',()=>{
  it('lands on real water, decks and thin rails rather than the invisible swimming barrier',()=>{
    const world=getRegion('marina-bay').build();
    try{
      (world.scene.getObjectByName('marina-bay-water') as THREE.Mesh<THREE.BufferGeometry,THREE.ShaderMaterial>).material.uniforms.uChop.value=0;
      const receivers=createRainReceivers(world.scene),ground=world.scene.userData.rainGroundHeight;
      const columns=createRainSurface(world.obstacles,(x,z)=>receivers.water(x,z)??ground(x,z));
      const hit=(x:number,z:number)=>receivers.sample(x,z,{height:columns(x,z),normal:new THREE.Vector3(0,1,0),kind:'water'} as VehicleRainHit);
      expect(columns(-30,-20)).toBeCloseTo(-.24,5);
      expect(hit(0,-8).height).toBeCloseTo(0,5); // islet deck
      expect(hit(-20.5,24).height).toBeCloseTo(0,5); // jetty
      expect(hit(-10,30.36).height).toBeCloseTo(.7,5); // module rail top: 1.16 authored x 0.6, snapped to 0.1 m
      expect(hit(-10,30.36).kind).toBe('rail');
      expect(hit(-10,30.5).height).toBeLessThan(.03); // gap beside rail, not a wide invisible roof
      expect(hit(-20.5,30.36).kind).not.toBe('rail'); // open jetty gate
      expect(receivers.water(81,-66)).toBeCloseTo(.114,5); // circular garden pond
      expect(receivers.water(94,-53)).toBeNull(); // outside circle but inside its bounds
    }finally{world.dispose();}
  },30000);
  it('suppresses ground-style white rings over water and keeps rail spray compact',()=>{
    const effects=createRainEffects(new THREE.Scene(),()=>-.24,(_x,_z,hit)=>{hit.kind='water';return hit;});
    for(let i=0;i<120;i++)effects.update(1/60,new THREE.Vector3(0,1.7,0),1,0,false,'ultra');
    expect(effects.counts.splashes).toBe(0);effects.dispose();
    const rail=createRainEffects(new THREE.Scene(),()=>.67,(_x,_z,hit)=>{hit.kind='rail';return hit;});
    for(let i=0;i<120;i++)rail.update(1/60,new THREE.Vector3(0,1.7,0),1,0,false);
    expect(rail.counts.splashes).toBeGreaterThan(0);
    expect(rail.splashes.geometry.drawRange.count).toBe(rail.counts.splashes*8);
    const p=rail.splashes.geometry.attributes.position;
    for(let i=0;i<rail.splashes.geometry.drawRange.count;i++)expect(p.getY(i)).toBeLessThan(.72);
    rail.dispose();
  });
});
