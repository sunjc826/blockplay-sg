import type { createSceneKit } from './scene-kit';
import { markWater } from './water';

/** Shared game-authored continuation, not a reconstruction of the real bridge.
 * Render past the playable boundary so the route visibly continues on either side.
 * Both halves use the same deck, rails, canopy and longitudinal spacing.
 */
export function buildBoardwalkConnection(kit: ReturnType<typeof createSceneKit>, side: 'harbourfront' | 'sentosa') {
  const { box, solid, sign, mat, scene } = kit;
  const x = side === 'harbourfront' ? 109 : 108;
  const seam = side === 'harbourfront' ? 210 : -205;
  const direction = side === 'harbourfront' ? 1 : -1;
  const wood = mat('#876b4b'), steel = mat('#b2babd'), roof = mat('#d6d6c6');
  // Overlapping scenery at the seam means the first and last frames share a place.
  const from = side === 'harbourfront' ? 193 : -207, to = seam + direction * 38;
  const water = mat('#3f88a4', .4); markWater(water);
  box(x, -.08, (from + to) / 2, 100, .08, Math.abs(to - from), water);
  for (const dx of [-28.5, 28.5]) solid(x + dx, (from + to) / 2, 43, Math.abs(to - from));
  box(x, -.05, (from + to) / 2, 14, .18, Math.abs(to - from), wood);
  const railFrom = side === 'harbourfront' ? 193 : -183, railMid = (railFrom + to) / 2, railLength = Math.abs(to - railFrom);
  for (const dx of [-5.3, 5.3]) {
    box(x + dx, .85, railMid, .16, 1.6, railLength, steel);
    kit.obstacles.push({ minX: x + dx - .12, maxX: x + dx + .12, minZ: Math.min(railFrom, to), maxZ: Math.max(railFrom, to), maxY: 1.7 });
  }
  for (let dz = -30; dz <= 36; dz += 6) {
    if ((seam + dz - railFrom) * direction < 0 || (seam + dz - to) * direction > 0) continue;
    for (const dx of [-5.3, 5.3]) {
      box(x + dx, 2.3, seam + dz, .25, 4.6, .25, steel);
      kit.obstacles.push({ minX: x + dx - .15, maxX: x + dx + .15, minZ: seam + dz - .15, maxZ: seam + dz + .15, maxY: 4.6 });
    }
    box(x, 4.65, seam + dz, 11, .18, .35, steel);
  }
  box(x, 4.8, railMid, 11, .12, railLength, roof);
  // A shared wind shelter masks the loading seam. Its straight central lane
  // admits utility vehicles; helicopters cross above the canopy.
  const screen = mat('#a8bcb6');
  for (const dx of [-5.3, 5.3]) {
    box(x + dx, 2.2, seam, .18, 4.4, 26, screen);
    kit.obstacles.push({ minX: x + dx - .12, maxX: x + dx + .12, minZ: seam - 13, maxZ: seam + 13, maxY: 4.4 });
  }
  for (const dz of [-10, 10]) for (const dx of [-4.75, 4.75]) {
    box(x + dx, 2.2, seam + dz, .8, 4.4, .25, screen);
    kit.obstacles.push({ minX: x + dx - .4, maxX: x + dx + .4, minZ: seam + dz - .15, maxZ: seam + dz + .15, maxY: 4.4 });
  }
  // Canopy participates in overhead clearance without making its footprint a wall.
  scene.userData.traversalObstacles = [...(scene.userData.traversalObstacles ?? []),
    { minX: x - 5.5, maxX: x + 5.5, minZ: Math.min(railFrom, to), maxZ: Math.max(railFrom, to), minY: 4.55, maxY: 4.9 }];
  for (const [heading, offset, yaw] of [
    [side === 'harbourfront' ? 'TO SENTOSA' : 'TO HARBOURFRONT', -direction * 14, direction > 0 ? Math.PI : 0],
    [side === 'harbourfront' ? 'TO HARBOURFRONT' : 'TO SENTOSA', direction * 14, direction > 0 ? 0 : Math.PI],
  ] as const) {
    const panel = sign(heading, x, 3.7, seam + offset, 8, .95, '#2f6b78');
    if (panel) panel.rotation.y = yaw;
  }
  scene.userData.physicalConnection = { id: 'sentosa-boardwalk', seam, x, direction, surveyed: false };
}
