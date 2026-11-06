import { Crosshair } from 'lucide-react';
import { setHitmarkerSound, useHitmarkerSound } from '../game/hitmarker-sound-setting';

/** The sound of a hit you land: a tick on the body, a ting on the head, a thunk on a kill. */
export default function HitmarkerSoundToggle() {
  const enabled = useHitmarkerSound();
  return <button type="button" className="session-button fps-hints-toggle" aria-pressed={enabled} onClick={() => setHitmarkerSound(!enabled)}
    title="The tick, headshot ting and kill thunk when your shots land. The visual hitmarker stays."><Crosshair size={14} />Hitmarker sound {enabled ? 'on' : 'off'}</button>;
}
