import { useSyncExternalStore, type ReactNode } from 'react';
import { Crosshair, Maximize, Minimize, Volume2, VolumeX } from 'lucide-react';
import type { FpsEngine, FpsHud } from '../game/fps-engine';
import { getAimAssist, setAimAssist, subscribeAimAssist } from '../game/aim-assist-setting';
import { FpsRadioVoice } from './FpsRadio';
import HudHintsToggle from './HudHintsToggle';
import './fps-hints.css';

/** The start card's settings for players: the toggles they reach for, nothing more. */
export function FpsPlayerTools({ hud, engine, immersive, touch, onFullscreen }: { hud: FpsHud; engine: FpsEngine | null; immersive: boolean; touch: boolean; onFullscreen: () => void }) {
  return <div className="fps-player-tools">
    <button className="session-button" aria-pressed={!hud.muted} onClick={() => engine?.toggleSound()}>{hud.muted ? <VolumeX size={14} /> : <Volume2 size={14} />} Sound {hud.muted ? 'off' : 'on'}</button>
    <FpsRadioVoice hud={hud} engine={engine} />
    {touch && <AimAssistToggle />}
    {!touch && <HudHintsToggle />}
    <button className="session-button" onClick={onFullscreen}>{immersive ? <Minimize size={14} /> : <Maximize size={14} />} {immersive ? 'Windowed' : 'Fullscreen'}</button>
  </div>;
}

/**
 * The thumb's aim assist. Only offered on touch, because only a drag is ever
 * assisted: a mouse plays the same with it on or off.
 */
export function AimAssistToggle() {
  const enabled = useSyncExternalStore(subscribeAimAssist, getAimAssist);
  return <button className="session-button" aria-pressed={enabled} title="Slows the sights over a visible target and nudges a drag towards it. Recoil still has to be pulled down." onClick={() => setAimAssist(!enabled)}><Crosshair size={14} /> Aim assist {enabled ? 'on' : 'off'}</button>;
}

/** The key list, open in the debug shell and folded away for players. */
export function FpsControlGuide({ debug, children }: { debug: boolean; children: ReactNode }) {
  const guide = <div className="fps-control-guide">{children}</div>;
  return debug ? guide : <details className="fps-controls-fold"><summary>Controls</summary>{guide}</details>;
}
