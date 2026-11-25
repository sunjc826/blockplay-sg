import * as THREE from 'three';
import { getGraphicsSettings, renderPixelRatio, type GraphicsSettings } from './graphics-settings';
import { holdShaderWarm } from './shader-warm';

/** Native-density ceiling avoids supersampling low-density phones/monitors. */
export function fpsPixelRatio(settings: Pick<GraphicsSettings, 'scale' | 'pixelDensity'> = getGraphicsSettings(), deviceRatio?: number) {
  return renderPixelRatio(settings.pixelDensity, settings, deviceRatio);
}

/**
 * One renderer serves every game on the page, one game at a time. A WebGL program belongs to the context that
 * linked it, so a renderer made afresh for each match or expedition compiled every shader again; kept, the next
 * game finds the programs it shares with the last one already linked. Each game must free what it uploaded, as a
 * district change always had to: the context no longer goes away to do it for them.
 */
let shared: { renderer: THREE.WebGLRenderer; antialias: boolean; inUse: boolean } | null = null;

function makeRenderer(antialias: boolean) {
  const renderer = new THREE.WebGLRenderer({ antialias });
  renderer.domElement.tabIndex = 0;
  return renderer;
}
/** As a new renderer stands, whatever the last game left set. */
function freshen(renderer: THREE.WebGLRenderer) {
  renderer.setRenderTarget(null); renderer.resetState();
  renderer.setPixelRatio(fpsPixelRatio());
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = .9;
  renderer.shadowMap.enabled = false; renderer.shadowMap.autoUpdate = true; renderer.shadowMap.needsUpdate = false;
  renderer.autoClear = false; renderer.info.autoReset = true; renderer.localClippingEnabled = false; renderer.clippingPlanes = [];
  renderer.setScissorTest(false); renderer.setClearColor(0x000000, 1);
  const canvas = renderer.domElement;
  for (const key of Object.keys(canvas.dataset)) delete canvas.dataset[key];
  canvas.removeAttribute('aria-label'); canvas.removeAttribute('style');
}

/**
 * The game view holds this surface across district changes, preserving pointer lock. `dispose` hands the renderer
 * back for the next game and keeps its context; a second game while one is up, a changed antialiasing setting or
 * a lost context gets a renderer of its own.
 */
export function createFpsSurface(host: HTMLDivElement) {
  // The menu's warm-up stands aside while a game is using the GPU.
  const releaseWarm = holdShaderWarm();
  const antialias = getGraphicsSettings().antialias;
  if (shared && !shared.inUse && (shared.antialias !== antialias || shared.renderer.getContext().isContextLost())) { shared.renderer.dispose(); shared = null; }
  let renderer: THREE.WebGLRenderer, mine: typeof shared = null;
  try {
    if (!shared) shared = mine = { renderer: makeRenderer(antialias), antialias, inUse: true };
    else if (!shared.inUse) { mine = shared; mine.inUse = true; }
    renderer = mine ? mine.renderer : makeRenderer(antialias);
  } catch (error) { releaseWarm(); throw error; }
  freshen(renderer);
  // Development probe: what the renderer holds, for scripts that count programs and uploads between games.
  if (import.meta.env.DEV) (globalThis as { blockplayRenderer?: unknown }).blockplayRenderer = renderer;
  const canvas = renderer.domElement; host.append(canvas);
  let disposed = false;
  return { renderer, dispose() {
    if (disposed) return;
    disposed = true;
    if (document.pointerLockElement === canvas) document.exitPointerLock();
    canvas.remove(); releaseWarm();
    if (mine) { renderer.setRenderTarget(null); renderer.renderLists.dispose(); mine.inUse = false; }
    else renderer.dispose();
  } };
}
/** Drops the kept renderer (tests). */
export function resetFpsSurface() { shared?.renderer.dispose(); shared = null; }
export type FpsSurface = ReturnType<typeof createFpsSurface>;
