import type { ReactNode } from 'react';
import type { FpsHud } from '../game/fps-engine';
import { FpsChatter } from './FpsCalloutWheel';
import FpsCommsLog from './FpsCommsLog';
import FpsRadio from './FpsRadio';
import { FpsHealthLine } from './FpsVitals';
import './fps-hud-layout.css';

/** Navigation and speech share available space rather than fixed screen offsets. */
export default function FpsHudLayout({ hud, history = false, children }: { hud: FpsHud; history?: boolean; children: ReactNode }) {
  return <div className="fps-hud-layout">
    <FpsHealthLine hud={hud} />
    <div className="fps-hud-navigation">
      {children}
      {history && hud.phase === 'playing' && <FpsCommsLog entries={hud.comms} />}
    </div>
    <div className="fps-subtitles">
      <FpsChatter hud={hud} />
      <FpsRadio hud={hud} />
    </div>
  </div>;
}
