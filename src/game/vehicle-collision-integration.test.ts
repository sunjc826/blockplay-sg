import { expect, it, vi } from 'vitest';
import { createArena } from './arena-rules';
import { createSharedVehicle } from './vehicle-seats';
import * as collision from './vehicle-collision-buffers';

it.each([false, true])('builds only the used collider list, including wreck support (wrecked=%s)', wrecked => {
  const original = collision.createVehicleCollisionBuffers, groundKinds: string[] = [], flightKinds: string[] = [];
  vi.spyOn(collision, 'createVehicleCollisionBuffers').mockImplementation((...args) => {
    const buffers = original(...args);
    return {
      ground: (self, all) => { groundKinds.push(self.kind); return buffers.ground(self, all); },
      flight: (self, all, authored) => { flightKinds.push(self.kind); return buffers.flight(self, all, authored); },
    };
  });
  try {
    const spawns = { car: { x: -30, z: 0, yaw: 0 }, helicopter: { x: 30, z: 0, yaw: 0 }, 'dragon-boat-red': { x: 0, z: 40, yaw: 0 } };
    const savedVehicles = (['car', 'helicopter', 'dragon-boat-red'] as const).map(kind => ({ ...createSharedVehicle(kind, spawns[kind]), ...(wrecked ? { health: 0, y: 8 } : {}) }));
    const arena = createArena([], 0, 'mixed', { move: p => p, spawns: [{ x: 80, z: 80 }], bounds: { minX: -100, maxX: 100, minZ: -100, maxZ: 100 }, facilities: { sites: [], savedVehicles } }, { spawns });
    arena.step(.05);
    expect(groundKinds).toEqual(wrecked ? [] : ['car']);
    expect(flightKinds).toEqual(wrecked ? ['car', 'helicopter'] : ['helicopter']);
    if (wrecked) for (const vehicle of arena.snapshot().vehicles!.filter(v => v.kind !== 'dragon-boat-red')) expect(vehicle.y).toBeLessThan(8);
  } finally { vi.restoreAllMocks(); }
});
