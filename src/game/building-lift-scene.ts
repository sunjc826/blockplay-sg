import * as THREE from 'three';
import type { RegionWorld } from './regions';
import { getWalkSurfaces, getTraversalObstacles } from './vertical-routes';
import { liftSample, liftLandingStatus, type BuildingLift } from './building-lifts';

/** Lift geometry and its endpoint floors share one authored definition. */
export function withBuildingLifts<T extends RegionWorld>(world:T,lifts:readonly BuildingLift[]):T {
  const root=new THREE.Group();root.name='MBS express lifts';
  const geometry=new THREE.BoxGeometry(1,1,1),materials=new Map<string,THREE.MeshStandardMaterial>();
  const surfaces=[...getWalkSurfaces(world.scene)],obstacles=[...getTraversalObstacles(world.scene)];
  const cars:{lift:BuildingLift;car:THREE.Group;doors:{mesh:THREE.Object3D;y:number;side:number}[]}[]=[];
  const labels:THREE.CanvasTexture[]=[];
  const indicators:{lift:BuildingLift;y:number;lamp:THREE.MeshStandardMaterial;paint?:(text:string)=>void;last?:string}[]=[];
  const glassColor='#9bcbd2';

  const batches:THREE.InstancedMesh[]=[];
  const box=(parent:THREE.Object3D,x:number,y:number,z:number,w:number,h:number,d:number,color:string,solid=false)=>{
    if(!materials.has(color)){
      const mat=new THREE.MeshStandardMaterial({color,roughness:color===glassColor?.12:.65,metalness:.15,
        ...(color===glassColor?{transparent:true,opacity:.18,depthWrite:false,side:THREE.DoubleSide}:{})});
      if(color===glassColor)mat.userData.bulletGlass=true;
      materials.set(color,mat);
    }
    const m=new THREE.Mesh(geometry,materials.get(color));m.position.set(x,y,z);m.scale.set(w,h,d);m.castShadow=color!==glassColor;m.receiveShadow=true;parent.add(m);
    if(solid)obstacles.push({minX:x-w/2,maxX:x+w/2,minZ:z-d/2,maxZ:z+d/2,minY:y-h/2,maxY:y+h/2});return m;
  };
  for(const lift of lifts){
    const {x,z,width:w,depth:d,bottom,top}=lift,h=top+3.3;
    const group=new THREE.Group();group.name=lift.id;root.add(group);
    for(const side of [-1,1])box(group,x+side*(w/2+.14),h/2,z,.28,h,d+.4,glassColor,true);
    box(group,x,h/2,z+d/2+.14,w,h,.28,glassColor,true);
    for(const side of [-1,1])for(const end of [-1,1])box(group,x+side*(w/2+.14),h/2,z+end*(d/2+.14),.22,h,.22,'#697e82');
    // Glazed shaft still has full physical guards; steel corner posts stop rounds.
    box(group,x,(top+3.2)/2,z-d/2,w,top-3.2,.25,glassColor,true);
    const doors:{mesh:THREE.Object3D;y:number;side:number}[]=[];
    for(const y of [bottom,top]){
      surfaces.push({id:`${lift.id}/${y===bottom?'lobby':'skypark'}`,routeId:lift.id,minX:x-w/2,maxX:x+w/2,minZ:z-d/2,maxZ:z+d/2,axis:'x',startHeight:y,endHeight:y});
      box(group,x,y+3.1,y===bottom?z-d/2:z,w,.3,y===bottom?.3:d,'#d2c7ad',true);
      box(group,x,y+.025,z-d/2-.45,w+.5,.05,.9,'#b6a06b');
      for(const side of [-1,1]){
        const door=new THREE.Group();door.position.set(x+side*w/4,y+1.35,z-d/2-.04);group.add(door);
        box(door,0,0,0,w/2,2.7,.12,glassColor);
        for(const edge of [-1,1]){box(door,edge*(w/4-.04),0,0,.08,2.7,.14,'#697e82');box(door,0,edge*1.31,0,w/2,.08,.14,'#697e82');}
        doors.push({mesh:door,y,side});
      }
      const lamp=new THREE.MeshStandardMaterial({color:'#57cda3',emissive:'#57cda3',emissiveIntensity:.8});
      const bulb=new THREE.Mesh(geometry,lamp);bulb.position.set(x+w/2+.5,y+2.9,z-d/2-.18);bulb.scale.set(.24,.5,.12);group.add(bulb);
      const indicator:{lift:BuildingLift;y:number;lamp:THREE.MeshStandardMaterial;paint?:(text:string)=>void;last?:string}={lift,y,lamp};indicators.push(indicator);
      box(group,x,y+2.9,z-d/2-.1,w,.24,.12,'#253d45');
      // Canvas labels are optional in headless geometry tests.
      if(typeof document!=='undefined'){
        const canvas=document.createElement('canvas');canvas.width=512;canvas.height=128;const ctx=canvas.getContext('2d');
        if(ctx){
          const tex=new THREE.CanvasTexture(canvas);tex.colorSpace=THREE.SRGBColorSpace;labels.push(tex);
          indicator.paint=text=>{ctx.fillStyle='#243b43';ctx.fillRect(0,0,512,128);ctx.fillStyle='#f5e5b6';ctx.textAlign='center';ctx.font='bold 27px sans-serif';ctx.fillText(y===bottom?'SKYPARK  ↑  EXPRESS':'LOBBY  ↓  EXPRESS',256,34);ctx.font='bold 26px sans-serif';ctx.fillText(text,256,77);ctx.font='18px sans-serif';ctx.fillText('GLASS CABIN · STEP INSIDE WHEN OPEN',256,112);tex.needsUpdate=true;};
          const mat=new THREE.MeshBasicMaterial({map:tex});const sign=new THREE.Mesh(new THREE.PlaneGeometry(w,1),mat);sign.position.set(x,y+3.7,z-d/2-.17);sign.rotation.y=Math.PI;group.add(sign);}

      }
    }
    const car=new THREE.Group();car.position.set(x,bottom,z);car.name='Express lift cabin';group.add(car);
    box(car,0,-.12,0,w-.12,.24,d-.12,'#bda982');
    box(car,0,2.8,0,w-.12,.14,d-.12,'#e2d9bf');
    box(car,0,1.4,d/2-.18,w-.3,2.8,.08,glassColor);
    for(const side of [-1,1]){box(car,side*(w/2-.16),1.4,0,.08,2.8,d-.3,glassColor);box(car,side*(w/2-.22),1.05,0,.06,.07,d-.5,'#c2ad79');}
    for(const side of [-1,1])for(const end of [-1,1])box(car,side*(w/2-.16),1.4,end*(d/2-.18),.1,2.8,.1,'#697e82');
    box(car,0,2.68,0,2,.04,1,'#fff0c9');cars.push({lift,car,doors});
    const movingDoors=new Set<THREE.Object3D>([...doors.map(d=>d.mesh),...group.children.filter(c=>c instanceof THREE.Mesh && indicators.some(i=>i.lamp===c.material))]);
    for(const parent of [group,car]) {
      const byMaterial=new Map<THREE.Material,THREE.Mesh[]>();
      for(const child of parent.children)if(child instanceof THREE.Mesh&&child.geometry===geometry&&!movingDoors.has(child)){
        const material=child.material as THREE.Material,list=byMaterial.get(material)??[];list.push(child);byMaterial.set(material,list);
      }
      for(const [material,meshes] of byMaterial)if(meshes.length>1){
        const batch=new THREE.InstancedMesh(geometry,material,meshes.length);batch.castShadow=material!==materials.get(glassColor);batch.receiveShadow=true;
        meshes.forEach((mesh,i)=>{mesh.updateMatrix();batch.setMatrixAt(i,mesh.matrix);parent.remove(mesh);});
        batch.computeBoundingBox();batch.computeBoundingSphere();parent.add(batch);batches.push(batch);
      }
    }
  }
  world.scene.add(root);world.scene.userData.buildingLifts=lifts;world.scene.userData.walkSurfaces=surfaces;world.scene.userData.traversalObstacles=obstacles;
  const animate=world.animate,dispose=world.dispose;
  world.animate=(time:number)=>{animate(time);for(const {lift,car,doors} of cars){const s=liftSample(lift,time);car.position.y=s.y;for(const door of doors){const open=s.open&&Math.abs(s.y-door.y)<.1;door.mesh.position.x=lift.x+door.side*(open?lift.width*.74:lift.width/4);}}
    for(const indicator of indicators){const status=liftLandingStatus(indicator.lift,time,indicator.y);const color=status.open?'#57cda3':status.arriving?'#ffbd58':'#6e8c9c';indicator.lamp.color.set(color);indicator.lamp.emissive.set(color);indicator.lamp.emissiveIntensity=status.arriving?(Math.sin(time*Math.PI*4)>0?2:.25):.8;
      if(status.label!==indicator.last){indicator.last=status.label;indicator.paint?.(status.label);}}
    root.updateMatrixWorld(true);
  };
  let disposed=false;world.dispose=()=>{if(disposed)return;disposed=true;root.traverse(o=>{if(o instanceof THREE.Mesh&&o.geometry!==geometry){o.geometry.dispose();(o.material as THREE.Material).dispose();}});root.removeFromParent();batches.forEach(b=>b.dispose());geometry.dispose();materials.forEach(m=>m.dispose());labels.forEach(t=>t.dispose());indicators.forEach(i=>i.lamp.dispose());dispose();};
  world.animate(0);return world;
}
