import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as drift from './ambient-drift';
import type { DriftSource, FoliageDriftDeclaration } from './ambient-drift';
import * as treeWind from './tree-wind';
import { createSceneKit } from './scene-kit';
import { createWorldAtmosphere } from './world-atmosphere';
import { setEnvironmentSettings } from './environment-settings';
import { DEFAULT_ENVIRONMENT } from './world-events';
import { getRegion, REGION_IDS } from './regions';

afterEach(() => {
  vi.restoreAllMocks();
  setEnvironmentSettings(DEFAULT_ENVIRONMENT);
});

function kitFixture() {
  return createSceneKit({ background: '#aaccee', fogNear: 100, fogFar: 500 });
}

function declaration(scene: THREE.Scene) {
  return scene.userData.foliageDrift as FoliageDriftDeclaration | undefined;
}

function driftMeshes(scene: THREE.Scene) {
  const meshes: THREE.Mesh[] = [];
  scene.traverse(object => {
    if (object instanceof THREE.Mesh && object.name === 'ambient-drift') meshes.push(object);
  });
  return meshes;
}

describe('build-time foliage declarations', () => {
  it('captures kit crowns before batching and excludes trunks and rigid greenery', () => {
    const kit = kitFixture(), wood = kit.mat('#76523b'), leaf = kit.mat('#408040');
    kit.tree(3, 4, 8, wood, leaf);
    kit.blob(200, 2, 200, 3, 2, 3, leaf);
    const expected: DriftSource[] = [];
    kit.scene.traverse(object => {
      if (object instanceof THREE.Mesh && object.userData.treePart?.flutter > 0) expected.push(...drift.foliageDriftSources(object, 0));
    });
    const world = kit.finish({ car: new THREE.Group(), stamps: [], animate() {} });
    try {
      expect(expected).toHaveLength(48);
      expect(declaration(world.scene)?.leafSources).toEqual(expected);
      expect(world.scene.children.some(object => object.userData.treePart)).toBe(false);
      expect(driftMeshes(world.scene)).toHaveLength(0);
    } finally { world.dispose(); }
  });

  it('registers untagged transformed crowns with an explicit raised landing base', () => {
    const kit = kitFixture(), parent = new THREE.Group();
    parent.position.set(20, 7, -30); kit.scene.add(parent);
    const crown = kit.blob(0, 8, 0, 3, 2, 3, kit.mat('#408040'), parent);
    drift.registerFoliageDrift(crown, 7);
    const expected = drift.foliageDriftSources(crown, 7);
    const world = kit.finish({ car: new THREE.Group(), stamps: [], animate() {} });
    try {
      expect(declaration(world.scene)?.leafSources).toEqual(expected);
      expect(expected.every(source => source.y === 7 && source.height >= 6)).toBe(true);
    } finally { world.dispose(); }
  });

  it('leaves a treeless kit scene without a declaration or atmosphere drift', () => {
    const kit = kitFixture(); kit.box(0, 1, 0, 2, 2, 2, kit.mat('#408040'));
    const world = kit.finish({ car: new THREE.Group(), stamps: [], animate() {} });
    const create = vi.spyOn(drift, 'createAmbientDrift');
    const atmosphere = createWorldAtmosphere(world.scene, [], world.obstacles);
    try {
      expect(declaration(world.scene)).toBeUndefined();
      atmosphere.update(.1, new THREE.PerspectiveCamera());
      expect(create).not.toHaveBeenCalled();
      expect(driftMeshes(world.scene)).toHaveLength(0);
    } finally { atmosphere.dispose(); world.dispose(); }
  });

  it('bounds dense-forest declarations deterministically while retaining late-built planting', () => {
    const kit = kitFixture(), wood = kit.mat('#76523b'), leaf = kit.mat('#408040');
    for (let i = 0; i < 400; i++) kit.tree(i * 10, 0, 8, wood, leaf);
    drift.captureFoliageDrift(kit.scene);
    const first = declaration(kit.scene)!.leafSources;
    expect(first).toHaveLength(drift.MAX_DRIFT_SOURCES);
    expect(first.some(source => source.x > 3980)).toBe(true);
    drift.captureFoliageDrift(kit.scene);
    expect(declaration(kit.scene)!.leafSources).toEqual(first);
    kit.finish({ car: new THREE.Group(), stamps: [], animate() {} }).dispose();
  });

  it.each(REGION_IDS)('publishes bounded real foliage for %s', id => {
    const world = getRegion(id).build();
    try {
      const sources = declaration(world.scene)!.leafSources;
      expect(sources.length).toBeGreaterThan(0);
      expect(sources.length).toBeLessThanOrEqual(drift.MAX_DRIFT_SOURCES);
      expect(sources.every(source => Number.isFinite(source.x + source.y + source.z + source.height) && source.height > .1)).toBe(true);
      expect(driftMeshes(world.scene)).toHaveLength(0);
    } finally { world.dispose(); }
  });

  it.each([
    ['orchard', (source: DriftSource) => Math.abs(source.z - 13.5) < 7 && Math.abs(source.x) < 180],
    ['bukit-timah', (source: DriftSource) => source.y === 28 && source.x < -175 && source.z < -55],
    ['upper-thomson', (source: DriftSource) => source.y > 0],
    ['harbourfront', (source: DriftSource) => source.y > 0],
    ['jurong-lake', (source: DriftSource) => Math.abs(source.x + 168) < 6 && Math.abs(source.z + 14) < 3],
    ['woodlands', (source: DriftSource) => source.x < -150 && source.z < -80],
    ['sentosa', (source: DriftSource) => source.z > 183 && source.height > 9],
    ['kampong-glam', (source: DriftSource) => Math.abs(source.x - 2) < 8 && source.z < -32 && source.z > -122],
  ] as const)('includes custom crowns/fronds and their landing bases in %s', (id, matches) => {
    const world = getRegion(id).build();
    try { expect(declaration(world.scene)!.leafSources.some(matches)).toBe(true); }
    finally { world.dispose(); }
  });
});

