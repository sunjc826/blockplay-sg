import { treePart } from './tree-wind';
import * as THREE from 'three';
import { PULAU_UBIN_SECTORS } from '../data/region-sectors';
import { PULAU_UBIN_STAMPS } from '../data/region-stamps';
import { createSceneKit } from './scene-kit';
import { insideFootprint, overlapsObstacle } from './region-collision';
import { markWater } from './water';
import { withVerticalPlaces } from './vertical-places';
import { bumboat } from './bumboat';

export const PULAU_UBIN_SPAWN = { x: 0, z: 145, yaw: 0 };
export const PULAU_UBIN_BOUNDS = { minX: -270, maxX: 270, minZ: -220, maxZ: 225 };
const SHORE = [{ x: -245, z: -100 }, { x: -200, z: -180 }, { x: 130, z: -180 }, { x: 245, z: -90 }, { x: 245, z: 80 }, { x: 185, z: 155 }, { x: -170, z: 155 }, { x: -245, z: 75 }];
export const PULAU_UBIN_MAP_ROADS = [
  { points: [{ x: 0, z: 205 }, { x: 0, z: 115 }, { x: -40, z: 65 }, { x: -50, z: 0 }, { x: -35, z: -115 }, { x: 60, z: -140 }, { x: 155, z: -100 }, { x: 190, z: -20 }, { x: 185, z: 55 }, { x: 130, z: 55 }, { x: 115, z: 100 }, { x: 100, z: 145 }, { x: 0, z: 145 }, { x: 0, z: 115 }] },
  { points: [{ x: -50, z: 0 }, { x: -165, z: 0 }, { x: -195, z: -55 }] },
];
const distanceToRoad = (x: number, z: number) => Math.min(...PULAU_UBIN_MAP_ROADS.flatMap(r => r.points.slice(1).map((b, i) => {
  const a = r.points[i], dx = b.x-a.x, dz = b.z-a.z, t = Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz)));
  return Math.hypot(x-a.x-t*dx,z-a.z-t*dz);
})));

/** A compressed island, not a road grid: a village/jetty, quarry, forest loop
 * and wetland boardwalk. Named places are stylised counterparts, not surveys. */
