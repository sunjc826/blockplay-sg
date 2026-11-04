import { setMenuMusicVolume, useMenuMusicVolume } from '../lib/menu-music';

export default function MenuMusicSettings() {
  const volume = useMenuMusicVolume();
  const percent = Math.round(volume * 100);
  return <div className="armory-settings-group armory-music">
    <h2>Menu music</h2><p>Plays on the main menu, Inventory and Settings. Game sound is separate.</p>
    <label>
      <span>Volume</span>
      <input type="range" min={0} max={100} step={5} value={percent} aria-valuetext={percent === 0 ? 'Off' : `${percent}%`}
        onChange={event => setMenuMusicVolume(Number(event.currentTarget.value) / 100)} />
      <output>{percent === 0 ? 'Off' : `${percent}%`}</output>
    </label>
  </div>;
}
