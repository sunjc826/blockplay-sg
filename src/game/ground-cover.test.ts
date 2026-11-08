import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { createGrass, withGroundCover } from './ground-cover';
import { getRegion, REGION_IDS } from './regions';
import { getFpsDistrict } from './fps-districts';
import { createRainSurface } from './rain-effects';
import { createSunShadows } from './fps-sun-shadows';
import type { RegionWorld } from './regions';
import { createVerticalMovement } from './vertical-movement';
import { getWalkSurfaces, getTraversalObstacles } from './vertical-routes';
import { markWater } from './water';

const bounds = { minX: -100, maxX: 100, minZ: -100, maxZ: 100 };
function fixture() {
  const scene = new THREE.Scene(), geometry = new THREE.BoxGeometry(1,1,1), material = new THREE.MeshStandardMaterial({ color: '#89a76a' });
  const base = new THREE.Mesh(geometry, material); base.position.y=-.6; base.scale.set(200,1,200); scene.add(base);
  const lawn = new THREE.InstancedMesh(geometry,material,2);
  lawn.setMatrixAt(0,new THREE.Matrix4().compose(new THREE.Vector3(0,.18,0),new THREE.Quaternion(),new THREE.Vector3(40,.35,40)));
  lawn.setMatrixAt(1,new THREE.Matrix4().compose(new THREE.Vector3(50,10,0),new THREE.Quaternion(),new THREE.Vector3(20,.35,20)));
  scene.add(lawn);
  const world:RegionWorld={scene,obstacles:[],car:new THREE.Group(),stamps:[],animate(){},dispose(){geometry.dispose();material.dispose();lawn.dispose();}};
  return {world,lawn};
}

describe('shared soil and grass',()=>{
  it('keeps grass off paving and water, and preserves a supported raised shore',()=>{
    const {world}=fixture(),geometry=new THREE.BoxGeometry(1,1,1);
    const paving=new THREE.MeshStandardMaterial({color:'#666666'}),water=markWater(new THREE.MeshStandardMaterial({color:'#448899'}));
    const road=new THREE.Mesh(geometry,paving);road.scale.set(40,.12,6);world.scene.add(road);
    const pond=new THREE.Mesh(geometry,water);pond.scale.set(12,.4,12);pond.position.x=25;world.scene.add(pond);
    const shore=new THREE.Mesh(geometry,paving);shore.scale.set(8,.34,8);shore.position.set(75,.16,0);world.scene.add(shore);
    world.scene.userData.walkSurfaces=[{id:'shore',routeId:'shore',axis:'x',minX:71,maxX:79,minZ:-4,maxZ:4,startHeight:.33,endHeight:.33}];
    withGroundCover(world,bounds);
    try{
      const cover=world.scene.userData.groundCover;
      expect(cover.sample(0,0).y).toBeCloseTo(.005);expect(cover.sample(0,0).grass).toBe(false);
      expect(cover.sample(0,10)).toEqual({y:0,grass:true});
      expect(cover.sample(25,0)).toEqual({y:.2,grass:false});
      expect(cover.wetGround(25,0)).toBeNull();expect(cover.wetGround(0,10)).toBeNull();expect(cover.wetGround(0,0)).toBeCloseTo(.005);
      expect(shore.position.y).toBe(.16);expect(cover.sample(75,0).y).toBeCloseTo(.33);
    }finally{world.dispose();geometry.dispose();paving.dispose();water.dispose();}
  });
  it('normalizes only low ground instances, leaves roof gardens and authored walkways alone, and owns its resources',()=>{
    const {world,lawn}=fixture();
    world.scene.userData.walkSurfaces=[{id:'deck',routeId:'deck',axis:'x',minX:70,maxX:80,minZ:-10,maxZ:10,startHeight:4,endHeight:4}];
    withGroundCover(world,bounds);
    // Low caps now have real cut geometry; the unmodified roof garden remains
    // in the original instance batch at the same transform.
    const matrix=new THREE.Matrix4();expect(lawn.count).toBe(1);
    lawn.getMatrixAt(0,matrix);expect(matrix.elements[13]).toBe(10);
    const ray=new THREE.Raycaster(new THREE.Vector3(0,1,0),new THREE.Vector3(0,-1,0),0,2);
    world.scene.updateMatrixWorld(true);
    expect(ray.intersectObject(world.scene,true)[0].point.y).toBeCloseTo(0);
    const cover=world.scene.userData.groundCover;
    expect(cover.sample(0,0)).toEqual({y:0,grass:true});
    expect(cover.sample(75,0)).toEqual({y:4,grass:false});
    const camera=new THREE.PerspectiveCamera();camera.position.set(0,1.75,0);
    cover.grass.update(camera,1,false);expect(cover.grass.mesh.count).toBeGreaterThan(100);
    const disposeGeometry=vi.fn(),disposeMaterial=vi.fn();cover.grass.mesh.geometry.addEventListener('dispose',disposeGeometry);cover.grass.mesh.material.addEventListener('dispose',disposeMaterial);
    world.dispose();expect(disposeGeometry).toHaveBeenCalledOnce();expect(disposeMaterial).toHaveBeenCalledOnce();expect(cover.grass.mesh.parent).toBeNull();
  });

  it('bounds density, follows world cells, excludes disallowed ground, and never casts even after the sun scan',()=>{
    const scene=new THREE.Scene();scene.add(new THREE.DirectionalLight());
    const grass=createGrass(scene,bounds,(x)=>x<0?2:null),camera=new THREE.PerspectiveCamera();camera.position.set(-20,3.75,0);
    try{
      grass.update(camera,1,false);expect(grass.mesh.count).toBeGreaterThan(500);expect(grass.mesh.count).toBeLessThanOrEqual(4096);
      const version=grass.mesh.instanceMatrix.version;grass.update(camera,2,false);expect(grass.mesh.instanceMatrix.version).toBe(version);
      const matrix=new THREE.Matrix4();for(let i=0;i<grass.mesh.count;i++){grass.mesh.getMatrixAt(i,matrix);expect(matrix.elements[12]+grass.mesh.position.x).toBeLessThan(0);expect(matrix.elements[13]).toBeCloseTo(1.995);}
      grass.update(camera,3,false,true);expect(grass.mesh.count).toBeLessThanOrEqual(1536);
      grass.update(camera,4,true);expect(grass.mesh.count).toBeLessThanOrEqual(384);
      camera.position.x=-28;grass.update(camera,5,true);expect(grass.mesh.position.x).toBe(-28);
      const renderer={getContext:()=>({getExtension:()=>null,getParameter:()=> 'hardware GPU',RENDERER:0}),shadowMap:{},capabilities:{maxTextureSize:4096}} as unknown as THREE.WebGLRenderer;
      const shadows=createSunShadows(renderer,scene);shadows.update(true,camera,{x:1,y:1,z:1},1);
      expect(grass.mesh.castShadow).toBe(false);expect(grass.mesh.receiveShadow).toBe(true);shadows.dispose();
      expect(new THREE.Raycaster(new THREE.Vector3(-20,5,0),new THREE.Vector3(0,-1,0)).intersectObject(grass.mesh)).toEqual([]);
    }finally{grass.dispose();}
  });
});

