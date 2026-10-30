import { smoothStep } from './fps-weapon-motion';

export const DEPLOYMENT_DESCENT = 3;
export const DEPLOYMENT_READY = 1.65;
/** The weapon starts rising during the last part of the camera's approach. */
export const DEPLOYMENT_OVERLAP = .85;
const ZOOM = 3.2;
interface DeploymentOrigin { height: number; x: number; z: number; yaw: number; fov: number }

/** Local presentation clock. The host stays unstarted until this finishes. */
export function createDeploymentIntro() {
  let elapsed = 0, reduced = false, begun = false, finished = false;
  let origin: DeploymentOrigin = { height: 150, x: 0, z: 0, yaw: 0, fov: 78 };
  return {
    get active() { return begun && !finished; },
    get begun() { return begun; },
    begin(reduceMotion: boolean, from?: DeploymentOrigin) {
      if (begun) return;
      begun = true; reduced = reduceMotion;
      origin = from ?? { height: 150, x: 0, z: 0, yaw: 0, fov: 78 };
    },
    advance(dt: number) {
      if (!begun || finished) return;
      elapsed += Number.isFinite(dt) ? Math.max(0, dt) : 0;
      finished = elapsed >= (reduced ? 0 : DEPLOYMENT_DESCENT - DEPLOYMENT_OVERLAP) + DEPLOYMENT_READY;
    },
    skip() { if (begun) finished = true; },
    reset() { elapsed = 0; reduced = begun = finished = false; },
    frame(eye: number, pitch: number, roof: number | null = null) {
      const descent = reduced ? 0 : DEPLOYMENT_DESCENT;
      const aerial = !reduced && elapsed < descent && !finished;
      const t = Math.min(1, elapsed / DEPLOYMENT_DESCENT);
      // A quintic distance profile starts and ends with zero velocity and
      // acceleration. Logarithmic height gives the final metres room to brake.
      const travel = t * t * t * (t * (t * 6 - 15) + 10);
      const height = eye + origin.height * Math.expm1(ZOOM * (1 - travel)) / Math.expm1(ZOOM);
      const speed = aerial ? origin.height * ZOOM * Math.exp(ZOOM * (1 - travel)) * 30 * t * t * (1 - t) ** 2 / (Math.expm1(ZOOM) * DEPLOYMENT_DESCENT) : 0;
      const covered = roof !== null && roof > eye + .4;
      // A sheltered entry cuts under its roof at black rather than clipping through it.
      const cut = covered && t >= .88;
      const ready = finished ? 1 : Math.max(0, Math.min(1, (elapsed - (reduced ? 0 : descent - DEPLOYMENT_OVERLAP)) / DEPLOYMENT_READY));
      const fade = covered && aerial ? smoothStep((t - .76) / .12) * (1 - smoothStep((t - .88) / .12)) : 0;
      return {
        elapsed, reduced,
        stage: aerial ? 'descent' as const : 'ready' as const,
        height: aerial && !cut ? Math.max(height, covered ? roof + 3 : eye) : eye,
        x: aerial && !cut ? origin.x * (1 - smoothStep(t / .15)) : 0,
        z: aerial && !cut ? origin.z * (1 - smoothStep(t / .15)) : 0,
        yaw: aerial && !cut ? origin.yaw * (1 - smoothStep(t / .8)) : 0,
        pitch: aerial && !cut ? -Math.PI / 2 + (pitch + Math.PI / 2) * smoothStep((t - .50) / .45) : pitch,
        fov: aerial && !cut ? 65 + (origin.fov - 65) * (1 - smoothStep(t)) + 4 * Math.min(1, speed / 140) : 65,
        blur: aerial && !cut ? .085 * Math.min(1, speed / 110) * (1 - smoothStep((t - .72) / .23)) : 0,
        weaponVisible: ready > 0 && (!aerial || t >= .72) && (!covered || cut || !aerial),
        speed, ready, fade,
      };
    },
  };
}