describe('atmosphere drift ownership', () => {
  it('creates one drift, drives it through the atmosphere and releases its resources once', () => {
    const scene = new THREE.Scene();
    const foliage: FoliageDriftDeclaration = { leafSources: [{ x: 3, y: 7, z: 4, height: 8 }] };
    scene.userData.foliageDrift = foliage;
    const create = vi.spyOn(drift, 'createAmbientDrift');
    const atmosphere = createWorldAtmosphere(scene, [], []), effect = create.mock.results[0].value as drift.AmbientDrift;
    const update = vi.spyOn(effect, 'update'), disposeGeometry = vi.spyOn(effect.mesh.geometry, 'dispose');
    const disposeMaterial = vi.spyOn(effect.mesh.material, 'dispose');
    try {
      expect(create).toHaveBeenCalledExactlyOnceWith(scene, foliage);
      const camera = new THREE.PerspectiveCamera(); camera.position.set(3, 9, 4);
      for (let i = 0; i < 3; i++) atmosphere.update(.1, camera, Date.UTC(2026, 5, 1, 4) + i * 100);
      expect(driftMeshes(scene)).toEqual([effect.mesh]);
      expect(update).toHaveBeenCalledTimes(3);
      expect(update.mock.calls[0][1]).toBe(update.mock.calls[2][1]);
      expect(update.mock.calls[2][2]).toEqual(camera.position);
      setEnvironmentSettings({ reducedEffects: true });
      atmosphere.update(.1, camera);
      expect(effect.mesh.visible).toBe(false);
      atmosphere.dispose(); atmosphere.dispose();
      expect(driftMeshes(scene)).toHaveLength(0);
      expect(disposeGeometry).toHaveBeenCalledTimes(1); expect(disposeMaterial).toHaveBeenCalledTimes(1);
      expect(declaration(scene)).toBe(foliage);
    } finally { atmosphere.dispose(); }
    const rebuilt = createWorldAtmosphere(scene, [], []);
    try { expect(driftMeshes(scene)).toHaveLength(1); }
    finally { rebuilt.dispose(); }
  });

  it('preserves every Marina source and colour and creates exactly one atmosphere-owned drift', () => {
    const batchTrees = treeWind.batchTrees;
    let expected: DriftSource[] = [];
    vi.spyOn(treeWind, 'batchTrees').mockImplementationOnce((scene, trackGeometry, trackMaterial) => {
      // This is Marina's previous capture rule, evaluated before the original meshes disappear.
      scene.traverse(object => {
        if (!(object instanceof THREE.Mesh)) return;
        const part = object.userData.treePart;
        const ground = object.userData.driftGround ?? (part?.flutter > 0 ? part.root.y : undefined);
        if (ground !== undefined) expected.push(...drift.foliageDriftSources(object, ground));
      });
      expect(declaration(scene)?.leafSources.length, `Marina previously captured ${expected.length} sources`).toBe(expected.length);
      expect(declaration(scene)?.leafSources).toEqual(expected);
      return batchTrees(scene, trackGeometry, trackMaterial);
    });
    const create = vi.spyOn(drift, 'createAmbientDrift'), world = getRegion('marina-bay').build();
    const atmosphere = createWorldAtmosphere(world.scene, [], world.obstacles);
    try {
      expect(expected.length).toBeGreaterThan(0);
      expect(declaration(world.scene)?.leafColors).toEqual(['#5d8a3c', '#7e9c40', '#b19a45', '#8b6b3c', '#4f7d3d']);
      expect(create).toHaveBeenCalledTimes(1);
      expect(driftMeshes(world.scene)).toHaveLength(1);
      expect(world.scene.userData.ambientDrift).toBeUndefined();
      atmosphere.dispose();
      expect(driftMeshes(world.scene)).toHaveLength(0);
    } finally { atmosphere.dispose(); world.dispose(); }
  });
});
