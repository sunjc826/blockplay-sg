import * as THREE from 'three';
import { getGraphicsSettings, renderPixelRatio } from './graphics-settings';

/** The first-person view's resolution cap, before the player's render scale. */
export const FPS_PIXEL_RATIO_CAP = 1.35;

/** The game view owns this surface across district changes, preserving pointer lock. */
export function createFpsSurface(host: HTMLDivElement) {
  const renderer = new THREE.WebGLRenderer({ antialias: getGraphicsSettings().antialias });
  renderer.setPixelRatio(renderPixelRatio(FPS_PIXEL_RATIO_CAP));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = .9;
  renderer.shadowMap.enabled = false; renderer.autoClear = false;
  const canvas = renderer.domElement; canvas.tabIndex = 0; host.append(canvas);
  return { renderer, dispose() {
    if (document.pointerLockElement === canvas) document.exitPointerLock();
    renderer.dispose(); canvas.remove();
  } };
}
export type FpsSurface = ReturnType<typeof createFpsSurface>;
