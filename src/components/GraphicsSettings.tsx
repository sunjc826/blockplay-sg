import { useSyncExternalStore } from 'react';
import { getEnvironmentSettings, setEnvironmentSettings, subscribeEnvironment } from '../game/environment-settings';

/** Rendering costs that follow the player across every mode. Weather, time and celebrations stay in the game's own menu. */
export default function GraphicsSettings() {
  const settings = useSyncExternalStore(subscribeEnvironment, getEnvironmentSettings, getEnvironmentSettings);
  return <div className="armory-settings-group graphics-settings">
    <h2>Graphics</h2><p>Lighting and effects in first-person modes. Changes apply immediately, including mid-game.</p>
    <label><input type="checkbox" checked={settings.shadows} onChange={e => setEnvironmentSettings({ shadows: e.target.checked })} /> Sun shadows</label>
    <label><input type="checkbox" checked={settings.occlusion} onChange={e => setEnvironmentSettings({ occlusion: e.target.checked })} /> Ambient occlusion (darker corners and gaps)</label>
    <label><input type="checkbox" checked={settings.reducedEffects} onChange={e => setEnvironmentSettings({ reducedEffects: e.target.checked })} /> Reduce particles &amp; disable lightning/fireworks</label>
  </div>;
}
