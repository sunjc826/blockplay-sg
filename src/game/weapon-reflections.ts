import * as THREE from 'three';
import type { OpticGlass } from './weapon-glass';

/** One 192px reflection, at most 8 captures/second, shared by the held optics. */
export function createOpticReflectionRenderer(renderer: THREE.WebGLRenderer) {
  const target = new THREE.WebGLRenderTarget(192, 192, { type: THREE.HalfFloatType, depthBuffer: true, stencilBuffer: false });
  const camera = new THREE.PerspectiveCamera(110, 1, .06, 400);
  const lens = new THREE.Vector3(), normal = new THREE.Vector3(), reflected = new THREE.Vector3(), projected = new THREE.Vector3();
  const orientation = new THREE.Quaternion(), rotation = new THREE.Matrix4(), captureFromView = new THREE.Matrix4();
  let previousGlass: OpticGlass | undefined, lastCapture = -Infinity;
  return {
    render(world: THREE.Scene, worldCamera: THREE.PerspectiveCamera, viewCamera: THREE.PerspectiveCamera, glass: OpticGlass | undefined, active: boolean, seconds: number) {
      if (!active || !glass) return false;
      worldCamera.updateMatrixWorld(); viewCamera.updateMatrixWorld(); glass.surface.updateWorldMatrix(true, false);
      glass.surface.getWorldPosition(lens).applyMatrix4(viewCamera.matrixWorldInverse);
      projected.copy(lens).applyMatrix4(viewCamera.projectionMatrix);
      if (lens.z >= -.01 || Math.abs(projected.x) > 1.15 || Math.abs(projected.y) > 1.15) return false;
      let captured = false;
      if (previousGlass !== glass || seconds - lastCapture >= .125) {
        // Viewmodel coordinates are camera-local, while the reflected scenery is
        // in world space. Map the lens normal and reflected eye ray between them.
        normal.set(0, 0, 1).transformDirection(glass.surface.matrixWorld).transformDirection(viewCamera.matrixWorldInverse);
        reflected.copy(lens).normalize().reflect(normal);
        worldCamera.getWorldQuaternion(orientation);
        camera.position.copy(lens).applyQuaternion(orientation).add(worldCamera.getWorldPosition(new THREE.Vector3()));
        reflected.applyQuaternion(orientation).add(camera.position);
        camera.up.set(0, 1, 0).applyQuaternion(orientation);
        camera.lookAt(reflected); camera.updateMatrixWorld();
        const previousTarget = renderer.getRenderTarget(), shadows = renderer.shadowMap.autoUpdate, xr = renderer.xr.enabled;
        try {
          renderer.shadowMap.autoUpdate = false; renderer.xr.enabled = false;
          renderer.setRenderTarget(target); renderer.clear(); renderer.render(world, camera);
        } finally {
          renderer.setRenderTarget(previousTarget); renderer.shadowMap.autoUpdate = shadows; renderer.xr.enabled = xr;
        }
        glass.uniforms.reflectionMap.value = target.texture;
        glass.uniforms.reflectionReady.value = 1;
        previousGlass = glass; lastCapture = seconds; captured = true;
      }
      // Reproject every frame against the last capture, so head movement changes
      // the reflection smoothly even between the throttled scenery renders.
      rotation.extractRotation(worldCamera.matrixWorld);
      captureFromView.multiplyMatrices(camera.matrixWorldInverse, rotation);
      glass.uniforms.reflectionViewToCapture.value.setFromMatrix4(captureFromView);
      return captured;
    },
    dispose() { target.dispose(); },
  };
}
