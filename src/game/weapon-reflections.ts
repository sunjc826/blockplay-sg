import * as THREE from 'three';
import type { OpticGlass } from './weapon-glass';

// Slack around the reflected cone, so the capture's edge fade stays off the glass.
const MARGIN = THREE.MathUtils.degToRad(3);
const MIN_HALF_FOV = THREE.MathUtils.degToRad(8), MAX_HALF_FOV = THREE.MathUtils.degToRad(55);
/** Only objects on this layer appear in the reflection. Shadows and the main view ignore it. */
export const REFLECTED_LAYER = 2;

export interface OpticReflectionOptions {
  /** The reflection's far plane; fog is pulled in during the pass so nothing pops at it. */
  far?: number;
  /**
   * Meshes whose second-largest side is under this many metres are left out:
   * props, characters, vehicles, debris, and long thin rails, kerbs and poles.
   */
  minSize?: number;
}

/**
 * One reflection target shared by the held optics, captured every frame. Its FOV
 * is fitted to the cone the curved lens actually reflects and its size to the
 * lens's on-screen pixels, so the glass gets about one texel per screen pixel.
 * The pass pays for itself by drawing only nearby, large scenery: a tinted
 * lens shows the skyline behind the player, not the bollards and passers-by.
 */
export function createOpticReflectionRenderer(renderer: THREE.WebGLRenderer, { far = 150, minSize = 2 }: OpticReflectionOptions = {}) {
  const target = new THREE.WebGLRenderTarget(256, 256, { type: THREE.HalfFloatType, depthBuffer: true, stencilBuffer: false });
  const camera = new THREE.PerspectiveCamera(110, 1, .06, far);
  camera.layers.set(REFLECTED_LAYER);
  const lens = new THREE.Vector3(), normal = new THREE.Vector3(), reflected = new THREE.Vector3(), projected = new THREE.Vector3();
  const point = new THREE.Vector3(), cameraPosition = new THREE.Vector3(), scale = new THREE.Vector3(), buffer = new THREE.Vector2();
  const orientation = new THREE.Quaternion(), rotation = new THREE.Matrix4(), captureFromView = new THREE.Matrix4();
  const viewFromSurface = new THREE.Matrix4(), normalMatrix = new THREE.Matrix3(), instance = new THREE.Matrix4();
  const extent = new THREE.Vector3(), instanceScale = new THREE.Vector3();
  const classified = new WeakSet<THREE.Object3D>();
  let taggedWorld: THREE.Scene | undefined, lastTag = -Infinity;

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

  /** Put lights and large meshes on the reflected layer, each object once. Sprites, points and lines are effects. */
  function tagScenery(world: THREE.Scene) {
    world.traverse(object => {
      if (classified.has(object)) return;
      classified.add(object);
      if ((object as THREE.Light).isLight) { object.layers.enable(REFLECTED_LAYER); return; }
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
      // Scenery is mostly scaled unit boxes, so measure each axis in world units.
      mesh.updateWorldMatrix(true, false); scale.setFromMatrixScale(mesh.matrixWorld);
      // An instanced set is one draw, but its pieces are the props it repeats.
      const instanced = mesh as THREE.InstancedMesh;
      if (instanced.isInstancedMesh && instanced.count > 0) { instanced.getMatrixAt(0, instance); scale.multiply(instanceScale.setFromMatrixScale(instance)); }
      mesh.geometry.boundingBox!.getSize(extent).multiply(scale);
      const middle = extent.x + extent.y + extent.z - Math.max(extent.x, extent.y, extent.z) - Math.min(extent.x, extent.y, extent.z);
      if (middle >= minSize) object.layers.enable(REFLECTED_LAYER);
    });
  }

  return {
    render(world: THREE.Scene, worldCamera: THREE.PerspectiveCamera, viewCamera: THREE.PerspectiveCamera, glass: OpticGlass | undefined, active: boolean, seconds: number) {
      if (!active || !glass) return false;
      worldCamera.updateMatrixWorld(); viewCamera.updateMatrixWorld(); glass.surface.updateWorldMatrix(true, false);
      glass.surface.getWorldPosition(lens).applyMatrix4(viewCamera.matrixWorldInverse);
      projected.copy(lens).applyMatrix4(viewCamera.projectionMatrix);
      if (lens.z >= -.01 || Math.abs(projected.x) > 1.15 || Math.abs(projected.y) > 1.15) return false;
      // New scenery (vehicles, spawned set pieces) joins within half a second.
      if (taggedWorld !== world || seconds - lastTag >= .5) { tagScenery(world); taggedWorld = world; lastTag = seconds; }

      // Viewmodel coordinates are camera-local, while the reflected scenery is
      // in world space. Map the lens normal and reflected eye ray between them.
      normal.set(0, 0, 1).transformDirection(glass.surface.matrixWorld).transformDirection(viewCamera.matrixWorldInverse);
      reflected.copy(lens).normalize().reflect(normal);
      worldCamera.getWorldQuaternion(orientation);
      camera.position.copy(lens).applyQuaternion(orientation).add(worldCamera.getWorldPosition(cameraPosition));
      reflected.applyQuaternion(orientation).add(camera.position);
      camera.up.set(0, 1, 0).applyQuaternion(orientation);
      camera.lookAt(reflected); camera.updateMatrixWorld();
      rotation.extractRotation(worldCamera.matrixWorld);
      captureFromView.multiplyMatrices(camera.matrixWorldInverse, rotation);

      // Fit the FOV to what the lens can reflect, instead of a fixed 110°.
      viewFromSurface.multiplyMatrices(viewCamera.matrixWorldInverse, glass.surface.matrixWorld);
      normalMatrix.getNormalMatrix(viewFromSurface);
      const halfFov = THREE.MathUtils.clamp(Math.atan(reflectedExtent(glass.surface.geometry)) + MARGIN, MIN_HALF_FOV, MAX_HALF_FOV);
      camera.fov = THREE.MathUtils.radToDeg(halfFov * 2); camera.updateProjectionMatrix();

      // The lens's on-screen diameter in drawing-buffer pixels, in 128px steps
      // so the target only reallocates when the lens size changes a lot.
      const geometry = glass.surface.geometry;
      if (!geometry.boundingSphere) geometry.computeBoundingSphere();
      const radius = geometry.boundingSphere!.radius * scale.setFromMatrixScale(glass.surface.matrixWorld).x;
      const screenFraction = radius / (-lens.z * Math.tan(THREE.MathUtils.degToRad(viewCamera.fov / 2)));
      const size = THREE.MathUtils.clamp(Math.ceil(screenFraction * renderer.getDrawingBufferSize(buffer).y * 1.25 / 128) * 128, 256, 1024);
      if (target.width !== size) target.setSize(size, size);

      // three.js draws a pending shadow map with whichever render comes first and
      // only for casters on that camera's layers. Leave the frame's update to the
      // main view, or the sun map is redrawn from this layer's few large meshes.
      const previousTarget = renderer.getRenderTarget(), shadows = renderer.shadowMap.autoUpdate, shadowsPending = renderer.shadowMap.needsUpdate, xr = renderer.xr.enabled;
      const fog = (world.fog as THREE.Fog | null)?.isFog ? world.fog as THREE.Fog : undefined, fogNear = fog?.near ?? 0, fogFar = fog?.far ?? 0;
      try {
        renderer.shadowMap.autoUpdate = false; renderer.shadowMap.needsUpdate = false; renderer.xr.enabled = false;
        // Fade scenery into the fog colour before the shortened far plane cuts it.
        if (fog) { fog.far = Math.min(fogFar, far); fog.near = Math.min(fogNear, fog.far * .65); }
        renderer.setRenderTarget(target); renderer.clear(); renderer.render(world, camera);
      } finally {
        renderer.setRenderTarget(previousTarget); renderer.shadowMap.autoUpdate = shadows; renderer.shadowMap.needsUpdate = shadowsPending; renderer.xr.enabled = xr;
        if (fog) { fog.near = fogNear; fog.far = fogFar; }
      }
      glass.uniforms.reflectionMap.value = target.texture;
      glass.uniforms.reflectionTanHalfFov.value = Math.tan(halfFov);
      glass.uniforms.reflectionReady.value = 1;
      glass.uniforms.reflectionViewToCapture.value.setFromMatrix4(captureFromView);
      return true;
    },
    /** Draws the world into the target once while loading, so the GPU builds its pipelines for this target's format before the first capture needs them. */
    warm(world: THREE.Scene, worldCamera: THREE.Camera) {
      const previous = renderer.getRenderTarget(), shadows = renderer.shadowMap.needsUpdate;
      renderer.shadowMap.needsUpdate = false;
      renderer.setRenderTarget(target); renderer.clear(); renderer.render(world, worldCamera); renderer.setRenderTarget(previous);
      renderer.shadowMap.needsUpdate = shadows;
    },
    dispose() { target.dispose(); },
  };
}
