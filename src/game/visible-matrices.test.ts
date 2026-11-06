import * as THREE from 'three';
import { expect, it } from 'vitest';
import { skipHiddenMatrixUpdates, updateVisibleMatrixWorld } from './visible-matrices';

/** Two identical random trees, built from one seed, so one can be updated natively and one by us. */
function forest(seed: number) {
  let s = seed; const random = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const root = new THREE.Scene(), nodes: THREE.Object3D[] = [root];
  for (let i = 0; i < 300; i++) {
    const node = random() < .1 ? new THREE.PerspectiveCamera() : new THREE.Object3D();
    node.position.set(random() * 10 - 5, random() * 4, random() * 10 - 5); node.rotation.set(random(), random() * 6, random()); node.scale.setScalar(.5 + random());
    if (random() < .25) node.visible = false;
    if (random() < .15) { node.updateMatrix(); node.matrixAutoUpdate = false; }
    nodes[Math.floor(random() * nodes.length)].add(node); nodes.push(node);
  }
  return { root, nodes, random };
}
const shown = (node: THREE.Object3D) => { for (let n: THREE.Object3D | null = node; n; n = n.parent) if (!n.visible) return false; return true; };
function expectVisibleMatch(a: THREE.Object3D[], b: THREE.Object3D[]) {
  let compared = 0;
  a.forEach((node, i) => {
    if (!shown(node)) return;
    expect(b[i].matrixWorld.elements).toEqual(node.matrixWorld.elements); compared++;
    if (node instanceof THREE.Camera) expect((b[i] as THREE.Camera).matrixWorldInverse.elements).toEqual(node.matrixWorldInverse.elements);
  });
  return compared;
}

it('gives every visible object the matrix three would, through moves, hiding and showing', () => {
  const native = forest(11), ours = forest(11);
  native.root.updateMatrixWorld(); updateVisibleMatrixWorld(ours.root);
  expect(expectVisibleMatch(native.nodes, ours.nodes)).toBeGreaterThan(60);
  for (let frame = 0; frame < 30; frame++) {
    // The same random edits to both: moves (frozen nodes via updateMatrix), and visibility flips.
    for (let k = 0; k < 20; k++) {
      const i = 1 + Math.floor(native.random() * 300), dx = native.random() - .5, flip = native.random() < .3;
      for (const tree of [native, ours]) {
        const node = tree.nodes[i]; node.position.x += dx;
        if (!node.matrixAutoUpdate) node.updateMatrix();
        if (flip) node.visible = !node.visible;
      }
    }
    native.root.updateMatrixWorld(); updateVisibleMatrixWorld(ours.root);
    expectVisibleMatch(native.nodes, ours.nodes);
  }
});

it('recomputes a frozen child shown again after its parent moved while it was hidden', () => {
  const scene = new THREE.Scene(), parent = new THREE.Object3D(), child = new THREE.Object3D();
  child.position.set(1, 0, 0); child.updateMatrix(); child.matrixAutoUpdate = false;
  parent.matrixAutoUpdate = false; scene.add(parent); parent.add(child);
  updateVisibleMatrixWorld(scene);
  child.visible = false; parent.position.set(0, 5, 0); parent.updateMatrix(); updateVisibleMatrixWorld(scene);
  updateVisibleMatrixWorld(scene); // a pass where nothing moves
  child.visible = true; updateVisibleMatrixWorld(scene);
  expect(new THREE.Vector3().setFromMatrixPosition(child.matrixWorld).toArray()).toEqual([1, 5, 0]);
});

it('leaves hidden subtrees alone, unless a forced update is asked for and allowed', () => {
  const scene = new THREE.Scene(), hidden = new THREE.Object3D(), inner = new THREE.Object3D();
  hidden.visible = false; inner.position.set(2, 0, 0); scene.add(hidden); hidden.add(inner);
  const undo = skipHiddenMatrixUpdates(scene);
  scene.updateMatrixWorld();
  expect(inner.matrixWorld.elements[12]).toBe(0);
  scene.updateMatrixWorld(true);
  expect(inner.matrixWorld.elements[12]).toBe(2);
  inner.position.x = 3; undo(); skipHiddenMatrixUpdates(scene, { forcedToo: true });
  scene.updateMatrixWorld(true);
  expect(inner.matrixWorld.elements[12]).toBe(2);
  // The renderer reaches it through the same method.
  expect(Object.prototype.hasOwnProperty.call(scene, 'updateMatrixWorld')).toBe(true);
});
