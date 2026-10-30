import { smoothStep } from './fps-weapon-motion';

export const DEPLOYMENT_DESCENT = 3;
export const DEPLOYMENT_READY = 1.65;

/** Local presentation clock. The host stays unstarted until this finishes. */
export function createDeploymentIntro() {
  let elapsed = 0, reduced = false, begun = false, finished = false;
  return {
    get active() { return begun && !finished; },
    get begun() { return begun; },
    begin(reduceMotion: boolean) {
      if (begun) return;
      begun = true; reduced = reduceMotion;
    },
    advance(dt: number) {
      if (!begun || finished) return;
      elapsed += Number.isFinite(dt) ? Math.max(0, dt) : 0;
      finished = elapsed >= (reduced ? 0 : DEPLOYMENT_DESCENT) + DEPLOYMENT_READY;
    },
    skip() { if (begun) finished = true; },
    reset() { elapsed = 0; reduced = begun = finished = false; },
    frame(eye: number, pitch: number, roof: number | null = null) {
      const descent = reduced ? 0 : DEPLOYMENT_DESCENT;
      const aerial = !reduced && elapsed < descent && !finished;
      const t = Math.min(1, elapsed / DEPLOYMENT_DESCENT);
      // Exponential height feels like a fast zoom, easing gently into the eye.
      const height = eye + 150 * (Math.exp(5 * (1 - smoothStep(t))) - 1) / (Math.exp(5) - 1);
      const covered = roof !== null && roof > eye + .4;
      // A sheltered entry cuts under its roof at black rather than clipping through it.
      const cut = covered && t >= .88;
      const ready = finished ? 1 : Math.max(0, Math.min(1, (elapsed - descent) / DEPLOYMENT_READY));
      const fade = covered && aerial ? smoothStep((t - .76) / .12) * (1 - smoothStep((t - .88) / .12)) : 0;
      return {
        stage: aerial ? 'descent' as const : 'ready' as const,
        height: aerial && !cut ? Math.max(height, covered ? roof + 3 : eye) : eye,
        pitch: aerial && !cut ? -Math.PI / 2 + (pitch + Math.PI / 2) * smoothStep((t - .48) / .52) : pitch,
        fov: aerial && !cut ? 65 + 13 * (1 - smoothStep(t)) : 65,
        ready, fade, reduced,
      };
    },
  };
}
