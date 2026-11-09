import { healthBand, HEALTH_LOW } from './vitals';

export function bloodBorder(health: number, maximum: number) {
  const fraction = maximum > 0 ? health / maximum : 1;
  const band = healthBand(health, maximum);
  return { band, opacity: health > 0 && maximum > 0 && fraction <= HEALTH_LOW
    ? Math.min(.9, .12 + .78 * (1 - Math.max(0, fraction) / HEALTH_LOW)) : 0 };
}
export interface ScreenVitals { health: number; armor: number; maxArmor: number; playing: boolean; alive: boolean; deaths?: number }
/** Ignore menus, first snapshots, respawns, death and unequipping/rental expiry. */
export function armorBrokeOnScreen(before: ScreenVitals | null, after: ScreenVitals) {
  return !!before && before.playing && after.playing && before.alive && after.alive && after.health > 0
    && before.deaths === after.deaths && after.maxArmor > 0 && before.armor > 0 && after.armor <= 0 && after.health <= before.health;
}
