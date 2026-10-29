import { Keyboard } from 'lucide-react';
import { setHudHints, useHudHints } from '../game/hud-hints-setting';

export default function HudHintsToggle() {
  const enabled = useHudHints();
  return <button type="button" className="session-button fps-hints-toggle" aria-pressed={enabled} onClick={() => setHudHints(!enabled)}
    title="PC HUD instructions. Health, armor, ammo, objectives and warnings stay visible."><Keyboard size={14} />HUD hints {enabled ? 'on' : 'off'}</button>;
}
