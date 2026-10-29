import { expect, it } from 'vitest';
import { buildTutorialWorld } from './tutorial-world';
import { createVerticalMovement } from './vertical-movement';
import { getTraversalObstacles, getWalkSurfaces } from './vertical-routes';
import { INFANTRY_GRAVITY } from './fps-movement';
import { createProfile, resolveLoadout } from './armory-state';
import { equipmentMovement } from './fps-encumbrance';
import { COURSE_STEPS, TUTORIAL_DISTRICT } from './tutorial-course';
it('keeps gates reachable while enforcing jump and crouch clearance', () => {
  const world = buildTutorialWorld();
  try {
    const motion = createVerticalMovement({ bounds: world.bounds, obstacles: world.obstacles, surfaces: getWalkSurfaces(world.scene), traversalObstacles: getTraversalObstacles(world.scene) });
    expect(motion.canOccupy(TUTORIAL_DISTRICT.spawn.x, 0, TUTORIAL_DISTRICT.spawn.z)).toBe(true);
    for (const step of COURSE_STEPS) if ('x' in step) expect(motion.canOccupy(step.x, 0, step.z)).toBe(true);
    expect(motion.canOccupy(0, 0, 7)).toBe(false);
    expect(motion.canOccupy(0, .6, 7)).toBe(true);
    expect(motion.canOccupy(0, 0, -1, .38, 1.8)).toBe(false);
    expect(motion.canOccupy(0, 0, -1, .38, 1.2)).toBe(true);
    const gear = resolveLoadout(createProfile()), burden = equipmentMovement(gear, 0);
    let body = { x: 0, y: 0, z: 8.8, velocityY: 5.6 * burden.jumpVelocity };
    for (let i = 0; i < 100; i++) body = motion.move(body, 0, -4.2 * burden.movement / 120, 1 / 120, .38, 1.8, [], INFANTRY_GRAVITY);
    expect(body.z).toBeLessThan(6);
    expect(body.y).toBe(0);
  } finally { world.dispose(); }
});
