import { useEffect, useRef } from 'react';
import { setEffectsVolume, useEffectsVolume } from '../lib/effects-volume';
import { playMenuSound } from '../lib/menu-audio';
import VolumeSlider from './VolumeSlider';

const PREVIEW_DELAY_MS = 120;

export default function EffectsSettings() {
  const preview = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(preview.current), []);
  return <div className="armory-settings-group">
    <h2>Sound effects</h2><p>Gunfire, footsteps, vehicles, the Encik's radio and menu sounds.</p>
    <VolumeSlider volume={useEffectsVolume()} onChange={next => {
      setEffectsVolume(next);
      // Nothing else is playing on this screen, so a sound once the slider settles lets the player hear the new level.
      clearTimeout(preview.current);
      preview.current = setTimeout(() => playMenuSound('click'), PREVIEW_DELAY_MS);
    }} />
  </div>;
}
