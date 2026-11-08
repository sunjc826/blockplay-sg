import * as THREE from 'three';
import {describe,it,expect} from 'vitest';
import {createMerlionVisuals} from './merlion-visuals';
import {createMerlionController,inMerlionMist,MERLION,merlionMouth,merlionDirection} from './merlion-gameplay';

function fixture(){
  const scene=new THREE.Scene(),statue=new THREE.Group();statue.name='merlion-statue';scene.add(statue);
  const visuals=createMerlionVisuals(scene),state=createMerlionController((_o,_d,r)=>r).state;
  return {scene,visuals,state};
}
describe('Merlion effect geometry',()=>{
  it('keeps the rendered mist inside the authoritative cone as the head rotates and pitches',()=>{
    const {scene,visuals,state}=fixture();
    try{
      for(const yaw of [-Math.PI,0,.7])for(const pitch of [MERLION.minPitch,MERLION.maxPitch]){
        Object.assign(state,{yaw,pitch,mist:3});visuals.update(state,.15);scene.updateMatrixWorld(true);
        const cloud=scene.getObjectByName('merlion-mist-cloud') as THREE.Points;
        const positions=cloud.geometry.getAttribute('position');
        for(let i=0;i<positions.count;i++)expect(inMerlionMist(state,new THREE.Vector3().fromBufferAttribute(positions,i))).toBe(true);
        const cone=scene.getObjectByName('merlion-mist-cone')!;
        expect(cone.localToWorld(new THREE.Vector3(0,-MERLION.mistRange/2,0)).distanceTo(new THREE.Vector3().copy(merlionMouth(yaw)))).toBeLessThan(1e-6);
      }
      state.mist=0;visuals.update(state,.1);
      for(const name of ['merlion-mist-cloud','merlion-mist-cone','merlion-mist-edge'])expect(scene.getObjectByName(name)?.visible).toBe(false);
    }finally{visuals.dispose();}
  });
  it('marks the clipped endpoint and only splashes on contact, not at maximum range in the air',()=>{
    const {scene,visuals,state}=fixture();
    try{
      Object.assign(state,{operator:'p',firing:true,pitch:0});
      const origin=new THREE.Vector3().copy(merlionMouth(state.yaw)),d=new THREE.Vector3().copy(merlionDirection(state.yaw,0));
      for(const range of [5,MERLION.range]){
        state.end=origin.clone().addScaledVector(d,range);visuals.update(state,.1);
        const marker=scene.getObjectByName('merlion-impact')!;
        expect(marker.visible).toBe(true);expect(marker.position.distanceTo(new THREE.Vector3().copy(state.end))).toBeCloseTo(.12);
        expect(scene.getObjectByName('merlion-impact-splash')?.visible).toBe(range<MERLION.range);
      }
      state.operator=null;state.firing=false;visuals.update(state,.1);
      expect(scene.getObjectByName('merlion-impact')?.visible).toBe(false);
      expect(scene.getObjectByName('merlion-impact-splash')?.visible).toBe(false);
    }finally{visuals.dispose();}
    expect(scene.getObjectByName('merlion-gameplay')).toBeUndefined();
  });
});
