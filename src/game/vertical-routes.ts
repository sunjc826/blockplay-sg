import * as THREE from 'three';
import type { RegionWorld } from './regions';
import type { Obstacle } from './region-collision';

export interface WalkSurface {
  id: string;
  routeId: string;
  minX: number; maxX: number; minZ: number; maxZ: number;
  axis: 'x' | 'z';
  startHeight: number; endHeight: number;
  solidBelow?: boolean;
}
export interface TraversalObstacle extends Obstacle { minY: number; maxY: number }
export interface RoutePoint { x: number; z: number; y: number }
/** Authored gameplay access, not a claim that these dimensions were surveyed. */
export interface VerticalRoute {
  id: string;
  name: string;
  width: number;
  points: readonly RoutePoint[];
  color?: string;
  railColor?: string;
  railHeight?: number;
  foundation?: 'solid' | 'open';
  note: string;
}

export const getWalkSurfaces = (scene: THREE.Object3D): readonly WalkSurface[] => scene.userData.walkSurfaces ?? [];
export const getTraversalObstacles = (scene: THREE.Object3D): readonly TraversalObstacle[] => scene.userData.traversalObstacles ?? [];
export const getVerticalRoutes = (scene: THREE.Object3D): readonly VerticalRoute[] => scene.userData.verticalRoutes ?? [];
export function surfaceHeight(surface: WalkSurface, x: number, z: number) {
  const low = surface.axis === 'x' ? surface.minX : surface.minZ;
  const high = surface.axis === 'x' ? surface.maxX : surface.maxZ;
  const t = Math.max(0, Math.min(1, ((surface.axis === 'x' ? x : z) - low) / (high - low)));
  return surface.startHeight + (surface.endHeight - surface.startHeight) * t;
}

/**
 * Render and movement share the exact top plane. These meshes are deliberately
 * separate from the old flat vehicle obstacle list: cars remain at street level.
 * Routes have open ends, rails along their sides, and pillars under raised decks.
 */
