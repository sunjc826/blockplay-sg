import * as THREE from 'three';
import { batchRigidMeshes } from './rigid-batches';

export type StreetPropKind = 'planter' | 'bench' | 'bollard' | 'cabinet' | 'vending' | 'bike-rack' | 'crate' | 'flower-pot' | 'cone' | 'stool' | 'wheelie-bin' | 'trolley';
export type PropBehavior = 'fixed' | 'breakable' | 'movable';
export interface StreetPropSpec { kind: StreetPropKind; name: string; behavior: PropBehavior; setting: string; detail: string; width: number; depth: number; height: number }
export const STREET_PROPS: readonly StreetPropSpec[] = [
  { kind: 'planter', name: 'Rain-garden planter', behavior: 'fixed', setting: 'Promenades & plazas', detail: 'Fluted concrete, a recessed soil bed and broad tropical leaves.', width: 1.7, depth: .9, height: 1.5 },
  { kind: 'bench', name: 'Estate bench', behavior: 'fixed', setting: 'HDB courtyards & parks', detail: 'Warm timber slats on heavy terrazzo feet, with steel armrests.', width: 1.9, depth: .75, height: .95 },
  { kind: 'bollard', name: 'Reflective bollard', behavior: 'fixed', setting: 'Service lanes & entrances', detail: 'A yellow safety sleeve, reflective bands and a bolted base.', width: .42, depth: .42, height: 1.05 },
  { kind: 'cabinet', name: 'Utility cabinet', behavior: 'fixed', setting: 'Back lanes & industrial yards', detail: 'Louvred doors, a rain hood, warning plate and a concrete plinth.', width: 1.1, depth: .65, height: 1.65 },
  { kind: 'vending', name: 'Cold-drinks machine', behavior: 'fixed', setting: 'Void decks & station approaches', detail: 'Teal enamel, colourful drink rows, coin slot and a recessed collection tray.', width: 1.05, depth: .8, height: 1.95 },
  { kind: 'bike-rack', name: 'Cycle stand', behavior: 'fixed', setting: 'Park connectors & town centres', detail: 'Three steel hoops with reflective collars, anchored to a common rail.', width: 2.15, depth: .65, height: .9 },
  { kind: 'crate', name: 'Produce crate', behavior: 'breakable', setting: 'Markets & loading bays', detail: 'Open slatted timber with green produce. Breaks into planks and loose contents.', width: .85, depth: .65, height: .62 },
  { kind: 'flower-pot', name: 'Terracotta pot', behavior: 'breakable', setting: 'Shophouse five-foot ways', detail: 'A rolled clay rim and a compact shrub. Shatters into clay pieces and foliage.', width: .65, depth: .65, height: 1.05 },
  { kind: 'cone', name: 'Roadwork cone', behavior: 'movable', setting: 'Maintenance corners', detail: 'Orange moulded plastic, white reflective bands and a heavy rubber foot.', width: .55, depth: .55, height: .85 },
  { kind: 'stool', name: 'Kopitiam stool', behavior: 'movable', setting: 'Hawker centres & shopfronts', detail: 'A red plastic seat with a carry slot, splayed legs and cross braces.', width: .48, depth: .48, height: .48 },
  { kind: 'wheelie-bin', name: 'Estate wheelie bin', behavior: 'movable', setting: 'Service alleys & food courts', detail: 'Green moulded body, hinged lid, grab handle and two rear wheels.', width: .62, depth: .72, height: 1.1 },
  { kind: 'trolley', name: 'Delivery hand trolley', behavior: 'movable', setting: 'Shop deliveries & workshops', detail: 'Blue tubular frame, rubber grips, a toe plate and chunky wheels.', width: .65, depth: .62, height: 1.25 },
];
export const streetPropSpec = (kind: StreetPropKind) => STREET_PROPS.find(p => p.kind === kind)!;

