import * as THREE from 'three';

/** Keep material identity and shader hooks (camouflage, night lighting, glass).
 * Only tagged actors/equipment and explicitly supplied viewmodels are changed. */
export function createWetSurfaces(scene: THREE.Object3D, all = false) {
  const records = new Map<THREE.MeshStandardMaterial, { roughness: number; intensity: number; color: THREE.Color; remove: () => void }>();
  let scanIn = 0, wetness = 0;
  function scan(object: THREE.Object3D, enabled: boolean) {
    enabled ||= object.userData.wetSurface === true;
    if (enabled && object instanceof THREE.Mesh) for (const m of Array.isArray(object.material) ? object.material : [object.material]) {
      if (!(m instanceof THREE.MeshStandardMaterial) || m.transparent || m.opacity < 1 || records.has(m)) continue;
      const remove = () => records.delete(m);
      records.set(m, { roughness: m.roughness, intensity: m.envMapIntensity, color: m.color.clone(), remove }); m.addEventListener('dispose', remove);
    }
    for (const child of object.children) scan(child, enabled);
  }
  return {
    get wetness() { return wetness; },
    update(dt: number, rain: number) {
      const step = Math.max(0, Math.min(.1, dt));
      // Soak promptly; water takes longer to dry after the shower passes.
      wetness += (rain - wetness) * (1 - Math.exp(-step * (rain > wetness ? 1.8 : .09)));
      scanIn -= step; if (scanIn <= 0) { scan(scene, all); scanIn = .5; }
      for (const [m, original] of records) {
        const metal = m.metalness > .3;
        const dry = original.roughness * (metal ? .86 : 1);
        const soaked = Math.min(dry, metal ? .2 : .46);
        m.roughness = THREE.MathUtils.lerp(dry, soaked, wetness);
        m.envMapIntensity = original.intensity * (metal ? 1.3 : 1) * (1 + wetness * .65);
        m.color.copy(original.color).multiplyScalar(1 - wetness * (metal ? .035 : .12));
      }
    },
    dispose() {
      for (const [m, original] of records) {
        m.roughness = original.roughness; m.envMapIntensity = original.intensity; m.color.copy(original.color); m.removeEventListener('dispose', original.remove);
      }
      records.clear();
    },
  };
}
