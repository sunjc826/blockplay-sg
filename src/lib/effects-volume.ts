import { createVolumeSetting } from './volume-setting';

const effects = createVolumeSetting('blockplay-sg-effects-volume-v1');
export const getEffectsVolume = effects.get;
export const setEffectsVolume = effects.set;
export const useEffectsVolume = effects.use;
/** Where every sound except music and speech connects, in place of `context.destination`, so the slider reaches it. */
export const effectsOutput = effects.output;
