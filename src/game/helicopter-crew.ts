import { vehicleGunRay } from './vehicle-seats';
import { combatRandom, type CombatEventDescriptor, type CombatVector } from './combat-events';
import { transportPoint } from './combat-transports';

/** Scripted helicopters follow the fleet's pilot / personal-weapon passenger distinction. */
export const AIRCREW_ROLES = ['pilot', 'door-left', 'door-right'] as const;
export type AircrewRole = typeof AIRCREW_ROLES[number];
export const validAircrewRole = (value: unknown): value is AircrewRole => typeof value === 'string' && AIRCREW_ROLES.some(role => role === value);
export const rifleSeat = (role: AircrewRole | undefined) => role === 'door-left' || role === 'door-right';
export const AIRCREW = { health: 100, descent: 5, range: 110, burst: 3, interval: .18, pause: 1.8, damage: 14 } as const;
/** Draw once per mission, independent of the host's combat RNG; more intense missions tend to carry more riflemen. */
export function helicopterCrew(event: Pick<CombatEventDescriptor, 'seed' | 'intensity'>): AircrewRole[] {
  const random = combatRandom(event.seed ^ 0x63726577), chance = .25 + .2 * Math.max(.5, Math.min(2, event.intensity));
  const roles: AircrewRole[] = ['pilot'];
  if (random() < chance) roles.push('door-left');
  if (random() < chance) roles.push('door-right');
  return roles;
}
type Airframe = Pick<CombatVector, 'x' | 'y' | 'z'> & { yaw: number };
export function aircrewPoint(frame: Airframe, role: AircrewRole): CombatVector {
  if (role === 'pilot') return transportPoint(frame, .45, 2.05, -1.6);
  return transportPoint(frame, role === 'door-left' ? -1.35 : 1.35, 1.9, .2);
}
/** Same chin-mount pivot as vehicleGunRay for the player's helicopter. */
export function helicopterGunPoint(frame: Airframe) { return transportPoint(frame, 0, .72, -1.7); }
export function aircrewFacing(yaw: number, role: AircrewRole) { return yaw + (role === 'door-left' ? Math.PI / 2 : role === 'door-right' ? -Math.PI / 2 : 0); }

/** Player and scripted mounted guns share their pitch stops as well as the mount. */
export function helicopterGunRay(frame: Airframe, aim: CombatVector) { return vehicleGunRay({ ...frame, kind: 'helicopter', gunYaw: frame.yaw, gunPitch: 0 }, aim); }
