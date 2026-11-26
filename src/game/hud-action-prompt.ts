import { actionPrompt } from './action-prompt';
import { itemById } from './armory-catalog';
import type { FpsHud } from './fps-engine';

export function hudActionPrompt(hud:FpsHud, canFight:boolean) {
  const item = hud.recoveryItem, heals = !!item && item.count > 0 && (itemById(item.id)?.effect?.health ?? 0) > 0;
  return actionPrompt({
    health: hud.health, maxHealth: hud.maxHealth, magazine: hud.magazine, reserve: hud.reserve, capacity: hud.reloadCapacity ?? 0, roundReady: hud.roundReady, aiming: hud.aiming,
    busy: hud.reloading > 0 || !!hud.supplyUse || !!hud.grenadeHeld || !!hud.recoveryPicker || !!hud.grenadePicker || !!hud.calloutWheel || hud.inspecting || hud.mapExpanded || !!hud.npcPrompt || !!hud.travelPrompt,
    unavailable: !canFight || hud.pilotEnabled || hud.swimming === true || hud.vehicle !== 'on-foot' && !hud.vehiclePersonalWeapon || hud.merlion?.operating === true,
    heal: heals ? { name: item!.name } : null,
  });
}
