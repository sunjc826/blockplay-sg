import { setMusicVolume, useMusicVolume } from '../lib/music';
import VolumeSlider from './VolumeSlider';

export default function MusicSettings() {
  return <div className="armory-settings-group">
    <h2>Music</h2><p>Plays on the menus and on the way into a game.</p>
    <VolumeSlider volume={useMusicVolume()} onChange={setMusicVolume} />
  </div>;
}