for(const id of REGION_IDS) it(`${id}: range ground, wheels, skids, rain and grass share the corrected surface`,()=>{
  const region=getRegion(id),world=region.build(),d=getFpsDistrict(id),ground=region.bounds.groundHeight??(()=>0);
  try{
    world.stamps.forEach(s=>s.visible=false);world.scene.updateMatrixWorld(true);
    const cover=world.scene.userData.groundCover;
    expect(cover.patches).toBeGreaterThan(0);
    const rain=createRainSurface(world.obstacles,world.scene.userData.rainGroundHeight);
    const movement=createVerticalMovement({bounds:region.bounds,obstacles:world.obstacles,surfaces:getWalkSurfaces(world.scene),traversalObstacles:getTraversalObstacles(world.scene)});
    const points=[d.spawn,...Object.values(d.vehicles),...d.targets];
    for(let dx=-9;dx<=9;dx+=3)for(let dz=-9;dz<=9;dz+=3)points.push({...d.spawn,x:d.spawn.x+dx,z:d.spawn.z+dz});
    for(const p of points){
      const y=ground(p.x,p.z),ray=new THREE.Raycaster(new THREE.Vector3(p.x,y+1,p.z),new THREE.Vector3(0,-1,0),0,2);
      if (!movement.canOccupy(p.x,y,p.z)) continue;
      const hit=ray.intersectObject(world.scene,true).find(h=>h.face&&h.face.normal.clone().transformDirection(h.object.matrixWorld).y>.2);
      expect(hit,`${p.x},${p.z} rendered ground`).toBeDefined();
      expect(hit!.point.y-y,`${p.x},${p.z} height`).toBeLessThanOrEqual(.025);
      expect(rain(p.x,p.z)+.025,`${p.x},${p.z} rain`).toBeGreaterThan(hit!.point.y);
    }
    const camera=new THREE.PerspectiveCamera();camera.position.set(d.spawn.x,1.75,d.spawn.z);cover.grass.update(camera,1,false);
    expect(cover.grass.mesh.castShadow).toBe(false);
    // Paved ranges may have no grass immediately beside the start; the mask
    // must still identify real soil elsewhere in every district.
    let soil=0;
    for(let x=region.bounds.minX+5;x<region.bounds.maxX;x+=10)for(let z=region.bounds.minZ+5;z<region.bounds.maxZ;z+=10)if(cover.sample(x,z).grass)soil++;
    expect(soil).toBeGreaterThan(0);
  }finally{world.dispose();}
},30000);

it('High/Ultra grass extends in two LODs, increases close density, and reuses sampled ground while moving',()=>{
  const floor=vi.fn(()=>0),grass=createGrass(new THREE.Scene(),{minX:-200,maxX:200,minZ:-200,maxZ:200},floor),camera=new THREE.PerspectiveCamera();
  camera.position.y=1.7;
  try{
    grass.update(camera,0,false);const low=grass.mesh.count;
    grass.update(camera,0,false,false,'high');const high=grass.mesh.count;
    expect(high).toBeGreaterThan(low*2);expect(grass.radius).toBe(60);expect(grass.farMesh.count).toBeGreaterThan(4000);
    expect(grass.farMesh.geometry.attributes.position.count).toBeLessThan(grass.mesh.geometry.attributes.position.count);
    grass.update(camera,0,false,false,'ultra');expect(grass.radius).toBe(100);expect(grass.mesh.count).toBeGreaterThan(high*1.8);
    const calls=floor.mock.calls.length;camera.position.x=4;grass.update(camera,1,false,false,'ultra');
    expect(floor.mock.calls.length-calls).toBeLessThan(4000);
    grass.update(camera,2,true,false,'ultra');expect(grass.radius).toBe(11);expect(grass.farMesh.count).toBe(0);
    expect(grass.count).toBeLessThanOrEqual(384);
  }finally{grass.dispose();}
});
