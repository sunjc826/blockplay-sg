import type { SceneKit } from './scene-kit';
import { tampinesGroundHeight } from './tampines-ground';

/** Contemporary Hub waiting/study furniture, unlike older tiled estate sets. */
export function addTampinesSocialDetails(kit: SceneKit) {
  const orange = kit.mat('#bc693c', .58), metal = kit.mat('#8c989a', .4, .35), timber = kit.mat('#997555'), leaf = kit.mat('#52764a');
  leaf.userData.visualCover = true;
  const traversal = kit.scene.userData.traversalObstacles ??= [];
  const piece = (x: number, y: number, z: number, width: number, height: number, depth: number, material = metal) => {
    kit.box(x, y, z, width, height, depth, material);
    const bounds = { minX: x - width / 2, maxX: x + width / 2, minZ: z - depth / 2, maxZ: z + depth / 2, minY: y - height / 2, maxY: y + height / 2 };
    kit.obstacles.push(bounds); traversal.push(bounds);
  };
  for (const x of [32, 78]) {
    const z = 1, base = tampinesGroundHeight(x, z);
    piece(x, base + .32, z, 2.9, .1, .16);
    for (const dx of [-1.05, 1.05]) piece(x + dx, base + .16, z, .12, .32, .52);
    for (const dx of [-.88, 0, .88]) {
      piece(x + dx, base + .49, z, .75, .12, .6, orange);
      piece(x + dx, base + .83, z - .25, .75, .58, .1, orange);
    }
  }
  // Study/conversation pockets sit under the concourses, not in the portal.
  for (const [x, z] of [[15, -43], [95, -30]]) {
    const base = tampinesGroundHeight(x, z);
    piece(x, base + .8, z, 2.8, .12, 1.1, timber);
    for (const dx of [-1.05, 1.05]) piece(x + dx, base + .37, z, .12, .74, .75);
    for (const side of [-1, 1]) {
      piece(x, base + .48, z + side * 1.1, 2.6, .12, .45, timber);
      for (const dx of [-.95, .95]) piece(x + dx, base + .21, z + side * 1.1, .12, .42, .36);
    }
  }
  // Reclaimed quarry edges read as wooded earth and informal trails. Trees
  // follow their bank height and sit outside the clear crest walking lines.
  for (const [x, z, h] of [[124, 62, 7], [134.5, 91, 8], [210, 68, 8], [222, 88, 7], [220.5, 54, 7]]) {
    const first = kit.scene.children.length, begin = kit.obstacles.length, base = tampinesGroundHeight(x, z);
    kit.tree(x, z, h, timber, leaf);
    for (const child of kit.scene.children.slice(first)) child.position.y += base;
    for (const o of kit.obstacles.slice(begin)) { o.minY = base; o.maxY = base + h; }
  }
  for (const [x, z] of [[134.8, 57], [134, 73], [135, 97], [133.8, 108], [210, 58], [210.5, 79], [210, 98], [221.5, 111]]) {
    const y = tampinesGroundHeight(x, z);
    kit.blob(x, y + .38, z, 1.0, .65, 1.3, leaf);
    kit.blob(x + .8, tampinesGroundHeight(x + .8, z + .7) + .26, z + .7, .6, .48, .8, leaf);
  }
  kit.scene.userData.socialGroundDesign = { type: 'hub-waiting-and-study-pockets', waitingBenches: 2, studyTables: 2, gameBoards: 0,
    sources: ['docs/TOA-PAYOH-TAMPINES-GROUND-DESIGN.md'], surveyed: false };
}
