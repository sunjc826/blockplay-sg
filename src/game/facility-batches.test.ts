import * as THREE from 'three';
import { expect, it, vi } from 'vitest';
import { createFacilityVisuals } from './facility-visuals';
import { createFacilities, type FacilitySite, type FacilityState } from './facilities';
import { sceneFlightObstacles } from './flight-obstacles';
import { firstVisibleHit } from './fps-raycast';
import { createSceneCover } from './scene-cover';
import { PLAYER_FACTION } from './arena-factions';

const sites: FacilitySite[] = ['command', 'supply', 'garage', 'helipad'].map((kind, i) => ({
  id: kind, name: kind, kind: kind as FacilitySite['kind'], x: i * 13, y: 2, z: -3,
  initialOwner: PLAYER_FACTION, deployment: { x: i * 13 + 6, z: -3, yaw: 0 },
}));
const roots = (scene: THREE.Scene) => scene.children.filter(o => o.userData.facilityId && o.children.some(c => c instanceof THREE.Mesh && c.material instanceof THREE.MeshStandardMaterial));
const rounded = (n: number) => Math.round(n * 10000) / 10000;
const bounds = (scene: THREE.Scene) => sceneFlightObstacles(scene).map(b => Object.values(b).map(n => rounded(n!)).join(',')).sort();
// Compare actual visible triangles, colors, normals and UVs independently of draw grouping.
function triangles(scene: THREE.Scene) {
  scene.updateMatrixWorld(true); const result: string[] = [];
  scene.traverseVisible(o => {
    if (!(o instanceof THREE.Mesh)) return;
    const g = o.geometry, m = o.material as THREE.MeshStandardMaterial;
    const count = g.index?.count ?? g.attributes.position.count, normalMatrix = new THREE.Matrix3().getNormalMatrix(o.matrixWorld);
    for (let i = 0; i < count; i += 3) {
      const values: unknown[] = [m.type, m.color.getHex(), m.emissive?.getHex(), m.transparent, m.opacity, m.side];
      for (let j = i; j < i + 3; j++) {
        const at = g.index?.getX(j) ?? j;
        values.push(...new THREE.Vector3().fromBufferAttribute(g.attributes.position, at).applyMatrix4(o.matrixWorld).toArray().map(rounded));
        values.push(...new THREE.Vector3().fromBufferAttribute(g.attributes.normal, at).applyNormalMatrix(normalMatrix).toArray().map(rounded));
        values.push(...new THREE.Vector2().fromBufferAttribute(g.attributes.uv, at).toArray().map(rounded));
      }
      result.push(JSON.stringify(values));
    }
  });
  return result.sort();
}

it('batches fixed facility bodies while retaining every visible triangle and individual flight volume through state changes', () => {
  const a = new THREE.Scene(), b = new THREE.Scene(), before = createFacilityVisuals(a, sites, { batchParts: false }), after = createFacilityVisuals(b, sites);
  try {
    expect(roots(a).map(r => r.children.length)).toEqual([22, 8, 8, 8]);
    expect(roots(b).map(r => r.children.length)).toEqual([5, 5, 5, 5]);
    const snapshot = createFacilities(sites).snapshot();
    const states: Partial<FacilityState>[] = [
      { owner: PLAYER_FACTION, health: 200 }, { owner: 'mercenaries', health: 100 },
      { owner: null, health: 100 }, { suppressed: true, health: 100 },
      { suppressed: false, health: 0 },
      { health: 0, action: { kind: 'build', by: 'p', faction: PLAYER_FACTION, progress: .37, stalled: false } },
      { health: 200, action: { kind: 'capture', by: 'p', faction: PLAYER_FACTION, progress: .82, stalled: true } },
      { owner: PLAYER_FACTION, health: 450, action: null },
    ];
    for (const patch of states) {
      Object.assign(snapshot.sites[0], patch); // Other facilities must retain independent colors and state.
      before.update(snapshot); after.update(snapshot);
      expect(triangles(b)).toEqual(triangles(a)); expect(bounds(b)).toEqual(bounds(a));
      // Analytical facility interactions/cover exclusion still recognize the root tag.
      for (const scene of [a, b]) expect(createSceneCover(scene).distance({ x: -5, y: 3, z: -3 }, { x: 1, y: 0, z: 0 }, 10)).toBe(10);
      for (const site of sites) for (const direction of [new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, -1, 0)]) {
        for (let y = .17; y < 4; y += .29) for (let x = -1.3; x < 1.4; x += .31) {
          const target = new THREE.Vector3(site.x + x, site.y + y, site.z + .013);
          const ray = new THREE.Raycaster(target.addScaledVector(direction, -5), direction, 0, 10);
          const u = firstVisibleHit(ray, [a], true, true), v = firstVisibleHit(ray, [b], true, true);
          expect(!!v).toBe(!!u); if (!u || !v) continue;
          expect(v.distance).toBeCloseTo(u.distance, 5);
          const material = (h: THREE.Intersection) => (h.object as THREE.Mesh).material as THREE.MeshStandardMaterial;
          expect(material(v).color.getHex()).toBe(material(u).color.getHex());
          expect(v.face!.normal.distanceTo(u.face!.normal)).toBeLessThan(.00001);
        }
      }
    }
  } finally { before.dispose(); after.dispose(); }
});

it('releases replaced source geometry and all retained console resources exactly once', () => {
  const disposed: THREE.BufferGeometry[] = [];
  const spy = vi.spyOn(THREE.BufferGeometry.prototype, 'dispose').mockImplementation(function(this: THREE.BufferGeometry) { disposed.push(this); });
  try {
    const scene = new THREE.Scene(), visuals = createFacilityVisuals(scene, sites);
    expect(disposed).toHaveLength(31); // 19 command boxes + 4 metal boxes per cabinet.
    const retained = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
    scene.traverse(o => { if (o instanceof THREE.Mesh) { retained.add(o.geometry); materials.add(o.material as THREE.Material); } });
    const onMaterialDispose = vi.fn(); materials.forEach(m => m.addEventListener('dispose', onMaterialDispose));
    visuals.dispose(); expect(scene.children).toHaveLength(0);
    for (const g of retained) expect(disposed.filter(d => d === g)).toHaveLength(1);
    expect(new Set(disposed).size).toBe(disposed.length);
    expect(onMaterialDispose).toHaveBeenCalledTimes(materials.size);
  } finally { spy.mockRestore(); }
});
