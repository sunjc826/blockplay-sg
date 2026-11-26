import * as T from 'three';
import { buildFacecam, type CamState } from './scene';

export interface FrameClock {
  request(cb: FrameRequestCallback): number;
  cancel(id: number): void;
  now(): number;
}
const browserClock: FrameClock = {
  request: (cb) => requestAnimationFrame(cb),
  cancel: (id) => cancelAnimationFrame(id),
  now: () => performance.now(),
};
/** 24 Hz, up to 2 ms CPU per update. Back off for a costly frame; do not catch up skipped renders. */
export function schedule(draw: (dt: number) => void, pressure: () => boolean, clock = browserClock) {
  let running = true,
    external = false,
    last = 0,
    previous = 0,
    next = 0,
    handle = 0;
  const stats = { frames: 0, opportunities: 0, skipped: 0, cpuMs: 0, firstMs: 0 };
  function tick(now: number, budget = 1000 / 60) {
    if (!running) return;
    stats.opportunities++;
    if (now + 0.5 >= next && !pressure()) {
      if ((previous && now - previous > budget * 1.45) || clock.now() - now > budget * 0.68) stats.skipped++;
      else {
        const begin = clock.now();
        draw(last ? Math.min(0.1, (now - last) / 1000) : 0);
        last = now;
        const cost = clock.now() - begin;
        if (stats.frames === 0) stats.firstMs = cost;
        else stats.cpuMs += cost;
        stats.frames++;
        next = now + Math.max(1000 / 24, Math.min(250, ((cost / 2) * 1000) / 24));
      }
    }
    previous = now;
    if (running && !external) handle = clock.request(tick);
  }
  handle = clock.request(tick);
  return {
    stats,
    tick,
    gameClock(value: boolean) {
      if (value === external) return;
      external = value;
      clock.cancel(handle);
      previous = 0;
      if (!external && running) handle = clock.request(tick);
    },
    dispose() {
      running = false;
      clock.cancel(handle);
    },
  };
}
export function cameraCanvas(canvas: HTMLCanvasElement, state: CamState, note: (text: string) => void) {
  const renderer = new T.WebGLRenderer({ canvas, alpha: false, antialias: true, powerPreference: 'low-power' });
  renderer.setSize(320, 240, false);
  const shot = buildFacecam(state, note);
  let disposed = false;
  return {
    shot,
    draw(dt: number, reduced: boolean, level: number | undefined, caption: boolean) {
      if (disposed) return;
      shot.frame(dt, reduced, level, caption);
      renderer.render(shot.scene, shot.camera);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      shot.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
