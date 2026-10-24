import * as THREE from 'three';
import type { OpticGlass } from './weapon-glass';

// Head rotation between captures is reprojected, so leave that much slack
// around the reflected cone before the capture's edge fade would show.
const AIMED_MARGIN = THREE.MathUtils.degToRad(3), HIP_MARGIN = THREE.MathUtils.degToRad(9);
const MIN_HALF_FOV = THREE.MathUtils.degToRad(8), MAX_HALF_FOV = THREE.MathUtils.degToRad(55);

/**
 * One reflection target shared by the held optics. Its FOV is fitted to the cone
 * the curved lens actually reflects and its size to the lens's on-screen pixels,
 * so the glass gets about one texel per screen pixel. Aimed optics capture every
 * frame; at the hip, where the lens is small and off-axis, at most 20 per second.
 */
export function createOpticReflectionRenderer(renderer: THREE.WebGLRenderer) {
  const target = new THREE.WebGLRenderTarget(256, 256, { type: THREE.HalfFloatType, depthBuffer: true, stencilBuffer: false });
  const camera = new THREE.PerspectiveCamera(110, 1, .06, 400);
  const lens = new THREE.Vector3(), normal = new THREE.Vector3(), reflected = new THREE.Vector3(), projected = new THREE.Vector3();
  const point = new THREE.Vector3(), cameraPosition = new THREE.Vector3(), scale = new THREE.Vector3(), buffer = new THREE.Vector2();
  const orientation = new THREE.Quaternion(), rotation = new THREE.Matrix4(), captureFromView = new THREE.Matrix4();
  const viewFromSurface = new THREE.Matrix4(), normalMatrix = new THREE.Matrix3();
  let previousGlass: OpticGlass | undefined, lastCapture = -Infinity;

  /** The widest reflected eye ray across the lens, as a tangent in the capture camera. */
  function reflectedExtent(geometry: THREE.BufferGeometry) {
    const positions = geometry.attributes.position, normals = geometry.attributes.normal;
    let extent = 0;
    for (let i = 0; i < positions.count; i++) {
      // The ring's zero-radius centre leaves degenerate vertices with no normal.
      normal.fromBufferAttribute(normals, i);
      if (normal.lengthSq() < .25) continue;
      normal.applyMatrix3(normalMatrix).normalize();
      point.fromBufferAttribute(positions, i).applyMatrix4(viewFromSurface).normalize();
      reflected.copy(point).reflect(normal).transformDirection(captureFromView);
      const depth = Math.max(-reflected.z, .05);
      extent = Math.max(extent, Math.abs(reflected.x) / depth, Math.abs(reflected.y) / depth);
    }
    return extent;
  }

  return {
    render(world: THREE.Scene, worldCamera: THREE.PerspectiveCamera, viewCamera: THREE.PerspectiveCamera, glass: OpticGlass | undefined, active: boolean, seconds: number, aimProgress = 1) {
      if (!active || !glass) return false;
      worldCamera.updateMatrixWorld(); viewCamera.updateMatrixWorld(); glass.surface.updateWorldMatrix(true, false);
      glass.surface.getWorldPosition(lens).applyMatrix4(viewCamera.matrixWorldInverse);
      projected.copy(lens).applyMatrix4(viewCamera.projectionMatrix);
      if (lens.z >= -.01 || Math.abs(projected.x) > 1.15 || Math.abs(projected.y) > 1.15) return false;
      rotation.extractRotation(worldCamera.matrixWorld);
      const aimed = aimProgress > .5;
      let captured = false;
      if (previousGlass !== glass || seconds - lastCapture >= (aimed ? 0 : .05)) {
        // Viewmodel coordinates are camera-local, while the reflected scenery is
        // in world space. Map the lens normal and reflected eye ray between them.
        normal.set(0, 0, 1).transformDirection(glass.surface.matrixWorld).transformDirection(viewCamera.matrixWorldInverse);
        reflected.copy(lens).normalize().reflect(normal);
        worldCamera.getWorldQuaternion(orientation);
        camera.position.copy(lens).applyQuaternion(orientation).add(worldCamera.getWorldPosition(cameraPosition));
        reflected.applyQuaternion(orientation).add(camera.position);
        camera.up.set(0, 1, 0).applyQuaternion(orientation);
        camera.lookAt(reflected); camera.updateMatrixWorld();
        captureFromView.multiplyMatrices(camera.matrixWorldInverse, rotation);

        // Fit the FOV to what the lens can reflect, instead of a fixed 110°.
        viewFromSurface.multiplyMatrices(viewCamera.matrixWorldInverse, glass.surface.matrixWorld);
        normalMatrix.getNormalMatrix(viewFromSurface);
        const halfFov = THREE.MathUtils.clamp(Math.atan(reflectedExtent(glass.surface.geometry)) + (aimed ? AIMED_MARGIN : HIP_MARGIN), MIN_HALF_FOV, MAX_HALF_FOV);
        camera.fov = THREE.MathUtils.radToDeg(halfFov * 2); camera.updateProjectionMatrix();

        // The lens's on-screen diameter in drawing-buffer pixels, in 128px steps
        // so the target only reallocates when the lens size changes a lot.
        const geometry = glass.surface.geometry;
        if (!geometry.boundingSphere) geometry.computeBoundingSphere();
        const radius = geometry.boundingSphere!.radius * scale.setFromMatrixScale(glass.surface.matrixWorld).x;
        const screenFraction = radius / (-lens.z * Math.tan(THREE.MathUtils.degToRad(viewCamera.fov / 2)));
        const size = THREE.MathUtils.clamp(Math.ceil(screenFraction * renderer.getDrawingBufferSize(buffer).y * 1.25 / 128) * 128, 256, 1024);
        if (target.width !== size) target.setSize(size, size);

        const previousTarget = renderer.getRenderTarget(), shadows = renderer.shadowMap.autoUpdate, xr = renderer.xr.enabled;
        try {
          renderer.shadowMap.autoUpdate = false; renderer.xr.enabled = false;
          renderer.setRenderTarget(target); renderer.clear(); renderer.render(world, camera);
        } finally {
          renderer.setRenderTarget(previousTarget); renderer.shadowMap.autoUpdate = shadows; renderer.xr.enabled = xr;
        }
        glass.uniforms.reflectionMap.value = target.texture;
        glass.uniforms.reflectionTanHalfFov.value = Math.tan(halfFov);
        glass.uniforms.reflectionReady.value = 1;
        previousGlass = glass; lastCapture = seconds; captured = true;
      }
      // Reproject every frame against the last capture, so head movement changes
      // the reflection smoothly even between throttled hip captures.
      captureFromView.multiplyMatrices(camera.matrixWorldInverse, rotation);
      glass.uniforms.reflectionViewToCapture.value.setFromMatrix4(captureFromView);
      return captured;
    },
    dispose() { target.dispose(); },
  };
}
