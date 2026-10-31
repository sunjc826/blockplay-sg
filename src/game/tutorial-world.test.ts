import { describe, expect, it } from 'vitest';
import { buildTutorialWorld } from './tutorial-world';
import { createVerticalMovement } from './vertical-movement';
import { getTraversalObstacles, getWalkSurfaces } from './vertical-routes';
import { INFANTRY_GRAVITY } from './fps-movement';
import { createProfile, resolveLoadout } from './armory-state';
import { equipmentMovement } from './fps-encumbrance';
import { COURSE_LAYOUT as L, COURSE_STEPS, TUTORIAL_DISTRICT } from './tutorial-course';

function withWorld(check: (motion: ReturnType<typeof createVerticalMovement>, world: ReturnType<typeof buildTutorialWorld>) => void) {
  const world = buildTutorialWorld();
  try { check(createVerticalMovement({ bounds: world.bounds, obstacles: world.obstacles, surfaces: getWalkSurfaces(world.scene), traversalObstacles: getTraversalObstacles(world.scene) }), world); }
  finally { world.dispose(); }
}
describe('field school obstacle course', () => {
  it('provides a large compound, a 50 m track and spaced recovery stations', () => withWorld((motion, world) => {
    expect(world.bounds.maxX - world.bounds.minX).toBeGreaterThanOrEqual(150);
    expect(world.bounds.maxZ - world.bounds.minZ).toBeGreaterThanOrEqual(200);
    expect(L.walkZ - L.sprintZ).toBe(50);
    expect(L.jumpZ - L.crouch.entryZ).toBeGreaterThanOrEqual(10);
    expect(L.crouch.exitZ - L.crawl.entryZ).toBeGreaterThanOrEqual(15);
    for (const step of COURSE_STEPS) if ('x' in step) expect(motion.canOccupy(step.x, 0, step.z), step.id).toBe(true);
    expect(motion.canOccupy(TUTORIAL_DISTRICT.spawn.x, 0, TUTORIAL_DISTRICT.spawn.z)).toBe(true);
    // The bend and firing-bay approach must be clear of boards, walls and benches.
    for (let x = L.laneX; x <= L.rangeX; x++) expect(motion.canOccupy(x, 0, L.bendZ)).toBe(true);
    for (let z = L.bendZ; z >= L.firingZ; z--) expect(motion.canOccupy(L.rangeX, 0, z)).toBe(true);
  }));
  it('blocks walking over the hurdle but allows a real loaded jump', () => withWorld(motion => {
    expect(motion.canOccupy(L.laneX, 0, L.hurdleZ)).toBe(false);
    const gear = resolveLoadout(createProfile()), burden = equipmentMovement(gear, 0);
    let body = { x: L.laneX, y: 0, z: L.hurdleZ + 1.8, velocityY: 5.6 * burden.jumpVelocity };
    for (let i = 0; i < 100; i++) body = motion.move(body, 0, -4.2 * burden.movement / 120, 1 / 120, .38, 1.8, [], INFANTRY_GRAVITY);
    expect(body.z).toBeLessThan(L.hurdleZ - 1);
    expect(body.y).toBe(0);
  }));
  it('blocks standing throughout the covered passage while crouching fits', () => withWorld(motion => {
    for (let z = L.crouch.exitZ; z <= L.crouch.entryZ; z += .5) {
      expect(motion.canOccupy(L.laneX, 0, z, .38, 1.8)).toBe(false);
      expect(motion.canOccupy(L.laneX, 0, z, .38, 1.2)).toBe(true);
    }
  }));
  it('forces prone clearance across the whole mesh and permits crawling end to end', () => withWorld(motion => {
    for (let z = L.crawl.exitZ; z <= L.crawl.entryZ; z += .5) for (const offset of [-2.5, 0, 2.5]) {
      expect(motion.canOccupy(L.laneX + offset, 0, z, .38, 1.8)).toBe(false);
      expect(motion.canOccupy(L.laneX + offset, 0, z, .38, 1.2)).toBe(false);
      expect(motion.canOccupy(L.laneX + offset, 0, z, .38, .6)).toBe(true);
    }
    const traverse = (height: number) => {
      let body = { x: L.laneX, y: 0, z: L.crawl.entryZ + 1, velocityY: 0 };
      for (let i = 0; i < 1500; i++) body = motion.move(body, 0, -.85 / 120, 1 / 120, .38, height, [], INFANTRY_GRAVITY);
      return body;
    };
    expect(traverse(1.8).z).toBeGreaterThan(L.crawl.entryZ);
    expect(traverse(1.2).z).toBeGreaterThan(L.crawl.entryZ);
    expect(traverse(.6).z).toBeLessThan(L.crawl.exitZ - 1);
  }));
  it('updates each ring independently after static batching', () => withWorld((_, world) => {
    world.scene.userData.setTutorialStep(5);
    const rings: import('three').Mesh[] = [];
    world.scene.traverse(node => { const mesh = node as import('three').Mesh; if (mesh.geometry?.type === 'RingGeometry') rings.push(mesh); });
    expect(rings).toHaveLength(6);
    const colors = rings.map(ring => (ring.material as import('three').MeshStandardMaterial).color.getHexString());
    expect(colors.filter(color => color === 'f6c76b')).toHaveLength(1);
    expect(colors.filter(color => color === '77c2a0')).toHaveLength(4);
  }));
});
