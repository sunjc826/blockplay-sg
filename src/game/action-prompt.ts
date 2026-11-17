import { healthBand } from './vitals';

/** What the HUD knows when deciding whether to suggest a reload or a heal under the reticle. */
export interface ActionPromptState {
  health: number; maxHealth: number;
  magazine: number; reserve: number; capacity: number; roundReady: boolean;
  /** A reload, a supply, a grenade, a picker or an inspection already has the hands. */
  busy: boolean;
  /** The gun cannot be worked at all: swimming, a seat without a personal weapon, dead. */
  unavailable: boolean;
  aiming: boolean;
  /** The selected recovery item, when it restores health and one is carried. */
  heal: { name: string } | null;
}
export interface ActionPrompt { kind: 'reload' | 'heal'; key: 'R' | 'F'; text: string; urgent: boolean }

/** A magazine at or under this share of its capacity is worth topping up between fights. */
export const LOW_MAGAZINE = .25;

/**
 * One suggestion at most, and only one the player can act on now. A gun that cannot fire outranks a wound,
 * since reloading is what ends the fight; a wound outranks a magazine that is merely low. A low magazine is
 * not mentioned while aiming, where the player is busy using what is left.
 */
export function actionPrompt(state: ActionPromptState): ActionPrompt | null {
  if (state.busy || state.unavailable || state.health <= 0) return null;
  if ((state.magazine <= 0 || !state.roundReady) && state.reserve > 0) return { kind: 'reload', key: 'R', text: 'RELOAD', urgent: true };
  const band = healthBand(state.health, state.maxHealth);
  if (band !== 'steady' && state.heal) return { kind: 'heal', key: 'F', text: state.heal.name.toUpperCase(), urgent: band === 'critical' };
  if (!state.aiming && state.reserve > 0 && state.capacity > 0 && state.magazine <= state.capacity * LOW_MAGAZINE) return { kind: 'reload', key: 'R', text: 'LOW AMMO · RELOAD', urgent: false };
  return null;
}