/** Shared geometry/material pool. One kit per world, disposed after its models. */
export function createStreetPropKit() {
  const geometries: THREE.BufferGeometry[] = [], materials = new Map<string, THREE.MeshStandardMaterial>();
  const keep = <T extends THREE.BufferGeometry>(g: T) => { geometries.push(g); return g; };
  const cube = keep(new THREE.BoxGeometry(1, 1, 1)), cylinder = keep(new THREE.CylinderGeometry(.5, .5, 1, 12));
  const taper = keep(new THREE.BoxGeometry(1, 1, 1));
  const taperedPositions=taper.attributes.position;
  for(let i=0;i<taperedPositions.count;i++)if(taperedPositions.getY(i)<0){taperedPositions.setX(i,taperedPositions.getX(i)*.8);taperedPositions.setZ(i,taperedPositions.getZ(i)*.8);}
  taper.computeVertexNormals();
  const cone = keep(new THREE.CylinderGeometry(.08, .5, 1, 12));
  const leaf = keep(new THREE.IcosahedronGeometry(.5, 1));
  const palette = { concrete: '#aaa99b', dark: '#263734', steel: '#728985', wood: '#aa7950', woodLight: '#c49865', green: '#356c44', leaf: '#5c9250', soil: '#443c30', teal: '#248887', cream: '#e6e5ce', yellow: '#e9b442', orange: '#ea682b', red: '#b74336', clay: '#ba7250', blue: '#39829e' };
  type Color = keyof typeof palette;
  const mat = (color: Color) => {
    let m = materials.get(color);
    if (!m) { m = new THREE.MeshStandardMaterial({ color: palette[color], roughness: color === 'steel' ? .4 : .82, metalness: color === 'steel' ? .65 : 0 }); materials.set(color, m); }
    return m;
  };
  function build(kind: StreetPropKind) {
    const root = new THREE.Group(), spec = streetPropSpec(kind);
    root.name = spec.name; root.userData.streetProp = kind;
    const add = (g: THREE.BufferGeometry, x: number, y: number, z: number, w: number, h: number, d: number, color: Color) => {
      const m = new THREE.Mesh(g, mat(color)); m.position.set(x,y,z); m.scale.set(w,h,d); m.castShadow = m.receiveShadow = true; root.add(m); return m;
    };
    const box = (x:number,y:number,z:number,w:number,h:number,d:number,c:Color) => add(cube,x,y,z,w,h,d,c);
    const round = (x:number,y:number,z:number,w:number,h:number,c:Color) => add(cylinder,x,y,z,w,h,w,c);
    const bar = (a:number[],b:number[],r:number,c:Color) => { const from=new THREE.Vector3(...a),to=new THREE.Vector3(...b),m=round(0,0,0,r,from.distanceTo(to),c);m.position.copy(from).add(to).multiplyScalar(.5);m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),to.sub(from).normalize());return m; };
    const plant = (y:number,spread:number) => {
      round(0,y+.2,0,.045,.45,'wood');
      for(let i=0;i<7;i++){const a=i*2.4,m=add(leaf,Math.cos(a)*spread*.3,y+.25+(i%3)*.12,Math.sin(a)*spread*.3,spread*.4,.55,spread*.3,i%2?'leaf':'green');m.rotation.set(Math.sin(a)*.6,a,Math.cos(a)*.6);}
    };
    if(kind==='planter') {
      box(0,.37,0,1.65,.68,.85,'concrete');box(0,.73,0,1.5,.06,.7,'soil');
      for(let i=-5;i<=5;i++)for(const z of [-.43,.43])box(i*.14,.38,z,.035,.56,.025,'cream');
      plant(.82,1.35);
    } else if(kind==='bench') {
      for(const x of [-.67,.67])box(x,.24,0,.22,.48,.65,'concrete');
      for(let i=0;i<4;i++)box(0,.51,-.25+i*.15,1.9,.085,.12,i%2?'woodLight':'wood');
      for(const x of [-.72,.72]){box(x,.71,.29,.055,.48,.055,'steel');box(x,.69,0,.055,.045,.55,'steel');}
      for(let i=0;i<3;i++)box(0,.69+i*.11,.29,1.9,.085,.065,i%2?'wood':'woodLight');
    } else if(kind==='bollard') {
      box(0,.045,0,.42,.09,.42,'dark');round(0,.55,0,.22,1,'yellow');
      for(const y of [.68,.88])round(0,y,0,.226,.09,'cream');
      round(0,1.04,0,.24,.04,'dark');for(const x of [-.15,.15])for(const z of [-.15,.15])round(x,.1,z,.035,.025,'steel');
    } else if(kind==='cabinet') {
      box(0,.08,0,1.1,.16,.65,'concrete');box(0,.86,0,.95,1.4,.56,'steel');box(0,1.6,0,1.06,.09,.64,'dark');
      box(0,.86,.286,.018,1.3,.025,'dark');
      for(const x of [-.24,.24]) {for(let i=0;i<6;i++)box(x,.4+i*.075,.295,.32,.025,.025,'dark');box(x,1.18,.3,.15,.14,.025,'yellow');box(x+.1,.85,.31,.035,.13,.04,'dark');}
    } else if(kind==='vending') {
      box(0,.98,0,1.05,1.86,.8,'teal');box(0,.1,0,.9,.2,.7,'dark');
      box(-.12,1.2,.41,.65,.99,.035,'dark');box(0,1.79,.42,.89,.18,.035,'cream');
      for(let row=0;row<3;row++)for(let col=0;col<4;col++){round(-.36+col*.16,.84+row*.28,.45,.09,.17,(col+row)%2?'orange':'green');box(-.36+col*.16,.83+row*.28,.497,.075,.035,.008,'cream');}
      for(let row=0;row<3;row++)box(-.12,.72+row*.28,.46,.65,.025,.07,'steel');
      box(.36,1.3,.42,.15,.26,.03,'steel');box(.36,1.33,.44,.09,.018,.02,'dark');box(.36,1.02,.44,.07,.07,.02,'yellow');
      box(-.07,.42,.42,.7,.22,.04,'dark');box(-.07,.31,.47,.74,.04,.14,'steel');
    } else if(kind==='bike-rack') {
      for(const z of [-.27,.27])box(0,.05,z,2.15,.1,.1,'dark');
      for(const x of [-.83,0,.83]){bar([x,0,-.27],[x,.8,-.27],.065,'steel');bar([x,0,.27],[x,.8,.27],.065,'steel');bar([x,.8,-.27],[x,.8,.27],.065,'steel');round(x,.66,-.27,.072,.1,'yellow');}
    } else if(kind==='crate') {
      for(let i=0;i<5;i++)box(-.34+i*.17,.065,0,.15,.09,.65,'wood');
      for(const x of [-.39,.39])for(const z of [-.28,.28])box(x,.32,z,.07,.6,.07,'woodLight');
      for(let i=0;i<3;i++){for(const z of [-.3,.3])box(0,.18+i*.18,z,.85,.12,.055,i%2?'woodLight':'wood');for(const x of [-.4,.4])box(x,.18+i*.18,0,.055,.12,.58,'wood');}
      for(let i=0;i<5;i++)add(leaf,(i%3-1)*.22,.41,Math.floor(i/3)*.24-.12,.24,.25,.24,'green');
    } else if(kind==='flower-pot') {
      // Individual clay panels become the fracture pieces; the dark soil seals the pot.
      for(let i=0;i<10;i++){const a=i*Math.PI/5,m=box(Math.sin(a)*.23,.27,Math.cos(a)*.23,.16,.48,.075,'clay');m.rotation.y=a;m.rotation.x=-.12;}
      round(0,.51,0,.59,.09,'clay');round(0,.56,0,.47,.025,'soil');plant(.58,.68);
    } else if(kind==='cone') {
      box(0,.045,0,.55,.09,.55,'dark');add(cone,0,.46,0,.44,.76,.44,'orange');
      add(cone,0,.46,0,.305,.17,.305,'cream');add(cone,0,.66,0,.185,.11,.185,'cream');
    } else if(kind==='stool') {
      // Two seat halves leave a real carry slot.
      for(const x of [-.115,.115])box(x,.45,0,.2,.06,.44,'red');
      for(const x of [-1,1])for(const z of [-1,1])bar([x*.22,.03,z*.22],[x*.16,.43,z*.16],.065,'red');
      for(const z of [-.2,.2])bar([-.2,.17,z],[.2,.17,z],.035,'red');
    } else if(kind==='wheelie-bin') {
      add(taper,0,.53,0,.6,.94,.65,'green');box(0,1.02,0,.62,.09,.72,'green');box(0,.66,.3,.21,.22,.025,'cream');
      bar([-.22,.95,-.37],[.22,.95,-.37],.055,'dark');
      for(const x of [-.25,.25]){const wheel=round(x,.14,-.25,.26,.09,'dark');wheel.rotation.z=Math.PI/2;}
    } else {
      for(const x of [-.24,.24]){bar([x,.15,.13],[x,1.2,-.15],.055,'blue');bar([x,1.2,-.15],[x,1.2,-.3],.065,'dark');const wheel=round(x,.16,.13,.3,.1,'dark');wheel.rotation.z=Math.PI/2;}
      for(const y of [.35,.65,.95])bar([-.24,y,.13-(y-.15)*.27],[.24,y,.13-(y-.15)*.27],.045,'blue');
      box(0,.1,.27,.62,.055,.36,'blue');
    }
    // Breakables retain their authored fragments. Other props use merged material draws.
    root.updateMatrixWorld(true);const bounds=new THREE.Box3().setFromObject(root);
    // Preserve authoring precision for collision, independent of merged Float32 vertices.
    root.userData.streetPropBounds={min:bounds.min.toArray(),max:bounds.max.toArray()};
    if(spec.behavior!=='breakable')for(const batch of batchRigidMeshes(root,{trackGeometry:keep}))batch.name='Street prop parts';
    return root;
  }
  const templates = new Map<StreetPropKind, THREE.Group>();
  return {
    create(kind:StreetPropKind) { let template=templates.get(kind);if(!template){template=build(kind);templates.set(kind,template);}return template.clone(true); },
    dispose(){geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());templates.clear();},
  };
}

