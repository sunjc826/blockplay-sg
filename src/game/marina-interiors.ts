import { withMarinaAtrium } from './marina-atrium';
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
  withMarinaAtrium(world);
  const root=new THREE.Group();root.name='SkyPark gardens';world.scene.add(root);
  const boxGeo=new THREE.BoxGeometry(1,1,1),softGeo=new RoundedBoxGeometry(1,1,1,2,.08),leafGeo=new THREE.IcosahedronGeometry(1,1),potGeo=new THREE.CylinderGeometry(.5,.4,1,16);
  const geometries:THREE.BufferGeometry[]=[boxGeo,softGeo,leafGeo,potGeo],materials:THREE.Material[]=[],textures:THREE.Texture[]=[],batches:THREE.InstancedMesh[]=[];
  const material=(color:string,roughness=.65,metalness=0)=>{const m=new THREE.MeshStandardMaterial({color,roughness,metalness});materials.push(m);return m;};
  const stone=material('#d8d1bc'),darkStone=material('#53564f'),wood=material('#70543e'),bronze=material('#b79a61',.3,.65),soil=material('#3c352a'),leaves=[material('#3b6039'),material('#547749'),material('#6e8651')];
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
