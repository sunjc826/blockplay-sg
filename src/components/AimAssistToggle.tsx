import { useSyncExternalStore } from 'react';
import { Crosshair } from 'lucide-react';
import { getAimAssist, setAimAssist, subscribeAimAssist } from '../game/aim-assist-setting';

/** The thumb's aim assist. Only a drag is ever assisted: a mouse plays the same with it on or off. */
export default function AimAssistToggle() {
  const enabled = useSyncExternalStore(subscribeAimAssist, getAimAssist, getAimAssist);
  return <button type="button" className="session-button fps-hints-toggle" aria-pressed={enabled} title="Slows the sights over a visible target and nudges a drag towards it. Recoil still has to be pulled down." onClick={() => setAimAssist(!enabled)}><Crosshair size={14} /> Aim assist {enabled ? 'on' : 'off'}</button>;
}
