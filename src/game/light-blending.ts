import * as THREE from 'three';

/**
 * Adds light and leaves coverage alone. The world view composites the scene
 * over a separately cleared sky (world-occlusion), so plain additive blending,
 * which also adds alpha, blots out the sky wherever a glow or beam is drawn.
 */
export const LIGHT_BLENDING = { transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneFactor,
  blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor } as const;
