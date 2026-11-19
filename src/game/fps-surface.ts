import * as THREE from 'three';
import { getGraphicsSettings, renderPixelRatio, type GraphicsSettings } from './graphics-settings';
import { holdShaderWarm } from './shader-warm';

/** Native-density ceiling avoids supersampling low-density phones/monitors. */
export function fpsPixelRatio(settings: Pick<GraphicsSettings, 'scale' | 'pixelDensity'> = getGraphicsSettings(), deviceRatio?: number) {
  return renderPixelRatio(settings.pixelDensity, settings, deviceRatio);
}

/** The game view owns this surface across district changes, preserving pointer lock. */
export function createFpsSurface(host: HTMLDivElement) {
  // The menu's warm-up stands aside while a game has a renderer of its own.
  const releaseWarm = holdShaderWarm();
  const renderer = new THREE.WebGLRenderer({ antialias: getGraphicsSettings().antialias });
  renderer.setPixelRatio(fpsPixelRatio());
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = .9;
  renderer.shadowMap.enabled = false; renderer.autoClear = false;
  const canvas = renderer.domElement; canvas.tabIndex = 0; host.append(canvas);
  return { renderer, dispose() {
    if (document.pointerLockElement === canvas) document.exitPointerLock();
    renderer.dispose(); canvas.remove(); releaseWarm();
  } };
}
export type FpsSurface = ReturnType<typeof createFpsSurface>;
