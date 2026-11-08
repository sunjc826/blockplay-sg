import * as THREE from 'three';
import { MERLION, merlionMouth, merlionDirection, type MerlionState } from './merlion-gameplay';

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
  const mist=mesh(new THREE.CylinderGeometry(MERLION.mistRadius,0,MERLION.mistRange,32,1,true),new THREE.MeshBasicMaterial({color:0x9fe9f5,transparent:true,opacity:.09,depthWrite:false,side:THREE.DoubleSide}));
  mist.name='merlion-mist-cone';
  const mistCount=384, mistGeo=new THREE.BufferGeometry(),mistPositions=new Float32Array(mistCount*3),mistSizes=new Float32Array(mistCount);
  mistGeo.setAttribute('position',new THREE.BufferAttribute(mistPositions,3));mistGeo.setAttribute('size',new THREE.BufferAttribute(mistSizes,1));geometries.push(mistGeo);
  const mistMat=new THREE.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{opacity:{value:1}},
    vertexShader:`attribute float size; void main(){vec4 mv=modelViewMatrix*vec4(position,1.0);gl_Position=projectionMatrix*mv;gl_PointSize=clamp(size*650.0/max(0.1,-mv.z),1.0,180.0);}`,
    fragmentShader:`uniform float opacity; void main(){float r=length(gl_PointCoord-0.5)*2.0;float a=(1.0-smoothstep(0.0,1.0,r))*0.23*opacity;if(a<0.005)discard;gl_FragColor=vec4(0.79,0.94,1.0,a);}`});materials.push(mistMat);
  const fog=new THREE.Points(mistGeo,mistMat);fog.name='merlion-mist-cloud';fog.frustumCulled=false;root.add(fog);
  const rim=mesh(new THREE.TorusGeometry(MERLION.mistRadius,.035,4,64),new THREE.MeshBasicMaterial({color:0xb5f5ff,transparent:true,opacity:.55,depthWrite:false}));rim.name='merlion-mist-edge';
  const impact=mesh(new THREE.SphereGeometry(.2,12,8),new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.95,depthWrite:false}));impact.name='merlion-impact';impact.renderOrder=2;
  const impactRing=mesh(new THREE.TorusGeometry(.65,.055,6,32),new THREE.MeshBasicMaterial({color:0x80e8ff,transparent:true,opacity:.9,depthWrite:false}));impactRing.name='merlion-impact-ring';impactRing.renderOrder=2;
  const splash=new THREE.InstancedMesh(dropsGeo,dropsMat,48);splash.name='merlion-impact-splash';splash.frustumCulled=false;root.add(splash);
  for(const effect of [mist,fog,rim,impact,impactRing,splash]){effect.userData.fpsEffect=true;effect.raycast=()=>{};}
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
  const tmp=new THREE.Object3D(),from=new THREE.Vector3(),to=new THREE.Vector3(),direction=new THREE.Vector3(),side=new THREE.Vector3(),up=new THREE.Vector3(),axis=new THREE.Vector3(0,1,0),forward=new THREE.Vector3(0,0,1);
  let time=0;
  function update(s:MerlionState|undefined,dt:number){
    time+=dt;root.visible=!!s;
    if(!s)return;
    const sculpture=scene.getObjectByName('merlion-statue');
    if(sculpture){sculpture.rotation.y=s.yaw+Math.PI/2;sculpture.updateMatrixWorld(true);const fountain=sculpture.getObjectByName('merlion-fountain');if(fountain)fountain.visible=!s.firing&&!s.mist;}
    core.visible=spray.visible=drops.visible=s.firing;
    cache.scale.y=s.packs?1:.5;
    from.copy(merlionMouth(s.yaw));direction.copy(merlionDirection(s.yaw,s.pitch));
    side.crossVectors(direction,axis).normalize();up.crossVectors(side,direction).normalize();
    mist.visible=fog.visible=rim.visible=s.mist>0;
    if(s.mist>0){
      const fade=Math.min(1,s.mist/.5);
      mist.position.copy(from).addScaledVector(direction,MERLION.mistRange/2);mist.quaternion.setFromUnitVectors(axis,direction);
      (mist.material as THREE.MeshBasicMaterial).opacity=.09*fade;mistMat.uniforms.opacity.value=fade;
      rim.position.copy(from).addScaledVector(direction,MERLION.mistRange);rim.quaternion.setFromUnitVectors(forward,direction);
      (rim.material as THREE.MeshBasicMaterial).opacity=.55*fade;
      for(let i=0;i<mistCount;i++){
        const t=(i/mistCount+time*.32)%1,angle=i*2.39996+time*.2,r=MERLION.mistRadius*t*Math.sqrt(((i*37)%(mistCount-1))/(mistCount-1));
        tmp.position.copy(from).addScaledVector(direction,t*MERLION.mistRange).addScaledVector(side,Math.cos(angle)*r).addScaledVector(up,Math.sin(angle)*r);
        tmp.position.toArray(mistPositions,i*3);mistSizes[i]=(.3+2.5*t)*Math.min(1,t*10,(1-t)*10);
      }
      mistGeo.attributes.position.needsUpdate=true;mistGeo.attributes.size.needsUpdate=true;
    }
    impact.visible=impactRing.visible=!!s.operator;
    to.copy(s.end);direction.subVectors(to,from);const length=direction.length();direction.normalize();
    splash.visible=s.firing&&length<MERLION.range-.1;
    // Pull the contact marker just off the surface so it cannot disappear inside the wall/ground.
    impact.position.copy(to).addScaledVector(direction,-.12);impactRing.position.copy(impact.position);
    impactRing.quaternion.setFromUnitVectors(forward,direction);
    impact.scale.setScalar(s.firing?1.2: .6);impactRing.scale.setScalar(s.firing?1+.12*Math.sin(time*18):.65);
    if(!s.firing)return;
    for(const v of [core,spray]){v.position.copy(from).add(to).multiplyScalar(.5);v.quaternion.setFromUnitVectors(axis,direction);v.scale.y=length;}
    side.crossVectors(direction,axis).normalize();up.crossVectors(side,direction).normalize();
    for(let i=0;i<48;i++){
      const t=(i/48+time*2.2)%1,angle=i*2.39996,r=t*(.6+(i%7)*.17);
      tmp.position.copy(impact.position).addScaledVector(direction,-t*(.5+(i%5)*.2)).addScaledVector(side,Math.cos(angle)*r).addScaledVector(up,Math.sin(angle)*r);
      tmp.position.y-=t*t*.65;tmp.scale.setScalar((1-t)*(.05+(i%4)*.025));tmp.updateMatrix();splash.setMatrixAt(i,tmp.matrix);
    }
    splash.instanceMatrix.needsUpdate=true;
    for(let i=0;i<160;i++){
      const t=(i/160+time*2.7)%1,angle=i*2.39996+time*3,r=(.08+.7*t)*(.35+.65*((i*37)%101)/101);
      tmp.position.copy(from).addScaledVector(direction,t*length).addScaledVector(side,Math.cos(angle)*r).addScaledVector(up,Math.sin(angle)*r);
      tmp.scale.setScalar(.025+((i*13)%19)/300);tmp.updateMatrix();drops.setMatrixAt(i,tmp.matrix);
    }
    drops.instanceMatrix.needsUpdate=true;
  }
  root.visible=false;
  return {update,dispose(){root.removeFromParent();drops.dispose();splash.dispose();geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());}};
}
