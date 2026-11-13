import { WATER_WAVES, type WaterImpulse } from './water-wave-state';

/** Presentation poses, including interpolated remote/AI boats. Forward is -Z. */
export interface WaterBoat {
  id: string; x: number; z: number; yaw: number; speed: number; active: boolean;
  revision: number;
  /** Written by the Ultra renderer; fades the inexpensive hull-attached wake. */
  wakeBlend: number;
}
const SPACING = .35;
const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x-a)/(b-a))); return t*t*(3-2*t);
};

/** Fade forcing before the absorbing border, avoiding a visible distance cutoff. */
export function boatWaveFade(x: number, z: number, origin: { x: number; y: number }) {
  const edge = Math.min(x-origin.x, z-origin.y, origin.x+WATER_WAVES.span-x, origin.y+WATER_WAVES.span-z);
  return smooth(1, 4, edge);
}

/** Keep the fallback until both the hull and its short trailing streak fit. */
export function boatWakeCoverage(boat: WaterBoat, origin: { x: number; y: number }) {
  const sign = boat.speed < 0 ? -1 : 1, fx = -Math.sin(boat.yaw)*sign, fz = -Math.cos(boat.yaw)*sign;
  let cover = 1;
  for (const along of [-8, 4.5]) for (const side of [-1.7, 1.7]) {
    cover = Math.min(cover, boatWaveFade(boat.x+fx*along-fz*side, boat.z+fz*along+fx*side, origin));
  }
  return cover;
}

/** Distance-spaced bow shoulders, stern drawdown and alternating turbulence.
 * Propagation in the shared field forms a V at cruising speed; old waves stay
 * behind in world space on turns. No trail is drawn across respawns or pauses. */
export function createBoatWake() {
  let previous: WaterBoat | undefined, carry = 0, travel = 0;
  return {
    reset() { previous = undefined; carry = travel = 0; },
    update(source: WaterBoat, dt: number, emit: (event: WaterImpulse, delay: number) => void) {
      if (!source.active || ![source.x,source.z,source.yaw,source.speed,dt].every(Number.isFinite)) {
        previous = undefined; carry = travel = 0; return;
      }
      if (dt <= 0) return;
      const distance = previous ? Math.hypot(source.x-previous.x,source.z-previous.z) : 0;
      if (!previous || source.revision !== previous.revision || dt > .5 || distance > Math.max(.75,dt*7) || source.speed*previous.speed < 0) {
        previous = { ...source }; carry = travel = 0; return;
      }
      const speed = Math.min(Math.abs(source.speed),distance/dt);
      if (speed < .12) { previous = { ...source }; carry = 0; return; }
      const yawDelta = Math.atan2(Math.sin(source.yaw-previous.yaw),Math.cos(source.yaw-previous.yaw));
      for (let along=SPACING-carry, count=0; along<=distance+1e-8 && count<8; along+=SPACING,count++) {
        const t = Math.min(1,along/distance), x = previous.x+(source.x-previous.x)*t, z = previous.z+(source.z-previous.z)*t;
        const yaw = previous.yaw+yawDelta*t, sign = source.speed < 0 ? -1 : 1;
        const fx = -Math.sin(yaw)*sign, fz = -Math.cos(yaw)*sign, nx = -fz, nz = fx;
        const power = smooth(.12,4.5,speed), height = .018+.06*power;
        const stamp = (forward: number, side: number, radius: number, h: number, foam: number) => emit({
          x: x+fx*forward+nx*side, z: z+fz*forward+nz*side, radius, height: h*power, foam: foam*power,
        }, -(1-t)*dt);
        for (const side of [-1,1]) stamp(3.65,side*.5,.52,height,.055);
        stamp(-3.9,0,.65,-height*.65,.13);
        const phase = (travel+along)*5.1;
        stamp(-4.65,Math.sin(phase)*.42,.28+.06*Math.cos(phase),height*.32*Math.cos(phase*.71),.2);
      }
      carry = (carry+distance)%SPACING;
      // Floating-point accumulation may leave a full spacing at an exact endpoint.
      if (carry > SPACING-1e-8) carry = 0;
      travel += distance; previous = { ...source };
    },
  };
}
