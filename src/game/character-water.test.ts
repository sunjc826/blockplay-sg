import * as THREE from 'three';
import {describe,it,expect} from 'vitest';
import {createCharacterRig,type CharacterDrive,type CharacterRig} from './character-rig';
import {arenaCharacterLook} from './character-looks';
const position=(o:THREE.Object3D)=>o.getWorldPosition(new THREE.Vector3());
const soldier=()=>createCharacterRig(arenaCharacterLook({bot:true,role:'rifle',id:'water-test'}),'water-test',{skinned:true});
function step(rig:CharacterRig,drive:CharacterDrive,seconds:number){for(let t=0;t<seconds;t+=1/60){rig.update(1/60,drive);rig.root.updateMatrixWorld(true);}}
const browDistance=(rig:CharacterRig)=>position(rig.joints.handL).distanceTo(position(rig.joints.head));

describe('water reactions',()=>{
  it.each([{}, {crouch:1}, {prone:true}])('shields the eyes, keeps the right grip and recovers in stance %j',stance=>{
    const rig=soldier();try{
      step(rig,{...stance,aim:1},1);
      const grips=rig.weapon!.children.filter(c=>!(c instanceof THREE.Mesh)&&c!==rig.muzzle);
      step(rig,{...stance,water:'cannon',aim:0},.6);
      expect(browDistance(rig)).toBeLessThan(.34);
      expect(position(rig.joints.handR).distanceTo(position(grips[0]))).toBeLessThan(.04);
      const head=rig.joints.head.quaternion.clone();step(rig,{...stance,water:'cannon',aim:0},.15);
      expect(head.angleTo(rig.joints.head.quaternion)).toBeGreaterThan(.05);
      step(rig,{...stance,aim:1},.8);
      expect(position(rig.joints.handL).distanceTo(position(grips[1]))).toBeLessThan(.03);
    }finally{rig.dispose();}
  });
  it('makes mist wipes intermittent while cannon shielding is sustained',()=>{
    const rig=soldier();try{
      for(const water of ['mist','cannon'] as const){
        step(rig,{water},.6);let near=0,away=0;
        for(let i=0;i<120;i++){step(rig,{water},1/60);if(browDistance(rig)<.34)near++;else away++;}
        expect(near).toBeGreaterThan(20);
        if(water==='mist')expect(away).toBeGreaterThan(20);else expect(away).toBe(0);
      }
    }finally{rig.dispose();}
  });
  it('preserves the walking gait and gives swimming, driving, healing, rolls and death priority',()=>{
    const rig=soldier(),normal=soldier();try{
      step(rig,{water:'cannon',velocity:{x:0,z:-2}},1);step(normal,{velocity:{x:0,z:-2}},1);
      for(const side of ['L','R'] as const)expect(position(rig.joints[`foot${side}`]).distanceTo(position(normal.joints[`foot${side}`]))).toBeLessThan(.001);
      for(const drive of [{swimming:true},{seated:true,driving:true},{healing:.4},{bailoutAge:.4}] as CharacterDrive[]){
        step(rig,{...drive,water:'cannon'},.8);step(normal,drive,.8);
        expect(position(rig.joints.handL).distanceTo(position(normal.joints.handL))).toBeLessThan(.03);
      }
      rig.setDown(true);normal.setDown(true);step(rig,{water:'cannon'},1);step(normal,{},1);
      expect(position(rig.joints.handL).distanceTo(position(normal.joints.handL))).toBeLessThan(.03);
      rig.setDown(false);step(rig,{},.8);expect(browDistance(rig)).toBeGreaterThan(.34);
    }finally{rig.dispose();normal.dispose();}
  });
});
