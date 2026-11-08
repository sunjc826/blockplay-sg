import { useSyncExternalStore } from 'react';
import { getEnvironmentSettings, setEnvironmentSettings, subscribeEnvironment } from '../game/environment-settings';
import './graphics-settings.css';
import type { WorldDetail } from '../game/environment-quality';
import { FRAME_CAPS, GRAPHICS_PRESETS, matchingPreset, RENDER_SCALES, setGraphicsSettings, useGraphicsSettings, type FrameCap, type RenderScale } from '../game/graphics-settings';

/**
 * Rendering costs that follow the player across every mode, saved on this
 * device so a phone can run lighter than a desktop. Weather, time and
 * celebrations stay in the game's own menu.
 */
export default function GraphicsSettings() {
  const environment = useSyncExternalStore(subscribeEnvironment, getEnvironmentSettings, getEnvironmentSettings);
  const graphics = useGraphicsSettings();
  const preset = matchingPreset(graphics, environment);
  const shadows = environment.shadows ? graphics.shadowDetail : 'off';
  return <div className="armory-settings-group graphics-settings">
    <h2>Graphics</h2>
    <p>Saved on this device only, so a phone can run lighter than a computer. Changes apply immediately, including mid-game, except antialiasing.</p>
    <div role="group" aria-label="Graphics preset" className="graphics-presets">{GRAPHICS_PRESETS.map(p =>
      <button key={p.id} data-preset={p.id} aria-pressed={preset === p.id} onClick={() => {
        const { shadows, occlusion, reducedEffects, ...rest } = p.values;
        setEnvironmentSettings({ shadows, occlusion, reducedEffects }); setGraphicsSettings(rest);
      }}><span><strong>{p.name}</strong><small>{p.description}</small></span></button>)}
    </div>
    <small className="graphics-preset-note">{preset ? 'Preset in use. Change anything below to make your own mix.' : 'Custom mix.'}</small>
    <div className="graphics-rows">
      <label><span>Resolution<small>Below 100% renders fewer pixels and upscales: the biggest saving on a phone.</small></span>
        <select value={graphics.scale} onChange={e => setGraphicsSettings({ scale: Number(e.target.value) as RenderScale })}>
          {RENDER_SCALES.map(s => <option key={s.value} value={s.value}>{s.name}</option>)}</select></label>
      <label><span>Frame rate limit<small>A cap keeps a phone cooler and its battery going longer.</small></span>
        <select value={graphics.frameCap} onChange={e => setGraphicsSettings({ frameCap: Number(e.target.value) as FrameCap })}>
          {FRAME_CAPS.map(c => <option key={c.value} value={c.value}>{c.name}</option>)}</select></label>
      <label><span>Sun shadows<small>Ultra sharpens fine details and uses more graphics memory.</small></span>
        <select value={shadows} onChange={e => {
          const value = e.target.value;
          if (value === 'off') setEnvironmentSettings({ shadows: false });
          else { setEnvironmentSettings({ shadows: true }); setGraphicsSettings({ shadowDetail: value === 'ultra' ? 'ultra' : value === 'low' ? 'low' : 'high' }); }
        }}><option value="off">Off</option><option value="low">Low</option><option value="high">High</option><option value="ultra">Ultra</option></select></label>
      {(['rainDetail', 'grassDetail', 'waterDetail'] as const).map(key => <label key={key}><span>{key === 'rainDetail' ? 'Rain distance' : key === 'waterDetail' ? 'Water detail' : 'Grass detail'}<small>{key === 'rainDetail' ? 'Show rain farther into the scene.' : key === 'waterDetail' ? 'Raised ripple rings from rain and bullet impacts.' : 'Denser nearby grass and longer coverage.'}</small></span>
        <select value={graphics[key]} onChange={e => setGraphicsSettings({ [key]: e.target.value as WorldDetail })}><option value="low">Low</option><option value="high">High</option><option value="ultra">Ultra</option></select></label>)}
    </div>
    <label><input type="checkbox" checked={graphics.waterReflections} onChange={e => setGraphicsSettings({ waterReflections: e.target.checked })} /> Bay reflections (nearby scenery reflected in Marina Bay water)</label>
    <label><input type="checkbox" checked={graphics.rainReflections} onChange={e => setGraphicsSettings({ rainReflections: e.target.checked })} /> Wet-ground reflections (visible scenery reflected in rain-soaked pavement)</label>
    <label><input type="checkbox" checked={environment.occlusion} onChange={e => setEnvironmentSettings({ occlusion: e.target.checked })} /> Ambient occlusion (darker corners and gaps)</label>
    <label><input type="checkbox" checked={graphics.bloom} onChange={e => setGraphicsSettings({ bloom: e.target.checked })} /> Light bloom (subtle glow around bright world lights)</label>
    <label><input type="checkbox" checked={graphics.lensEffects} onChange={e => setGraphicsSettings({ lensEffects: e.target.checked })} /> Lens effects (sun flare, haze dust, raindrops on the lens)</label>
    <label><input type="checkbox" checked={graphics.sightReflections} onChange={e => setGraphicsSettings({ sightReflections: e.target.checked })} /> Live reflections in sight glass (redraws the world a second time each frame; off, the glass still catches sun and sky highlights)</label>
    <label><input type="checkbox" checked={environment.reducedEffects} onChange={e => setEnvironmentSettings({ reducedEffects: e.target.checked })} /> Reduce particles &amp; disable lightning/fireworks</label>
    <label><input type="checkbox" checked={graphics.antialias} onChange={e => setGraphicsSettings({ antialias: e.target.checked })} /> Antialiasing (smoother edges; takes effect next time a game starts)</label>
  </div>;
}
