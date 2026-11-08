import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { isWaterObject, type WaterMaterial } from './water';

/** One bounded planar capture for Marina's broad bay, shared by its water shader.
 * A mirrored camera can include scenery outside the main view, unlike pavement SSR. */
export function createWaterReflections(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
  const bay = scene.getObjectByName('marina-bay-water') as THREE.Mesh | undefined;
  const material = bay?.material as WaterMaterial | undefined;
  let reflector: Reflector | undefined;
  const size = new THREE.Vector2(), hidden: THREE.Object3D[] = [], eye = new THREE.Vector3();
  const frustum = new THREE.Frustum(), matrix = new THREE.Matrix4();
  return {
    render(enabled: boolean) {
      if (!bay || !material?.uniforms.uReflectionReady) return false;
      material.uniforms.uReflectionReady.value = 0;
      camera.getWorldPosition(eye); bay.updateWorldMatrix(true,false);
      frustum.setFromProjectionMatrix(matrix.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
      if (!enabled || eye.y <= bay.position.y + .05 || !frustum.intersectsObject(bay)) return false;
      if (!reflector) {
        reflector = new Reflector(new THREE.PlaneGeometry(1,1), { textureWidth: 512, textureHeight: 512, multisample: 0, clipBias: .003 });
        reflector.rotation.x = -Math.PI/2; reflector.position.y = bay.position.y; reflector.updateMatrixWorld(true);
      }
      renderer.getDrawingBufferSize(size);
      const scale=Math.min(.5,768/Math.max(size.x,size.y)), target=reflector.getRenderTarget();
      const width=Math.max(64,Math.ceil(size.x*scale)),height=Math.max(64,Math.ceil(size.y*scale));
      if(target.width!==width||target.height!==height)target.setSize(width,height);
      hidden.length=0;
      scene.traverse(o=>{if(o.visible&&(isWaterObject(o)||o.name==='rain-effects'||o.name==='water-ripple-crests')){hidden.push(o);o.visible=false;}});
      try {
        // Reflector supplies the mirrored camera and oblique plane clipping.
        reflector.onBeforeRender(renderer,scene,camera,reflector.geometry,reflector.material as THREE.Material,null!);
        material.uniforms.uReflectionMap.value=target.texture;
        material.uniforms.uReflectionMatrix.value.copy((reflector.material as THREE.ShaderMaterial).uniforms.textureMatrix.value);
        // Reflector's matrix expects local plane coordinates. Water uses world coordinates.
        material.uniforms.uReflectionMatrix.value.multiply(matrix.copy(reflector.matrixWorld).invert());
        material.uniforms.uReflectionHeight.value=bay.position.y;
        material.uniforms.uReflectionReady.value=1;
      } finally { hidden.forEach(o=>{o.visible=true;}); }
      return true;
    },
    dispose() { if(material?.uniforms.uReflectionReady)material.uniforms.uReflectionReady.value=0;reflector?.geometry.dispose();reflector?.dispose(); },
  };
}
