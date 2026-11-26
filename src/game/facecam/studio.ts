import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { loft } from '../character-shapes';

// Bake the room once. Articulated boxes and cylinders share two instanced draws.
export function studio() {
  const scene = new T.Scene(),
    room = new T.Group(),
    actors = new T.Group();
  const cube = new T.BoxGeometry(),
    tube = new T.CylinderGeometry(0.5, 0.5, 1, 10, 1, false);
  const materials = new Map<string, T.MeshLambertMaterial>();
  const material = (color: string) => {
    let m = materials.get(color);
    if (!m) {
      m = new T.MeshLambertMaterial({ color, flatShading: true });
      materials.set(color, m);
    }
    return m;
  };
  const group = (parent: T.Object3D, x = 0, y = 0, z = 0) => {
    const g = new T.Group();
    g.position.set(x, y, z);
    parent.add(g);
    return g;
  };
  const shape = (
    parent: T.Object3D,
    geo: T.BufferGeometry,
    color: string,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number
  ) => {
    const m = new T.Mesh(geo, material(color));
    m.position.set(x, y, z);
    m.scale.set(w, h, d);
    parent.add(m);
    return m;
  };
  const box = (p: T.Object3D, c: string, x: number, y: number, z: number, w: number, h: number, d: number) =>
    shape(p, cube, c, x, y, z, w, h, d);
  const cyl = (p: T.Object3D, c: string, x: number, y: number, z: number, w: number, h: number, d = w) =>
    shape(p, tube, c, x, y, z, w, h, d);
  const face = loft(
    [
      { y: -0.29, halfWidth: 0.2, front: 0.16, back: 0.19 },
      { y: -0.17, halfWidth: 0.3, front: 0.24, back: 0.23 },
      { y: 0.19, halfWidth: 0.32, front: 0.24, back: 0.24 },
      { y: 0.32, halfWidth: 0.25, front: 0.19, back: 0.19 },
    ],
    10,
    0.43
  );
  const skin = (p: T.Object3D, c: string) => shape(p, face, c, 0, 0, 0, 1, 1, 1);
  const batches: { items: T.Mesh[]; mesh: T.InstancedMesh }[] = [];
  const baked: T.BufferGeometry[] = [];
  const paint = new T.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const moving = new T.MeshLambertMaterial({ flatShading: true });
  function bake() {
    room.updateMatrixWorld(true);
    room.traverse((o) => {
      if (!(o instanceof T.Mesh)) return;
      const g = o.geometry.clone().applyMatrix4(o.matrixWorld);
      const rgb = (o.material as T.MeshLambertMaterial).color;
      const colors = new Float32Array(g.attributes.position.count * 3);
      for (let i = 0; i < colors.length; i += 3) rgb.toArray(colors, i);
      g.setAttribute('color', new T.BufferAttribute(colors, 3));
      baked.push(g);
    });
    const merged = mergeGeometries(baked)!;
    scene.add(new T.Mesh(merged, paint));
    baked.forEach((g) => g.dispose());
    baked.length = 0;
    baked.push(merged);
    room.clear();
    for (const geo of [cube, tube, face]) {
      const items: T.Mesh[] = [];
      actors.traverse((o) => {
        if (o instanceof T.Mesh && o.geometry === geo) items.push(o);
      });
      if (!items.length) continue;
      const mesh = new T.InstancedMesh(geo, moving, items.length);
      mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
      mesh.frustumCulled = false;
      items.forEach((m, i) => mesh.setColorAt(i, (m.material as T.MeshLambertMaterial).color));
      scene.add(mesh);
      batches.push({ items, mesh });
    }
  }
  function sync() {
    actors.updateMatrixWorld(true);
    for (const { items, mesh } of batches) {
      items.forEach((m, i) => {
        mesh.setMatrixAt(i, m.matrixWorld);
        mesh.setColorAt(i, (m.material as T.MeshLambertMaterial).color);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor!.needsUpdate = true;
    }
  }
  function dispose() {
    baked.forEach((g) => g.dispose());
    for (const { mesh } of batches) mesh.dispose();
    for (const g of [cube, tube, face]) g.dispose();
    for (const m of materials.values()) m.dispose();
    paint.dispose();
    moving.dispose();
    actors.clear();
    scene.clear();
  }
  return { scene, room, actors, group, box, cyl, skin, bake, sync, dispose };
}
export type Studio = ReturnType<typeof studio>;
