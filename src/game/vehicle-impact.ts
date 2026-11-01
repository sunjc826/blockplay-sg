import type { Camera } from 'three';
import type { VehicleImpact, VehicleState } from './vehicle-rules';

const clamp = (n: number, limit: number) => Math.max(-limit, Math.min(limit, n));

/** A retained contact receipt survives authority ticks that contain no new crash. */
export function recordVehicleImpact(state: VehicleState, speed: number, impulse: { x: number; y: number; z: number }) {
  const length = Math.hypot(impulse.x, impulse.y, impulse.z);
  if (speed <= 1.5 || length < 1e-6) return;
  state.impact = { serial: (state.impact?.serial ?? 0) + 1, speed, x: impulse.x / length, y: impulse.y / length, z: impulse.z / length };
}

export function validVehicleImpact(value: unknown): value is VehicleImpact {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as Record<string, number>;
  return Number.isSafeInteger(v.serial) && v.serial > 0 && v.serial <= 1e9 &&
    ['speed', 'x', 'y', 'z'].every(key => typeof v[key] === 'number' && Number.isFinite(v[key])) &&
    v.speed > 1.5 && v.speed <= 120 && Math.abs(Math.hypot(v.x, v.y, v.z) - 1) < 1e-5;
}

export interface VehicleImpactPose {
  body: { pitch: number; roll: number; heave: number };
  camera: { pitch: number; yaw: number; roll: number };
}

export const createEmptyImpactPose = (): VehicleImpactPose => ({ body: { pitch: 0, roll: 0, heave: 0 }, camera: { pitch: 0, yaw: 0, roll: 0 } });

/** Bounded, deterministic suspension recoil and a faster camera rattle. */
export function createVehicleImpactMotion() {
  let serial = 0;
  const pulses: { age: number; strength: number; side: number; forward: number; up: number }[] = [];
  return {
    reset(baseline = 0) { serial = baseline; pulses.length = 0; },
    accept(impact: VehicleImpact | undefined, yaw: number) {
      if (!validVehicleImpact(impact) || impact.serial <= serial) return;
      serial = impact.serial;
      pulses.push({ age: 0, strength: Math.min(1, (impact.speed - 1.5) / 18.5),
        side: Math.cos(yaw) * impact.x - Math.sin(yaw) * impact.z,
        forward: -Math.sin(yaw) * impact.x - Math.cos(yaw) * impact.z, up: impact.y });
      if (pulses.length > 4) pulses.shift();
    },
    advance(dt: number) {
      if (!Number.isFinite(dt) || dt <= 0) return;
      for (const pulse of pulses) pulse.age += dt;
      while (pulses.length && pulses[0].age > 1.2) pulses.shift();
    },
    sample(reducedMotion = false): VehicleImpactPose {
      const { body, camera } = createEmptyImpactPose();
      if (reducedMotion) return { body, camera };
      for (const p of pulses) {
        const spring = p.strength * Math.exp(-p.age * 7) * Math.sin(p.age * 24);
        const rattle = p.strength * Math.exp(-p.age * 10) * Math.sin(p.age * 53);
        body.pitch += p.forward * spring * .075;
        body.roll -= p.side * spring * .065;
        body.heave += Math.abs(spring) * .045 + p.up * spring * .045;
        camera.pitch += p.forward * spring * .024 + p.up * rattle * .018 + rattle * .006;
        camera.yaw += p.side * rattle * .016;
        camera.roll -= p.side * spring * .022 + rattle * .006;
      }
      body.pitch = clamp(body.pitch, .08); body.roll = clamp(body.roll, .07); body.heave = clamp(body.heave, .09);
      camera.pitch = clamp(camera.pitch, .035); camera.yaw = clamp(camera.yaw, .025); camera.roll = clamp(camera.roll, .03);
      return { body, camera };
    },
  };
}

/** Apply only to the freshly placed view: player look angles and aim are untouched. */
export function applyVehicleImpactCamera(camera: Camera, pose: VehicleImpactPose, firstPerson: boolean) {
  // Cab occupants already inherit the body's suspension pitch/roll through their seat.
  const scale = firstPerson ? .55 : 1;
  camera.rotateX(pose.camera.pitch * scale);
  camera.rotateY(pose.camera.yaw * scale);
  camera.rotateZ(pose.camera.roll * scale);
  camera.updateMatrixWorld(true);
}
