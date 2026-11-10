import { MenuButton } from './MenuControls';
import { PERF_OVERLAY_MODES, setPerfOverlay, usePerfOverlay } from '../game/perf-overlay';

const DESCRIPTIONS = {
  off: 'Nothing on screen',
  fps: 'Frame rate in the corner',
  profiler: 'Frame times, draw calls, memory and a graph',
} as const;

/** Settings › Video: the on-screen frame counter. */
export default function PerfOverlaySettings() {
  const mode = usePerfOverlay();
  return <div className="armory-settings-group perf-overlay-settings">
    <h2>Performance overlay</h2>
    <p>Shows how smoothly the game is running, in the top-left corner while you play. Saved on this device. “Main thread” is the game's own work each frame; when it is well under the frame time, the graphics card is what holds the frame rate back.</p>
    <div role="group" aria-label="Performance overlay">{PERF_OVERLAY_MODES.map(m =>
      <MenuButton variant="choice" key={m.value} data-perf-overlay={m.value} aria-pressed={mode === m.value} onClick={() => setPerfOverlay(m.value)}><span><strong>{m.name}</strong><small>{DESCRIPTIONS[m.value]}</small></span></MenuButton>)}
    </div>
  </div>;
}
