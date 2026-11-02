import * as THREE from 'three';
import { MARINA_CAMP_DECKS, MARINA_CAMP_COVER, MARINA_ISLET, MARINA_SWIM_EXITS } from './marina-water';

/** Compact Merlion islet, with boat landings and visible swimming ladders. */
export function buildMarinaCamp() {
  const root=new THREE.Group();root.name='Merlion islet · three landings';
  const geometry=new THREE.BoxGeometry(1,1,1);
  const materials=['#87705a','#3b5350','#cab995','#526d55','#b5b7a2','#d1ab4e'].map(color=>new THREE.MeshStandardMaterial({color,roughness:.85}));
  const [wood,float,sand,,metal,gold]=materials;
  const roundGeometries:THREE.BufferGeometry[]=[];
  const box=(x:number,y:number,z:number,w:number,h:number,d:number,material:THREE.Material,name='')=>{
    const m=new THREE.Mesh(geometry,material);m.name=name;m.position.set(x,y,z);m.scale.set(w,h,d);m.castShadow=m.receiveShadow=true;root.add(m);return m;
  };
  for(const deck of MARINA_CAMP_DECKS){
    const x=(deck.minX+deck.maxX)/2,z=(deck.minZ+deck.maxZ)/2,w=deck.maxX-deck.minX,d=deck.maxZ-deck.minZ;
    if(deck.id==='camp'){
      const radius=MARINA_ISLET.radius/Math.cos(Math.PI/8);
      for(const [y,h,material] of [[-.12,.24,wood],[-.43,.32,float]] as const){
        const g=new THREE.CylinderGeometry(radius,radius,h,8);g.rotateY(Math.PI/8);
        const m=new THREE.Mesh(g,material);m.position.set(x,y,z);m.castShadow=m.receiveShadow=true;root.add(m);roundGeometries.push(g);
      }
    }else{box(x,-.12,z,w,.24,d,wood,deck.id);box(x,-.43,z,w-.3,.32,d-.3,float);}
    for(let offset=-d/2+.7;offset<d/2;offset+=.7){
      const half=deck.id==='camp'?Math.min(6,6+6*(Math.SQRT2-1)-Math.abs(offset)):w/2;
      box(x,.004,z+offset,half*2-.08,.008,.018,float);
    }
    // Bollards identify the mooring edge without closing a landing approach.
    for(const side of [-1,1])box(x+side*(w/2-.35),.18,z,.18,.36,.18,metal);
  }
  for(const c of MARINA_CAMP_COVER.slice(1)){
    const x=(c.minX+c.maxX)/2,z=(c.minZ+c.maxZ)/2,w=c.maxX-c.minX,d=c.maxZ-c.minZ;
    box(x,c.maxY/2,z,w,c.maxY,d,sand,'Camp cover');
    for(let row=0;row<3;row++)box(x,c.maxY*(row+.5)/3,z,w+.04,.03,d+.04,wood);
  }
  // Ladder rails descend into the water; the matching exit zones gate climbing.
  for(const p of MARINA_SWIM_EXITS){
    for(const side of [-1,1])box(p.x-p.dz*side*.48,.12,p.z+p.dx*side*.48,.08,1.2,.08,metal);
    for(const y of [-.38,-.1,.18])box(p.x,y,p.z,p.dz?1.05:.08,.07,p.dx?1.05:.08,gold);
    box(p.x-p.dx*.35,.015,p.z-p.dz*.35,p.dz?1.3:.4,.03,p.dx?1.3:.4,gold);
  }
  // Planks and repeated campsite props share six draws rather than one per plank.
  const batches=new Map<THREE.Material,THREE.Mesh[]>(),instances:THREE.InstancedMesh[]=[];
  for(const child of [...root.children]){
    if(!(child instanceof THREE.Mesh)||child.geometry!==geometry)continue;
    const material=child.material as THREE.Material,row=batches.get(material)??[];row.push(child);batches.set(material,row);
  }
  for(const [material,parts] of batches){
    const mesh=new THREE.InstancedMesh(geometry,material,parts.length);mesh.castShadow=mesh.receiveShadow=true;
    parts.forEach((part,i)=>{part.updateMatrix();mesh.setMatrixAt(i,part.matrix);root.remove(part);});
    mesh.computeBoundingSphere();root.add(mesh);instances.push(mesh);
  }
  return {root,dispose(){root.removeFromParent();instances.forEach(m=>m.dispose());geometry.dispose();roundGeometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());}};
}
