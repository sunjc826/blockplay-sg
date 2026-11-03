import * as THREE from 'three';
import type { MotorVehicleKind, VehicleState } from './vehicle-rules';

/** One explosion for the renderer: where, how big and the momentum its fire and debris inherit. */
export interface HullBlast { at: THREE.Vector3; drift: THREE.Vector3; size: number }
/** A puff from a burning wreck; `heat` 1 is fresh, falling to a smoulder as it burns out. */
export interface HullBurn { at: THREE.Vector3; size: number; heat: number }
/** Blast size of the hull going up; cook-offs follow at a share of it, on the wreck wherever it has got to. */
const HULL_BLAST: Record<MotorVehicleKind, number> = { car: 1.15, helicopter: 1.5 };
const COOK_OFFS = [{ at: .16, share: .5, x: .7, z: -.9 }, { at: .42, share: .65, x: -.6, z: .8 }];
/** Below this a wreck's contact is a clatter, not a crash. A car landing from its own blast hop stays under it. */
const CRASH_SPEED = 7;
const TUMBLE: Record<MotorVehicleKind, { pitchRate: number; rollRate: number; restPitch: number; restRoll: number; halfWidth: number; halfLength: number }> = {
  car: { pitchRate: 1.1, rollRate: 1.4, restPitch: -.05, restRoll: .16, halfWidth: 1.1, halfLength: 2.3 },
  helicopter: { pitchRate: -.9, rollRate: .8, restPitch: -.12, restRoll: .28, halfWidth: 1.2, halfLength: 3 },
};
const TUMBLE_LIMIT = .7;
/** Seconds between puffs, closer together at speed so the trail stays a trail, and how long the fire takes to die to a smoulder. */
const BURN_EVERY = .14, BURN_EVERY_MOVING = .05, BURN_OUT = 18;

const hullVelocity = (v: VehicleState, into = new THREE.Vector3()) => {
  const sin = Math.sin(v.yaw), cos = Math.cos(v.yaw), lateral = v.lateralSpeed ?? 0;
  return into.set(-sin * v.speed + cos * lateral, Math.min(0, v.climb) * .5, -cos * v.speed - sin * lateral);
};

/**
 * The look of one hull's death, read from authority state so a guest sees what
 * the host does: chained explosions, a crash blast on each hard contact, and a
 * body tumble and rotor spin-down that collide with nothing.
 */
export function createWreckMotion(kind: MotorVehicleKind, reducedMotion: () => boolean = () => false) {
  const tune = TUMBLE[kind], size = HULL_BLAST[kind];
  let serial = 0, age = 0, burning = false, cooked = COOK_OFFS.length, side = 1, burnIn = 0;
  const pose = { pitch: 0, roll: 0, pitchRate: 0, rollRate: 0, lift: 0, rotorRate: 0, rotorLost: false };
  const blastAt = (v: VehicleState, share: number, x = 0, z = 0): HullBlast => ({ at: new THREE.Vector3(v.x + x, v.y + 1.3, v.z + z), drift: hullVelocity(v), size: size * share });
  function clear() {
    burning = false; age = 0; cooked = COOK_OFFS.length; burnIn = 0;
    Object.assign(pose, { pitch: 0, roll: 0, pitchRate: 0, rollRate: 0, lift: 0, rotorRate: 0, rotorLost: false });
  }
  return {
    pose,
    /** The hull has just died; `rotorRate` is what it was turning at. */
    ignite(v: VehicleState, rotorRate = 0): HullBlast[] {
      const still = reducedMotion();
      burning = true; age = 0; serial = v.impact?.serial ?? 0; cooked = still ? COOK_OFFS.length : 0;
      side = Math.sign(v.yawSpeed || 0) || 1;
      pose.pitchRate = still ? 0 : tune.pitchRate; pose.rollRate = still ? 0 : tune.rollRate * side; pose.rotorRate = rotorRate; pose.rotorLost = false;
      return [blastAt(v, 1)];
    },
    /** The next puff of a wreck seen burning, if one is due. */
    burn(v: VehicleState, dt: number): HullBurn | null {
      if (!burning || v.health > 0 || v.despawned || (burnIn -= dt) > 0) return null;
      burnIn = Math.hypot(v.speed, v.lateralSpeed ?? 0, v.climb) > 6 ? BURN_EVERY_MOVING : BURN_EVERY;
      return { at: new THREE.Vector3(v.x, v.y + 1.4, v.z), size, heat: Math.max(.15, 1 - age / BURN_OUT) };
    },
    /** Replaces the receipt without a crash: a hull already dead when first seen, or restored. */
    baseline(v: VehicleState) { serial = v.impact?.serial ?? 0; },
    advance(v: VehicleState, dt: number): HullBlast[] {
      const next = v.impact?.serial ?? 0;
      if (v.health > 0 || v.despawned) { if (burning || pose.rotorLost) clear(); serial = next; return []; }
      const blasts: HullBlast[] = [];
      age += dt; pose.rotorRate *= Math.exp(-1.1 * dt);
      for (; cooked < COOK_OFFS.length && age >= COOK_OFFS[cooked].at; cooked++) { const c = COOK_OFFS[cooked]; blasts.push(blastAt(v, c.share, c.x, c.z)); }
      if (next !== serial) {
        const hit = v.impact!;
        if (next > serial && hit.speed >= CRASH_SPEED) {
          blasts.push({ ...blastAt(v, Math.min(1, .35 + hit.speed / 30)), at: new THREE.Vector3(v.x, v.y + .8, v.z) });
          if (kind === 'helicopter' && hit.y > .5) { pose.rotorLost = true; pose.rotorRate = 0; }
        }
        serial = next;
      }
      const flying = Math.abs(v.climb) > .01;
      if (flying) {
        pose.pitch = THREE.MathUtils.clamp(pose.pitch + pose.pitchRate * dt, -TUMBLE_LIMIT, TUMBLE_LIMIT);
        pose.roll = THREE.MathUtils.clamp(pose.roll + pose.rollRate * dt, -TUMBLE_LIMIT, TUMBLE_LIMIT);
      } else {
        pose.pitch = THREE.MathUtils.damp(pose.pitch, tune.restPitch, 5, dt);
        pose.roll = THREE.MathUtils.damp(pose.roll, tune.restRoll * side, 5, dt);
      }
      // The hull pivots about its base, so lift the low corner clear of the ground.
      pose.lift = tune.halfWidth * Math.abs(Math.sin(pose.roll)) + tune.halfLength * Math.abs(Math.sin(pose.pitch));
      return blasts;
    },
    reset(baselineSerial = 0) { clear(); serial = baselineSerial; side = 1; },
  };
}
