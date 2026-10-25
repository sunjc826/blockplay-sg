import { useEffect, useState, useSyncExternalStore } from 'react';
import { getEnvironmentSettings, setEnvironmentSettings, subscribeEnvironment } from '../game/environment-settings';
import { CELEBRATIONS, DEFAULT_ENVIRONMENT, WEATHER, resolveEnvironment, type CelebrationId, type WeatherId } from '../game/world-events';
import { singaporeHour, TIMES_OF_DAY, type TimeOfDayId } from '../game/world-lighting';
import './environment-controls.css';

export default function EnvironmentControls({ multiplayer = false }: { multiplayer?: boolean }) {
  const settings = useSyncExternalStore(subscribeEnvironment, getEnvironmentSettings);
  const [now, setNow] = useState(Date.now);
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const active = resolveEnvironment(multiplayer ? { ...DEFAULT_ENVIRONMENT, reducedEffects: settings.reducedEffects, shadows: settings.shadows } : settings, now);
  const time = (hour: number) => `${String(Math.floor(hour)).padStart(2, '0')}:${String(Math.floor(hour % 1 * 60)).padStart(2, '0')}`;
  const clock = time(active.hour);
  return <details className="environment-controls"><summary>World conditions · {WEATHER[active.weather].name} · {clock}{active.celebration !== 'none' ? ` · ${CELEBRATIONS[active.celebration].name}` : ''}</summary>
    <div className="environment-options">
      <label>Weather<select aria-label="Weather" disabled={multiplayer} value={multiplayer ? 'auto' : settings.weather} onChange={e => setEnvironmentSettings({ weather: e.target.value as WeatherId | 'auto' })}><option value="auto">Automatic Singapore weather</option>{Object.entries(WEATHER).map(([id, preset]) => <option key={id} value={id}>{preset.name}</option>)}</select></label>
      <label>Celebration<select aria-label="Celebration" disabled={multiplayer} value={multiplayer ? 'auto' : settings.celebration} onChange={e => setEnvironmentSettings({ celebration: e.target.value as CelebrationId | 'auto' })}><option value="auto">Automatic Singapore calendar</option>{Object.entries(CELEBRATIONS).map(([id, preset]) => <option key={id} value={id}>{preset.name}</option>)}</select></label>
      <label>Time of day<select aria-label="Time of day" disabled={multiplayer} value={multiplayer ? 'auto' : settings.timeOfDay} onChange={e => setEnvironmentSettings({ timeOfDay: e.target.value as TimeOfDayId | 'auto' })}><option value="auto">Singapore clock (now {time(singaporeHour(now))})</option>{Object.entries(TIMES_OF_DAY).map(([id, preset]) => <option key={id} value={id}>{preset.name}</option>)}</select></label>
      <label className="environment-effects"><input type="checkbox" checked={settings.shadows} onChange={e => setEnvironmentSettings({ shadows: e.target.checked })} /> Sun shadows in first-person modes</label>
      <label className="environment-effects"><input type="checkbox" checked={settings.reducedEffects} onChange={e => setEnvironmentSettings({ reducedEffects: e.target.checked })} /> Reduce particles &amp; disable lightning/fireworks</label>
      <small>{multiplayer ? 'LAN uses automatic conditions on every device. ' : 'Changes apply immediately and carry across districts. '}Simulated weather, not a live forecast. Reduced motion is respected.</small>
    </div>
  </details>;
}
