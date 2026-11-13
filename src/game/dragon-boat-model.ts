import * as THREE from 'three';

/** Open hull, carved dragon prow and six separate paddles. Forward is local -Z. */
export function buildDragonBoatModel(golden: boolean) {
  const root = new THREE.Group(); root.name = golden ? 'Golden Dragon' : 'Red Dragon';
  const paint = new THREE.MeshStandardMaterial({ color: golden ? '#d6a239' : '#a63832', roughness: .65 });
  const gold = new THREE.MeshStandardMaterial({ color: '#e7c260', metalness: .3, roughness: .5 });
  const wood = new THREE.MeshStandardMaterial({ color: '#79503c', roughness: .85 });
  const dark = new THREE.MeshStandardMaterial({ color: '#1c3533' });
  const unit = new THREE.BoxGeometry(1,1,1);
  const box = (x:number,y:number,z:number,w:number,h:number,d:number, material: THREE.Material, parent: THREE.Object3D = root) => {
    const mesh = new THREE.Mesh(unit,material); mesh.position.set(x,y,z);mesh.scale.set(w,h,d);mesh.castShadow=mesh.receiveShadow=true;parent.add(mesh);return mesh;
  };
  // Taper each end to make a recognisable narrow racing hull, with an open interior.
  const vertices:number[]=[], indices:number[]=[];
  const sections=[[-4.5,.08],[-3.1,.85],[2.8,.85],[4.5,.12]];
  for(const [z,width] of sections) vertices.push(-width,-.12,z,-width,.6,z,width,.6,z,width,-.12,z);
  for(let i=0;i<3;i++)for(const [a,b] of [[0,1],[2,3],[3,0]]){const n=i*4;indices.push(n+a,n+b,n+b+4,n+a,n+b+4,n+a+4);}
  const hullGeo=new THREE.BufferGeometry();hullGeo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));hullGeo.setIndex(indices);hullGeo.computeVertexNormals();
  paint.side=THREE.DoubleSide;root.add(new THREE.Mesh(hullGeo,paint));
  box(0,.04,0,1.35,.13,6.3,wood);
  for(const side of [-1,1]) {box(side*.85,.73,-.1,.12,.12,6.2,gold);box(side*.72,.39,-.1,.08,.06,6.1,gold);}
  for(const z of [-2.1,0,2.1])box(0,.65,z,1.65,.16,.38,wood);
  // Raised dragon head, snout, eyes and paired horns; no imported reference assets.
  box(0,1,-3.8,.45,.95,.42,paint);box(0,1.42,-4.12,.64,.58,.7,gold);box(0,1.28,-4.48,.48,.23,.35,paint);
  for(const side of [-1,1]){
    box(side*.33,1.5,-4.25,.045,.12,.13,dark);
    const horn=new THREE.Mesh(new THREE.ConeGeometry(.1,.55,5),gold);horn.position.set(side*.23,1.93,-3.96);horn.rotation.z=side*-.25;root.add(horn);
    const tail=box(side*.15,1.1,4,.12,.8,.18,gold);tail.rotation.x=.65;
  }
  for(const side of [-1,1])for(let row=0;row<3;row++){
    const paddle=new THREE.Group();paddle.name='dragon-paddle';paddle.position.set(side*.77,.95,-2.1+row*2.1);paddle.userData.side=side;root.add(paddle);
    box(side*.33,-.5,0,.055,1.35,.055,wood,paddle).rotation.z=side*.55;
    box(side*.65,-1.05,0,.32,.55,.08,gold,paddle).rotation.z=side*.55;
  }
  // Shared vehicle presentation expects weapon anchors; these contain no weapon.
  const turret=new THREE.Group();turret.name='vehicle-turret';const muzzle=new THREE.Group();muzzle.name='vehicle-muzzle';turret.add(muzzle);root.add(turret);
  const flash=new THREE.Group();flash.name='vehicle-muzzle-flash';flash.visible=false;root.add(flash);
  const wakeMaterial=new THREE.MeshBasicMaterial({color:'#b4e2dc',transparent:true,opacity:0,depthWrite:false,side:THREE.DoubleSide});
  for(const side of [-1,1]){
    const wake=new THREE.Mesh(new THREE.PlaneGeometry(.12,5),wakeMaterial);wake.name='dragon-wake';wake.position.set(side*1.15,.025,4.6);wake.rotation.set(-Math.PI/2,0,side*.17);wake.userData.side=side;wake.userData.fpsEffect=true;wake.raycast=()=>{};root.add(wake);
  }
  return root;
}

export function animateDragonBoat(model: THREE.Group, speed:number, dt:number, reducedMotion=false, waveBlend=0) {
  const time=(model.userData.paddleTime??0)+dt;model.userData.paddleTime=time;
  const moving=Math.abs(speed)>.1, stroke=time*4.5;
  model.position.y+=reducedMotion?0:Math.sin(time*1.7)*.025;
  model.rotation.z=reducedMotion?0:Math.sin(time*1.3)*.008;
  model.traverse(o=>{
    if(o.name==='dragon-paddle'){o.rotation.x=moving?Math.sin(stroke)*.5:0;o.rotation.z=o.userData.side*(moving?.08+Math.cos(stroke)*.1:.15);}
    if(o.name==='dragon-wake'){
      const wake=o as THREE.Mesh<THREE.PlaneGeometry,THREE.MeshBasicMaterial>,sign=speed<0?-1:1;
      wake.material.opacity=Math.min(.45,Math.abs(speed)*.09)*(1-Math.max(0,Math.min(1,waveBlend)));
      wake.position.z=4.6*sign;wake.rotation.z=wake.userData.side*.17*sign;
    }
  });
}
