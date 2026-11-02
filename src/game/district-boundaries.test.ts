import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { BOUNDARY_PROFILES, BOUNDARY_SIDES, boundaryFrame, boundaryOpenings, withDistrictBoundaries } from './district-boundaries';
import { REGION_IDS, getRegion, type RegionWorld } from './regions';
import { createNightLights } from './world-night-lights';
import { WORLD_GATEWAYS } from './world-zones';

function emptyWorld(): RegionWorld {
  return { scene: new THREE.Scene(), obstacles: [], stamps: [], car: new THREE.Group(), animate() {}, dispose: vi.fn() };
}
describe('authored map-edge scenery', () => {
  for (const id of REGION_IDS) it(`${id}: shows a physical inland limit, preserves crossings and leaves the coast open`, () => {
    const region = getRegion(id), original = emptyWorld(), world = withDistrictBoundaries(id, original, region.bounds);
    try {
      expect(world.obstacles).toBe(original.obstacles); expect(world.obstacles).toHaveLength(0);
      world.scene.updateMatrixWorld(true);
      const root = world.scene.getObjectByName('district-boundaries')!, ray = new THREE.Raycaster();
      const segments = root.userData.segments as { side: string; min: number; max: number; kind: string }[];
      expect(root.children.filter(child => child instanceof THREE.InstancedMesh).length).toBeLessThanOrEqual(16);
      for (const side of BOUNDARY_SIDES) {
        const { axis, direction, fixed } = boundaryFrame(region.bounds, side);
        if (BOUNDARY_PROFILES[id].open?.includes(side)) {
          expect(segments.filter(s => s.side === side)).toHaveLength(0); continue;
        }
        const normal = new THREE.Vector3(axis === 'x' ? direction : 0, 0, axis === 'z' ? direction : 0);
        for (const segment of segments.filter(s => s.side === side)) {
          const s = (segment.min + segment.max) / 2, x = axis === 'x' ? fixed : s, z = axis === 'z' ? fixed : s;
          const y = (region.bounds.groundHeight?.(x, z) ?? 0) + (BOUNDARY_PROFILES[id].style === 'industrial' ? .5 : 1.75);
          ray.set(new THREE.Vector3(x, y, z).addScaledVector(normal, -1), normal); ray.far = segment.kind === 'crossing' ? 10 : 4;
          const hits = ray.intersectObject(root, true);
          if (segment.kind === 'crossing') expect(hits, `${id}/${side} checkpoint gap`).toHaveLength(0);
          else {
            expect(hits.length, `${id}/${side} edge at ${s}`).toBeGreaterThan(0);
            expect(hits[0].distance, 'visible boundary meets the movement clamp').toBeCloseTo(1, 4);
          }
        }
      }
      for (const mesh of root.children) if (mesh.name.startsWith('boundary-ground-')) {
        const geometry = (mesh as THREE.Mesh).geometry, position = geometry.getAttribute('position'), normals = geometry.getAttribute('normal');
        for (let i = 0; i < position.count; i++) { expect(Number.isFinite(position.getX(i))).toBe(true); expect(normals.getY(i)).toBeGreaterThan(0); }
      }
    } finally { world.dispose(); }
  });
  it('extends Punggol’s coastal opening with water instead of exposing a gap in the land skirt', () => {
    const world = withDistrictBoundaries('punggol', emptyWorld(), getRegion('punggol').bounds);
    try { expect(world.scene.getObjectByName('boundary-water-south')).toBeTruthy(); } finally { world.dispose(); }
  });
  it('keeps the full width of every border and each nearby checkpoint opening', () => {
    for (const gateway of WORLD_GATEWAYS.filter(g => g.kind !== 'ferry')) {
      const { bounds } = getRegion(gateway.from);
      const nearest = [...BOUNDARY_SIDES].sort((a, b) => {
        const fa = boundaryFrame(bounds, a), fb = boundaryFrame(bounds, b);
        return Math.abs(gateway.position[fa.axis] - fa.fixed) - Math.abs(gateway.position[fb.axis] - fb.fixed);
      })[0];
      const frame = boundaryFrame(bounds, nearest);
      if (Math.abs(gateway.position[frame.axis] - frame.fixed) > 75 || BOUNDARY_PROFILES[gateway.from].open?.includes(nearest)) continue;
      const s = frame.axis === 'x' ? gateway.position.z : gateway.position.x;
      expect(boundaryOpenings(gateway.from, bounds, nearest).some(g => g.kind === 'crossing' && g.min <= s - 13 && g.max >= s + 13), gateway.id).toBe(true);
    }
  });
  it('keeps fences and rail sheds windowless while retaining normal night shading', () => {
    const region = getRegion('woodlands'), world = withDistrictBoundaries('woodlands', emptyWorld(), region.bounds);
    const night = createNightLights(world.scene, { roads: [], roadWidth: 16, bounds: region.bounds, obstacles: [] });
    try {
      world.scene.getObjectByName('district-boundaries')!.traverse(node => {
        if (node instanceof THREE.Mesh) expect(node.geometry.getAttribute('nightSpan')).toBeUndefined();
      });
    } finally { night.dispose(); world.dispose(); }
  });
  it('owns and disposes its shared resources once without disposing the scene kit', () => {
    const original = emptyWorld(), world = withDistrictBoundaries('queenstown', original, getRegion('queenstown').bounds);
    const root = world.scene.getObjectByName('district-boundaries')!, geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
    root.traverse(node => { if (node instanceof THREE.Mesh) { geometries.add(node.geometry); if (!Array.isArray(node.material)) materials.add(node.material); } });
    const spies = [...geometries, ...materials].map(resource => vi.spyOn(resource, 'dispose'));
    world.dispose(); expect(original.dispose).toHaveBeenCalledOnce(); expect(root.parent).toBeNull();
    for (const spy of spies) expect(spy).toHaveBeenCalledOnce();
  });
});
