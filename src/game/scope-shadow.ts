/** Visual eye-box lag from actual lateral travel, in lens UVs. ADS damps the
 * model's gait almost completely, so it cannot supply a readable strafe cue. */
export function createScopeStrafeShadow() {
  let offset = 0;
  return {
    reset() { offset = 0; },
    update(dt: number, lateralSpeed: number, enabled: boolean) {
      if (!enabled) { offset = 0; return offset; }
      // A normal aimed sidestep gets a clear crescent; slow crawling/analogue
      // movement stays proportional. Only the shadow moves, never the aim.
      const target = -Math.max(-1, Math.min(1, lateralSpeed / 2)) * .18;
      offset += (target - offset) * (1 - Math.exp(-12 * Math.min(Math.max(dt, 0), .1)));
      if (Math.abs(offset) < .0001) offset = 0;
      return offset;
    },
  };
}
