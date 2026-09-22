import type { FpsEngine, FpsHud } from '../game/fps-engine';
import { RELOAD_STYLES, RELOAD_STYLE_LABELS, normalizeReloadStyle } from '../game/fps-reload-styles';

export default function FpsReloadStyle({ hud, engine }: { hud: FpsHud; engine: FpsEngine | null }) {
  return <label className="fps-reload-style">Reload animation{' '}
    <select aria-label="Reload animation" value={hud.reloadStyle}
      disabled={!engine || hud.reloading > 0 || hud.phase === 'loading' || hud.phase === 'error'}
      onChange={event => engine?.setReloadStyle(normalizeReloadStyle(event.target.value))}>
      {RELOAD_STYLES.map(style => <option key={style} value={style}>{RELOAD_STYLE_LABELS[style]}</option>)}
    </select>
    <small>{hud.reloadStyle === 'dual-mag' && hud.weapon !== 0 ? 'SAR 21 only · Standard on Ultimax' : 'Visual style · reload time unchanged'}</small>
  </label>;
}
