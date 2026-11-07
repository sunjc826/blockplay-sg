import * as THREE from 'three';
import type { StructureDefinition } from './structure-types';
import { STRUCTURE_PROP_SIZE } from './structure-layout';

/** Reusable physical furnishings. Props block rendered sight and bullets;
 * the caller owns appearance, resource disposal and any associated objective. */
export function createStructurePropsVisuals(scene: THREE.Scene, site: StructureDefinition, accent: THREE.Material,
  resources: (THREE.BufferGeometry|THREE.Material)[]) {
  const root=new THREE.Group();root.name=`${site.name} / field camp`;root.userData.structureId=site.id;root.userData.structureRole='props';
  root.position.set(site.x,site.y,site.z);
  const unit=new THREE.BoxGeometry(1,1,1);resources.push(unit);
  const material=(color:string)=>{const m=new THREE.MeshStandardMaterial({color,roughness:.9});resources.push(m);return m;};
  const canvas=material('#687457'),sand=material('#b8aa80'),frame=material('#3e4944'),wood=material('#75664c');
  const batches=new Map<THREE.Material,THREE.Matrix4[]>();
  const position=new THREE.Vector3(),scale=new THREE.Vector3(),rotation=new THREE.Quaternion();
  const box=(w:number,h:number,d:number,x:number,y:number,z:number,m:THREE.Material,rx=0,ry=0)=>{
    const matrices=batches.get(m)??[];
    matrices.push(new THREE.Matrix4().compose(position.set(x,y,z),rotation.setFromEuler(new THREE.Euler(rx,ry,0)),scale.set(w,h,d)));
    batches.set(m,matrices);
  };
  for(const p of site.props??[]) {
    const x=p.x-site.x,y=p.y-site.y,z=p.z-site.z,s=STRUCTURE_PROP_SIZE[p.kind];
    if(p.kind==='canopy'||p.kind==='shelter') {
      const eave=2.5,rise=p.kind==='canopy'?.65:.3;
      for(const side of [-1,1]) {
        const depth=s.d/2,angle=Math.atan2(rise,depth);
        box(s.w,.09,Math.hypot(depth,rise),x,y+eave+rise/2,z+side*depth/2,canvas,side*angle);
        box(.08,.1,s.d,x+side*(s.w/2-.12),y+eave-.05,z,frame);
      }
      for(const dx of [-s.w/2+.12,s.w/2-.12])for(const dz of [-s.d/2+.12,s.d/2-.12])
        box(.14,eave,.14,x+dx,y+eave/2,z+dz,frame);
      box(s.w,.08,.1,x,y+eave+rise,z,frame);
      if(p.kind==='shelter') {
        // Cot and bedroll stay against the back edge; the aisle remains open.
        box(2,.12,.7,x,y+.45,z-.9,frame);box(1.9,.13,.68,x,y+.55,z-.9,canvas);
        for(const dx of [-.85,.85])box(.1,.45,.6,x+dx,y+.225,z-.9,frame);
      }
    } else if(p.kind==='stores') {
      box(s.w,.6,s.d,x,y+.3,z,wood);
      for(const dx of [-.7,.7])box(1.15,.55,1.55,x+dx,y+.9,z,canvas);
      for(const dx of [-.85,.85])box(.1,s.h,s.d+.03,x+dx,y+s.h/2,z,frame);
      box(.55,.07,.65,x,y+1.22,z,accent);
    } else {
      // Offset rows of sandbags give cover a readable rounded silhouette.
      for(let row=0;row<3;row++)for(let i=0;i<5;i++) {
        const along=(i-2)*.78+(row%2?.12:0),side=row===1?.08:0;
        const dx=Math.cos(p.yaw)*along+Math.sin(p.yaw)*side,dz=-Math.sin(p.yaw)*along+Math.cos(p.yaw)*side;
        box(.79,.34,.9,x+dx,y+.18+row*.34,z+dz,sand,0,p.yaw);
      }
    }
  }
  // A raised flag identifies the camp from a distance; the shared accent follows
  // ownership, suppression and equipment damage without rebuilding the camp.
  if(site.flag) {
    box(.08,4.5,.08,0,2.25,-1.9,frame);
    box(1.15,.62,.025,.55,4,-1.9,accent);
    box(.08,.08,.9,0,3.2,-1.9,frame);
    box(1.6,.035,1.1,0,.025,2,sand);
  }
  for(const [m,matrices] of batches) {
    const mesh=new THREE.InstancedMesh(unit,m,matrices.length);
    matrices.forEach((matrix,i)=>mesh.setMatrixAt(i,matrix));
    mesh.instanceMatrix.needsUpdate=true;mesh.castShadow=true;mesh.receiveShadow=true;
    mesh.computeBoundingSphere();root.add(mesh);
  }
  scene.add(root);return root;
}
