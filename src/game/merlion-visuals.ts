import * as THREE from 'three';
import { MERLION, merlionMouth, type MerlionState } from './merlion-gameplay';

/** Pooled water geometry; every client draws the host's clipped stream. */
export function createMerlionVisuals(scene: THREE.Scene) {
  if(!scene.getObjectByName('merlion-statue'))return {update(_s:MerlionState|undefined,_dt:number){},dispose(){}};
  const root=new THREE.Group();root.name='merlion-gameplay';scene.add(root);
  const geometries: THREE.BufferGeometry[]=[],materials: THREE.Material[]=[];
  function mesh(g:THREE.BufferGeometry,m:THREE.Material){geometries.push(g);materials.push(m);const v=new THREE.Mesh(g,m);root.add(v);return v;}
  const water=new THREE.MeshBasicMaterial({color:0xe1fbff,transparent:true,opacity:.85,depthWrite:false});
  const core=mesh(new THREE.CylinderGeometry(.23,.08,1,10,1,true),water);core.userData.fpsEffect=true;core.raycast=()=>{};
  const spray=mesh(new THREE.CylinderGeometry(.9,.15,1,12,1,true),new THREE.MeshBasicMaterial({color:0xc3efff,transparent:true,opacity:.2,depthWrite:false,side:THREE.DoubleSide}));spray.userData.fpsEffect=true;spray.raycast=()=>{};
  const dropsGeo=new THREE.SphereGeometry(1,5,3);geometries.push(dropsGeo);
  const dropsMat=new THREE.MeshBasicMaterial({color:0xe8fbff,transparent:true,opacity:.68,depthWrite:false});materials.push(dropsMat);
  const drops=new THREE.InstancedMesh(dropsGeo,dropsMat,160);drops.userData.fpsEffect=true;drops.raycast=()=>{};drops.frustumCulled=false;root.add(drops);
  const mist=mesh(new THREE.SphereGeometry(1,20,12),new THREE.MeshBasicMaterial({color:0xd5f2f5,transparent:true,opacity:.18,depthWrite:false,side:THREE.DoubleSide}));mist.position.set(0,2.3,MERLION.z);mist.userData.fpsEffect=true;mist.raycast=()=>{};
  const station=new THREE.Group();station.name='merlion-controls';root.add(station);
  const metal=new THREE.MeshStandardMaterial({color:0x224b58,roughness:.6});materials.push(metal);
  const brass=new THREE.MeshStandardMaterial({color:0xdbb468,roughness:.4});materials.push(brass);
  function box(w:number,h:number,d:number,x:number,y:number,z:number,m:THREE.Material){const g=new THREE.BoxGeometry(w,h,d);geometries.push(g);const b=new THREE.Mesh(g,m);b.position.set(x,y,z);station.add(b);return b;}
  box(.65,.9,.45,MERLION.console.x,.45,MERLION.console.z,metal);
  const panel=box(.76,.12,.6,0,.96,MERLION.console.z,brass);panel.rotation.x=.25;
  const wheelG=new THREE.TorusGeometry(.2,.035,6,20);geometries.push(wheelG);const wheel=new THREE.Mesh(wheelG,brass);wheel.position.set(0,1.1,MERLION.console.z+.07);wheel.rotation.x=-.45;station.add(wheel);
  const cache=box(.95,.52,.65,MERLION.cache.x,.26,MERLION.cache.z,metal);cache.name='merlion-supply-cache';
  box(.14,.03,.62,MERLION.cache.x,.54,MERLION.cache.z,brass);box(.92,.03,.14,MERLION.cache.x,.54,MERLION.cache.z,brass);
  // Controls and cache are small props; movement uses the existing authored platform obstacles.
  const tmp=new THREE.Object3D(),from=new THREE.Vector3(),to=new THREE.Vector3(),direction=new THREE.Vector3(),side=new THREE.Vector3(),up=new THREE.Vector3(),axis=new THREE.Vector3(0,1,0);
  let time=0;
  function update(s:MerlionState|undefined,dt:number){
    time+=dt;root.visible=!!s;
    if(!s)return;
    const sculpture=scene.getObjectByName('merlion-statue');
    if(sculpture){sculpture.rotation.y=s.yaw+Math.PI/2;sculpture.updateMatrixWorld(true);const fountain=sculpture.getObjectByName('merlion-fountain');if(fountain)fountain.visible=!s.firing&&!s.mist;}
    core.visible=spray.visible=drops.visible=s.firing;
    mist.visible=s.mist>0;mist.scale.setScalar(MERLION.mistRadius*(.96+.04*Math.sin(time*2)));(mist.material as THREE.MeshBasicMaterial).opacity=.22*Math.min(1,s.mist/.5);
    cache.scale.y=s.packs?1:.5;
    if(!s.firing)return;
    from.copy(merlionMouth(s.yaw));to.copy(s.end);direction.subVectors(to,from);const length=direction.length();direction.normalize();
    for(const v of [core,spray]){v.position.copy(from).add(to).multiplyScalar(.5);v.quaternion.setFromUnitVectors(axis,direction);v.scale.y=length;}
    side.crossVectors(direction,axis).normalize();up.crossVectors(side,direction).normalize();
    for(let i=0;i<160;i++){
      const t=(i/160+time*2.7)%1,angle=i*2.39996+time*3,r=(.08+.7*t)*(.35+.65*((i*37)%101)/101);
      tmp.position.copy(from).addScaledVector(direction,t*length).addScaledVector(side,Math.cos(angle)*r).addScaledVector(up,Math.sin(angle)*r);
      tmp.scale.setScalar(.025+((i*13)%19)/300);tmp.updateMatrix();drops.setMatrixAt(i,tmp.matrix);
    }
    drops.instanceMatrix.needsUpdate=true;
  }
  root.visible=false;
  return {update,dispose(){root.removeFromParent();drops.dispose();geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());}};
}
