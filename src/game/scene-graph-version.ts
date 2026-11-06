import * as THREE from 'three';

/**
 * A number on every object that changes whenever an object is added or removed
 * anywhere beneath it, so a cache built by walking a subtree (the gameplay ray
 * index's object list) knows when to walk it again. three changes `children`
 * only inside `add`, `remove` and `attach` (`clear` and `removeFromParent` call
 * `remove`), which are wrapped here.
 */
const VERSION = Symbol.for('blockplay.graphVersion');
type Versioned = THREE.Object3D & { [VERSION]?: number };
let epoch = 0;
export const graphVersion = (object: THREE.Object3D) => (object as Versioned)[VERSION] ?? 0;
const stamp = (from: THREE.Object3D) => { const version = ++epoch; for (let node: THREE.Object3D | null = from; node; node = node.parent) (node as Versioned)[VERSION] = version; };

const patched = Symbol.for('blockplay.graphVersion.patched');
const proto = THREE.Object3D.prototype as THREE.Object3D & { [patched]?: true };
if (!proto[patched]) {
  proto[patched] = true;
  const add = proto.add, remove = proto.remove, attach = proto.attach;
  proto.add = function (this: THREE.Object3D, ...objects: THREE.Object3D[]) { const result = add.apply(this, objects); stamp(this); return result; };
  proto.attach = function (this: THREE.Object3D, object: THREE.Object3D) { const result = attach.call(this, object); stamp(this); return result; };
  proto.remove = function (this: THREE.Object3D, ...objects: THREE.Object3D[]) { const result = remove.apply(this, objects); stamp(this); return result; };
}