export function withVerticalRoutes<T extends RegionWorld>(world: T, routes: readonly VerticalRoute[]): T {
  const surfaces: WalkSurface[] = [...getWalkSurfaces(world.scene)];
  const obstacles: TraversalObstacle[] = [...getTraversalObstacles(world.scene)];
  const group = new THREE.Group(); group.name = 'Walkable elevated routes';
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const unit = new THREE.BoxGeometry(1, 1, 1); geometries.push(unit);
  const box = (x: number, y: number, z: number, w: number, h: number, d: number, material: THREE.Material, solid = true) => {
    const mesh = new THREE.Mesh(unit, material); mesh.position.set(x, y, z); mesh.scale.set(w, h, d);
    mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh);
    if (solid) obstacles.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, minY: Math.max(0, y - h / 2), maxY: y + h / 2 });
    return mesh;
  };
  const ids = new Set(getVerticalRoutes(world.scene).map(route => route.id));
  for (const route of routes) {
    if (ids.has(route.id) || !route.id || route.width < 3 || !Number.isFinite(route.width) || route.points.length < 4) throw new Error(`Invalid vertical route: ${route.id}`);
    ids.add(route.id);
    if (route.points[0].y !== 0 || route.points.at(-1)!.y !== 0) throw new Error(`Route ${route.id} needs ground access at both ends`);
    const deck = new THREE.MeshStandardMaterial({ color: route.color ?? '#bdb5a3', roughness: .87 });
    const rail = new THREE.MeshStandardMaterial({ color: route.railColor ?? '#50676a', roughness: .6, metalness: .25 });
    materials.push(deck, rail);
    for (let i = 1; i < route.points.length; i++) {
      const a = route.points[i - 1], b = route.points[i];
      const dx = b.x - a.x, dz = b.z - a.z, length = Math.hypot(dx, dz);
      if (![a.x, a.y, a.z, b.x, b.y, b.z].every(Number.isFinite) || a.y < 0 || b.y < 0 || !length || (dx !== 0 && dz !== 0) || Math.abs(b.y - a.y) / length > .5 + 1e-8) throw new Error(`Invalid ramp ${route.id}/${i}`);
      const axis = dx !== 0 ? 'x' : 'z';
      const width = route.width, half = width / 2;
      const low = (axis === 'x' ? a.x < b.x : a.z < b.z) ? a : b, high = low === a ? b : a;
      const s: WalkSurface = {
        id: `${route.id}/${i}`, routeId: route.id, axis,
        minX: axis === 'x' ? low.x : a.x - half, maxX: axis === 'x' ? high.x : a.x + half,
        minZ: axis === 'z' ? low.z : a.z - half, maxZ: axis === 'z' ? high.z : a.z + half,
        startHeight: low.y, endHeight: high.y, solidBelow: route.foundation === 'solid',
      };
      surfaces.push(s);
      // An actual sloping prism, rather than a bounding box whose upper face
      // disagrees with movement. Its 22cm thickness also gives the deck an edge.
      const top = axis === 'x'
        ? [[low.x, low.y, s.minZ], [high.x, high.y, s.minZ], [high.x, high.y, s.maxZ], [low.x, low.y, s.maxZ]]
        : [[s.minX, low.y, low.z], [s.maxX, low.y, low.z], [s.maxX, high.y, high.z], [s.minX, high.y, high.z]];
      const vertices = [...top, ...top.map(([x,y,z]) => [x, route.foundation === 'solid' ? -.04 : y - .22, z])];
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices.flat(), 3));
      geometry.setIndex([0,2,1,0,3,2,4,5,6,4,6,7,0,1,5,0,5,4,1,2,6,1,6,5,2,3,7,2,7,6,3,0,4,3,4,7]);
      geometry.computeVertexNormals(); geometries.push(geometry);
      const mesh = new THREE.Mesh(geometry, deck); mesh.name = `${route.name} / ${i}`;
      mesh.receiveShadow = true; mesh.castShadow = true; group.add(mesh);
      if (a.y === b.y && a.y > .4) obstacles.push({ minX:s.minX,maxX:s.maxX,minZ:s.minZ,maxZ:s.maxZ,minY:route.foundation === 'solid' ? 0 : a.y-.22,maxY:a.y });
      const railHeight = route.railHeight ?? 1.05;
      // Short rail sections preserve the slope in the collision volume too.
      const sections = Math.max(1, Math.ceil(length / 2));
      for (const side of [-1, 1]) {
        for (let n = 0; n < sections; n++) {
          const t0 = n / sections, t1 = (n + 1) / sections;
          const p = new THREE.Vector3(a.x + dx*t0, a.y+(b.y-a.y)*t0+railHeight, a.z+dz*t0);
          const q = new THREE.Vector3(a.x + dx*t1, a.y+(b.y-a.y)*t1+railHeight, a.z+dz*t1);
          // Keep the rail outside the walkable width. At a turning landing the
          // rail must stop to leave an opening onto its neighbouring segment.
          const insetStart = i > 1 && route.points[i-2][axis] === a[axis];
          const insetEnd = i < route.points.length-1 && route.points[i+1][axis] === b[axis];
          if ((insetStart && t0*length < half+.3) || (insetEnd && (1-t1)*length < half+.3)) continue;
          if (axis === 'x') { p.z += side*(half+.08); q.z += side*(half+.08); }
          else { p.x += side*(half+.08); q.x += side*(half+.08); }
          const beam = box((p.x+q.x)/2,(p.y+q.y)/2,(p.z+q.z)/2,.12,.12,p.distanceTo(q),rail,false);
          beam.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),q.clone().sub(p).normalize());
          const minY = Math.min(p.y,q.y)-railHeight;
          obstacles.push({ minX:Math.min(p.x,q.x)-.06,maxX:Math.max(p.x,q.x)+.06,minZ:Math.min(p.z,q.z)-.06,maxZ:Math.max(p.z,q.z)+.06,minY:Math.max(0,minY),maxY:Math.max(p.y,q.y)+.06 });
          box(p.x,p.y-railHeight/2,p.z,.12,railHeight,.12,rail);
          if (n === sections-1) box(q.x,q.y-railHeight/2,q.z,.12,railHeight,.12,rail);
          // Deck-edge pillars keep the ground route underneath open.
          if (route.foundation !== 'solid' && a.y === b.y && a.y >= 2 && n % 4 === 0) box(p.x,(p.y-railHeight-.22)/2,p.z,.25,p.y-railHeight-.22,.25,deck);
        }
      }
    }
  }
  world.scene.add(group);
  world.scene.userData.walkSurfaces = surfaces;
  world.scene.userData.traversalObstacles = obstacles;
  world.scene.userData.verticalRoutes = [...getVerticalRoutes(world.scene), ...routes];
  const disposeOriginal = world.dispose;
  let disposed = false;
  world.dispose = () => {
    if (disposed) return; disposed = true;
    group.removeFromParent(); geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); disposeOriginal();
  };
  return world;
}
