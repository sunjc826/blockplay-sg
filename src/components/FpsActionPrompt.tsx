import { actionPrompt } from '../game/action-prompt';
import { itemById } from '../game/armory-catalog';
import type { FpsHud } from '../game/fps-engine';
import './fps-heading.css';

/** A quiet suggestion under the reticle, shown only while it can be acted on. Touch has the buttons, so no key is drawn there. */
export default function FpsActionPrompt({ hud, canFight, touch }: { hud: FpsHud; canFight: boolean; touch: boolean }) {
  const item = hud.recoveryItem, heals = !!item && item.count > 0 && (itemById(item.id)?.effect?.health ?? 0) > 0;
  const prompt = actionPrompt({
    health: hud.health, maxHealth: hud.maxHealth, magazine: hud.magazine, reserve: hud.reserve, capacity: hud.reloadCapacity ?? 0, roundReady: hud.roundReady, aiming: hud.aiming,
    busy: hud.reloading > 0 || !!hud.supplyUse || !!hud.grenadeHeld || !!hud.recoveryPicker || !!hud.grenadePicker || !!hud.calloutWheel || hud.inspecting || hud.mapExpanded || !!hud.npcPrompt || !!hud.travelPrompt,
    unavailable: !canFight || hud.pilotEnabled || hud.swimming === true || hud.vehicle !== 'on-foot' && !hud.vehiclePersonalWeapon || hud.merlion?.operating === true,
    heal: heals ? { name: item!.name } : null,
  });
  if (!prompt) return null;
  return <div className="fps-action-prompt" role="status" data-kind={prompt.kind} data-urgent={prompt.urgent || undefined}>
    {!touch && <kbd>{prompt.key}</kbd>}<span>{prompt.kind === 'heal' ? `USE ${prompt.text}` : prompt.text}</span>
  </div>;
}
