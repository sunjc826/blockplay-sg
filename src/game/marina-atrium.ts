import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { RegionWorld } from './regions';
import { getTraversalObstacles, type TraversalObstacle } from './vertical-routes';

/** Compressed interpretation of the reviewed Hursley/CL3 hotel atrium photographs.
 * The balconies are scenic hotel floors; the ground concourse and express lifts are playable. */
export const MBS_ATRIUM={minX:82.2,maxX:102.2,minZ:-49,maxZ:31,height:24,
  trees:[{x:84.8,z:-29},{x:99,z:-24},{x:84.8,z:1},{x:99,z:6},{x:84.8,z:26}],
  mainRouteX:86.7} as const;

export function withMarinaAtrium<T extends RegionWorld>(world:T):T {
  const root=new THREE.Group();root.name='MBS connected hotel atrium';world.scene.add(root);
  const geometries:THREE.BufferGeometry[]=[],materials:THREE.Material[]=[],textures:THREE.Texture[]=[],instances:THREE.InstancedMesh[]=[];
  const geometry=<G extends THREE.BufferGeometry>(g:G)=>{geometries.push(g);return g;};
  const boxGeo=geometry(new THREE.BoxGeometry(1,1,1)),softGeo=geometry(new RoundedBoxGeometry(1,1,1,3,.09));
  const cylinder=geometry(new THREE.CylinderGeometry(1,1,1,24)),pot=geometry(new THREE.CylinderGeometry(1,.7,1,32));
  const leafShape=new THREE.Shape();leafShape.moveTo(0,-1);leafShape.quadraticCurveTo(.62,0,0,1);leafShape.quadraticCurveTo(-.62,0,0,-1);
  const foliage=geometry(new THREE.ShapeGeometry(leafShape,3));
  const material=(color:string,roughness=.65,metalness=0)=>{const m=new THREE.MeshStandardMaterial({color,roughness,metalness});materials.push(m);return m;};
  const ivory=material('#f0ece2',.48),limestone=material('#dfd8c8',.5),walnut=material('#705543',.56),bronze=material('#a38c62',.3,.65);
  const charcoal=material('#313c3c'),linen=material('#d2c0a0',.92),velvet=material('#526a62',.94),soil=material('#453e30'),bark=material('#716652');
  const leaf=[material('#526743'),material('#728354'),material('#8c9a68')];leaf.forEach(m=>{m.userData.visualCover=true;m.side=THREE.DoubleSide;});
  const outer=material('#7f9ba6',.38,.12);
  const glass=material('#d4e5e6',.16,.08);glass.transparent=true;glass.opacity=.12;glass.depthWrite=false;glass.side=THREE.DoubleSide;glass.userData.bulletGlass=true;
  const warm=material('#ffe3ac');warm.emissive.set('#ffcc83');warm.emissiveIntensity=.8;
  ivory.emissive.set('#dfcfb4');ivory.emissiveIntensity=.09;
  const slot=material('#d6b986');slot.emissive.set('#cda66a');slot.emissiveIntensity=.25;
  // Soft stone grain and veins, shared across floors/portals; deterministic and canvas-free.
  const pixels=new Uint8Array(256*256*4);
  for(let y=0;y<256;y++)for(let x=0;x<256;x++){
    const vein=Math.pow(Math.max(0,Math.sin(x*.035+y*.022+Math.sin(y*.045)*2.1)),18),noise=Math.sin(x*127.1+y*311.7)*43758.5453;
    const v=242-vein*17+(noise-Math.floor(noise))*5,index=(y*256+x)*4;pixels[index]=v;pixels[index+1]=v-2;pixels[index+2]=v-6;pixels[index+3]=255;
  }
  const marble=new THREE.DataTexture(pixels,256,256);marble.colorSpace=THREE.SRGBColorSpace;marble.wrapS=marble.wrapT=THREE.RepeatWrapping;marble.magFilter=THREE.LinearFilter;marble.minFilter=THREE.LinearMipmapLinearFilter;marble.generateMipmaps=true;marble.needsUpdate=true;textures.push(marble);limestone.map=marble;
  const batches=new Map<string,{g:THREE.BufferGeometry;m:THREE.Material;matrices:THREE.Matrix4[]}>(),dummy=new THREE.Object3D();
  const add=(g:THREE.BufferGeometry,m:THREE.Material,x:number,y:number,z:number,w:number,h:number,d:number,yaw=0,q?:THREE.Quaternion)=>{
    const key=g.uuid+m.uuid;let b=batches.get(key);if(!b){b={g,m,matrices:[]};batches.set(key,b);}
    dummy.position.set(x,y,z);dummy.rotation.set(0,yaw,0);if(q)dummy.quaternion.copy(q);dummy.scale.set(w,h,d);dummy.updateMatrix();b.matrices.push(dummy.matrix.clone());
  };
  const solids:TraversalObstacle[]=[...getTraversalObstacles(world.scene)];
  const body=(x:number,y:number,z:number,w:number,h:number,d:number,yaw=0,supportsTop=false)=>{
    const footprint=[[-w/2,-d/2],[w/2,-d/2],[w/2,d/2],[-w/2,d/2]].map(([dx,dz])=>({x:x+dx*Math.cos(yaw)+dz*Math.sin(yaw),z:z-dx*Math.sin(yaw)+dz*Math.cos(yaw)}));
    solids.push({minX:Math.min(...footprint.map(p=>p.x)),maxX:Math.max(...footprint.map(p=>p.x)),minZ:Math.min(...footprint.map(p=>p.z)),maxZ:Math.max(...footprint.map(p=>p.z)),minY:y-h/2,maxY:y+h/2,footprint,supportsTop});
  };
  const box=(x:number,y:number,z:number,w:number,h:number,d:number,m:THREE.Material,yaw=0,solid=false)=>{add(boxGeo,m,x,y,z,w,h,d,yaw);if(solid)body(x,y,z,w,h,d,yaw,y+h/2<2);};
  const soft=(x:number,y:number,z:number,w:number,h:number,d:number,m:THREE.Material,yaw=0,solid=false)=>{add(softGeo,m,x,y,z,w,h,d,yaw);if(solid)body(x,y,z,w,h,d,yaw,y+h/2<2);};
  const beam=(a:number[],b:number[],w:number,m:THREE.Material)=>{
    const from=new THREE.Vector3(...a),to=new THREE.Vector3(...b),delta=to.clone().sub(from);
    add(boxGeo,m,(a[0]+b[0])/2,(a[1]+b[1])/2,(a[2]+b[2])/2,w,delta.length(),w,0,new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize()));
  };
  const panes=new Map<THREE.Material,THREE.BufferGeometry[]>();
  const quad=(points:number[][],m:THREE.Material=glass)=>{
    const g=geometry(new THREE.BufferGeometry());g.setAttribute('position',new THREE.Float32BufferAttribute(points.flat(),3));g.setIndex([0,1,2,0,2,3]);g.computeVertexNormals();
    const list=panes.get(m)??[];list.push(g);panes.set(m,list);
  };
  const label=(text:string,x:number,y:number,z:number,w:number,yaw=Math.PI)=>{
    if(typeof document==='undefined')return;const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=128;const c=canvas.getContext('2d');if(!c)return;
    c.fillStyle='#d9c79c';c.textAlign='center';c.font='500 42px serif';c.fillText(text,512,82);
    const tex=new THREE.CanvasTexture(canvas);tex.colorSpace=THREE.SRGBColorSpace;textures.push(tex);const mat=new THREE.MeshBasicMaterial({map:tex,transparent:true,depthWrite:false});materials.push(mat);
    const mesh=new THREE.Mesh(geometry(new THREE.PlaneGeometry(w,w/8)),mat);mesh.position.set(x,y,z);mesh.rotation.y=yaw;root.add(mesh);
  };
  // A single stone concourse joins all three towers. Thin joints establish human scale.
  const floorGeo=geometry(new THREE.PlaneGeometry(20,80));const uv=floorGeo.getAttribute('uv');for(let n=0;n<uv.count;n++)uv.setXY(n,uv.getX(n)*10,uv.getY(n)*40);
  const floor=new THREE.Mesh(floorGeo,limestone);floor.name='Continuous marble hotel concourse';floor.rotation.x=-Math.PI/2;floor.position.set(92.2,.013,-9);floor.receiveShadow=true;root.add(floor);
  for(let z=-49;z<=31;z+=2)box(92.2,.016,z,20,.003,.012,ivory);
  for(let x=82.2;x<=102.2;x+=2)box(x,.016,-9,.012,.003,80,ivory);
  for(const x of [86.45,88.75])box(x,.02,-9,.035,.012,80,bronze);

  // The long inclined glass walls and roof replace the three low glazed boxes.
  // Ground doors stay open on both sides so the atrium has several useful approaches.
  const doors=[-43,-13,17];
  for(const side of [-1,1]){
    const bottom=side<0?82.2:102.2,top=side<0?85.2:98.6;
    for(let z=-49;z<31;z+=5){
      const doorway=doors.some(d=>Math.abs(z+2.5-d)<3);
      if(!doorway){box(bottom,1.8,z+2.5,.12,3.6,5,glass);body(bottom,1.8,z+2.5,.12,3.6,5);}
      quad([[bottom,3.6,z],[bottom,3.6,z+5],[top,24,z+5],[top,24,z]]);
      beam([bottom,0,z],[top,24,z],.16,ivory);
      if(!doorway)body(bottom,.4,z,.35,.8,.35);
    }
    for(let y=4;y<=24;y+=4){const x=bottom+(top-bottom)*y/24;box(x,y,-9,.1,.1,80,ivory);}
    for(const z of doors){box(bottom,3.6,z,.8,.25,4.8,limestone);box(bottom,3.44,z,.1,.03,4.4,warm);}
  }
  for(const z of [-49,31]){
    for(const [x,w] of [[85.3,6.2],[98.1,8.2]])box(x,1.8,z,w,3.6,.13,glass,0,true);
    quad([[82.2,3.6,z],[102.2,3.6,z],[98.6,24,z],[85.2,24,z]]);
    for(let x=84;x<101;x+=2)box(x,3.5,z,.1,7,.1,ivory);
    box(90.6,3.5,z,4,.2,.5,limestone);
    label('MARINA BAY SANDS',90.6,4.15,z+(z<0?-.12:.12),4.8,z<0?Math.PI:0);
  }
  for(let z=-49;z<31;z+=5){
    for(const [left,right] of [[85.2,91.9],[91.9,98.6]]){
      const ly=left===91.9?25.5:24,ry=right===91.9?25.5:24;
      quad([[left,ly,z],[right,ry,z],[right,ry,z+5],[left,ly,z+5]]);
      beam([left,ly,z],[right,ry,z],.2,ivory);
    }
  }
  // Horizontal white gallery edges and recessed warm room slots dominate the view upward.
  for(const z of [-39,-9,21])for(let level=0;level<6;level++){
    const y=5.4+level*3.5;
    for(const side of [-1,1]){
      const back=side<0?82.4+y/24*2.8:102-y/24*3.4,front=side<0?85.75:96.9,width=Math.abs(front-back);
      box((back+front)/2,y,z,width,.28,19.8,ivory,0,true);solids[solids.length-1].supportsTop=true;
      box(front,y+.65,z,.22,1.08,19.8,ivory,0,true);
      box(front-side*.13,y+1.22,z,.09,.07,19.8,bronze);
      box(back,y+1.7,z,.16,3.1,19.8,limestone,0,true);
      box(front+side*.36,y-.17,z,.1,.035,19.5,warm);
      for(let dz=-8;dz<=8;dz+=2.7){
        box(back-side*.1,y+1.35,z+dz,.025,2.3,1.1,walnut);
        box(back-side*.13,y+2.65,z+dz,.035,.12,1.05,slot);
        box(back-side*.14,y+1.65,z+dz+.76,.04,.3,.12,warm);
      }
    }
  }
  // Solid hotel wings behind the galleries, with deep end walls and load-bearing piers.
  // The inclined glass remains visible in the connecting gaps between the three wings.
  for(const z of [-39,-9,21])for(const side of [-1,1]){
    const bottom=side<0?82.16:102.24,top=side<0?85.16:98.64,front=side<0?85.75:96.9;
    quad([[bottom,5.1,z-9.9],[bottom,5.1,z+9.9],[top,24,z+9.9],[top,24,z-9.9]],ivory);
    for(const end of [-1,1]){
      const edge=z+end*9.9;
      quad([[bottom,5.1,edge],[front,5.1,edge],[front,24,edge],[top,24,edge]],ivory);
      body((bottom+front)/2,14.55,edge,Math.abs(front-bottom),18.9,.18);
      beam([bottom,0,edge],[top,24,edge],.65,ivory);body(bottom,.8,edge,.8,1.6,.8);
      box((bottom+front)/2,4.6,edge,Math.abs(front-bottom),.8,.7,ivory);
    }
    for(let level=0;level<6;level++){
      const y=5.7+level*3.1,xb=bottom+(top-bottom)*(y-5.1)/18.9+side*.025,xt=bottom+(top-bottom)*(y+2.4-5.1)/18.9+side*.025;
      for(let dz=-8.3;dz<=8.3;dz+=2.75)quad([[xb,y,z+dz-1.1],[xb,y,z+dz+1.1],[xt,y+2.4,z+dz+1.1],[xt,y+2.4,z+dz-1.1]],outer);
    }
  }
  // Scenic bridges across the tall void: no new stairs or inaccessible gameplay objectives.
  for(const z of [-24,6]){
    box(91.4,10,z,11.5,.32,2.4,ivory,0,true);solids[solids.length-1].supportsTop=true;
    for(const end of [-1,1]){box(91.4,10.7,z+end*1.1,11.5,1.15,.18,ivory,0,true);box(91.4,9.82,z+end*.85,11.1,.025,.08,warm);}
  }
  // Tall stone core returns embed the lift portals in the building. The front remains glass.
  for(const z of [-36,24]){
    for(const side of [-1,1]){
      box(90.6+side*2.65,2.5,z-.5,.6,5,4.1,limestone,0,true);
      box(90.6+side*2.99,2.45,z-2.46,.09,4.6,.06,bronze);
    }
    box(90.6,4.6,z-2.65,5.9,.6,.5,limestone,0,true);
    for(const side of [-1,1])box(90.6+side*2.5,4.27,z-2.7,.08,.025,.12,warm);
  }
  // Long reception wall and counters, set to the side of the lift approach.
  for(const z of [-44,16]){
    box(99.4,2.2,z, .22,4.4,6.8,walnut,0,true);
    for(let dz=-3.2;dz<=3.2;dz+=.22)box(99.23,2.2,z+dz,.06,4.2,.025,bronze);
    soft(97.9,.58,z,1.2,1.16,5.7,walnut,0,true);soft(97.85,1.18,z,1.45,.14,5.9,limestone,0,true);
    box(97.22,.15,z,.035,.06,5.1,warm);
    for(const dz of [-1.7,1.7]){box(97.72,1.43,z+dz,.06,.32,.48,charcoal);box(97.72,1.26,z+dz,.3,.03,.38,bronze);}
    label('RECEPTION',99.09,3,z,3.4,-Math.PI/2);
  }
  // Sculptural tree pots give the concourse landmarks without closing the main walking lane.
  for(const {x,z} of MBS_ATRIUM.trees){
    add(pot,bronze,x,.8,z,.78,1.6,.78);add(cylinder,soil,x,1.57,z,.7,.035,.7);body(x,.8,z,1.56,1.6,1.56,0,true);
    add(cylinder,bark,x,3.1,z,.07,3.4,.07);
    for(let n=0;n<9;n++){
      const a=n*2.4,r=.65+(n%3)*.18,tip=[x+Math.cos(a)*r,3.4+(n%4)*.35,z+Math.sin(a)*r];
      beam([x,2.8+(n%2)*.5,z],tip,.045,bark);
      for(let j=0;j<38;j++){const angle=j*2.4+n,spread=.12+Math.sqrt(j/38)*.9;add(foliage,leaf[(n+j)%3],tip[0]+Math.cos(angle)*spread,tip[1]+Math.sin(j*1.7)*.55,tip[2]+Math.sin(angle)*spread,.27,.35,1,0,new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.sin(j)*.9,angle,Math.cos(j)*.6)));}
    }
  }
  // An elliptical lounge island echoes the original atrium's curved hospitality spaces.
  const loungeX=93.7,loungeZ=-9;
  add(cylinder,walnut,loungeX,.035,loungeZ,4.3,.04,6.1);
  const arc=(cx:number,cz:number,rx:number,rz:number,from:number,to:number,y:number,h:number,thick:number,m:THREE.Material,solid=false)=>{
    const count=Math.ceil((to-from)/.12);
    for(let i=0;i<count;i++){
      const a=from+(to-from)*i/count,b=from+(to-from)*(i+1)/count,ax=cx+Math.cos(a)*rx,az=cz+Math.sin(a)*rz,bx=cx+Math.cos(b)*rx,bz=cz+Math.sin(b)*rz;
      box((ax+bx)/2,y,(az+bz)/2,thick,h,Math.hypot(bx-ax,bz-az)+.025,m,Math.atan2(bx-ax,bz-az),solid);
    }
  };
  // Three openings permit crossing the lounge, with seating facing the bar.
  for(const [a,b] of [[.28,1.32],[1.8,2.8],[3.48,4.48],[4.95,6]]){
    arc(loungeX,loungeZ,4.25,6,a,b,.47,.88,.14,ivory,true);
    arc(loungeX,loungeZ,4.25,6,a,b,.93,.06,.19,bronze);
  }
  const chair=(x:number,z:number,yaw:number)=>{
    soft(x,.43,z,.78,.32,.78,linen,yaw,true);
    const dx=Math.sin(yaw),dz=Math.cos(yaw);
    soft(x+dx*.32,.77,z+dz*.32,.8,.65,.15,velvet,yaw,true);
    for(const s of [-1,1])soft(x+s*Math.cos(yaw)*.36,.63,z-s*Math.sin(yaw)*.36,.1,.3,.7,linen,yaw);
    for(const a of [-1,1])for(const b of [-1,1])box(x+a*.24,.16,z+b*.24,.035,.3,.035,bronze);
  };
  for(const a of [.6,2.2,3.9,5.5]){
    const x=loungeX+Math.cos(a)*2.9,z=loungeZ+Math.sin(a)*4.1;
    add(cylinder,limestone,x,.68,z,.5,.06,.5);add(cylinder,bronze,x,.35,z,.05,.66,.05);body(x,.36,z,.75,.72,.75,0,true);
    for(const d of [-.5,.5]){const yaw=a+Math.PI/2+d;chair(x+Math.cos(a+d)*.85,z+Math.sin(a+d)*.85,Math.PI-yaw);}
    add(cylinder,bronze,x,.91,z,.08,.4,.08);add(pot,warm,x,1.14,z,.18,.17,.18);
  }
  soft(loungeX, .57,loungeZ,1.8,1.14,3.5,walnut,0,true);soft(loungeX,1.18,loungeZ,2.1,.12,3.8,limestone,0,true);
  for(let dz=-1.5;dz<=1.5;dz+=.16)box(loungeX- .92,.64,loungeZ+dz,.035,.85,.025,bronze);
  for(const dz of [-1.1,0,1.1]){add(cylinder,bronze,loungeX-.25,1.35,loungeZ+dz,.06,.22,.06);add(cylinder,glass,loungeX+.22,1.33,loungeZ+dz,.08,.18,.08);}
  // A lightweight suspended wire cloud recalls the atrium artwork's airy presence.
  const wires:number[]=[];let seed=71;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  for(let n=0;n<260;n++){
    const x=88+random()*6.8,y=15+random()*4.2,z=-26+random()*39,size=.45+random()*.75;
    const p=[[x,y,z],[x+size,y+.15,z],[x+size,y+size,z+.2],[x,y+size,z],[x-.15,y,z+size],[x+size,y,z+size],[x+size,y+size,z+size],[x,y+size,z+size]];
    for(const [a,b] of [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]])wires.push(...p[a],...p[b]);
  }
  const wireGeo=geometry(new THREE.BufferGeometry());wireGeo.setAttribute('position',new THREE.Float32BufferAttribute(wires,3));const wireMat=new THREE.LineBasicMaterial({color:'#a59e8c',transparent:true,opacity:.55});materials.push(wireMat);
  const sculpture=new THREE.LineSegments(wireGeo,wireMat);sculpture.name='Atrium suspended wire study';root.add(sculpture);
  for(const {g,m,matrices} of batches.values()){
    const mesh=new THREE.InstancedMesh(g,m,matrices.length);matrices.forEach((matrix,i)=>mesh.setMatrixAt(i,matrix));mesh.castShadow=m!==glass&&m!==warm;mesh.receiveShadow=true;mesh.computeBoundingBox();mesh.computeBoundingSphere();root.add(mesh);instances.push(mesh);
  }
  ivory.side=THREE.DoubleSide;outer.side=THREE.DoubleSide;
  for(const [m,list] of panes){const mesh=new THREE.Mesh(geometry(mergeGeometries(list)),m);mesh.name=m===glass?'Atrium inclined glazing and skylight':'Atrium hotel wing envelope';mesh.castShadow=m!==glass;mesh.receiveShadow=true;root.add(mesh);}
  world.scene.userData.traversalObstacles=solids;
  world.scene.userData.referenceFeatures=[...(world.scene.userData.referenceFeatures??[]),'mbs-hotel-atrium-hursley','mbs-atrium-lounge-cl3'];
  world.scene.userData.mbsAtrium={height:24,continuous:true,scenicBalconies:true,referenceReview:'docs/evidence/2026-11-02-mbs-atrium.md'};
  const dispose=world.dispose;let disposed=false;world.dispose=()=>{if(disposed)return;disposed=true;root.removeFromParent();instances.forEach(m=>m.dispose());geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());dispose();};
  return world;
}