export function buildPulauUbinScene() {
  const k = createSceneKit({ background: '#cedfdc', fogNear: 330, fogFar: 1100, shadow: { extent: 285, far: 720 }, module: true });
  const { scene, box, cylinder, blob, solid, mat, sign, tree } = k;
  const sea = mat('#568f98', .4), quarry = mat('#4f807b', .45), mud = mat('#7c8e70'); markWater(sea, quarry, mud);
  const grass = mat('#91a476'), trail = mat('#b6a17b'), pale = mat('#e4d9bf'), wood = mat('#80604b'), dark = mat('#3d4945');
  const leaf = mat('#456d42'), fern = mat('#627e4b'), granite = mat('#9c9f91'), roof = mat('#8c6a53'), glass = mat('#769b9f', .3, .2);
  const villagePane = mat('#5b7773'); villagePane.userData.nightWindow = true;
  box(0, -.25, 0, 1000, .2, 850, sea);
  const shape = new THREE.Shape(); SHORE.forEach((p, i) => i ? shape.lineTo(p.x, -p.z) : shape.moveTo(p.x, -p.z)); shape.closePath();
  const island = new THREE.Mesh(k.geo(new THREE.ShapeGeometry(shape)), grass); island.rotation.x = -Math.PI/2; island.position.y = -.04; island.receiveShadow = true; scene.add(island);
  // Water outside the convex island polygon, clipped into convex pieces. The
  // south spans leave one real gap for the 16 m wide village jetty.
  for (const [x,z,w,d] of [[-267,0,44,500],[267,0,44,500],[0,-210,600,60],[-145,195,274,80],[145,195,274,80]] as const) {
    k.obstacles.push({ minX:x-w/2,maxX:x+w/2,minZ:z-d/2,maxZ:z+d/2,maxY:.2 });
  }
  k.obstacles.push({minX:-8,maxX:8,minZ:211,maxZ:240,maxY:.2});
  const corners = [
    [{x:-245,z:-180},{x:-200,z:-180},{x:-245,z:-100}],
    [{x:130,z:-180},{x:245,z:-180},{x:245,z:-90}],
    [{x:245,z:80},{x:245,z:155},{x:185,z:155}],
    [{x:-245,z:75},{x:-170,z:155},{x:-245,z:155}],
  ];
  for (const footprint of corners) k.obstacles.push({ minX:Math.min(...footprint.map(p=>p.x)),maxX:Math.max(...footprint.map(p=>p.x)),minZ:Math.min(...footprint.map(p=>p.z)),maxZ:Math.max(...footprint.map(p=>p.z)),maxY:.2,footprint });
  for (const road of PULAU_UBIN_MAP_ROADS) for(let i=1;i<road.points.length;i++) {
    const a=road.points[i-1],b=road.points[i],dx=b.x-a.x,dz=b.z-a.z;
    const path=box((a.x+b.x)/2,.025,(a.z+b.z)/2,10,.12,Math.hypot(dx,dz)+1,trail); path.rotation.y=Math.atan2(dx,dz);
  }
  // Timber landing reaches south into open water. Railings stop before the
  // boarding point and do not seal either arrival or its 12 m walk inland.
  box(0,.025,182.5,16,.12,55,wood);
  for(const x of [-7,7]) for(const z of [160,174,188]) {
    box(x,1,z,.25,2,.25,pale); solid(x,z,.3,.3);
    if(z<188) box(x,1.7,z+7,.18,.18,14,wood);
  }
  const ferry=bumboat(k,18,197); sign('PULAU UBIN / CHANGI BUMBOAT',0,4.6,170,35,2,'#376961');
  sign('RETURN TO CHANGI · BOARD ON FOOT',0,3.6,205,34,1.7,'#376961');

  function kampong(x:number,z:number,color:string,width=26) {
    const wall=mat(color); box(x,3.1,z,width,5,16,wall,scene,true); solid(x,z,width,16);
    for(const dx of [-width/2+2,0,width/2-2]) {
      box(x+dx,.4,z,1,.8,12,granite);
      box(x+dx,3.2,z+8.2,3.2,2.2,.3,villagePane);
      for(const y of [2.5,3,3.5,4]) box(x+dx,y,z+8.45,3.2,.12,.1,pale);
    }
    for(const side of [-1,1]) { const slope=box(x,6.5,z+side*4.5,width+4,.4,10,roof,scene,true);slope.rotation.x=side*.25; }
    box(x,2.8,z+12,width+3,.25,8,roof);
    for(const dx of [-width/2,width/2]) { cylinder(x+dx,1.4,z+14,.18,2.8,wood);solid(x+dx,z+14,.4,.4); }
  }
  kampong(-52,112,'#b5a181',30);kampong(44,112,'#97a99b',30);kampong(-64,72,'#b5ae93');kampong(54,72,'#c2b093');
  sign('UBIN VILLAGE',0,5,123,30,2,'#496c55');sign('KOPI & PROVISIONS',-52,2.9,128,27,1.5,'#6b654b');
  // Bicycle racks are scenery; the shipped drive mode still uses its car.
  const wheelGeo=k.geo(new THREE.TorusGeometry(.75,.09,5,12));
  for(const x of [30,35,40,45]) {
    for(const z of [91,94]) {const wheel=new THREE.Mesh(wheelGeo,dark);wheel.rotation.y=Math.PI/2;wheel.position.set(x,.85,z);scene.add(wheel);}
    k.beam(new THREE.Vector3(x,1.2,91),new THREE.Vector3(x,1.2,94),.08,pale);
    box(x,1.75,92.2,.6,.15,.8,wood);
  }
  sign('FOREST LOOP',-38,3.8,47,22,1.6,'#496c55');

  box(-107.5,.035,-95,85,.2,70,quarry);
  k.obstacles.push({minX:-150,maxX:-65,minZ:-130,maxZ:-60,maxY:.2});
  // Broken granite outcrops border the quarry; clear gaps retain shore access.
  for(let i=0;i<14;i++) { const x=-145+i*6;blob(x,2.2,-135,4,3+(i%3),4,granite);k.obstacles.push({minX:x-3,maxX:x+3,minZ:-138,maxZ:-132,maxY:5}); }
  for(const z of [-120,-95,-70]) {blob(-156,2,z,4,3.5,5,granite);k.obstacles.push({minX:-159,maxX:-153,minZ:z-4,maxZ:z+4,maxY:5});}
  sign('QUARRY / LOOKOUT TRAIL',-180,4,-18,31,1.6,'#496c55');
  // The wetland pool has accessible banks and a complete timber circuit.
  box(170,.035,90,50,.2,50,mud);k.obstacles.push({minX:145,maxX:195,minZ:65,maxZ:115,maxY:.2});
  for(const z of [55,125]) box(170,.1,z,78,.18,5,wood);
  for(const x of [135,205]) box(x,.1,90,5,.18,70,wood);
  for(const x of [135,205]) for(const z of [55,75,95,115,125]) {
    // Low boardwalk edging is visual; it does not invent a solid wall across a path.
    box(x+3, .55,z,.15,1.1,.15,pale);
  }
  for(const x of [155,170,185]) for(const z of [80,105]) {
    treePart(cylinder(x,2,z,.4,4,wood),x,0,z,5);treePart(blob(x,5,z,5,3,5,leaf),x,0,z,5,1);
    for(const side of [-1,1]) k.beam(new THREE.Vector3(x,2,z),new THREE.Vector3(x+side*2,.1,z+2),.12,wood);
  }
  kampong(214,20,'#ded9c3',24);
  for(const y of [1.8,3.7]) box(214,y,28.45,22,.2,.2,wood);
  sign('CHEK JAWA / VISITOR COTTAGE',214,4.4,34,37,1.7,'#496c55');
  sign('WETLAND BOARDWALK',170,3.2,49,31,1.5,'#496c55');

  // Deterministic forest placement leaves the complete road network, authored
  // stops, range, stairs and house access clear. It is not a navigation grid.
  const clearings=[...PULAU_UBIN_STAMPS,...PULAU_UBIN_SECTORS.flatMap(s=>[...s.anchors,...(s.foodAnchors??[])]),{x:25,z:112},{x:-35,z:130},{x:170,z:55},{x:110,z:-120},{x:-185,z:55},{x:-150,z:105},{x:70,z:145},{x:130,z:10}];
  for(let x=-230;x<=230;x+=19) for(let z=-165;z<=145;z+=19) {
    if(!insideFootprint(SHORE,x,z)||distanceToRoad(x,z)<13||clearings.some(p=>Math.hypot(x-p.x,z-p.z)<10))continue;
    if(x>40&&x<135&&z>-85&&z<35 || x<-172&&z<2&&z>-133 || x>130&&z>0 || Math.abs(x)<95&&z>45)continue;
    if(k.obstacles.some(o=>overlapsObstacle(o,x,z,4)))continue;
    const hash=Math.abs(x*17+z*31);tree(x,z,7+hash%6,wood,hash%3?leaf:fern);
  }
  for(const x of [-230,-210,-190,-170,-150]) for(const z of [35,65,95]) {
    if(k.obstacles.some(o=>overlapsObstacle(o,x,z,4))||clearings.some(p=>Math.hypot(x-p.x,z-p.z)<10)||distanceToRoad(x,z)<13)continue;
    tree(x,z,8,wood,leaf);
  }
  const car=k.car(mat('#9aaa87'),glass,pale,dark),stamps=k.stampRings(PULAU_UBIN_STAMPS,mat('#eda047'));
  scene.userData.referenceFeatures=[];
  scene.userData.districtFeatures=['irregular-island-shore','bumboat-landing','kampong-village','dirt-road-loop','granite-quarry','connected-quarry-lookout','mangrove-roots','wetland-boardwalk','visitor-cottage'];
  return withVerticalPlaces(k.finish({car,stamps,animate:time=>ferry.animate(time)}),[{
    id:'ubin-quarry-lookout',name:'Quarry trail lookout',note:'Authored forest lookout beside a compressed quarry, not a surveyed Bukit Puaka trail.',
    floors:[{id:'lower-landing',x:-205,z:-55,y:3.2,width:20,depth:16,color:'#9a8b6b'},{id:'lookout',x:-195,z:-105,y:6.4,width:32,depth:24,color:'#9a8b6b'}],
    connections:[{id:'lower-stairs',from:{x:-205,z:-12,y:0},to:{x:-205,z:-47,y:3.2},width:5,stairs:true},{id:'upper-stairs',from:{x:-205,z:-63,y:3.2},to:{x:-205,z:-93,y:6.4},width:5,stairs:true}],
    fixtures:[{x:-184,z:-105,y:7,width:2,height:1.2,depth:6,color:'#80604b'}],
  }]);
}
