import { useSyncExternalStore } from 'react';
import type { WebGLRenderer } from 'three';

/**
 * The on-screen frame counter, chosen in Settings › Video. `fps` shows the rate
 * alone; `profiler` adds frame times, main-thread work, renderer counts and a
 * frame-time graph. Saved per browser. Off by default.
 *
 * Game loops call `beginProfiledFrame` when they decide to draw a frame and
 * `endProfiledFrame` once it is submitted; both are near free while off. The
 * overlay reads `perfSnapshot` a few times a second and hides when no loop has
 * reported lately, so it only appears in a game.
 */
export type PerfOverlayMode = 'off' | 'fps' | 'profiler';
export const PERF_OVERLAY_MODES: readonly { value: PerfOverlayMode; name: string }[] = [
  { value: 'off', name: 'Off' }, { value: 'fps', name: 'FPS counter' }, { value: 'profiler', name: 'Profiler' },
];

const KEY = 'blockplay-sg-perf-overlay-v1';
let mode: PerfOverlayMode | undefined;
const listeners = new Set<() => void>();
const isMode = (value: unknown): value is PerfOverlayMode => PERF_OVERLAY_MODES.some(m => m.value === value);

export function getPerfOverlay(): PerfOverlayMode {
  if (mode === undefined) {
    try { const saved = localStorage.getItem(KEY); mode = isMode(saved) ? saved : 'off'; }
    catch { mode = 'off'; }
  }
  return mode;
}
export function setPerfOverlay(next: PerfOverlayMode) {
  mode = isMode(next) ? next : 'off';
  try { localStorage.setItem(KEY, mode); } catch { /* Play works without storage. */ }
  listeners.forEach(listener => listener());
}
export function subscribePerfOverlay(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
export const usePerfOverlay = () => useSyncExternalStore(subscribePerfOverlay, getPerfOverlay, getPerfOverlay);

/** Frames kept: about four seconds at 60 fps, enough for a 1% low and the graph. */
export const PERF_HISTORY = 240;
const intervals = new Float32Array(PERF_HISTORY), work = new Float32Array(PERF_HISTORY);
let head = 0, filled = 0, lastFrameAt = -Infinity, workStart = 0, inFrame = false, pendingInterval = 0, lastReport = -Infinity;
let tracked: WebGLRenderer | undefined;
interface RendererCounts { calls: number; triangles: number; geometries: number; textures: number; programs: number; width: number; height: number; pixelRatio: number }
let counts: RendererCounts | undefined;

/** Starts a drawn frame. `now` is the animation-frame timestamp. */
export function beginProfiledFrame(now: number, renderer?: WebGLRenderer) {
  if (getPerfOverlay() === 'off') {
    // Hand the renderer back its per-render counter reset.
    if (tracked) { tracked.info.autoReset = true; tracked = undefined; }
    lastFrameAt = -Infinity; inFrame = false; return;
  }
  // A gap over a second (hidden tab, a district loading) starts a new run rather than counting as one slow frame.
  pendingInterval = now - lastFrameAt < 1000 ? now - lastFrameAt : 0;
  lastFrameAt = now; workStart = performance.now(); inFrame = true;
  if (renderer) {
    // Count every render call this frame (passes, scope, reflections), not just the last.
    if (tracked !== renderer) { if (tracked) tracked.info.autoReset = true; tracked = renderer; }
    renderer.info.autoReset = false; renderer.info.reset();
  }
}

/** Ends the frame begun last; does nothing if none was begun (or the overlay is off). */
export function endProfiledFrame(renderer?: WebGLRenderer) {
  if (!inFrame) return;
  const spent = performance.now() - workStart; inFrame = false;
  lastReport = performance.now();
  if (pendingInterval) {
    intervals[head] = pendingInterval; work[head] = spent;
    head = (head + 1) % PERF_HISTORY; filled = Math.min(filled + 1, PERF_HISTORY);
  }
  if (renderer) {
    const { render, memory, programs } = renderer.info, canvas = renderer.domElement;
    counts = { calls: render.calls, triangles: render.triangles, geometries: memory.geometries, textures: memory.textures,
      programs: programs?.length ?? 0, width: canvas.width, height: canvas.height, pixelRatio: renderer.getPixelRatio() };
  }
}

export interface FrameSummary {
  /** Frames drawn per second over about the last second. */
  fps: number;
  /** The rate of the slowest 1% of frames in the history. */
  lowFps: number;
  frameMs: number;
  worstMs: number;
  /** Main-thread time inside the frame callback, averaged over the same second. */
  workMs: number;
  workMaxMs: number;
}

/** Summarises frame intervals and work times, oldest first. */
export function summarizeFrames(frameIntervals: ArrayLike<number>, frameWork: ArrayLike<number>): FrameSummary | undefined {
  const n = frameIntervals.length;
  if (!n) return undefined;
  let total = 0, workTotal = 0, workMax = 0, frames = 0;
  for (let i = n - 1; i >= 0 && total < 1000; i--) {
    total += frameIntervals[i]; workTotal += frameWork[i]; workMax = Math.max(workMax, frameWork[i]); frames++;
  }
  const sorted = Array.from(frameIntervals).sort((a, b) => a - b);
  const p99 = sorted[Math.min(n - 1, Math.floor(n * .99))];
  return { fps: frames * 1000 / total, lowFps: 1000 / p99, frameMs: total / frames, worstMs: sorted[n - 1], workMs: workTotal / frames, workMaxMs: workMax };
}

export interface PerfSnapshot extends FrameSummary {
  /** Frame intervals in ms, oldest first, for the graph. */
  history: number[];
  renderer?: RendererCounts;
  /** Used JS heap, where the browser reports it (Chromium). */
  heapMb?: number;
}

/** What the overlay shows, or undefined when no game has drawn a frame in the last second and a half. */
export function perfSnapshot(now = performance.now()): PerfSnapshot | undefined {
  if (now - lastReport > 1500 || !filled) return undefined;
  const history: number[] = [], workHistory: number[] = [];
  for (let i = 0; i < filled; i++) {
    const at = (head - filled + i + PERF_HISTORY) % PERF_HISTORY;
    history.push(intervals[at]); workHistory.push(work[at]);
  }
  const summary = summarizeFrames(history, workHistory)!;
  const memory = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
  return { ...summary, history, renderer: counts, heapMb: memory ? memory.usedJSHeapSize / 1048576 : undefined };
}

/** Forgets recorded frames (tests). */
export function resetPerfFrames() { head = 0; filled = 0; lastFrameAt = -Infinity; inFrame = false; pendingInterval = 0; lastReport = -Infinity; counts = undefined; tracked = undefined; }
