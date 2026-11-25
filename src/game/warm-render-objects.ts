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

/**
 * `renderer.compileAsync`, but one that always ends. Three's own reads each waiting material's program inside a
 * timer, and a material disposed in the meantime has none: the timer throws, nothing checks again, and the promise
 * never settles, which leaves the loading screen up for good. A material without a program has nothing left to
 * wait for. The limit is for a driver that never reports a program ready.
 */
export function compileSettled(renderer: THREE.WebGLRenderer, scene: THREE.Object3D, camera: THREE.Camera, limitMs = 60_000): Promise<void> {
  const materials = renderer.compile(scene, camera) as unknown as Set<THREE.Material>, started = performance.now();
  return new Promise(resolve => {
    const check = () => {
      for (const material of materials) {
        const program = (renderer.properties.get(material) as { currentProgram?: { isReady(): boolean } }).currentProgram;
        if (!program || program.isReady()) materials.delete(material);
      }
      if (materials.size && performance.now() - started < limitMs) setTimeout(check, 10); else resolve();
    };
    // Asking is only free where the driver compiles in parallel; elsewhere give it a moment first.
    if (renderer.extensions.get('KHR_parallel_shader_compile') !== null) check(); else setTimeout(check, 10);
  });
}
