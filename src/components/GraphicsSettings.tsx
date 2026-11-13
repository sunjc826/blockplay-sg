import { MenuButton, MenuSelect } from './MenuControls';
import { useSyncExternalStore } from 'react';
import { getEnvironmentSettings, setEnvironmentSettings, subscribeEnvironment } from '../game/environment-settings';
import './graphics-settings.css';
import type { SunRayQuality } from '../game/sun-rays';
import type { WorldDetail } from '../game/environment-quality';
import { FRAME_CAPS, GRAPHICS_PRESETS, PIXEL_DENSITIES, type PixelDensity, matchingPreset, RENDER_SCALES, setGraphicsSettings, useGraphicsSettings, type FrameCap, type RenderScale } from '../game/graphics-settings';

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
    <p>Saved on this device only, so a phone can run lighter than a computer. Changes apply immediately, including mid-game, except hardware antialiasing.</p>
    <div role="group" aria-label="Graphics preset" className="graphics-presets">{GRAPHICS_PRESETS.map(p =>
      <MenuButton key={p.id} data-preset={p.id} aria-pressed={preset === p.id} onClick={() => {
        const { shadows, occlusion, reducedEffects, ...rest } = p.values;
        setEnvironmentSettings({ shadows, occlusion, reducedEffects }); setGraphicsSettings(rest);
      }}><span><strong>{p.name}</strong><small>{p.description}</small></span></MenuButton>)}
    </div>
    <small className="graphics-preset-note">{preset ? 'Preset in use. Change anything below to make your own mix.' : 'Custom mix.'}</small>
    <div className="graphics-rows">
      <label><span>Resolution<small>Below 100% renders fewer pixels and upscales: the biggest saving on a phone.</small></span>
        <MenuSelect value={graphics.scale} onChange={e => setGraphicsSettings({ scale: Number(e.target.value) as RenderScale })}>
          {RENDER_SCALES.map(s => <option key={s.value} value={s.value}>{s.name}</option>)}</MenuSelect></label>
      <label><span>First-person pixel density<small>Higher limits sharpen high-density screens at a higher GPU cost. 1.35× saves power; 2× favors quality.</small></span>
        <MenuSelect value={graphics.pixelDensity} onChange={e => setGraphicsSettings({ pixelDensity: Number(e.target.value) as PixelDensity })}>
          {PIXEL_DENSITIES.map(value => <option key={value} value={value}>{value}×</option>)}</MenuSelect></label>
      <label><span>Frame rate limit<small>A cap keeps a phone cooler and its battery going longer.</small></span>
        <MenuSelect value={graphics.frameCap} onChange={e => setGraphicsSettings({ frameCap: Number(e.target.value) as FrameCap })}>
          {FRAME_CAPS.map(c => <option key={c.value} value={c.value}>{c.name}</option>)}</MenuSelect></label>
      <label><span>Sun shadows<small>Ultra sharpens fine details and uses more graphics memory.</small></span>
        <MenuSelect value={shadows} onChange={e => {
          const value = e.target.value;
          if (value === 'off') setEnvironmentSettings({ shadows: false });
          else { setEnvironmentSettings({ shadows: true }); setGraphicsSettings({ shadowDetail: value === 'ultra' ? 'ultra' : value === 'low' ? 'low' : 'high' }); }
        }}><option value="off">Off</option><option value="low">Low</option><option value="high">High</option><option value="ultra">Ultra</option></MenuSelect></label>
      <label><span>God rays<small>Sunlight shafts through trees and buildings. High draws finer rays at a higher GPU cost.</small></span>
        <MenuSelect value={graphics.godRays} onChange={e => setGraphicsSettings({ godRays: e.target.value as SunRayQuality })}><option value="off">Off</option><option value="low">Low</option><option value="high">High</option></MenuSelect></label>
      {(['rainDetail', 'grassDetail', 'waterDetail'] as const).map(key => <label key={key}><span>{key === 'rainDetail' ? 'Rain distance' : key === 'waterDetail' ? 'Water detail' : 'Grass detail'}<small>{key === 'rainDetail' ? 'Show rain farther into the scene.' : key === 'waterDetail' ? 'Raised ripples; Ultra adds refraction, interactive waves and sunlit shallows in Marina Bay.' : 'Denser nearby grass and longer coverage.'}</small></span>
        <MenuSelect value={graphics[key]} onChange={e => setGraphicsSettings({ [key]: e.target.value as WorldDetail })}><option value="low">Low</option><option value="high">High</option><option value="ultra">Ultra</option></MenuSelect></label>)}
    </div>
    <label><input type="checkbox" checked={graphics.waterReflections} onChange={e => setGraphicsSettings({ waterReflections: e.target.checked })} /> Bay reflections (nearby scenery reflected in Marina Bay water)</label>
    <label><input type="checkbox" checked={graphics.rainReflections} onChange={e => setGraphicsSettings({ rainReflections: e.target.checked })} /> Wet-ground reflections (visible scenery reflected in rain-soaked pavement)</label>
    <label><input type="checkbox" checked={environment.occlusion} onChange={e => setEnvironmentSettings({ occlusion: e.target.checked })} /> Ambient occlusion (darker corners and gaps)</label>
    <label><input type="checkbox" checked={graphics.bloom} onChange={e => setGraphicsSettings({ bloom: e.target.checked })} /> Light bloom (subtle glow around bright world lights)</label>
    <label><input type="checkbox" checked={graphics.lensEffects} onChange={e => setGraphicsSettings({ lensEffects: e.target.checked })} /> Lens effects (sun flare, haze dust, raindrops on the lens)</label>
    <label><input type="checkbox" checked={graphics.sightReflections} onChange={e => setGraphicsSettings({ sightReflections: e.target.checked })} /> Live reflections in sight glass (redraws the world a second time each frame; off, the glass still catches sun and sky highlights)</label>
    <label><input type="checkbox" checked={environment.reducedEffects} onChange={e => setEnvironmentSettings({ reducedEffects: e.target.checked })} /> Reduce particles &amp; disable lightning/fireworks</label>
    <label><input type="checkbox" checked={graphics.smaa} onChange={e => setGraphicsSettings({ smaa: e.target.checked })} /> Extra edge smoothing (SMAA; world scenery only, adds GPU work, applies immediately)</label>
    <label><input type="checkbox" checked={graphics.antialias} onChange={e => setGraphicsSettings({ antialias: e.target.checked })} /> Hardware antialiasing (smoother edges; takes effect next time a game starts)</label>
  </div>;
}
