import { useModalFocus } from '../lib/use-modal-focus';
import { createContext, useContext, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, Settings } from 'lucide-react';
import ArmorySettings from './ArmorySettings';
import type { ArmoryStore } from '../game/use-armory';
import './settings-overlay.css';

type SettingsStore = Pick<ArmoryStore, 'profile' | 'wearRankSet' | 'setEncikTone'>;

/** The profile the full settings page edits. A play screen without it offers no settings button. */
export const SettingsStoreContext = createContext<SettingsStore | null>(null);

/**
 * Opens the full Settings page over the paused game, so changing a setting
 * never costs the run. Drawn inside the fullscreen element when there is one.
 */
export function SettingsButton() {
  const store = useContext(SettingsStoreContext);
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  useModalFocus(panel, open, () => setOpen(false));
  if (!store) return null;
  const host = typeof document === 'undefined' ? null : document.fullscreenElement ?? document.body;
  // Clicks and keys stay in the overlay; through the portal they would reach the start card.
  const stop = (event: React.SyntheticEvent) => event.stopPropagation();
  return <>
    <button type="button" className="session-button fps-settings-button" onClick={() => setOpen(true)}><Settings size={14} /> Settings</button>
    {open && host && createPortal(<div ref={panel} tabIndex={-1} className="settings-overlay" role="dialog" aria-modal="true" aria-label="Settings" onClick={stop} onPointerDown={stop} onKeyDown={stop}>
      <header className="settings-overlay-bar">
        <button type="button" className="settings-overlay-back" onClick={() => setOpen(false)}><ArrowLeft size={16} /> Back to game</button>
        <h1>Settings</h1>
      </header>
      <div className="settings-overlay-body"><ArmorySettings store={store} /></div>
    </div>, host)}
  </>;
}
