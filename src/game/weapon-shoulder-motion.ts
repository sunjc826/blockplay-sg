import { Quaternion, Vector3, type Object3D } from 'three';

export interface ShoulderPose { x: number; y: number; z: number; pitch: number; yaw: number; roll: number }
export const SHOULDER_PUSH_LIMIT = .065;
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const emptyPose = (): ShoulderPose => ({ x: 0, y: 0, z: 0, pitch: 0, yaw: 0, roll: 0 });

/** Independent, cosmetic stock compression; never feeds the recoil or accuracy models. */
export function createWeaponShoulderMotion() {
  let push = 0, velocity = 0, frequency = 45, damping = 22.5, age = 1, strength = 0, shot = 0;
  const originalPosition = new Vector3(), originalRotation = new Quaternion();
  return {
    reset() { push = velocity = strength = shot = 0; age = 1; },
    shot(spec: { recoil: number; weightKg?: number }, impulseMultiplier = 1) {
      if (!Number.isFinite(spec.recoil) || spec.recoil <= 0 || !Number.isFinite(impulseMultiplier) || impulseMultiplier <= 0) return;
      const mass = Number.isFinite(spec.weightKg) ? clamp(spec.weightKg! / 4, .5, 3) : 1;
      frequency = 50 - mass * 5; damping = frequency * .5;
      strength = Math.min(1.65, Math.sqrt(spec.recoil / .018)) * clamp(impulseMultiplier, 0, 1);
      // A small immediate snap, followed by momentum into the shoulder spring.
      push = clamp(push + strength * .018, -.009, SHOULDER_PUSH_LIMIT);
      velocity = clamp(velocity + strength * 2.1, -3, 3);
      age = 0; shot++;
    },
    advance(dt: number) {
      if (!Number.isFinite(dt) || dt <= 0) return;
      age += dt;
      if (age >= .45) { push = velocity = 0; return; }
      // Exact damped-spring integration keeps slow frames from changing the kick.
      const omega = Math.sqrt(frequency * frequency - damping * damping);
      const decay = Math.exp(-damping * dt), sin = Math.sin(omega * dt), cos = Math.cos(omega * dt);
      const next = decay * (push * cos + (velocity + damping * push) / omega * sin);
      velocity = decay * (velocity * cos - (damping * velocity + frequency * frequency * push) / omega * sin);
      push = clamp(next, -.009, SHOULDER_PUSH_LIMIT);
    },
    sample(aim = 0, magnification = 1, support = 0, reducedMotion = false): ShoulderPose {
      if (reducedMotion || age >= .45) return emptyPose();
      const ads = Number.isFinite(aim) ? clamp(aim, 0, 1) : 0;
      const zoom = Number.isFinite(magnification) ? Math.max(1, magnification) : 1;
      const planted = Number.isFinite(support) ? clamp(support, 0, 1) : 0;
      const travel = (1 - ads * .72) * (1 - planted * .5);
      const turn = (1 - ads * .86) / (1 + (zoom - 1) * ads);
      const ring = strength * Math.exp(-age * 28), side = shot % 2 ? 1 : -1;
      return {
        x: push * .035 * side * travel,
        y: -push * .16 * travel,
        z: clamp(push + Math.sin(age * 110) * ring * .0025, -.009, SHOULDER_PUSH_LIMIT) * travel,
        pitch: clamp(push * .8 + Math.sin(age * 120) * ring * .004, -.012, .055) * turn,
        yaw: Math.sin(age * 83) * ring * .0015 * side * turn,
        roll: Math.sin(age * 98) * ring * .003 * side * turn,
      };
    },
    /** Move the gun and its attached hands together for rendering, then restore all gameplay transforms. */
    render<T>(rig: Object3D, pose: ShoulderPose, draw: () => T): T {
      if (!pose.x && !pose.y && !pose.z && !pose.pitch && !pose.yaw && !pose.roll) return draw();
      originalPosition.copy(rig.position); originalRotation.copy(rig.quaternion);
      rig.position.x += pose.x; rig.position.y += pose.y; rig.position.z += pose.z;
      rig.rotateX(pose.pitch); rig.rotateY(pose.yaw); rig.rotateZ(pose.roll); rig.updateMatrixWorld(true);
      try { return draw(); }
      finally {
        rig.position.copy(originalPosition); rig.quaternion.copy(originalRotation); rig.updateMatrixWorld(true);
      }
    },
  };
}
