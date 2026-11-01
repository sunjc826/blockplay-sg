import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createGunshotAcoustics, createSceneGunshotAcoustics, MAX_ACOUSTIC_CACHE, MAX_REMOTE_ACOUSTIC_PROBES, OPEN_GUNSHOT_ACOUSTICS, sampleGunshotAcoustics } from './gunshot-acoustics';
import { buildQueenstownScene } from './queenstown-scene';
import { QUEENSTOWN_HDB_BLOCKS } from './queenstown-housing-layout';
import { queenstownTerrainHeight } from './queenstown-terrain';

const ear = { x: 0, y: 1.75, z: 0 };
function fixture(kind: 'open' | 'facade' | 'covered' | 'corridor') {
  const scene = new THREE.Scene(), material = new THREE.MeshBasicMaterial({ color: '#bcbcb8' });
  const box = (x: number, y: number, z: number, w: number, h: number, d: number) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material); mesh.position.set(x, y, z); scene.add(mesh); return mesh;
  };
  if (kind === 'facade') box(8, 4, 0, .3, 8, 30);
  if (kind === 'covered') box(0, 3.4, 0, 24, .3, 24);
  if (kind === 'corridor') { box(-1.6, 1.6, 0, .3, 3.2, 30); box(1.6, 1.6, 0, .3, 3.2, 30); box(0, 3.2, 0, 3.5, .3, 30); }
  return { scene, box, acoustics: createSceneGunshotAcoustics(scene) };
}

describe('geometry-derived gunshot spaces', () => {
  it('distinguishes open sky, a facade, a covered open deck and a narrow corridor', () => {
    const profiles = (['open', 'facade', 'covered', 'corridor'] as const).map(kind => fixture(kind).acoustics.at(kind, ear, true));
    expect(profiles.map(p => p.kind)).toEqual(['open', 'facade', 'covered', 'enclosed']);
    expect(profiles[0].reflections).toHaveLength(0); expect(profiles[0].wet).toBe(0);
    expect(profiles[1].reflections.length).toBeGreaterThan(0);
    expect(profiles[2].wet).toBeGreaterThan(profiles[1].wet);
    expect(profiles[3].wet).toBeGreaterThan(profiles[2].wet);
    expect(profiles[3].decay).toBeGreaterThan(profiles[2].decay);
  });
  it('uses reflector distance for timing and material hardness for strength', () => {
    const wall = (distance: number, surface: 'concrete' | 'wood' | 'foliage') => sampleGunshotAcoustics(ear,
      (_at, direction) => direction.x > .9 ? { distance, surface } : undefined);
    const close = wall(4, 'concrete'), far = wall(24, 'concrete'), timber = wall(4, 'wood');
    expect(close.reflections[0].delay).toBeCloseTo(8 / 343);
    expect(far.reflections[0].delay).toBeGreaterThan(close.reflections[0].delay * 5);
    expect(far.reflections[0].gain).toBeLessThan(close.reflections[0].gain);
    expect(timber.reflections[0].gain).toBeLessThan(close.reflections[0].gain);
    expect(wall(4, 'foliage')).toBe(OPEN_GUNSHOT_ACOUSTICS);
  });
  it('does not mistake hidden or detached roofs, foliage or nearby avatars for a room', () => {
    const f = fixture('open');
    const leaves = f.box(0, 3.2, 0, 20, .3, 20); leaves.userData.visualCover = true;
    const actor = f.box(2, 2, 0, .5, 4, 2); actor.userData.arenaActorId = 'other';
    const hidden = f.box(0, 3.2, 0, 20, .3, 20); hidden.visible = false;
    expect(f.acoustics.at('one', ear, true).kind).toBe('open');
    hidden.visible = true; expect(f.acoustics.at('two', ear, true).kind).toBe('covered');
    hidden.removeFromParent(); expect(f.acoustics.at('three', ear, true).kind).toBe('open');
  });
  it('uses actual Queenstown HDB soffits and access galleries, including their authored elevation', () => {
    const world = buildQueenstownScene();
    try {
      const block = QUEENSTOWN_HDB_BLOCKS[0], base = queenstownTerrainHeight(block.x, block.z);
      const acoustics = createSceneGunshotAcoustics(world.scene);
      const deck = acoustics.at('deck', { x: block.x - 6, y: base + 1.75, z: block.z }, true);
      const gallery = acoustics.at('gallery', { x: block.x - 6, y: base + 3.4 + 1.75, z: block.z + 6.5 }, true);
      expect(deck.kind).toBe('covered'); expect(gallery.kind).toBe('enclosed');
      expect(gallery.wet).toBeGreaterThan(deck.wet);
      expect(gallery.reflections[0].delay).toBeLessThan(.02);
    } finally { world.dispose(); }
  });
});

describe('bounded acoustic probing', () => {
  it('reuses repeated shots but refreshes after movement, floor changes or expiry', () => {
    let now = 0; const trace = vi.fn(() => undefined), cache = createGunshotAcoustics(trace, () => now);
    cache.at('own', ear, true); const reads = trace.mock.calls.length; expect(reads).toBe(13);
    cache.at('own', { ...ear, x: .2 }, true); expect(trace).toHaveBeenCalledTimes(reads);
    cache.at('own', { ...ear, y: ear.y + 2.8 }, true); expect(trace).toHaveBeenCalledTimes(reads * 2);
    now = 400; cache.at('own', { ...ear, y: ear.y + 2.8 }, true); expect(trace).toHaveBeenCalledTimes(reads * 3);
    cache.clear(); cache.at('own', ear, true); expect(trace).toHaveBeenCalledTimes(reads * 4);
  });
  it('bounds snapshot probes while prioritizing the local gun, and bounds long-lived emitter history', () => {
    let now = 0; const trace = vi.fn(() => undefined), cache = createGunshotAcoustics(trace, () => now);
    for (let i = 0; i < 20; i++) cache.at(`remote:${i}`, ear);
    expect(trace).toHaveBeenCalledTimes(MAX_REMOTE_ACOUSTIC_PROBES * 13);
    cache.at('own', ear, true); expect(trace).toHaveBeenCalledTimes((MAX_REMOTE_ACOUSTIC_PROBES + 1) * 13);
    for (let i = 0; i <= MAX_ACOUSTIC_CACHE; i++) { now += 101; cache.at(`new:${i}`, ear); }
    const before = trace.mock.calls.length; cache.at('remote:0', ear); expect(trace.mock.calls.length).toBe(before + 13);
  });
  it('ignores invalid origins and invalid trace ranges without scheduling an unbounded response', () => {
    const trace = vi.fn(() => ({ distance: Infinity, surface: 'concrete' as const }));
    expect(sampleGunshotAcoustics({ ...ear, x: NaN }, trace)).toBe(OPEN_GUNSHOT_ACOUSTICS);
    expect(trace).not.toHaveBeenCalled(); expect(sampleGunshotAcoustics(ear, trace)).toBe(OPEN_GUNSHOT_ACOUSTICS);
  });
});
