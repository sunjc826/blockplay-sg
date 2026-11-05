import { createVolumeSetting } from './volume-setting';

const voice = createVolumeSetting('blockplay-sg-voice-volume-v1');
export const getVoiceVolume = voice.get;
export const setVoiceVolume = voice.set;
export const useVoiceVolume = voice.use;
/** Where recorded speech connects, in place of `context.destination`, so the slider reaches it. */
export const voiceOutput = voice.output;
