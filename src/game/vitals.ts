/**
 * The vitals chips read as a state rather than a number, so a player glancing
 * at the corner sees trouble before reading the digits. Bands are a share of
 * the player's own maximum, because the debug health multiplier moves it.
 */
export type HealthBand = 'steady' | 'low' | 'critical';

/** A half-magazine of return fire takes a full operator to 'low'. */
export const HEALTH_LOW = .5, HEALTH_CRITICAL = .25;

export function healthBand(health: number, maxHealth: number): HealthBand {
  const fraction = maxHealth > 0 ? Math.max(0, health) / maxHealth : 0;
  return fraction <= HEALTH_CRITICAL ? 'critical' : fraction <= HEALTH_LOW ? 'low' : 'steady';
}

/**
 * Armor is a two-state reading rather than a third band: the plate's capacity
 * lives on the loadout, not the HUD, and what a player needs to know is only
 * whether anything is still absorbing hits.
 */
export const armorState = (armor: number) => armor > 0 ? 'holding' : 'depleted';
