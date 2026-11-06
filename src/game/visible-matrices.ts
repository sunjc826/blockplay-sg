import * as THREE from 'three';
// Imported first: it wraps three's matrix methods, and the wrapped one is what `nativeUpdate` must be.
import { noteMatrixWrite } from './matrix-epoch';

const nativeUpdate = THREE.Object3D.prototype.updateMatrixWorld;

/**
 * three's `updateMatrixWorld`, except that hidden subtrees are left alone.
 * Nothing hidden is drawn, and a subtree shown again is brought up to date by
 * the next pass before it can be. A child skipped while its parent's matrix
 * changed is flagged, so that pass recomputes it even if nothing else moved.
 *
 * Objects that override `updateMatrixWorld` (cameras, skinned meshes) keep
 * their own method, and so their whole subtree.
 */
export function updateVisibleMatrixWorld(object: THREE.Object3D, force = false) {
  noteMatrixWrite();
  if (object.matrixAutoUpdate) object.updateMatrix();
  if (object.matrixWorldNeedsUpdate || force) {
    if (object.matrixWorldAutoUpdate === true) {
      if (object.parent === null) object.matrixWorld.copy(object.matrix);
      else object.matrixWorld.multiplyMatrices(object.parent.matrixWorld, object.matrix);
    }
    object.matrixWorldNeedsUpdate = false;
    force = true;
  }
  const children = object.children;
  for (let i = 0, l = children.length; i < l; i++) {
    const child = children[i];
    if (!child.visible) { if (force) child.matrixWorldNeedsUpdate = true; continue; }
    if (child.updateMatrixWorld === nativeUpdate) updateVisibleMatrixWorld(child, force);
    else child.updateMatrixWorld(force);
  }
}

/**
 * Makes `scene.updateMatrixWorld` skip hidden subtrees: the renderer's own call
 * every frame, and any other caller's. With `forcedToo` false, an explicit
 * `updateMatrixWorld(true)` still updates everything, hidden or not, for code
 * that reads matrices off objects that may be hidden. Returns the undo.
 */
export function skipHiddenMatrixUpdates(scene: THREE.Object3D, { forcedToo = false } = {}) {
  const own = Object.prototype.hasOwnProperty.call(scene, 'updateMatrixWorld') ? scene.updateMatrixWorld : undefined;
  scene.updateMatrixWorld = function (this: THREE.Object3D, force?: boolean) {
    if (force && !forcedToo) nativeUpdate.call(this, true);
    else updateVisibleMatrixWorld(this, force);
  };
  return () => { if (own) scene.updateMatrixWorld = own; else delete (scene as Partial<THREE.Object3D>).updateMatrixWorld; };
}
