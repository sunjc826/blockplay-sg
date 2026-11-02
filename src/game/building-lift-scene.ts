import * as THREE from 'three';
import type { RegionWorld } from './regions';
import { getWalkSurfaces, getTraversalObstacles } from './vertical-routes';
import { liftSample, liftLandingStatus, type BuildingLift } from './building-lifts';

/** Lift geometry and its endpoint floors share one authored definition. */
export function withBuildingLifts<T extends RegionWorld>(world:T,lifts:readonly BuildingLift[]):T {
  const root=new THREE.Group();root.name='MBS express lifts';
  const geometry=new THREE.BoxGeometry(1,1,1),railGeometry=new THREE.CylinderGeometry(.035,.035,1,10),materials=new Map<string,THREE.MeshStandardMaterial>();
  const surfaces=[...getWalkSurfaces(world.scene)],obstacles=[...getTraversalObstacles(world.scene)];
  const cars:{lift:BuildingLift;car:THREE.Group;doors:{mesh:THREE.Object3D;y:number;side:number;cab?:boolean}[]}[]=[];
  const labels:THREE.CanvasTexture[]=[];
  const indicators:{lift:BuildingLift;y:number;lamp:THREE.MeshStandardMaterial;paint?:(text:string)=>void;last?:string}[]=[];
  const glassColor='#9bcbd2';

  const batches:THREE.InstancedMesh[]=[];
  const box=(parent:THREE.Object3D,x:number,y:number,z:number,w:number,h:number,d:number,color:string,solid=false)=>{
    if(!materials.has(color)){
      const mat=new THREE.MeshStandardMaterial({color,roughness:color===glassColor?.12:color==='#b79a61'?.3:.6,metalness:color==='#b79a61'?.65:.15,
        ...(color===glassColor?{transparent:true,opacity:.18,depthWrite:false,side:THREE.DoubleSide}:{})});
      if(color===glassColor)mat.userData.bulletGlass=true;
      if(color==='#fff0c9'){mat.emissive.set('#ffe4b0');mat.emissiveIntensity=.7;}
      materials.set(color,mat);
    }
    const m=new THREE.Mesh(geometry,materials.get(color));m.position.set(x,y,z);m.scale.set(w,h,d);m.castShadow=color!==glassColor;m.receiveShadow=true;parent.add(m);
    if(solid)obstacles.push({minX:x-w/2,maxX:x+w/2,minZ:z-d/2,maxZ:z+d/2,minY:y-h/2,maxY:y+h/2});return m;
  };
  for(const lift of lifts){
    const {x,z,width:w,depth:d,bottom,top}=lift,h=top+4.05;
    const group=new THREE.Group();group.name=lift.id;root.add(group);
    for(const side of [-1,1])box(group,x+side*(w/2+.14),h/2,z,.28,h,d+.4,glassColor,true);
    box(group,x,h/2,z+d/2+.14,w,h,.28,glassColor,true);
    for(const side of [-1,1])for(const end of [-1,1])box(group,x+side*(w/2+.14),h/2,z+end*(d/2+.14),.22,h,.22,'#697e82');
    // Glazed shaft still has full physical guards; steel corner posts stop rounds.
    box(group,x,(top+3.2)/2,z-d/2,w,top-3.2,.25,glassColor,true);
    const doors:{mesh:THREE.Object3D;y:number;side:number;cab?:boolean}[]=[];
    for(const y of [bottom,top]){
      surfaces.push({id:`${lift.id}/${y===bottom?'lobby':'skypark'}`,routeId:lift.id,lift:lift.id,minX:x-w/2,maxX:x+w/2,minZ:z-d/2,maxZ:z+d/2,axis:'x',startHeight:y,endHeight:y});
      box(group,x,y+3.1,y===bottom?z-d/2:z,w,.3,y===bottom?.3:d,'#d2c7ad',true);
      box(group,x,y+.025,z-d/2-.45,w+.5,.05,.9,'#b6a06b');
      for(const side of [-1,1]){
        box(group,x+side*w*.375,y+1.35,z-d/2,w/4,2.7,.16,glassColor,true);
        box(group,x+side*(w/4+.06),y+1.4,z-d/2-.13,.12,2.8,.22,'#b79a61');
        box(group,x+side*(w/2+.28),y+1.98,z-d/2-.08,.3,3.96,.4,'#d8d1bc');
        const door=new THREE.Group();door.position.set(x+side*w/8,y+1.35,z-d/2-.04);group.add(door);
        box(door,0,0,0,w/4,2.7,.07,glassColor);
        for(const edge of [-1,1]){box(door,edge*(w/8-.025),0,0,.05,2.7,.09,'#b79a61');box(door,0,edge*1.325,0,w/4,.05,.09,'#b79a61');}
        box(door,0,-.73,-.05,w/4,.035,.025,'#b79a61');
        doors.push({mesh:door,y,side});
      }
      box(group,x,y+3.94,z-d/2-.1,w+.8,.18,.5,'#d8d1bc');
      box(group,x,y+2.78,z-d/2-.22,w/2,.035,.06,'#fff0c9');
      for(const dx of [-.035,.035])box(group,x,y+.035,z-d/2+dx,w/2,.02,.02,'#697e82');
      const lamp=new THREE.MeshStandardMaterial({color:'#57cda3',emissive:'#57cda3',emissiveIntensity:.8});
      const bulb=new THREE.Mesh(geometry,lamp);bulb.position.set(x+w/2+.28,y+2.6,z-d/2-.31);bulb.scale.set(.08,.35,.035);group.add(bulb);
      const indicator:{lift:BuildingLift;y:number;lamp:THREE.MeshStandardMaterial;paint?:(text:string)=>void;last?:string}={lift,y,lamp};indicators.push(indicator);
      box(group,x,y+3.54,z-d/2-.16,w,.6,.15,'#253d45');
      // Canvas labels are optional in headless geometry tests.
      if(typeof document!=='undefined'){
        const canvas=document.createElement('canvas');canvas.width=512;canvas.height=128;const ctx=canvas.getContext('2d');
        if(ctx){
          const tex=new THREE.CanvasTexture(canvas);tex.colorSpace=THREE.SRGBColorSpace;labels.push(tex);
          indicator.paint=text=>{ctx.fillStyle='#243b43';ctx.fillRect(0,0,512,128);ctx.fillStyle='#f5e5b6';ctx.textAlign='center';ctx.font='500 25px sans-serif';ctx.fillText(y===bottom?'SKYPARK  ↑  EXPRESS':'LOBBY  ↓  EXPRESS',256,34);ctx.font='500 23px sans-serif';ctx.fillText(text,256,77);ctx.font='18px sans-serif';ctx.fillText('Walk in when green',256,112);tex.needsUpdate=true;};
          const mat=new THREE.MeshBasicMaterial({map:tex});const sign=new THREE.Mesh(new THREE.PlaneGeometry(w-.4,.55),mat);sign.position.set(x,y+3.54,z-d/2-.245);sign.rotation.y=Math.PI;group.add(sign);}

      }
    }
    const car=new THREE.Group();car.position.set(x,bottom,z);car.name='Express lift cabin';group.add(car);
    box(car,0,-.12,0,w-.12,.24,d-.12,'#d8d1bc');
    for(const side of [-1,1]){box(car,side*(w/2-.32),.008,0,.04,.012,d-.5,'#b79a61');box(car,0,.008,side*(d/2-.32),w-.6,.012,.04,'#b79a61');}
    for(const n of [-1,0,1])box(car,n,.004,0,.008,.008,d-.7,'#b5b2a6');
    for(const n of [-1,0,1])box(car,0,.004,n,w-.7,.008,.008,'#b5b2a6');
    box(car,0,2.8,0,w-.12,.14,d-.12,'#e2d9bf');
    box(car,0,1.4,d/2-.18,w-.3,2.8,.08,glassColor);
    for(const side of [-1,1]){box(car,side*(w/2-.16),1.4,0,.08,2.8,d-.3,glassColor);box(car,side*(w/2-.24),.22,0,.09,.44,d-.3,'#d8d1bc');}
    for(const side of [-1,1])for(const end of [-1,1])box(car,side*(w/2-.16),1.4,end*(d/2-.18),.1,2.8,.1,'#697e82');
    box(car,0,.22,d/2-.23,w-.4,.44,.1,'#d8d1bc');
    for(const side of [-1,1]){
      const handrail=new THREE.Mesh(railGeometry,materials.get('#b79a61'));handrail.position.set(side*(w/2-.3),1.05,0);handrail.scale.y=d-.65;handrail.rotation.x=Math.PI/2;car.add(handrail);
      for(const end of [-1,1])box(car,side*(w/2-.25),1.05,end*(d/2-.5),.12,.04,.05,'#b79a61');
      box(car,side*w*.375,1.35,-d/2+.12,w/4,2.7,.06,glassColor);
      const door=new THREE.Group();door.position.set(side*w/8,1.35,-d/2+.06);car.add(door);
      box(door,0,0,0,w/4,2.7,.06,glassColor);
      for(const edge of [-1,1])box(door,edge*(w/8-.025),0,0,.05,2.7,.08,'#b79a61');
      doors.push({mesh:door,y:0,side,cab:true});
      box(car,side*(w/2-.4),2.745,0,.12,.025,d-.8,'#fff0c9');
    }
    box(car,0,2.745,0,w-.9,.025,.12,'#fff0c9');
    box(car,w/2-.27,1.3,-d/2+.45,.08,.55,.24,'#253d45');
    for(let i=0;i<3;i++)box(car,w/2-.32,1.48-i*.15,-d/2+.44,.015,.06,.09,i===0?'#fff0c9':'#b79a61');
    cars.push({lift,car,doors});
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
  world.animate=(time:number)=>{animate(time);for(const {lift,car,doors} of cars){const s=liftSample(lift,time);car.position.y=s.y;for(const door of doors){const open=s.open&&(door.cab||Math.abs(s.y-door.y)<.1);door.mesh.position.x=(door.cab?0:lift.x)+door.side*lift.width*(open?.375:.125);}}
    for(const indicator of indicators){const status=liftLandingStatus(indicator.lift,time,indicator.y);const color=status.open?'#57cda3':status.arriving?'#ffbd58':'#6e8c9c';indicator.lamp.color.set(color);indicator.lamp.emissive.set(color);indicator.lamp.emissiveIntensity=status.arriving?(Math.sin(time*Math.PI*4)>0?2:.25):.8;
      if(status.label!==indicator.last){indicator.last=status.label;indicator.paint?.(status.label);}}
    root.updateMatrixWorld(true);
  };
  let disposed=false;world.dispose=()=>{if(disposed)return;disposed=true;root.traverse(o=>{if(o instanceof THREE.Mesh&&o.geometry!==geometry&&o.geometry!==railGeometry){o.geometry.dispose();(o.material as THREE.Material).dispose();}});root.removeFromParent();batches.forEach(b=>b.dispose());geometry.dispose();railGeometry.dispose();materials.forEach(m=>m.dispose());labels.forEach(t=>t.dispose());indicators.forEach(i=>i.lamp.dispose());dispose();};
  world.animate(0);return world;
}
