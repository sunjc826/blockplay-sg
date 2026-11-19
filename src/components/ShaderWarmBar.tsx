import { useEffect, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { getShaderWarmState, startShaderWarm, subscribeShaderWarm } from '../game/shader-warm';
import './shader-warm-bar.css';

const READY_MS = 2600;

/**
 * Starts the menu's shader warm-up and shows how far it has got, the way a
 * shooter's lobby does. Hidden while a game is on screen, when the warm-up is
 * paused, and on a visit that has nothing left to compile.
 */
export default function ShaderWarmBar() {
  const { phase, done, total } = useSyncExternalStore(subscribeShaderWarm, getShaderWarmState, getShaderWarmState);
  const [worked, setWorked] = useState(false), [ready, setReady] = useState(false);

  useEffect(() => {
    // After the first paint: the title screen comes before anything it speeds up.
    const idle = window.requestIdleCallback?.(() => startShaderWarm(), { timeout: 1500 });
    const timer = idle === undefined ? window.setTimeout(() => startShaderWarm(), 300) : undefined;
    return () => { if (idle !== undefined) window.cancelIdleCallback?.(idle); window.clearTimeout(timer); };
  }, []);
  useEffect(() => { if (phase === 'working') setWorked(true); }, [phase]);
  useEffect(() => {
    if (phase !== 'done' || !worked) return;
    setReady(true);
    const timer = window.setTimeout(() => setReady(false), READY_MS);
    return () => window.clearTimeout(timer);
  }, [phase, worked]);

  const working = phase === 'working';
  if (!working && !ready) return null;
  const percent = total ? Math.floor(done / total * 100) : 0;
  return createPortal(<div className="shader-warm-bar" data-phase={working ? 'working' : 'ready'}
    role="progressbar" aria-label="Compiling shaders" aria-valuemin={0} aria-valuemax={100} aria-valuenow={working ? percent : 100}>
    <i style={{ transform: `scaleX(${working ? Math.max(.01, done / Math.max(1, total)) : 1})` }} />
    <span>{working ? <>COMPILING SHADERS <b>{percent}%</b><small>Ranges load faster once this finishes</small></> : <>SHADERS READY</>}</span>
  </div>, document.body);
}
