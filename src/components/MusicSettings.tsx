import { setMusicVolume, useMusicVolume } from '../lib/music';

export default function MusicSettings() {
  const volume = useMusicVolume();
  const percent = Math.round(volume * 100);
  return <div className="armory-settings-group armory-music">
    <h2>Music</h2><p>Plays on the menus and on the way into a game. Game sound is separate.</p>
    <label>
      <span>Volume</span>
      <input type="range" min={0} max={100} step={5} value={percent} aria-valuetext={percent === 0 ? 'Off' : `${percent}%`}
        onChange={event => setMusicVolume(Number(event.currentTarget.value) / 100)} />
      <output>{percent === 0 ? 'Off' : `${percent}%`}</output>
    </label>
  </div>;
}
