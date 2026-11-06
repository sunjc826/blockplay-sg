import * as THREE from 'three';

/**
 * A count that changes whenever any world matrix may have been rewritten, so a
 * cache built from world matrices (scene cover's ray index) knows when to look
 * again. three writes `matrixWorld` only inside these two methods (and their
 * overrides, which call them); `updateVisibleMatrixWorld` reports its own writes.
 */
let epoch = 0;
export const matrixEpoch = () => epoch;
export const noteMatrixWrite = () => { epoch++; };

const patched = Symbol.for('blockplay.matrixEpoch');
const proto = THREE.Object3D.prototype as THREE.Object3D & { [patched]?: true };
if (!proto[patched]) {
  proto[patched] = true;
  const updateMatrixWorld = proto.updateMatrixWorld, updateWorldMatrix = proto.updateWorldMatrix;
  proto.updateMatrixWorld = function (this: THREE.Object3D, force?: boolean) { epoch++; updateMatrixWorld.call(this, force); };
  proto.updateWorldMatrix = function (this: THREE.Object3D, updateParents: boolean, updateChildren: boolean) { epoch++; updateWorldMatrix.call(this, updateParents, updateChildren); };
}
