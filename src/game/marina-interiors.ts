import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { RegionWorld } from './regions';
import { MARINA_LIFTS, SKYPARK_FLOOR } from './marina-landmarks';
import { getWalkSurfaces, getTraversalObstacles } from './vertical-routes';

/** Same outline as the landmark shell, in compacted gameplay metres. */
export function skyparkOutline() {
  const w=20.52/2,l=183.6/2,s=new THREE.Shape();
  s.moveTo(-w,-l+8);s.quadraticCurveTo(-w,-l,0,-l);s.quadraticCurveTo(w,-l,w,-l+8);
  s.lineTo(w,l-22);s.quadraticCurveTo(w,l-4,0,l);s.quadraticCurveTo(-w,l-4,-w,l-22);s.closePath();
  const p=s.getPoints(12);p.pop();return p.map(p=>({x:90.6+p.x*.6,z:-9-p.y*.6}));
}
/** Architectural finish, furniture and roof geometry. All repeated details are instanced. */
export function withMarinaInteriors<T extends RegionWorld>(world:T):T {
  const root=new THREE.Group();root.name='MBS interiors and SkyPark gardens';world.scene.add(root);
  const boxGeo=new THREE.BoxGeometry(1,1,1),softGeo=new RoundedBoxGeometry(1,1,1,2,.08),leafGeo=new THREE.IcosahedronGeometry(1,1),potGeo=new THREE.CylinderGeometry(.5,.4,1,16);
  const geometries:THREE.BufferGeometry[]=[boxGeo,softGeo,leafGeo,potGeo],materials:THREE.Material[]=[],textures:THREE.Texture[]=[],batches:THREE.InstancedMesh[]=[];
  const material=(color:string,roughness=.65,metalness=0)=>{const m=new THREE.MeshStandardMaterial({color,roughness,metalness});materials.push(m);return m;};
  const stone=material('#d8d1bc'),darkStone=material('#53564f'),wood=material('#70543e'),bronze=material('#b79a61',.3,.65),upholstery=material('#365c58'),soil=material('#3c352a'),leaves=[material('#3b6039'),material('#547749'),material('#6e8651')];
  leaves.forEach(m=>m.userData.visualCover=true);
  const glass=material('#c0dae0',.16,.1);glass.transparent=true;glass.opacity=.17;glass.depthWrite=false;glass.side=THREE.DoubleSide;glass.userData.bulletGlass=true;
  const glow=material('#fff0cf');glow.emissive.set('#ffe4b0');glow.emissiveIntensity=.75;
  // One repeatable stone tile texture supplies joints and fine grain without extra draw calls.
  if(typeof document!=='undefined'){
    const canvas=document.createElement('canvas');canvas.width=canvas.height=256;const c=canvas.getContext('2d');
    if(c){c.fillStyle='#e6e0d0';c.fillRect(0,0,256,256);let seed=41;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
      for(let i=0;i<1300;i++){c.fillStyle=`rgba(102,96,81,${random()*.06})`;c.fillRect(random()*256,random()*256,1+random()*3,1);}
      c.strokeStyle='#c9c3b5';c.lineWidth=1.5;c.strokeRect(.75,.75,254.5,254.5);
      const t=new THREE.CanvasTexture(canvas);t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;textures.push(t);stone.map=t;
    }
  }
  const pending=new Map<string,{geometry:THREE.BufferGeometry;material:THREE.Material;matrices:THREE.Matrix4[]}>();
  const dummy=new THREE.Object3D();
  const add=(geo:THREE.BufferGeometry,mat:THREE.Material,x:number,y:number,z:number,w:number,h:number,d:number,yaw=0)=>{
    const key=geo.uuid+mat.uuid;let batch=pending.get(key);if(!batch){batch={geometry:geo,material:mat,matrices:[]};pending.set(key,batch);}
    dummy.position.set(x,y,z);dummy.rotation.set(0,yaw,0);dummy.scale.set(w,h,d);dummy.updateMatrix();batch.matrices.push(dummy.matrix.clone());
  };
  const box=(x:number,y:number,z:number,w:number,h:number,d:number,mat:THREE.Material,yaw=0)=>add(boxGeo,mat,x,y,z,w,h,d,yaw);
  const soft=(x:number,y:number,z:number,w:number,h:number,d:number,mat:THREE.Material,yaw=0)=>add(softGeo,mat,x,y,z,w,h,d,yaw);
  const plant=(x:number,y:number,z:number,scale=1)=>{
    add(potGeo,stone,x,y+.3*scale,z,.75*scale,.6*scale,.75*scale);add(potGeo,soil,x,y+.58*scale,z,.67*scale,.03*scale,.67*scale);
    for(let i=0;i<14;i++){const a=i*2.4,r=.15+(i%3)*.1;add(leafGeo,leaves[i%3],x+Math.cos(a)*r*scale,y+(.65+(i%4)*.12)*scale,z+Math.sin(a)*r*scale,.14*scale,.4*scale,.1*scale,a);}
  };
  const pane=(x:number,z:number,w:number,d:number)=>{
    box(x,2.2,z,w,4.4,d,glass);box(x,.13,z,w,.26,d+.05,darkStone);box(x,4.18,z,w,.14,d+.06,bronze);
    const alongX=w>d,length=Math.max(w,d),count=Math.ceil(length/2.5);
    for(let i=0;i<=count;i++)box(x+(alongX?-w/2+w*i/count:0),2.2,z+(alongX?0:-d/2+d*i/count),.055,4.4,.055,bronze);
  };
  const label=(text:string,x:number,y:number,z:number,width:number,yaw=Math.PI)=>{
    if(typeof document==='undefined')return;const canvas=document.createElement('canvas');canvas.width=768;canvas.height=128;const c=canvas.getContext('2d');if(!c)return;
    c.fillStyle='#283d3a';c.fillRect(0,0,768,128);c.fillStyle='#e7d4a4';c.textAlign='center';c.font='500 36px sans-serif';c.fillText(text,384,77);
    const t=new THREE.CanvasTexture(canvas);t.colorSpace=THREE.SRGBColorSpace;textures.push(t);const m=new THREE.MeshBasicMaterial({map:t});materials.push(m);
    const g=new THREE.PlaneGeometry(width,width/6);geometries.push(g);const mesh=new THREE.Mesh(g,m);mesh.position.set(x,y,z);mesh.rotation.y=yaw;root.add(mesh);
  };
  for(const [i,z] of [-39,-9,21].entries()){
    // Fine floor joints and bronze borders lead from both public entrances to the lift portal.
    const floorGeo=new THREE.PlaneGeometry(18,19.8);const uv=floorGeo.getAttribute('uv');for(let n=0;n<uv.count;n++)uv.setXY(n,uv.getX(n)*12,uv.getY(n)*13.2);geometries.push(floorGeo);
    const floor=new THREE.Mesh(floorGeo,stone);floor.rotation.x=-Math.PI/2;floor.position.set(91.2,.012,z);floor.receiveShadow=true;root.add(floor);
    for(const side of [-1,1])box(90.6+side*1.5,.018,z-5,.045,.012,9,bronze);
    pane(82.2,z-8,.28,3.8);pane(82.2,z+4.8,.28,10.2);pane(100.2,z,.28,19.8);
    for(const side of [-1,1])pane(90.6+side*6.1,z-9.9,6.7,.28);pane(91.2,z+9.9,18,.28);
    // Layered ceiling coffers, warm diffusers and timber slats; no shadow-casting point lights.
    for(const dx of [-5,0,5])for(const dz of [-6,0,6]){
      if(i!==1&&Math.abs(dx)<2&&dz>=0)continue;
      box(91.2+dx,4.23,z+dz,3.8,.12,3.2,wood);box(91.2+dx,4.15,z+dz,3.5,.08,2.9,stone);box(91.2+dx,4.095,z+dz,2.8,.025,.12,glow);
    }
    for(const x of [83,99.4])for(const dz of [-8.8,8.8]){box(x,.15,z+dz,.86,.3,.86,darkStone);box(x,4.15,z+dz,.84,.15,.84,bronze);}
    // Reception has a floating stone counter, fluted timber front, task display and a lit plinth.
    box(96.7,1.5,z+.3,3.8,3,.16,wood);
    for(let n=0;n<20;n++)box(94.85+n*.195,1.5,z+.2,.035,3,.04,bronze);
    soft(96.7,.6,z-2,3,1.2,1.1,wood);soft(96.7,1.23,z-2,3.2,.12,1.3,stone);
    for(let n=0;n<15;n++)box(95.3+n*.2,.65,z-2.56,.045,.85,.045,bronze);
    box(96.7,.12,z-2.57,2.6,.04,.035,glow);box(96.7,1.42,z-1.9,.48,.3,.055,darkStone);
    // Lounge furniture retains the existing collision footprints, with backs, arms and raised legs.
    for(const dz of [1,6]){
      soft(84,.42,z+dz,1.1,.42,2.4,upholstery);soft(83.57,.68,z+dz,.24,.5,2.4,upholstery);
      for(const end of [-1,1]){soft(84,.62,z+dz+end*1.08,1.1,.34,.2,upholstery);box(84,.1,z+dz+end*.88,.72,.2,.09,bronze);}
      for(const n of [-.45,.45])soft(84.03,.65,z+dz+n,.72,.12,.82,upholstery);
    }
    plant(87,0,z+7.8,1.3);
    box(81.5,3.9,z-3.8,3,.22,5.2,wood);box(81.5,3.77,z-3.8,2.7,.025,.1,glow);
    label(`TOWER ${i+1}   /   ${i===1?'LOUNGE':'SKYPARK'}`,90.6,3.45,z-10.07,4.5);
    label('MARINA BAY  /  RECEPTION',96.7,2.35,z+.16,3.5);
  }
  const outline=skyparkOutline(),holes=MARINA_LIFTS.map(l=>[{x:l.x-l.width/2,z:l.z-l.depth/2},{x:l.x+l.width/2,z:l.z-l.depth/2},{x:l.x+l.width/2,z:l.z+l.depth/2},{x:l.x-l.width/2,z:l.z+l.depth/2}]);
  const contour=outline.map(p=>new THREE.Vector2(p.x,p.z)),cutouts=holes.map(h=>h.map(p=>new THREE.Vector2(p.x,p.z)));
  const vertices=[...contour,...cutouts.flat()],triangles=THREE.ShapeUtils.triangulateShape(contour,cutouts);
  const roofGeo=new THREE.BufferGeometry();roofGeo.setAttribute('position',new THREE.Float32BufferAttribute(vertices.flatMap(p=>[p.x,SKYPARK_FLOOR,p.y]),3));
  roofGeo.setAttribute('uv',new THREE.Float32BufferAttribute(vertices.flatMap(p=>[p.x/1.5,p.y/1.5]),2));roofGeo.setIndex(triangles.flatMap(t=>[t[2],t[1],t[0]]));roofGeo.computeVertexNormals();geometries.push(roofGeo);
  const roof=new THREE.Mesh(roofGeo,stone);roof.name='SkyPark continuous walkable stone deck';roof.receiveShadow=true;root.add(roof);
  const surfaces=[...getWalkSurfaces(world.scene),{id:'sands-skypark/deck',routeId:'sands-skypark',minX:Math.min(...outline.map(p=>p.x)),maxX:Math.max(...outline.map(p=>p.x)),minZ:Math.min(...outline.map(p=>p.z)),maxZ:Math.max(...outline.map(p=>p.z)),axis:'x' as const,startHeight:SKYPARK_FLOOR,endHeight:SKYPARK_FLOOR,footprint:outline,holes}];
  const guards=[...getTraversalObstacles(world.scene)];
  for(let i=0;i<outline.length;i++){
    const a=outline[i],b=outline[(i+1)%outline.length],length=Math.hypot(b.x-a.x,b.z-a.z);if(length<.02)continue;
    const yaw=Math.atan2(b.x-a.x,b.z-a.z),x=(a.x+b.x)/2,z=(a.z+b.z)/2;
    box(x,SKYPARK_FLOOR+.62,z,.06,1.2,length,glass,yaw);box(x,SKYPARK_FLOOR+1.24,z,.09,.07,length,bronze,yaw);
    box(a.x,SKYPARK_FLOOR+.62,a.z,.08,1.24,.08,bronze);
    const nx=(b.z-a.z)/length*.06,nz=-(b.x-a.x)/length*.06,footprint=[{x:a.x+nx,z:a.z+nz},{x:b.x+nx,z:b.z+nz},{x:b.x-nx,z:b.z-nz},{x:a.x-nx,z:a.z-nz}];
    guards.push({minX:Math.min(...footprint.map(p=>p.x)),maxX:Math.max(...footprint.map(p=>p.x)),minZ:Math.min(...footprint.map(p=>p.z)),maxZ:Math.max(...footprint.map(p=>p.z)),minY:SKYPARK_FLOOR,maxY:SKYPARK_FLOOR+1.25,footprint});
  }
  for(const z of [-40,-24,-8,8,31]){
    soft(94,SKYPARK_FLOOR+.28,z,1.3,.56,3,stone);box(94,SKYPARK_FLOOR+.57,z,1.1,.06,2.8,soil);
    for(let n=0;n<15;n++)add(leafGeo,leaves[n%3],94+Math.sin(n*2.4)*.22,SKYPARK_FLOOR+.92+Math.sin(n)*.08,z-1.15+n%5*.56,.43,.4,.44,n);
  }
  for(const z of [-30,0,16]){
    soft(87.2,SKYPARK_FLOOR+.5,z,1.6,.18,2.4,wood);soft(86.5,SKYPARK_FLOOR+.8,z,.2,.6,2.4,wood);
    for(const dz of [-.9,.9])box(87.2,SKYPARK_FLOOR+.2,z+dz,1.2,.4,.15,stone);
    for(let n=0;n<12;n++)box(87.2,SKYPARK_FLOOR+.595,z-1.1+n*.2,1.4,.01,.014,darkStone);
  }
  for(const {geometry,material,matrices} of pending.values()){
    const batch=new THREE.InstancedMesh(geometry,material,matrices.length);matrices.forEach((m,i)=>batch.setMatrixAt(i,m));batch.castShadow=material!==glass;batch.receiveShadow=true;batch.computeBoundingBox();batch.computeBoundingSphere();root.add(batch);batches.push(batch);
  }
  world.scene.userData.walkSurfaces=surfaces;world.scene.userData.traversalObstacles=guards;
  const dispose=world.dispose;let disposed=false;world.dispose=()=>{if(disposed)return;disposed=true;root.removeFromParent();batches.forEach(b=>b.dispose());geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());dispose();};
  return world;
}
