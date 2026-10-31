import { expect, it } from 'vitest';
import { getRegion, REGION_IDS } from './regions';
import { findWorldGateway, findWorldRoute, resolveWorldTransition, worldGatewayAction, WORLD_GATEWAYS } from './world-zones';
import { createVerticalMovement } from './vertical-movement';
import { getWalkSurfaces, getTraversalObstacles } from './vertical-routes';

it('reaches Pulau Ubin only through the reversible Changi bumboat crossing', () => {
  const inbound = WORLD_GATEWAYS.filter(g => g.to === 'pulau-ubin');
  const outbound = WORLD_GATEWAYS.filter(g => g.from === 'pulau-ubin');
  expect(inbound).toHaveLength(1); expect(outbound).toHaveLength(1);
  expect(inbound[0]).toMatchObject({ from: 'changi', kind: 'ferry' });
  expect(outbound[0]).toMatchObject({ to: 'changi', kind: 'ferry' });
  for (const id of REGION_IDS.filter(id => id !== 'pulau-ubin')) {
    expect(findWorldRoute(id, 'pulau-ubin').at(-1)?.id, id).toBe(inbound[0].id);
    expect(findWorldRoute('pulau-ubin', id)[0]?.id, id).toBe(outbound[0].id);
  }
  expect(worldGatewayAction(inbound[0])).toBe('Board bumboat to Pulau Ubin');
  for (const gateway of [...inbound, ...outbound]) {
    expect(resolveWorldTransition(gateway.from, gateway.id, gateway.position)?.to).toBe(gateway.to);
    expect(resolveWorldTransition(gateway.from, gateway.id, { x: 0, z: 0 })).toBeNull();
    expect(findWorldGateway(gateway.to, gateway.arrival)).toBeNull();
  }
});

it('supports both ferry landings and their safe arrivals on the actual ground', () => {
  for (const id of ['changi', 'pulau-ubin'] as const) {
    const region = getRegion(id), world = region.build();
    try {
      const movement = createVerticalMovement({ bounds: region.bounds, obstacles: world.obstacles, surfaces: getWalkSurfaces(world.scene), traversalObstacles: getTraversalObstacles(world.scene) });
      for (const gateway of WORLD_GATEWAYS.filter(g => g.kind === 'ferry')) {
        const points = [...(gateway.from === id ? [gateway.position] : []), ...(gateway.to === id ? [gateway.arrival] : [])];
        for (const p of points) expect(movement.canOccupy(p.x, 0, p.z, .65, 1.8), `${id} ${p.x},${p.z}`).toBe(true);
      }
    } finally { world.dispose(); }
  }
});

it('keeps Ubin water impassable while leaving its boardwalk and jetty accessible', () => {
  const region = getRegion('pulau-ubin'), world = region.build();
  try {
    for (const p of [{ x: 0, z: 193 }, { x: 205, z: 100 }, { x: 170, z: 125 }]) {
      expect(region.canOccupy(p.x, p.z, 1.35, world.obstacles), JSON.stringify(p)).toBe(true);
    }
    for (const p of [{ x: 0, z: 220 }, { x: 230, z: 130 }, { x: 170, z: 90 }, { x: -100, z: -95 }]) {
      expect(region.canOccupy(p.x, p.z, .4, world.obstacles), JSON.stringify(p)).toBe(false);
    }
  } finally { world.dispose(); }
});
