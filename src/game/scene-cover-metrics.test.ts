import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { analyseSceneCover } from './scene-cover-metrics';

const bounds = { minX: -12, maxX: 12, minZ: -12, maxZ: 12 };
function box(scene: THREE.Scene, x: number, y: number, z: number, w: number, h: number, d: number, visual = false) {
  const material = new THREE.MeshBasicMaterial(); material.userData.visualCover = visual;
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);
  mesh.position.set(x,y,z); scene.add(mesh); return mesh;
}
const dispose = (scene: THREE.Scene) => scene.traverse(node => {
  if (node instanceof THREE.Mesh) { node.geometry.dispose(); (node.material as THREE.Material).dispose(); }
});

describe('terrain-aware solid and visual proximity', () => {
  it('counts traversable concealment at zero and preserves one population across cover types and poses', () => {
    const scene = new THREE.Scene();
    box(scene,0,.7,0,6,1.4,6,true);
    try {
      const report = analyseSceneCover(scene,bounds,[]).measure();
      expect(report.crouch.solid!.mean).toBe(Infinity);
      expect(report.crouch.visual!.mean).toBeGreaterThan(0);
      expect(report.crouch.visual!.within2m).toBeGreaterThan(0);
      expect(report.stand.visual!.mean).toBe(Infinity);
      expect(report.prone.visual!.mean).toBe(report.crouch.visual!.mean);
      expect(report.stand.solid!.samples).toBe(report.prone.visual!.samples);
    } finally { dispose(scene); }
  });

  it('retains thin walls between lattice centres and cover outside a sector', () => {
    const scene = new THREE.Scene();
    box(scene,1,1.5,0,.15,3,20);
    try {
      const report = analyseSceneCover(scene,bounds,[]);
      const sector = report.measure({minX:4,maxX:10,minZ:-6,maxZ:6}).crouch;
      expect(sector.solid!.mean).toBeGreaterThan(0);
      expect(sector.solid!.max).toBeLessThanOrEqual(10);
      expect(sector.visual).toEqual(sector.solid);
    } finally { dispose(scene); }
  });

  it('does not turn an overhead canopy into cover and returns null for empty sampling areas', () => {
    const scene = new THREE.Scene();
    box(scene,0,5,0,20,.3,20,true);
    try {
      const analysis = analyseSceneCover(scene,bounds,[]);
      expect(analysis.measure().stand.visual!.mean).toBe(Infinity);
      expect(analysis.measure({minX:100,maxX:110,minZ:100,maxZ:110}).prone.solid).toBeNull();
    } finally { dispose(scene); }
  });

  it('uses local terrain height: a low wall below a crest does not protect someone on it', () => {
    const scene = new THREE.Scene();
    box(scene,-6,.7,0,2,1.4,8);
    scene.userData.walkSurfaces = [{id:'earth',routeId:'earth',minX:0,maxX:12,minZ:-12,maxZ:12,axis:'x',startHeight:3,endHeight:3,solidBelow:true}];
    try {
      const report = analyseSceneCover(scene,bounds,[]).measure({minX:4,maxX:10,minZ:-8,maxZ:8});
      expect(report.crouch.solid!.mean).toBe(Infinity);
    } finally { dispose(scene); }
  });
});
