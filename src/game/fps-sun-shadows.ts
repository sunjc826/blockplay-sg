import * as THREE from 'three';
import { isWaterObject } from './water';

/**
 * Sun shadows for the first-person view. A district's sun was authored with a
 * frustum over the whole map, which at FPS distances is a few texels per
 * metre; here one 2048² map covers a square about 130 metres across
 * that follows the camera, so a lamp post, a railing or a soldier throws a
 * shadow you can read. The frustum is snapped to whole shadow texels in the
 * light's own frame, so walking does not make every edge crawl.
 *
 * Skipped on software renderers (SwiftShader, llvmpipe), where a second pass
 * over the district costs more than the whole frame should.
 */
export const SHADOW_SPAN = 64;
const SHADOW_MAP = 2048;
const RESCAN_SECONDS = 1;

export function softwareRenderer(renderer: THREE.WebGLRenderer) {
  const gl = renderer.getContext(), info = gl.getExtension('WEBGL_debug_renderer_info');
  const name = String(info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
  return /swiftshader|llvmpipe|softpipe|software|basic render/i.test(name);
}

/** Whether a mesh should throw and take shadows: lit, opaque, solid scenery and figures. */
function shadowed(object: THREE.Object3D) {
  if (!(object instanceof THREE.Mesh) || object.userData.fpsEffect || isWaterObject(object)) return false;
  const materials = Array.isArray(object.material) ? object.material : [object.material];
  return materials.every(m => !m.transparent && !(m instanceof THREE.MeshBasicMaterial) && !(m instanceof THREE.ShaderMaterial));
}

export function createSunShadows(renderer: THREE.WebGLRenderer, scene: THREE.Scene) {
  let sun: THREE.DirectionalLight | null = null;
  scene.traverse(object => { if (!sun && object instanceof THREE.DirectionalLight) sun = object; });
  const light = sun as THREE.DirectionalLight | null;
  const supported = !!light && !softwareRenderer(renderer);
  if (light) {
    if (!light.target.parent) scene.add(light.target);
    light.castShadow = false;
    light.shadow.mapSize.set(SHADOW_MAP, SHADOW_MAP);
    Object.assign(light.shadow.camera, { left: -SHADOW_SPAN, right: SHADOW_SPAN, top: SHADOW_SPAN, bottom: -SHADOW_SPAN, near: 1, far: 600 });
    light.shadow.camera.updateProjectionMatrix();
    light.shadow.bias = -.0004; light.shadow.normalBias = .04;
  }
  renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.shadowMap.autoUpdate = false;
  const flagged = new WeakSet<THREE.Object3D>();
  let enabled = false, rescan = 0, casters = 0;
  const forward = new THREE.Vector3(), right = new THREE.Vector3(), up = new THREE.Vector3(), toward = new THREE.Vector3(), center = new THREE.Vector3();
  const worldUp = new THREE.Vector3(0, 1, 0), texel = SHADOW_SPAN * 2 / SHADOW_MAP;
  function scan() {
    scene.traverse(object => {
      if (flagged.has(object)) return;
      flagged.add(object);
      if (shadowed(object)) { object.castShadow = true; object.receiveShadow = true; casters++; }
    });
  }
  return {
    get enabled() { return enabled; },
    /** Meshes flagged to throw and take shadows so far. */
    get casters() { return casters; },
    /**
     * Turns shadows on or off and centres the frustum a little ahead of the
     * camera. `direction` points towards the light. Call once a frame, before
     * anything renders the scene.
     */
    update(want: boolean, camera: THREE.Camera, direction: { x: number; y: number; z: number }, dt: number) {
      const on = supported && want && !!light;
      if (on !== enabled) {
        enabled = on; renderer.shadowMap.enabled = on;
        if (light) light.castShadow = on;
        // Programs compiled without the shadow map need rebuilding to sample it.
        scene.traverse(object => { if (object instanceof THREE.Mesh) (Array.isArray(object.material) ? object.material : [object.material]).forEach(m => { m.needsUpdate = true; }); });
      }
      if (!on || !light) return;
      if ((rescan -= dt) <= 0) { rescan = RESCAN_SECONDS; scan(); }
      toward.set(direction.x, direction.y, direction.z).normalize();
      // The light's frame: looking down -toward, with right and up across it.
      forward.copy(toward).negate();
      right.crossVectors(forward, Math.abs(forward.y) > .999 ? right.set(0, 0, 1) : worldUp).normalize();
      up.crossVectors(right, forward);
      camera.getWorldDirection(center); center.y = 0;
      if (center.lengthSq() > 1e-6) center.normalize();
      center.multiplyScalar(SHADOW_SPAN * .35).add(camera.getWorldPosition(new THREE.Vector3()));
      const along = center.dot(forward), x = Math.round(center.dot(right) / texel) * texel, y = Math.round(center.dot(up) / texel) * texel;
      light.target.position.copy(right.multiplyScalar(x)).addScaledVector(up, y).addScaledVector(forward, along);
      light.target.updateMatrixWorld();
      renderer.shadowMap.needsUpdate = true;
    },
    dispose() { renderer.shadowMap.enabled = false; if (light) light.castShadow = false; },
  };
}
