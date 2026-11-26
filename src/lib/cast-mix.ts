/** Times in seconds unless named in milliseconds. */
export const CAST_MIX = {
  music: 1 / 3, effects: 10 ** (-4 / 20), attack: .12, release: .4,
  encikFade: .15, lead: .16, level: .9,
  threshold: -16, knee: 12, ratio: 2, compressorAttack: .012, compressorRelease: .18,
  readyMs: 3000, bufferLeadMs: 250, stallMs: 2000, breathMs: 350,
} as const;

let speakers = 0;
const listeners = new Set<(speaking: boolean) => void>();
export const castSpeaking = () => speakers > 0;
export function onCastSpeaking(fn: (speaking: boolean) => void) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
export function beginCastSpeech() {
  if (++speakers === 1) listeners.forEach(fn => fn(true));
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--speakers === 0) listeners.forEach(fn => fn(false));
  };
}
export function mixLevel(bus: 'music' | 'effects', volume: number) {
  return volume * (castSpeaking() ? CAST_MIX[bus] : 1);
}
export function rampLevel(gain: GainNode, now: number, target: number, seconds: number) {
  const param = gain.gain;
  if (param.cancelAndHoldAtTime) param.cancelAndHoldAtTime(now);
  else {
    const current = param.value;
    param.cancelScheduledValues(now);
    param.setValueAtTime(current,now);
  }
  param.linearRampToValueAtTime(target,now + seconds);
}