/** Cosmetic, bounded floor physics. It never changes navigation or ballistic cover. */
export function createPropMotion(root: THREE.Group, kind: StreetPropKind) {
  const spec=streetPropSpec(kind), origin=root.position.clone(), rest=root.quaternion.clone();
  const parts=root.children.map((mesh,index)=>({mesh,position:mesh.position.clone(),rotation:mesh.quaternion.clone(),velocity:new THREE.Vector3(),spin:new THREE.Vector3(Math.sin(index*2.3)*4,Math.cos(index)*3,2)}));
  const velocity=new THREE.Vector3(), axis=new THREE.Vector3(), floorBounds=new THREE.Box3();let active=false,broken=false,age=0;
  const hit=(direction:THREE.Vector3)=>{
    if(spec.behavior==='fixed'||broken||active||!direction.toArray().every(Number.isFinite))return false;
    active=true;age=0;
    if(spec.behavior==='breakable') {
      broken=true;const local=direction.clone().applyQuaternion(root.getWorldQuaternion(new THREE.Quaternion()).invert());
      parts.forEach((p,i)=>p.velocity.set(local.x*1.2+Math.sin(i*2.4)*1.1,1.3+(i%4)*.35,local.z*1.2+Math.cos(i*2.4)*1.1));
    }
    else {velocity.set(direction.x*1.5,1.1,direction.z*1.5);axis.set(direction.z,0,-direction.x);if(axis.lengthSq()<.01)axis.set(1,0,0);axis.normalize();}
    return true;
  };
  return { root, hit, get broken(){return broken;},get active(){return active;},
    update(dt:number){
      if(!active||!Number.isFinite(dt)||dt<=0)return;
      const step=Math.min(dt,.05);age+=step;
      if(broken){
        parts.forEach(p=>{p.velocity.y-=9.8*step;p.mesh.position.addScaledVector(p.velocity,step);p.mesh.rotation.x+=p.spin.x*step;p.mesh.rotation.z+=p.spin.z*step;
          p.mesh.updateMatrix();const mesh=p.mesh as THREE.Mesh;if(!mesh.geometry.boundingBox)mesh.geometry.computeBoundingBox();floorBounds.copy(mesh.geometry.boundingBox!).applyMatrix4(mesh.matrix);
          if(floorBounds.min.y<.015){p.mesh.position.y+=.015-floorBounds.min.y;p.velocity.y=Math.abs(p.velocity.y)*.22;p.velocity.x*=.74;p.velocity.z*=.74;p.spin.multiplyScalar(.7);}
          p.mesh.position.x=THREE.MathUtils.clamp(p.mesh.position.x,-1.15,1.15);p.mesh.position.z=THREE.MathUtils.clamp(p.mesh.position.z,-1.15,1.15);
        });
      } else {
        velocity.y-=9.8*step;root.position.addScaledVector(velocity,step);
        // Pivot support rises as the body tips, keeping its lowest point above the floor.
        root.quaternion.copy(rest).premultiply(new THREE.Quaternion().setFromAxisAngle(axis,Math.min(Math.PI/2,age*3)));
        root.updateMatrixWorld(true);floorBounds.setFromObject(root);if(floorBounds.min.y<origin.y){root.position.y+=origin.y-floorBounds.min.y;velocity.y=Math.abs(velocity.y)*.18;velocity.x*=.85;velocity.z*=.85;}
        root.position.x=THREE.MathUtils.clamp(root.position.x,origin.x-.8,origin.x+.8);root.position.z=THREE.MathUtils.clamp(root.position.z,origin.z-.8,origin.z+.8);
      }
      if(age>2.5)active=false;
    },
    reset(){active=broken=false;age=0;root.position.copy(origin);root.quaternion.copy(rest);parts.forEach(p=>{p.mesh.position.copy(p.position);p.mesh.quaternion.copy(p.rotation);});},
  };
}
export type PropMotion = ReturnType<typeof createPropMotion>;
