import { hudActionPrompt } from '../game/hud-action-prompt';
import type { FpsHud } from '../game/fps-engine';
import './fps-heading.css';

/** A quiet suggestion under the reticle, shown only while it can be acted on. Touch has the buttons, so no key is drawn there. */
export default function FpsActionPrompt({ hud, canFight, touch }: { hud: FpsHud; canFight: boolean; touch: boolean }) {
  const prompt = hudActionPrompt(hud,canFight);
  if (!prompt) return null;
  return <div className="fps-action-prompt" role="status" data-kind={prompt.kind} data-urgent={prompt.urgent || undefined}>
    {!touch && <kbd>{prompt.key}</kbd>}<span>{prompt.kind === 'heal' ? `USE ${prompt.text}` : prompt.text}</span>
  </div>;
}
