import { expect, it } from 'vitest';
import { getRegion } from './regions';

it('lets Bishan players drive forward along the park path from reset without hitting a lamp', () => {
  const region = getRegion('bishan');
  const world = region.build();
  try {
    const start = region.spawn;
    const distance = 30;
    const dx = -Math.sin(start.yaw) * distance;
    const dz = -Math.cos(start.yaw) * distance;
    const end = region.move(start, dx, dz, 1.35, world.obstacles);
    expect(Math.hypot(end.x - start.x, end.z - start.z)).toBeCloseTo(distance);
  } finally { world.dispose(); }
});
