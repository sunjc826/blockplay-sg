import * as THREE from 'three';
import { createVerticalMovement, type VerticalWorld } from './vertical-movement';

type Point = { x: number; y: number; z: number };
export interface DiagnosticPlace {
  id: string;
  floors: readonly (Point & { id: string; width: number; depth: number })[];
  connections: readonly { id: string; from: Point; to: Point; width: number }[];
}

/** Geometric facts and suspected defects, never a quality grade. */
export function inspectVerticalPlaces(scene: THREE.Scene, world: VerticalWorld, places: readonly DiagnosticPlace[], isReachable?: (point: Point) => boolean) {
  scene.updateMatrixWorld(true);
  const movement = createVerticalMovement(world);
  const radius = .38, height = 1.8;
  const walk = (a: Point, b: Point) => {
    const result = movement.move({ ...a, velocityY: 0 }, b.x - a.x, b.z - a.z, 0, radius, height);
    return Math.hypot(result.x - b.x, result.z - b.z) < .05 && Math.abs(result.y - b.y) < .08 && result.grounded;
  };
  const meshes: THREE.Mesh[] = [];
  scene.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    for (let parent: THREE.Object3D | null = object; parent; parent = parent.parent) if (!parent.visible) return;
    // Moving actors are not architectural headroom. Floors are retained: rays
    // begin above feet, so their supporting top face is not a collision.
    if (object.userData.skipVerticalClearance) return;
    meshes.push(object);
  });
  const meshBounds = meshes.map(mesh => ({ mesh, bounds: new THREE.Box3().setFromObject(mesh) }));
  const ray = new THREE.Raycaster();
  const clearance = (p: Point) => {
    const hits = new Set<string>();
    const envelope = new THREE.Box3(new THREE.Vector3(p.x-radius, p.y+.36, p.z-radius), new THREE.Vector3(p.x+radius, p.y+height, p.z+radius));
    const nearby = meshBounds.filter(item => item.bounds.intersectsBox(envelope)).map(item => item.mesh);
    const cast = (origin: THREE.Vector3, direction: THREE.Vector3, far: number) => {
      ray.set(origin, direction); ray.near = .015; ray.far = far;
      for (const hit of ray.intersectObjects(nearby, false)) {
        hits.add(hit.object.name || hit.object.parent?.name || `mesh:${hit.object.id}`);
      }
    };
    // Upright body envelope: overhead rays at centre and shoulders plus radial
    // rays at shin, waist and head height catch visual walls omitted by colliders.
    for (const [dx, dz] of [[0, 0], [radius, 0], [-radius, 0], [0, radius], [0, -radius]])
      cast(new THREE.Vector3(p.x + dx, p.y + .36, p.z + dz), new THREE.Vector3(0, 1, 0), height - .36);
    for (const y of [.4, .9, 1.7]) for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]])
      cast(new THREE.Vector3(p.x, p.y + y, p.z), new THREE.Vector3(dx, 0, dz), radius);
    return [...hits];
  };
  return places.map(place => {
    const floors = place.floors.map(floor => {
      const samples: Point[] = [];
      // Interior samples exclude rail edges. Obstructed furniture positions do
      // not invalidate the floor; sample its remaining usable standing area.
      for (const fx of [-.3, 0, .3]) for (const fz of [-.3, 0, .3]) {
        const point = { x: floor.x + fx * floor.width, y: floor.y, z: floor.z + fz * floor.depth };
        if (movement.canOccupy(point.x, point.y, point.z, radius, height) && Math.abs((movement.supportHeight(point.x, point.z, point.y + .01) ?? -100) - point.y) < .02) samples.push(point);
      }
      return { id: floor.id, standingSamples: samples.length, spawnReachableSamples: isReachable ? samples.filter(isReachable).length : null,
        meshClearanceWarnings: samples.flatMap(point => { const meshes = clearance(point); return meshes.length ? [{ point, meshes }] : []; }) };
    });
    const connections = place.connections.map(connection => {
      const length = Math.hypot(connection.to.x - connection.from.x, connection.to.z - connection.from.z);
      const samples = Array.from({ length: Math.max(2, Math.ceil(length / 2) + 1) }, (_, i, ) => {
        const t = i / Math.max(1, Math.ceil(length / 2));
        return { x: connection.from.x + (connection.to.x - connection.from.x) * t, y: connection.from.y + (connection.to.y - connection.from.y) * t, z: connection.from.z + (connection.to.z - connection.from.z) * t };
      });
      return { id: connection.id, forward: walk(connection.from, connection.to), reverse: walk(connection.to, connection.from),
        meshClearanceWarnings: samples.flatMap(point => { const meshes = clearance(point); return meshes.length ? [{ point, meshes }] : []; }) };
    });
    // Collapse each authored floor into a node only for a topology diagnostic.
    // This is not pathfinding: fixtures can divide a plate; the lattice access
    // probes above remain authoritative for whether the player reaches it.
    const nodes = new Set(place.floors.map(f => `floor:${f.id}`));
    const adjacency = new Map<string, Set<string>>();
    const add = (a: string, b: string) => {
      nodes.add(a); nodes.add(b);
      if (a === b) return;
      const aa = adjacency.get(a) ?? new Set<string>(); aa.add(b); adjacency.set(a, aa);
      const bb = adjacency.get(b) ?? new Set<string>(); bb.add(a); adjacency.set(b, bb);
    };
    const endpoint = (p: Point) => {
      const floor = place.floors.find(f => Math.abs(f.y-p.y) < .08 && Math.abs(f.x-p.x) <= f.width/2+.02 && Math.abs(f.z-p.z) <= f.depth/2+.02);
      return floor ? `floor:${floor.id}` : `endpoint:${p.x},${p.y},${p.z}`;
    };
    place.connections.forEach((c, i) => { if (connections[i].forward && connections[i].reverse) add(endpoint(c.from), endpoint(c.to)); });
    // Adjacent/overlapping floor pieces are real horizontal graph edges too.
    // Probe their shared boundary with the same capsule instead of treating
    // every atrium-ring piece as an isolated platform.
    for (let i=0; i<place.floors.length; i++) for (let j=i+1; j<place.floors.length; j++) {
      const a = place.floors[i], b = place.floors[j];
      if (Math.abs(a.y-b.y) > .02) continue;
      const minX = Math.max(a.x-a.width/2, b.x-b.width/2), maxX = Math.min(a.x+a.width/2, b.x+b.width/2);
      const minZ = Math.max(a.z-a.depth/2, b.z-b.depth/2), maxZ = Math.min(a.z+a.depth/2, b.z+b.depth/2);
      if (maxX < minX-.02 || maxZ < minZ-.02 || Math.max(maxX-minX,maxZ-minZ) < radius*2) continue;
      for (const t of [.25,.5,.75]) {
        const p = { x: minX+(maxX-minX)*t, y: a.y, z: minZ+(maxZ-minZ)*t };
        const inset = (f: typeof a) => {
          const length = Math.hypot(f.x-p.x,f.z-p.z);
          return { x: p.x+(f.x-p.x)*Math.min(.6/Math.max(length,.001),1), y: f.y, z: p.z+(f.z-p.z)*Math.min(.6/Math.max(length,.001),1) };
        };
        const aa = inset(a), bb = inset(b);
        if (walk(aa,bb) && walk(bb,aa)) { add(`floor:${a.id}`, `floor:${b.id}`); break; }
      }
    }
    const visited = new Set<string>(); let components = 0;
    for (const node of nodes) {
      if (visited.has(node)) continue;
      components++; const pending = [node]; visited.add(node);
      for (let i=0; i<pending.length; i++) for (const next of adjacency.get(pending[i]) ?? []) if (!visited.has(next)) { visited.add(next); pending.push(next); }
    }
    const edges = [...adjacency.values()].reduce((sum, neighbors) => sum+neighbors.size, 0)/2;
    const topology = { nodes: nodes.size, bidirectionalEdges: edges, components,
      branchNodes: [...adjacency.values()].filter(neighbors => neighbors.size >= 3).length,
      independentCycles: edges-nodes.size+components,
      caveat: 'Floor-collapsed connection graph; ignores ground paths and internal fixture partitions. Use reachability probes and playtesting.' };
    return { id: place.id, floors, connections, topology };
  });
}
