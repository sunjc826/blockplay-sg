import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { perfSnapshot, usePerfOverlay, type PerfSnapshot } from '../game/perf-overlay';
import './perf-overlay.css';

const REFRESH_MS = 250;
const GRAPH_W = 150, GRAPH_H = 36, GRAPH_MAX_MS = 50;
const rate = (fps: number) => fps >= 55 ? 'good' : fps >= 30 ? 'fair' : 'poor';
const count = (n: number) => n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e4 ? `${Math.round(n / 1e3)}k` : String(n);

/** Frame times as bars, with lines at 60 and 30 fps. */
function drawGraph(canvas: HTMLCanvasElement, history: number[]) {
  const ratio = Math.min(devicePixelRatio || 1, 2), ctx = canvas.getContext('2d');
  if (!ctx) return;
  if (canvas.width !== GRAPH_W * ratio) { canvas.width = GRAPH_W * ratio; canvas.height = GRAPH_H * ratio; }
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0); ctx.clearRect(0, 0, GRAPH_W, GRAPH_H);
  const y = (ms: number) => GRAPH_H - Math.min(ms, GRAPH_MAX_MS) / GRAPH_MAX_MS * GRAPH_H;
  const bars = history.slice(-GRAPH_W), x0 = GRAPH_W - bars.length;
  bars.forEach((ms, i) => {
    ctx.fillStyle = ms <= 1000 / 55 ? '#7fd08a' : ms <= 1000 / 30 ? '#e8c35a' : '#ef6f5c';
    ctx.fillRect(x0 + i, y(ms), 1, GRAPH_H - y(ms));
  });
  ctx.fillStyle = '#ffffff55';
  [1000 / 60, 1000 / 30].forEach(ms => ctx.fillRect(0, Math.round(y(ms)), GRAPH_W, 1));
}

/**
 * The FPS counter or profiler chosen in Settings › Video, drawn over whatever
 * game is running (inside the fullscreen element when there is one). Hidden
 * outside a game, since only game loops feed it.
 */
export default function PerfOverlay() {
  const mode = usePerfOverlay();
  const [snapshot, setSnapshot] = useState<PerfSnapshot>();
  const [host, setHost] = useState<Element | null>(null);
  const graph = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (mode === 'off') { setSnapshot(undefined); return; }
    const place = () => setHost(document.fullscreenElement ?? document.body);
    place(); document.addEventListener('fullscreenchange', place);
    const tick = () => setSnapshot(perfSnapshot());
    tick(); const timer = window.setInterval(tick, REFRESH_MS);
    return () => { window.clearInterval(timer); document.removeEventListener('fullscreenchange', place); };
  }, [mode]);
  useEffect(() => { if (graph.current && snapshot) drawGraph(graph.current, snapshot.history); }, [snapshot]);
  if (mode === 'off' || !snapshot || !host) return null;
  const fps = Math.round(snapshot.fps), r = snapshot.renderer;
  return createPortal(<div className="perf-overlay" data-perf-mode={mode} data-fps={fps} aria-hidden="true">
    <div className="perf-fps" data-rate={rate(snapshot.fps)}><strong>{fps}</strong> FPS</div>
    {mode === 'profiler' && <>
      <dl>
        <dt>1% low</dt><dd data-rate={rate(snapshot.lowFps)}>{Math.round(snapshot.lowFps)} fps</dd>
        <dt>Frame</dt><dd>{snapshot.frameMs.toFixed(1)} ms <small>worst {snapshot.worstMs.toFixed(0)}</small></dd>
        <dt>Main thread</dt><dd>{snapshot.workMs.toFixed(1)} ms <small>max {snapshot.workMaxMs.toFixed(0)}</small></dd>
        {r && <>
          <dt>Draw calls</dt><dd>{count(r.calls)}</dd>
          <dt>Triangles</dt><dd>{count(r.triangles)}</dd>
          <dt>Geo · tex</dt><dd>{r.geometries} · {r.textures}</dd>
          <dt>Shaders</dt><dd>{r.programs}</dd>
          <dt>Buffer</dt><dd>{r.width}×{r.height} <small>@{r.pixelRatio.toFixed(2)}</small></dd>
        </>}
        {snapshot.heapMb !== undefined && <><dt>JS heap</dt><dd>{Math.round(snapshot.heapMb)} MB</dd></>}
      </dl>
      <canvas ref={graph} className="perf-graph" style={{ width: GRAPH_W, height: GRAPH_H }} />
    </>}
  </div>, host);
}
