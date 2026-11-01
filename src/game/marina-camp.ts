import * as THREE from 'three';
import { MARINA_CAMP_DECKS, MARINA_CAMP_COVER, MARINA_CAMP_TENT } from './marina-water';

/** Low floating campsite; three open landings and separated cover retain flanking routes. */
export function buildMarinaCamp() {
  const root=new THREE.Group();root.name='Bay campsite · three landings';
  const geometry=new THREE.BoxGeometry(1,1,1);
  const materials=['#87705a','#3b5350','#cab995','#526d55','#b5b7a2','#d1ab4e'].map(color=>new THREE.MeshStandardMaterial({color,roughness:.85}));
  const [wood,float,sand,canvas,metal,gold]=materials;
  const box=(x:number,y:number,z:number,w:number,h:number,d:number,material:THREE.Material,name='')=>{
    const m=new THREE.Mesh(geometry,material);m.name=name;m.position.set(x,y,z);m.scale.set(w,h,d);m.castShadow=m.receiveShadow=true;root.add(m);return m;
  };
  for(const deck of MARINA_CAMP_DECKS){
    const x=(deck.minX+deck.maxX)/2,z=(deck.minZ+deck.maxZ)/2,w=deck.maxX-deck.minX,d=deck.maxZ-deck.minZ;
    box(x,-.12,z,w,.24,d,wood,deck.id);
    box(x,-.43,z,w-.3,.32,d-.3,float);
    for(let offset=-d/2+.7;offset<d/2;offset+=.7)box(x,.004,z+offset,w-.08,.008,.018,float);
    // Bollards identify the mooring edge without closing a landing approach.
    for(const side of [-1,1])box(x+side*(w/2-.35),.18,z,.18,.36,.18,metal);
  }
  for(const c of MARINA_CAMP_COVER){
    const x=(c.minX+c.maxX)/2,z=(c.minZ+c.maxZ)/2,w=c.maxX-c.minX,d=c.maxZ-c.minZ;
    box(x,c.maxY/2,z,w,c.maxY,d,sand,'Camp cover');
    for(let row=0;row<3;row++)box(x,c.maxY*(row+.5)/3,z,w+.04,.03,d+.04,wood);
  }
  const t=MARINA_CAMP_TENT;
  box(0,(t.minY+t.maxY)/2,-12.5,6,t.maxY-t.minY,5,canvas,'Camp shelter roof');
  for(const x of [-2.85,2.85])for(const z of [-14.85,-10.15])box(x,1.05,z,.12,2.1,.12,metal);
  // Low bedrolls, benches and a contained lantern make this read as a campsite.
  for(const x of [-1.4,1.4]){box(x,.12,-13.2,1,.24,2,canvas);box(x,.28,-13.9,.7,.12,.4,sand);}
  box(0,.3,-11,1.2,.6,.65,wood);box(0,.73,-11,.16,.26,.16,gold);
  // Landing stripes are visible from the water, with different approach colours.
  box(0,.015,2.6,4,.03,.35,gold);box(0,.015,-26.6,4,.03,.35,canvas);box(16.6,.015,-12,.35,.03,4,sand);
  // Planks and repeated campsite props share six draws rather than one per plank.
  const batches=new Map<THREE.Material,THREE.Mesh[]>(),instances:THREE.InstancedMesh[]=[];
  for(const child of [...root.children]){
    if(!(child instanceof THREE.Mesh)||child.name==='Camp shelter roof')continue;
    const material=child.material as THREE.Material,row=batches.get(material)??[];row.push(child);batches.set(material,row);
  }
  for(const [material,parts] of batches){
    const mesh=new THREE.InstancedMesh(geometry,material,parts.length);mesh.castShadow=mesh.receiveShadow=true;
    parts.forEach((part,i)=>{part.updateMatrix();mesh.setMatrixAt(i,part.matrix);root.remove(part);});
    mesh.computeBoundingSphere();root.add(mesh);instances.push(mesh);
  }
  return {root,dispose(){root.removeFromParent();instances.forEach(m=>m.dispose());geometry.dispose();materials.forEach(m=>m.dispose());}};
}
