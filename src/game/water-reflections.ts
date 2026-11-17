import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { isWaterObject, primaryWaterSurface, waterSurfaceLevel, waterSurfaceMaterials } from './water';

/** One bounded planar capture for the district's primary water surface, shown by
 * every water material whose surface lies at that height.
 * A mirrored camera can include scenery outside the main view, unlike pavement SSR. */
export function createWaterReflections(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
  const bay = primaryWaterSurface(scene);
  const material = bay?.material;
  const materials = [...waterSurfaceMaterials(scene)].filter(m => m.uniforms.uReflectionReady);
  let reflector: Reflector | undefined, level = 0;
  const size = new THREE.Vector2(), hidden: THREE.Object3D[] = [], eye = new THREE.Vector3();
  const frustum = new THREE.Frustum(), matrix = new THREE.Matrix4();
  return {
    render(enabled: boolean, ultra = false) {
      if (!bay || !material?.uniforms.uReflectionReady) return false;
      for (const m of materials) m.uniforms.uReflectionReady.value = 0;
      material.uniforms.uReflectionReady.value = 0;
      camera.getWorldPosition(eye); bay.updateWorldMatrix(true,false);
      if (enabled) level = waterSurfaceLevel(bay).height;
      frustum.setFromProjectionMatrix(matrix.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
      if (!enabled || eye.y <= level + .05 || !frustum.intersectsObject(bay)) return false;
      if (!reflector) {
        reflector = new Reflector(new THREE.PlaneGeometry(1,1), { textureWidth: 512, textureHeight: 512, multisample: 0, clipBias: .003 });
        reflector.rotation.x = -Math.PI/2; reflector.position.y = level; reflector.updateMatrixWorld(true);
      }
      renderer.getDrawingBufferSize(size);
      const scale=Math.min(.5,(ultra ? 1024 : 768)/Math.max(size.x,size.y)), target=reflector.getRenderTarget();
      // Reflector's HDR target generates the filtered levels after its scene draw.
      const filter = ultra ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
      if (target.texture.minFilter !== filter) {
        target.texture.minFilter = filter; target.texture.generateMipmaps = ultra;
        target.texture.needsUpdate = true;
      }
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
        material.uniforms.uReflectionHeight.value=level;
        material.uniforms.uReflectionReady.value=1;
        for (const m of materials) if (m !== material) {
          m.uniforms.uReflectionMap.value=target.texture; m.uniforms.uReflectionMatrix.value.copy(material.uniforms.uReflectionMatrix.value);
          m.uniforms.uReflectionHeight.value=level; m.uniforms.uReflectionReady.value=1;
        }
      } finally { hidden.forEach(o=>{o.visible=true;}); }
      return true;
    },
    dispose() { for(const m of materials)m.uniforms.uReflectionReady.value=0;if(material?.uniforms.uReflectionReady)material.uniforms.uReflectionReady.value=0;reflector?.geometry.dispose();reflector?.dispose(); },
  };
}
