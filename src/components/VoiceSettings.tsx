import { useEffect, useRef } from 'react';
import manifest from '../audio/encik/manifest.json';
import { ENCIK_LEVEL } from '../game/encik-audio';
import { getVoiceVolume, setVoiceVolume, useVoiceVolume } from '../lib/voice-volume';
import VolumeSlider from './VolumeSlider';

const PREVIEW_DELAY_MS = 150;
const previewUrl = `${import.meta.env.BASE_URL}audio/encik/${manifest.clips[0].file}`;

export default function VoiceSettings() {
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const preview = useRef<HTMLAudioElement | null>(null);
  useEffect(() => () => { clearTimeout(timer.current); preview.current?.pause(); }, []);
  return <div className="armory-settings-group">
    <h2>Voice</h2><p>The Encik's radio calls and the AI guide's replies.</p>
    <VolumeSlider volume={useVoiceVolume()} onChange={next => {
      setVoiceVolume(next);
      if (preview.current) preview.current.volume = ENCIK_LEVEL * next;
      clearTimeout(timer.current);
      // The Encik says a line once the slider settles, as nothing else is speaking on this screen.
      timer.current = setTimeout(() => {
        const volume = getVoiceVolume(), audio = preview.current ??= new Audio(previewUrl);
        audio.pause();
        audio.currentTime = 0;
        audio.volume = ENCIK_LEVEL * volume;
        if (volume > 0) void audio.play().catch(() => {});
      }, PREVIEW_DELAY_MS);
    }} />
  </div>;
}
