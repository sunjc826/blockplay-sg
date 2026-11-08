import type { ReactNode } from 'react';
import { Maximize, Minimize, Volume2, VolumeX } from 'lucide-react';
import type { FpsEngine, FpsHud } from '../game/fps-engine';
import { FpsRadioVoice } from './FpsRadio';
import { SettingsButton } from './SettingsOverlay';
import './fps-hints.css';

/**
 * The start and pause card's quick actions. Saved preferences live on the full
 * Settings page, which the Settings button opens over the paused game.
 */
export function FpsPlayerTools({ hud, engine, immersive, onFullscreen }: { hud: FpsHud; engine: FpsEngine | null; immersive: boolean; onFullscreen: () => void }) {
  return <div className="fps-player-tools">
    <SettingsButton />
    <button className="session-button" aria-pressed={!hud.muted} onClick={() => engine?.toggleSound()}>{hud.muted ? <VolumeX size={14} /> : <Volume2 size={14} />} Sound {hud.muted ? 'off' : 'on'}</button>
    <FpsRadioVoice hud={hud} engine={engine} />
    <button className="session-button" onClick={onFullscreen}>{immersive ? <Minimize size={14} /> : <Maximize size={14} />} {immersive ? 'Windowed' : 'Fullscreen'}</button>
  </div>;
}

/** The key list, open in the debug shell and folded away for players. */
export function FpsControlGuide({ debug, children }: { debug: boolean; children: ReactNode }) {
  const guide = <div className="fps-control-guide">{children}</div>;
  return debug ? guide : <details className="fps-controls-fold"><summary>Controls</summary>{guide}</details>;
}
