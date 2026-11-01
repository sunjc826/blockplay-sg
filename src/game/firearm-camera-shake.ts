import { Quaternion, type Camera } from 'three';

export interface FirearmShakePose { pitch: number; yaw: number; roll: number }
/** Less than half a degree per axis, including sustained automatic fire. */
export const FIREARM_SHAKE_LIMIT = .0085;
export const FIREARM_SHAKE_DURATION = .2;
const clamp = (value: number, max = 1) => Math.max(0, Math.min(max, value));

/** A short render-only vibration; existing recoil owns all aim and weapon movement. */
export function createFirearmCameraShake() {
  let age = FIREARM_SHAKE_DURATION, strength = 0, shot = 0;
  const worldRotation = new Quaternion(), viewRotation = new Quaternion();
  return {
    reset() { age = FIREARM_SHAKE_DURATION; strength = shot = 0; },
    shot(recoil: number, impulseMultiplier = 1) {
      if (!Number.isFinite(recoil) || recoil <= 0 || !Number.isFinite(impulseMultiplier) || impulseMultiplier <= 0) return;
      const remaining = Math.max(0, 1 - age / FIREARM_SHAKE_DURATION);
      // Refresh the pulse rather than adding another layer on every automatic round.
      strength = Math.max(strength * remaining * remaining, Math.min(1.4, Math.sqrt(recoil / .018)) * clamp(impulseMultiplier));
      age = 0; shot++;
    },
    advance(dt: number) {
      if (Number.isFinite(dt) && dt > 0) age = Math.min(FIREARM_SHAKE_DURATION, age + dt);
    },
    sample(aim = 0, magnification = 1, reducedMotion = false): FirearmShakePose {
      if (reducedMotion || age >= FIREARM_SHAKE_DURATION) return { pitch: 0, yaw: 0, roll: 0 };
      const ads = Number.isFinite(aim) ? clamp(aim) : 0;
      const zoom = Number.isFinite(magnification) ? Math.max(1, magnification) : 1;
      const remaining = 1 - age / FIREARM_SHAKE_DURATION;
      const amount = strength * remaining * remaining * Math.exp(-age * 10) * (1 - ads * .4) / (1 + (zoom - 1) * ads);
      const direction = shot % 2 ? 1 : -1;
      return {
        pitch: Math.sin(age * 92) * amount * .003,
        yaw: Math.sin(age * 113) * amount * .0026 * direction,
        roll: Math.cos(age * 78) * amount * .006 * direction,
      };
    },
    /** Restore both cameras even if rendering fails; gameplay rays never inherit the shake. */
    render<T>(world: Camera, view: Camera, pose: FirearmShakePose, draw: () => T): T {
      if (!pose.pitch && !pose.yaw && !pose.roll) return draw();
      worldRotation.copy(world.quaternion); viewRotation.copy(view.quaternion);
      for (const camera of [world, view]) {
        camera.rotateX(pose.pitch); camera.rotateY(pose.yaw); camera.rotateZ(pose.roll);
        camera.updateMatrixWorld(true);
      }
      try { return draw(); }
      finally {
        world.quaternion.copy(worldRotation); view.quaternion.copy(viewRotation);
        world.updateMatrixWorld(true); view.updateMatrixWorld(true);
      }
    },
  };
}
