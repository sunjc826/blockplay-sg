import * as THREE from 'three';
import { vehicleDamageStage, type VehicleDamageStage } from './vehicle-combat';
import type { VehicleState } from './vehicle-rules';

/** Bounded, preallocated world-space particles; effects never intercept shots. */
export function createVehicleEffects(scene: THREE.Scene) {
  const root = new THREE.Group(); root.userData.fpsEffect = true; scene.add(root);
  const geometry = new THREE.IcosahedronGeometry(1, 0);
  const particles = Array.from({ length: 96 }, () => {
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }));
    mesh.visible = false; mesh.raycast = () => {}; root.add(mesh);
    return { mesh, velocity: new THREE.Vector3(), age: 0, life: 0, size: 1, fire: false };
  });
  let cursor = 0, emission = 0;
  function emit(point: THREE.Vector3, fire: boolean, blast = false) {
    const p = particles[cursor++ % particles.length]; p.age = 0; p.life = blast ? 1.4 : fire ? .5 : 2.5;
    p.size = blast ? .65 : fire ? .22 : .32; p.fire = fire; p.mesh.position.copy(point); p.mesh.visible = true; p.mesh.scale.setScalar(p.size); p.mesh.material.opacity = 1;
    p.velocity.set((Math.random() - .5) * (blast ? 14 : .7), blast ? 3 + Math.random() * 8 : fire ? 1.3 : 2, (Math.random() - .5) * (blast ? 14 : .7));
    p.mesh.material.color.set(fire ? '#ff9c26' : '#34393b');
  }
  return {
    explode(point: THREE.Vector3) { for (let i = 0; i < 40; i++) emit(point, i < 24, true); },
    step(dt: number, states: VehicleState[]) {
      emission += dt;
      if (emission >= .09) {
        emission %= .09;
        for (const v of states) {
          const stage = vehicleDamageStage(v);
          if (stage === 'intact' || stage === 'damaged') continue;
          const point = new THREE.Vector3(v.x + Math.sin(v.yaw), v.y + 1.5, v.z + Math.cos(v.yaw));
          emit(point, false); if (stage === 'critical' || stage === 'destroyed') emit(point, true);
        }
      }
      for (const p of particles) {
        if (!p.mesh.visible) continue;
        p.age += dt; if (p.age >= p.life) { p.mesh.visible = false; continue; }
        p.mesh.position.addScaledVector(p.velocity, dt);
        p.mesh.scale.setScalar(p.size * (1 + p.age * (p.fire ? 2 : 1.8)));
        p.mesh.material.opacity = (p.fire ? 1 : .65) * (1 - p.age / p.life);
      }
    },
    reset() { particles.forEach(p => { p.mesh.visible = false; }); emission = 0; cursor = 0; },
    dispose() { root.removeFromParent(); geometry.dispose(); particles.forEach(p => p.mesh.material.dispose()); },
  };
}

/** Preserve each wrap and restore exact authored transforms on reset. */
export function vehicleDamageVisual(model: THREE.Group) {
  const materials = new Map<THREE.MeshStandardMaterial, { color: THREE.Color; glow: number; roughness: number }>();
  const panels: { mesh: THREE.Mesh; scale: THREE.Vector3; rotation: THREE.Euler }[] = [];
  model.traverse(o => {
    if (!(o instanceof THREE.Mesh)) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) if (m instanceof THREE.MeshStandardMaterial && !materials.has(m)) materials.set(m, { color: m.color.clone(), glow: m.emissiveIntensity, roughness: m.roughness });
    if (o.parent === model && o.position.y > .7) panels.push({ mesh: o, scale: o.scale.clone(), rotation: o.rotation.clone() });
  });
  let previous: VehicleDamageStage | undefined;
  return (stage: VehicleDamageStage) => {
    if (stage === previous) return; previous = stage;
    const severity = ['intact', 'damaged', 'smoking', 'critical', 'destroyed'].indexOf(stage);
    for (const [material, base] of materials) {
      material.color.copy(base.color).lerp(new THREE.Color('#191b19'), severity * .21);
      material.emissiveIntensity = severity >= 2 ? 0 : base.glow;
      material.roughness = severity ? .85 : base.roughness;
    }
    panels.forEach(({ mesh, scale, rotation }, i) => {
      mesh.scale.copy(scale); mesh.rotation.copy(rotation);
      if (severity) { mesh.scale.y *= 1 - severity * .07; mesh.rotation.z += (i % 2 ? -1 : 1) * severity * .025; }
    });
  };
}
