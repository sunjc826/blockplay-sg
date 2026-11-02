import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Authored sculpture in Marina's pre-compaction metres, facing +X.
 * Cached references support the fish scales and tiled waves. The cropped head
 * references do not support a surveyed likeness; the face/mane are sculpted here.
 */
export function buildMerlionModel() {
  const root=new THREE.Group();root.name='merlion-statue';
  const stone=new THREE.MeshStandardMaterial({color:'#eee9dd',roughness:.83});
  const warm=new THREE.MeshStandardMaterial({color:'#ccc4b3',roughness:.9});
  const recess=new THREE.MeshStandardMaterial({color:'#736f65',roughness:.93});
  const blue=new THREE.MeshStandardMaterial({color:'#426f88',roughness:.45,metalness:.05});
  const paleBlue=new THREE.MeshStandardMaterial({color:'#87a7b2',roughness:.55});
  const grout=new THREE.MeshStandardMaterial({color:'#c0c6bd',roughness:.8});
  const stream=new THREE.MeshStandardMaterial({color:'#d3ece9',transparent:true,opacity:.78,roughness:.18,depthWrite:false});
  const materials=[stone,warm,recess,blue,paleBlue,grout,stream];
  const sources=new Set<THREE.BufferGeometry>(),geometries:THREE.BufferGeometry[]=[];
  const batches=new Map<THREE.Material,THREE.BufferGeometry[]>();
  const keep=<T extends THREE.BufferGeometry>(g:T)=>{sources.add(g);return g;};
  const sphere=keep(new THREE.SphereGeometry(1,20,12));
  const transform=new THREE.Object3D();
  function add(g:THREE.BufferGeometry,m:THREE.Material,x=0,y=0,z=0,sx=1,sy=1,sz=1,rx=0,ry=0,rz=0){
    sources.add(g);transform.position.set(x,y,z);transform.scale.set(sx,sy,sz);transform.rotation.set(rx,ry,rz);transform.updateMatrix();
    const copy=g.index?g.toNonIndexed():g.clone();copy.applyMatrix4(transform.matrix);copy.deleteAttribute('uv');
    if(!copy.getAttribute('normal'))copy.computeVertexNormals();
    const list=batches.get(m)??[];list.push(copy);batches.set(m,list);
  }
  const ellipsoid=(x:number,y:number,z:number,sx:number,sy:number,sz:number,m:THREE.Material=stone)=>add(sphere,m,x,y,z,sx,sy,sz);
  function tube(points:THREE.Vector3[],radius:number,m:THREE.Material,segments=16){
    add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),segments,radius,6,false),m);
  }
  function surface(rows:number,columns:number,point:(u:number,v:number)=>THREE.Vector3,reverse=false){
    const positions:number[]=[],indices:number[]=[];
    for(let j=0;j<=rows;j++)for(let i=0;i<=columns;i++){const p=point(i/columns,j/rows);positions.push(p.x,p.y,p.z);}
    for(let j=0;j<rows;j++)for(let i=0;i<columns;i++){const a=j*(columns+1)+i,b=a+columns+1;indices.push(...(reverse?[a,b,a+1,a+1,b,b+1]:[a,a+1,b,a+1,b+1,b]));}
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals();return g;
  }
  const profiles=[{y:.65,x:0,rx:1.03,rz:1.03},{y:1.1,x:-.04,rx:1.26,rz:1.12},{y:2.2,x:-.12,rx:1.15,rz:1.0},{y:3.6,x:-.12,rx:.9,rz:.83},{y:4.65,x:-.03,rx:.73,rz:.72},{y:5.05,x:0,rx:.7,rz:.7}];
  const profile=(y:number)=>{
    let a=profiles[0],b=profiles[1];
    for(let i=1;i<profiles.length;i++){b=profiles[i];a=profiles[i-1];if(y<=b.y)break;}
    const t=THREE.MathUtils.clamp((y-a.y)/(b.y-a.y),0,1);
    return {x:THREE.MathUtils.lerp(a.x,b.x,t),rx:THREE.MathUtils.lerp(a.rx,b.rx,t),rz:THREE.MathUtils.lerp(a.rz,b.rz,t)};
  };
  // A continuous curved fish body supports the shallow, overlapping scallops.
  add(surface(32,32,(u,v)=>{const y=.65+v*4.4,p=profile(y),angle=u*Math.PI*2;return new THREE.Vector3(p.x+p.rx*Math.cos(angle),y,p.rz*Math.sin(angle));},true),stone);
  for(let row=0;row<13;row++)for(let n=0;n<22;n++){
    const centre=n*Math.PI*2/22+(row%2)*Math.PI/22,base=.84+row*.295;
    add(surface(2,6,(u,v)=>{
      const across=u*2-1,angle=centre+across*Math.PI/22*.98;
      const y=base+.30*(1-v)-.065*Math.sqrt(Math.max(0,1-across*across))*v,p=profile(y),relief=.018+Math.sin(v*Math.PI)*.026;
      return new THREE.Vector3(p.x+(p.rx+relief)*Math.cos(angle),y,(p.rz+relief)*Math.sin(angle));
    }),stone);
  }
  // Low curled caudal lobes, tucked onto the wave pedestal instead of spikes.
  for(const side of [-1,1]){
    const fin=new THREE.Shape();fin.moveTo(-.55,.8);fin.bezierCurveTo(-1.2,.9,-1.55,1.55,-2.1,1.7);fin.bezierCurveTo(-2.05,1.12,-1.8,.55,-1.1,.55);fin.quadraticCurveTo(-.8,.58,-.55,.8);
    add(new THREE.ExtrudeGeometry(fin,{depth:.16,bevelEnabled:true,bevelSize:.06,bevelThickness:.05,bevelSegments:2,steps:1,curveSegments:12}),stone,0,0,side*.7,1,1,1,side*.22,0,0);
  }
  // The head has a broad brow, cheekbones and a paired muzzle, with a real mouth.
  ellipsoid(.03,5.98,0,.91,1.02,.74);
  ellipsoid(.28,6.33,0,.68,.66,.68);
  for(const side of [-1,1]){
    ellipsoid(.50,5.78,side*.49,.60,.53,.34);
    ellipsoid(1.02,5.59,side*.24,.57,.29,.30);
    const eye=new THREE.Shape();eye.moveTo(-.20,0);eye.quadraticCurveTo(-.03,.105,.20,.015);eye.quadraticCurveTo(.04,-.075,-.20,0);
    add(new THREE.ShapeGeometry(eye,12),recess,1.01,6.11,side*.49,1,1,1,0,Math.PI/2,0);
    tube([new THREE.Vector3(.96,6.21,side*.25),new THREE.Vector3(1.01,6.25,side*.48),new THREE.Vector3(.85,6.21,side*.73)],.055,stone);
    ellipsoid(.03,6.71,side*.78,.19,.21,.15);
    ellipsoid(.16,6.73,side*.81,.035,.10,.065,warm);
    // Subtle stone folds under the cheeks, rather than painted facial outlines.
    tube([new THREE.Vector3(1.00,5.45,side*.48),new THREE.Vector3(.76,5.30,side*.56),new THREE.Vector3(.56,5.24,side*.51)],.025,warm);
  }
  ellipsoid(.92,5.19,0,.57,.20,.43);
  ellipsoid(1.10,5.98,0,.30,.29,.28);
  const nose=new THREE.Shape();nose.moveTo(-.30,.13);nose.quadraticCurveTo(0,.21,.30,.13);nose.lineTo(.12,-.12);nose.quadraticCurveTo(0,-.21,-.12,-.12);nose.closePath();
  add(new THREE.ExtrudeGeometry(nose,{depth:.08,bevelEnabled:true,bevelSize:.035,bevelThickness:.03,bevelSegments:2,steps:1,curveSegments:10}),warm,1.36,5.83,0,.9,.9,1,0,Math.PI/2,0);
  // An elliptical opening, framed by a carved lip; fountain starts at its centre.
  add(new THREE.CircleGeometry(1,32),recess,1.52,5.37,0,.32,.12,1,0,Math.PI/2,0);
  add(new THREE.TorusGeometry(1,.09,8,32),stone,1.535,5.37,0,.34,.14,.42,0,Math.PI/2,0);
  const mouth=new THREE.Object3D();mouth.name='merlion-mouth-origin';mouth.position.set(1.61,5.37,0);root.add(mouth);
  // Broad stone locks curl around the skull and descend into the fish shoulders.
  function lock(points:THREE.Vector3[],width:number,across:THREE.Vector3){
    const curve=new THREE.CatmullRomCurve3(points),axis=across.clone().normalize();
    const rows=10,columns=8;
    const ribbon=surface(rows,columns,(u,t)=>{
      const centre=curve.getPoint(t),direction=curve.getTangent(t),normal=new THREE.Vector3().crossVectors(direction,axis).normalize();
      const angle=u*Math.PI*2,w=width*(.65+.5*Math.sin(t*Math.PI))*Math.pow(1-t,.35)+.018,depth=.12*(1-t*.5);
      return centre.addScaledVector(axis,Math.cos(angle)*w).addScaledVector(normal,Math.sin(angle)*depth);
    });
    // Close the sculpted locks: an open tube leaves dark holes at the tips.
    const position=ribbon.getAttribute('position'),vertices=Array.from(position.array),indices=Array.from(ribbon.getIndex()!.array);
    for(const [row,reverse] of [[0,true],[rows,false]] as const){
      const centre=curve.getPoint(row/rows),index=vertices.length/3;vertices.push(centre.x,centre.y,centre.z);
      for(let i=0;i<columns;i++){const a=row*(columns+1)+i;indices.push(...(reverse?[a,index,a+1]:[a,a+1,index]));}
    }
    ribbon.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));ribbon.setIndex(indices);ribbon.deleteAttribute('normal');ribbon.computeVertexNormals();
    add(ribbon,stone);
  }
  for(let i=0;i<21;i++){
    const angle=i*Math.PI*2/21,cy=Math.cos(angle),sz=Math.sin(angle);
    lock([new THREE.Vector3(.08,5.98+cy*.72,sz*.70),new THREE.Vector3(.07,5.98+cy*1.18,sz*1.25),new THREE.Vector3(.16,5.87+cy*1.38,sz*1.38)],.24,new THREE.Vector3(0,-sz,cy));
  }
  for(const side of [-1,1])for(let i=0;i<3;i++){
    const x=-.63+i*.40;
    lock([new THREE.Vector3(x,5.6,side*.73),new THREE.Vector3(x-.08,4.85,side*.85),new THREE.Vector3(x+.12,4.25,side*.66)],.28,new THREE.Vector3(1,0,0));
    tube([new THREE.Vector3(x,5.35,side*.85),new THREE.Vector3(x-.04,4.85,side*.97),new THREE.Vector3(x+.1,4.30,side*.76)],.014,warm,12);
  }
  // Cover the back of the head too, so the mane is sculpted in the round.
  for(let i=-3;i<=3;i++){
    const z=i*.24;
    lock([new THREE.Vector3(-.30,6.91,z*.72),new THREE.Vector3(-.98,6.13,z),new THREE.Vector3(-1.03,5.24,z*.92)],.19,new THREE.Vector3(0,0,1));
  }
  for(const z of [-.38,0,.38])lock([new THREE.Vector3(-.77,5.72,z),new THREE.Vector3(-1.00,4.95,z),new THREE.Vector3(-.65,4.22,z)],.23,new THREE.Vector3(0,0,1));

  // Rounded overlapping tiled wave arches, informed by the cached plinth images.
  add(new THREE.CylinderGeometry(2.55,2.70,.22,48),grout,0,.11,0);
  for(let i=-2;i<=2;i++){
    const z=i*.83,height=1.06-Math.abs(i)*.20,length=Math.sqrt(2.5**2-(Math.abs(z)+.35)**2),shape=new THREE.Shape();
    shape.moveTo(-length,.20);
    shape.bezierCurveTo(-length*.75,.20,-length*.72,height,-length*.22,height);
    shape.bezierCurveTo(length*.18,height*1.05,length*.35,height*.62,length*.10,height*.43);
    shape.bezierCurveTo(-length*.02,height*.70,-length*.22,height*.65,-length*.23,height*.40);
    shape.bezierCurveTo(-length*.05,.22,length*.55,.20,length,.20);
    shape.lineTo(length,.13);shape.lineTo(-length,.13);shape.closePath();
    add(new THREE.ExtrudeGeometry(shape,{depth:.70,bevelEnabled:true,bevelSize:.05,bevelThickness:.04,bevelSegments:2,steps:1,curveSegments:12}),i%2?blue:paleBlue,0,0,z-.35);
    const edge=shape.getPoints(20).slice(0,81);
    // Fine tile seams across the coloured ceramic crest, not projecting ribs.
    for(let n=5;n<edge.length-4;n+=8){const v=edge[n];tube([new THREE.Vector3(v.x,v.y+.012,z-.32),new THREE.Vector3(v.x,v.y+.012,z+.32)],.010,grout,2);}

  }
  for(const [material,parts] of batches){
    const merged=mergeGeometries(parts,false);if(!merged)throw Error('Merlion geometry could not be merged');parts.forEach(p=>p.dispose());
    const mesh=new THREE.Mesh(merged,material);mesh.name=material===stone?'merlion-carved-stone':material===recess?'merlion-face-recesses':'merlion-sculpture-detail';mesh.castShadow=mesh.receiveShadow=true;root.add(mesh);geometries.push(merged);
  }
  sources.forEach(g=>g.dispose());
  // A tapering stream meets the water rather than hanging above it.
  const path=new THREE.QuadraticBezierCurve3(mouth.position.clone(),new THREE.Vector3(8.5,6.0,0),new THREE.Vector3(18,-.4,0));
  const waterGeometry=new THREE.TubeGeometry(path,48,.075,8,false);
  const positions=waterGeometry.getAttribute('position');
  for(let i=0;i<=48;i++){const centre=path.getPointAt(i/48),scale=1-i/48*.6;for(let j=0;j<=8;j++){const n=i*9+j;positions.setXYZ(n,centre.x+(positions.getX(n)-centre.x)*scale,centre.y+(positions.getY(n)-centre.y)*scale,centre.z+(positions.getZ(n)-centre.z)*scale);}}
  waterGeometry.computeVertexNormals();geometries.push(waterGeometry);
  const water=new THREE.Mesh(waterGeometry,stream);water.name='merlion-fountain';water.userData.fpsEffect=true;water.raycast=()=>{};root.add(water);
  root.userData.sculpture={authored:true,features:['lion-face','layered-mane','scalloped-fish-scales','curled-tail','tiled-wave-plinth','mouth-fountain'],cachedReferenceScope:'fish scales and plinth; head is an authored interpretation'};
  return {root,dispose(){root.removeFromParent();geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());}};
}
