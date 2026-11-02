import * as THREE from 'three';
import type { RegionWorld } from './regions';
import { getWalkSurfaces, getTraversalObstacles } from './vertical-routes';
import { liftSample, type BuildingLift } from './building-lifts';

/** Lift geometry and its endpoint floors share one authored definition. */
export function withBuildingLifts<T extends RegionWorld>(world:T,lifts:readonly BuildingLift[]):T {
  const root=new THREE.Group();root.name='MBS express lifts';
  const geometry=new THREE.BoxGeometry(1,1,1),materials=new Map<string,THREE.MeshStandardMaterial>();
  const surfaces=[...getWalkSurfaces(world.scene)],obstacles=[...getTraversalObstacles(world.scene)];
  const cars:{lift:BuildingLift;car:THREE.Group;doors:{mesh:THREE.Mesh;y:number;side:number}[]}[]=[];
  const labels:THREE.CanvasTexture[]=[];
  const batches:THREE.InstancedMesh[]=[];
  const box=(parent:THREE.Object3D,x:number,y:number,z:number,w:number,h:number,d:number,color:string,solid=false)=>{
    if(!materials.has(color))materials.set(color,new THREE.MeshStandardMaterial({color,roughness:.65,metalness:.15}));
    const m=new THREE.Mesh(geometry,materials.get(color));m.position.set(x,y,z);m.scale.set(w,h,d);m.castShadow=m.receiveShadow=true;parent.add(m);
    if(solid)obstacles.push({minX:x-w/2,maxX:x+w/2,minZ:z-d/2,maxZ:z+d/2,minY:y-h/2,maxY:y+h/2});return m;
  };
  for(const lift of lifts){
    const {x,z,width:w,depth:d,bottom,top}=lift,h=top+3.3;
    const group=new THREE.Group();group.name=lift.id;root.add(group);
    for(const side of [-1,1])box(group,x+side*(w/2+.14),h/2,z,.28,h,d+.4,'#d2c7ad',true);
    box(group,x,h/2,z+d/2+.14,w,h,.28,'#c0b69f',true);
    // Intermediate storeys are enclosed; both public landings have doors.
    box(group,x,(top+3.2)/2,z-d/2,w,top-3.2,.25,'#c0b69f',true);
    const doors:{mesh:THREE.Mesh;y:number;side:number}[]=[];
    for(const y of [bottom,top]){
      surfaces.push({id:`${lift.id}/${y===bottom?'lobby':'skypark'}`,routeId:lift.id,minX:x-w/2,maxX:x+w/2,minZ:z-d/2,maxZ:z+d/2,axis:'x',startHeight:y,endHeight:y});
      box(group,x,y+3.1,y===bottom?z-d/2:z,w,.3,y===bottom?.3:d,'#d2c7ad',true);
      box(group,x,y+.025,z-d/2-.45,w+.5,.05,.9,'#b6a06b');
      for(const side of [-1,1])doors.push({mesh:box(group,x+side*w/4,y+1.35,z-d/2-.04,w/2,2.7,.12,'#697e82'),y,side});
      box(group,x,y+2.9,z-d/2-.1,w,.24,.12,'#253d45');
      // Canvas labels are optional in headless geometry tests.
      if(typeof document!=='undefined'){
        const canvas=document.createElement('canvas');canvas.width=512;canvas.height=80;const ctx=canvas.getContext('2d');
        if(ctx){ctx.fillStyle='#243b43';ctx.fillRect(0,0,512,80);ctx.fillStyle='#f5e5b6';ctx.font='bold 27px sans-serif';ctx.textAlign='center';ctx.fillText(y===bottom?'SKYPARK  ↑  EXPRESS':'LOBBY  ↓  EXPRESS',256,34);ctx.font='18px sans-serif';ctx.fillText('AUTO SHUTTLE · STEP INSIDE',256,63);
          const tex=new THREE.CanvasTexture(canvas);tex.colorSpace=THREE.SRGBColorSpace;labels.push(tex);const mat=new THREE.MeshBasicMaterial({map:tex});const sign=new THREE.Mesh(new THREE.PlaneGeometry(w,.65),mat);sign.position.set(x,y+3.7,z-d/2-.17);sign.rotation.y=Math.PI;group.add(sign);}
      }
    }
    const car=new THREE.Group();car.position.set(x,bottom,z);car.name='Express lift cabin';group.add(car);
    box(car,0,-.12,0,w-.12,.24,d-.12,'#bda982');
    box(car,0,2.8,0,w-.12,.14,d-.12,'#e2d9bf');
    box(car,0,1.4,d/2-.18,w-.3,2.8,.08,'#728487');
    for(const side of [-1,1]){box(car,side*(w/2-.16),1.4,0,.08,2.8,d-.3,'#728487');box(car,side*(w/2-.22),1.05,0,.06,.07,d-.5,'#c2ad79');}
    box(car,0,2.68,0,2,.04,1,'#fff0c9');cars.push({lift,car,doors});
    const movingDoors=new Set(doors.map(d=>d.mesh));
    for(const parent of [group,car]) {
      const byMaterial=new Map<THREE.Material,THREE.Mesh[]>();
      for(const child of parent.children)if(child instanceof THREE.Mesh&&child.geometry===geometry&&!movingDoors.has(child)){
        const material=child.material as THREE.Material,list=byMaterial.get(material)??[];list.push(child);byMaterial.set(material,list);
      }
      for(const [material,meshes] of byMaterial)if(meshes.length>1){
        const batch=new THREE.InstancedMesh(geometry,material,meshes.length);batch.castShadow=batch.receiveShadow=true;
        meshes.forEach((mesh,i)=>{mesh.updateMatrix();batch.setMatrixAt(i,mesh.matrix);parent.remove(mesh);});
        batch.computeBoundingBox();batch.computeBoundingSphere();parent.add(batch);batches.push(batch);
      }
    }
  }
  world.scene.add(root);world.scene.userData.buildingLifts=lifts;world.scene.userData.walkSurfaces=surfaces;world.scene.userData.traversalObstacles=obstacles;
  const animate=world.animate,dispose=world.dispose;
  world.animate=(time:number)=>{animate(time);for(const {lift,car,doors} of cars){const s=liftSample(lift,time);car.position.y=s.y;for(const door of doors){const open=s.open&&Math.abs(s.y-door.y)<.1;door.mesh.position.x=lift.x+door.side*(open?lift.width*.74:lift.width/4);}}};
  let disposed=false;world.dispose=()=>{if(disposed)return;disposed=true;root.traverse(o=>{if(o instanceof THREE.Mesh&&o.geometry!==geometry){o.geometry.dispose();(o.material as THREE.Material).dispose();}});root.removeFromParent();batches.forEach(b=>b.dispose());geometry.dispose();materials.forEach(m=>m.dispose());labels.forEach(t=>t.dispose());dispose();};
  world.animate(0);return world;
}
