import * as THREE from 'three';

/** Submit dormant renderables while loading, without spawning gameplay effects.
 * compileAsync alone leaves first-use program checks, uploads and driver pipelines
 * until the first draw. Restore every temporary change before the next paint. */
export function withWarmRenderObjects(roots: readonly THREE.Object3D[], draw: () => void) {
  const restore: (() => void)[] = [], visited = new Set<THREE.Object3D>();
  const ranges = new Set<THREE.BufferGeometry>();
  try {
    for (const root of roots) root.traverse(object => {
      if (visited.has(object)) return;
      visited.add(object);
      // Changing the light set would warm a different shader variant.
      if ((object as THREE.Light).isLight) return;
      const visible = object.visible, culled = object.frustumCulled;
      restore.push(() => { object.visible = visible; object.frustumCulled = culled; });
      object.visible = true; object.frustumCulled = false;
      const mesh = object as THREE.InstancedMesh;
      if (mesh.isInstancedMesh && mesh.count === 0 && mesh.instanceMatrix.count > 0) {
        restore.push(() => { mesh.count = 0; }); mesh.count = 1;
      }
      const geometry = (object as THREE.Mesh).geometry;
      if (geometry && geometry.drawRange.count === 0 && !ranges.has(geometry)) {
        ranges.add(geometry);
        const { start, count } = geometry.drawRange;
        restore.push(() => geometry.setDrawRange(start, count));
        geometry.setDrawRange(0, Infinity);
      }
    });
    draw();
  } finally {
    for (let i = restore.length - 1; i >= 0; i--) restore[i]();
  }
}
