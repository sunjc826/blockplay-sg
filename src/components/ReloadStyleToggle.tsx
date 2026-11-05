import { RefreshCw } from 'lucide-react';
import { RELOAD_STYLES, setReloadStyle, useReloadStyle } from '../game/reload-style-setting';

/** Flips between the reload animations from the start and pause card. */
export default function ReloadStyleToggle() {
  const style = useReloadStyle(), choice = RELOAD_STYLES.find(entry => entry.id === style)!;
  return <button type="button" className="session-button" title={choice.description} onClick={() => setReloadStyle(style === 'improved' ? 'original' : 'improved')}><RefreshCw size={14} /> Reload: {choice.name.toLowerCase()}</button>;
}
