import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { auditMapSurfaces } from './map-surface-audit';
import { withSurfaceOwnership } from './surface-ownership';
import { withGroundCover } from './ground-cover';
import { getRegion, type RegionWorld } from './regions';

function fixture() {
  const scene = new THREE.Scene(), geometry = new THREE.BoxGeometry(1,1,1);
  const wall = new THREE.MeshStandardMaterial({color:'#888888'}), trim = new THREE.MeshStandardMaterial({color:'#ccbb99'});
  const world: RegionWorld = { scene, obstacles: [], car: new THREE.Group(), stamps: [], animate() {}, dispose() { geometry.dispose();wall.dispose();trim.dispose(); } };
  return { world, geometry, wall, trim };
}

describe('one owner for coincident map surfaces', () => {
  it('cuts only the shared wall face, preserves adjoining cover and leaves moving groups intact', () => {
    const {world,geometry,wall,trim}=fixture();
    const body=new THREE.Mesh(geometry,wall);body.scale.set(12,6,4);body.position.y=3;world.scene.add(body);
    const panel=new THREE.Mesh(geometry,trim);panel.scale.set(4,2,1);panel.position.set(0,3,1.5);world.scene.add(panel);
    const moving=new THREE.Group(),prop=new THREE.Mesh(geometry,trim);prop.position.set(0,3,1.5);moving.add(prop);world.scene.add(moving);
    prop.updateMatrix();const transform=prop.matrix.clone(), original=prop.geometry;
    expect(auditMapSurfaces(world.scene).conflicts.length).toBeGreaterThan(0);
    withSurfaceOwnership(world);world.scene.updateMatrixWorld(true);
    try {
      expect(auditMapSurfaces(world.scene).conflicts).toEqual([]);
      expect(prop.geometry).toBe(original);expect(prop.matrix.equals(transform)).toBe(true);
      moving.visible=false;
      for(const x of [-5,-1.1,0,1.1,5]) {
        const ray=new THREE.Raycaster(new THREE.Vector3(x,3.2,5),new THREE.Vector3(0,0,-1),0,4);
        const hits=ray.intersectObjects([body,panel]);
        expect(hits).toHaveLength(1);expect(hits[0].point.z).toBeCloseTo(2);
        expect((hits[0].object as THREE.Mesh).material).toBe(Math.abs(x)<2?trim:wall);
      }
    } finally {world.dispose();}
  });

  it('retains instancing, authored window tags, untouched transforms and resource ownership', () => {
    const {world,geometry,wall,trim}=fixture();trim.userData.nightWindow=true;
    const bodies=new THREE.InstancedMesh(geometry,wall,2),panels=new THREE.InstancedMesh(geometry,trim,2);
    for(let i=0;i<2;i++) {
      bodies.setMatrixAt(i,new THREE.Matrix4().makeScale(12,6,4).setPosition(i*20,3,0));
      panels.setMatrixAt(i,new THREE.Matrix4().makeScale(4,2,1).setPosition(i*20,3,1.5));
    }
    world.scene.add(bodies,panels);withSurfaceOwnership(world);world.scene.updateMatrixWorld(true);
    const variants: THREE.BufferGeometry[]=[];
    world.scene.traverse(object=>{if(object instanceof THREE.InstancedMesh && object.geometry!==geometry) {expect(object.count).toBe(2);variants.push(object.geometry);}});
    const dispose=vi.fn();variants.forEach(g=>g.addEventListener('dispose',dispose));
    expect(variants.length).toBeGreaterThan(0);expect(variants.length).toBeLessThanOrEqual(2);
    expect(panels.material.userData.nightWindow).toBe(true);
    expect(geometry.userData.partitionedFaces).toBeUndefined();
    expect(auditMapSurfaces(world.scene).conflicts).toEqual([]);
    bodies.dispose();panels.dispose();world.dispose();expect(dispose).toHaveBeenCalledTimes(variants.length);
  });

  it('uses a tilted roof end outline and keeps interpolated vertex data finite',()=>{
    const {world,geometry,wall,trim}=fixture();
    const body=new THREE.Mesh(geometry,wall);body.scale.set(12,6,4);body.position.y=3;
    const roof=new THREE.Mesh(geometry,trim);roof.scale.set(1,2,6);roof.rotation.x=.7;roof.position.set(5.5,3,0);
    world.scene.add(body,roof);
    expect(auditMapSurfaces(world.scene).conflicts.length).toBeGreaterThan(0);
    withSurfaceOwnership(world);
    try {
      expect(auditMapSurfaces(world.scene).conflicts).toEqual([]);
      for(const mesh of [body,roof])for(const name of ['position','normal','uv'])expect([...mesh.geometry.getAttribute(name).array].every(Number.isFinite)).toBe(true);
    }finally{world.dispose();}
  });

  it('removes hidden ground tops at different normalized heights without holes or raised floors', () => {
    const {world,geometry,wall,trim}=fixture();
    const base=new THREE.Mesh(geometry,wall);base.scale.set(80,1,80);base.position.y=-.6;
    const lawn=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color:'#89a76a'}));lawn.scale.set(60,.35,60);lawn.position.y=.18;
    const path=new THREE.Mesh(geometry,trim);path.scale.set(8,.2,70);path.position.y=.1;
    world.scene.add(base,lawn,path);
    withGroundCover(world,{minX:-40,maxX:40,minZ:-40,maxZ:40});world.scene.updateMatrixWorld(true);
    try {
      for(const [x,z] of [[1,3],[15,2],[35,2],[1,33]]) {
        const ray=new THREE.Raycaster(new THREE.Vector3(x,1,z),new THREE.Vector3(0,-1,0),0,2);
        const hits=ray.intersectObject(world.scene,true).filter(h=>h.face!.normal.y>.99);
        expect(hits).toHaveLength(1);expect(hits[0].point.y).toBeLessThanOrEqual(.025);
        expect(hits[0].point.y).toBeCloseTo(world.scene.userData.groundCover.sample(x,z).y);
      }
    }finally{world.dispose();lawn.material.dispose();}
  });

  it('does not report adjacent triangle edges as an overlapping surface',()=>{
    const {world,wall,trim}=fixture();
    const a=new THREE.BufferGeometry(),b=new THREE.BufferGeometry();
    a.setAttribute('position',new THREE.Float32BufferAttribute([0,1,0,0,1,4,4,1,0],3));
    b.setAttribute('position',new THREE.Float32BufferAttribute([4,1,0,0,1,4,4,1,4],3));
    world.scene.add(new THREE.Mesh(a,wall),new THREE.Mesh(b,trim));
    expect(auditMapSurfaces(world.scene).conflicts).toEqual([]);
    world.dispose();a.dispose();b.dispose();
  });
});

for(const id of ['sentosa','yishun','changi'] as const) it(`${id}: no exposed coplanar axis faces in actual registered geometry`,()=>{
  const world=getRegion(id).build();world.car.visible=false;world.stamps.forEach(s=>{s.visible=false;});
  try {expect(auditMapSurfaces(world.scene).conflicts).toEqual([]);}finally{world.dispose();}
},30000);
