import type { Object3D } from 'three';
import type { Obstacle } from './region-collision';
import { getTraversalObstacles, type TraversalObstacle } from './vertical-routes';
import type { StructureCore, StructureDefinition, StructureLayout, StructurePoint, StructureProp, StructurePropKind } from './structure-types';

export const STRUCTURE_PROP_SIZE: Record<StructurePropKind, { w: number; d: number; h: number }> = {
  canopy: { w: 5.6, d: 5, h: 3.2 }, shelter: { w: 4.4, d: 3.6, h: 2.8 },
  stores: { w: 2.6, d: 1.8, h: 1.25 }, barricade: { w: 4.2, d: 1, h: 1.1 },
};

export function structurePropBounds(prop: StructureProp): Obstacle {
  const size = STRUCTURE_PROP_SIZE[prop.kind], turned = Math.abs(Math.sin(prop.yaw)) > .5;
  const w = turned ? size.d : size.w, d = turned ? size.w : size.d;
  return { minX: prop.x-w/2, maxX: prop.x+w/2, minZ: prop.z-d/2, maxZ: prop.z+d/2, minY: prop.y, maxY: prop.y+size.h,
    supportsTop: prop.kind === 'stores' || prop.kind === 'barricade' };
}

export function structureCoreBounds(position: StructurePoint, model: StructureCore['model']): Obstacle {
  if(model==='signal-beacon')return {minX:position.x-.45,maxX:position.x+.45,minZ:position.z-.35,maxZ:position.z+.35,minY:position.y,maxY:position.y+.9};
  const w = model === 'command-console' ? 1.2 : .85, d = model === 'command-console' ? .8 : .65, h = model === 'command-console' ? 1.55 : 1.8;
  return { minX: position.x-w, maxX: position.x+w, minZ: position.z-d, maxZ: position.z+d, minY: position.y, maxY: position.y+h };
}

export function structureObstacles(structure: StructureDefinition): Obstacle[] {
  const result = structure.core ? [structureCoreBounds(structure, structure.core.model)] : [];
  for (const prop of structure.props ?? []) {
    const b = structurePropBounds(prop);
    if (prop.kind === 'canopy' || prop.kind === 'shelter') {
      // Open shelters have posts and an overhead roof, never a solid box.
      for (const x of [b.minX+.12, b.maxX-.12]) for (const z of [b.minZ+.12, b.maxZ-.12])
        result.push({ minX:x-.07, maxX:x+.07, minZ:z-.07, maxZ:z+.07, minY:prop.y, maxY:prop.y+2.5 });
      result.push({ ...b, minY:prop.y+2.5 });
      if (prop.kind === 'shelter') result.push({ minX:prop.x-1, maxX:prop.x+1, minZ:prop.z-1.25, maxZ:prop.z-.55, minY:prop.y, maxY:prop.y+.62 });
    } else result.push(b);
  }
  return result;
}

export function structureCeilings(structure: StructureDefinition): TraversalObstacle[] {
  return (structure.props ?? []).filter(p => p.kind === 'canopy' || p.kind === 'shelter').map(p =>
    ({ ...structurePropBounds(p), minY:p.y+2.5, maxY:p.y+STRUCTURE_PROP_SIZE[p.kind].h }));
}

export function structureNavigationAnchors(structure: StructureDefinition) {
  // Order is significant for the existing navigation graph/bake tie breaks.
  return [...(structure.navigationAnchors ?? []), ...structureObstacles(structure).flatMap(b =>
    [b.minX-.8, b.maxX+.8].flatMap(x => [b.minZ-.8, b.maxZ+.8].map(z => ({ x, z }))))];
}

/** Shared by live worlds, offline navigation bakes and alternative layouts.
 * Install before constructing movement/navigation. Dispose before rebuilding them.
 * Only this installation's volumes are removed; other world additions survive.
 */
export function installStructureLayout(world: { scene: Object3D; obstacles: Obstacle[] }, layout: StructureLayout) {
  const ids = new Set<string>();
  for (const s of layout.structures) {
    if (ids.has(s.id)) throw new Error(`Duplicate structure id: ${s.id}`);
    ids.add(s.id);
  }
  const obstacles = layout.structures.flatMap(structureObstacles);
  const ceilings = layout.structures.flatMap(structureCeilings);
  const navigationAnchors = layout.structures.flatMap(structureNavigationAnchors);
  const hadCeilings = world.scene.userData.traversalObstacles !== undefined;
  world.obstacles.push(...obstacles);
  if (ceilings.length) world.scene.userData.traversalObstacles = [...getTraversalObstacles(world.scene), ...ceilings];
  let disposed = false;
  return { navigationAnchors, dispose() {
    if (disposed) return;
    disposed = true;
    const owned = new Set(obstacles);
    for (let i = world.obstacles.length-1; i >= 0; i--) if (owned.has(world.obstacles[i])) world.obstacles.splice(i, 1);
    if (ceilings.length) {
      const ownedCeilings = new Set(ceilings);
      const remaining = getTraversalObstacles(world.scene).filter(b => !ownedCeilings.has(b));
      if (remaining.length || hadCeilings) world.scene.userData.traversalObstacles = remaining;
      else delete world.scene.userData.traversalObstacles;
    }
  } };
}
