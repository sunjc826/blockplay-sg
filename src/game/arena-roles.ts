import { FPS_WEAPONS, validWeaponIndex, type WeaponSpec } from './fps-rules';
import { isEnemyIssue, itemById, type ShopItem } from './armory-catalog';
import { DEFAULT_BOT_FACTION, getArenaFaction } from './arena-factions';

export interface ArenaRoleContext { distance: number; visible: boolean; healthFraction: number; strafeDirection: number }
export interface ArenaRoleIntent { approach: number; strafe: number; fire: boolean; shotDelay: number; spread: number }
export interface ArenaRolePlugin {
  id: string; name: string; description: string; health: number; armor: number; absorption: number;
  speed: number; sightRange: number; reaction: number;
  /**
   * Enemy-issue variants a squad member may be carrying, by relative weight,
   * drawn again at every spawn. This decides what they hold, what they drop
   * and how hard, how fast and how far they hit: the drawn variant's own
   * damage, falloff, cycle, magazine and reload. `weapon` is only the fallback
   * for a loadout slot no draw fills.
   */
  armament: readonly ArmamentChoice[];
  weapon: Pick<WeaponSpec, 'damage' | 'interval' | 'capacity' | 'reload'>;
  /**
   * Rounds per trigger pull, drawn between the two bounds; `shotDelay` is then
   * the pause between bursts. Inside a burst the drawn variant's own cycle sets
   * the pace. Omitted, every pull is a single round.
   */
  burst?: readonly [number, number];
  /** Field dressings carried per spawn; each restores about half their health. Default 1. */
  medkits?: number;
  /** Fielded by combat events only (a mortar crew, a rooftop sniper): never a squad choice or a balance opponent. */
  eventOnly?: boolean;
  /** Whose uniform a squad member wears (see arena-factions). Default mercenaries. Event crews wear their event's faction instead. */
  faction?: string;
  think(context: Readonly<ArenaRoleContext>): ArenaRoleIntent;
}
export interface ArmamentChoice { variant: string; weight: number }
const registry = new Map<string, ArenaRolePlugin>();
const armedWith = (choice: ArmamentChoice) => {
  const item = itemById(choice.variant);
  return item?.category === 'weapon' && isEnemyIssue(item) && validWeaponIndex(item.family) ? item : undefined;
};
/** Weighted draw of what one spawn carries; `kit`, when given, reweights each choice by its variant's tier (a rank's issue, see arena-ranks). */
export function chooseArmament(role: Pick<ArenaRolePlugin, 'armament'>, random: () => number, kit?: Readonly<Record<ShopItem['tier'], number>>): ShopItem & { family: number } {
  const weight = (choice: ArmamentChoice) => choice.weight * (kit ? kit[armedWith(choice)!.tier] ?? 1 : 1);
  const total = role.armament.reduce((sum, choice) => sum + weight(choice), 0);
  let roll = random() * total;
  for (const choice of role.armament) { roll -= weight(choice); if (roll <= 0) return armedWith(choice) as ShopItem & { family: number }; }
  return armedWith(role.armament[role.armament.length - 1]) as ShopItem & { family: number };
}
/** Every family a role can be holding, so its loadout has the role's stats in each. */
export const armamentFamilies = (role: Pick<ArenaRolePlugin, 'armament'>) => [...new Set(role.armament.map(choice => armedWith(choice)!.family!))];
/** Local, statically imported extensions only: no downloaded scripts or eval. */
export function registerArenaRole(plugin: ArenaRolePlugin) {
  if (!/^[a-z][a-z0-9-]{0,31}$/.test(plugin.id) || registry.has(plugin.id)) throw new Error('Role ID must be unique and use lowercase letters, numbers or hyphens.');
  if (!getArenaFaction(plugin.faction ?? DEFAULT_BOT_FACTION)) throw new Error('Role faction must be a registered faction.');
  if (!plugin.name || typeof plugin.think !== 'function' || ![plugin.health, plugin.armor, plugin.absorption, plugin.speed, plugin.sightRange, plugin.reaction,
    plugin.weapon.damage, plugin.weapon.interval, plugin.weapon.capacity, plugin.weapon.reload].every(Number.isFinite)) throw new Error('Role requires finite stats and a think function.');
  if (plugin.health <= 0 || plugin.health > 300 || plugin.armor < 0 || plugin.armor > 150 || plugin.absorption < 0 || plugin.absorption > 0.9 ||
    plugin.speed <= 0 || plugin.speed > 10 || plugin.sightRange <= 0 || plugin.sightRange > 125 || plugin.reaction < 0.1 || plugin.reaction > 10 ||
    !plugin.armament.length || plugin.armament.length > 12 || !plugin.armament.every(choice => armedWith(choice) && Number.isFinite(choice.weight) && choice.weight > 0 && choice.weight <= 100) || plugin.weapon.damage <= 0 || plugin.weapon.damage > 100 || plugin.weapon.interval < 0.06 ||
    plugin.weapon.capacity < 1 || plugin.weapon.capacity > 200 || plugin.weapon.reload < 0.4 ||
    (plugin.burst && !(Number.isInteger(plugin.burst[0]) && Number.isInteger(plugin.burst[1]) && plugin.burst[0] >= 1 && plugin.burst[1] >= plugin.burst[0] && plugin.burst[1] <= 12)) ||
    (plugin.medkits !== undefined && !(Number.isInteger(plugin.medkits) && plugin.medkits >= 0 && plugin.medkits <= 4))) throw new Error('Role stats are outside arcade limits.');
  registry.set(plugin.id, Object.freeze({ ...plugin, ...(plugin.burst ? { burst: Object.freeze([plugin.burst[0], plugin.burst[1]] as const) } : {}), armament: Object.freeze(plugin.armament.map(choice => Object.freeze({ ...choice }))), weapon: Object.freeze({ ...plugin.weapon }) }));
}
export const getArenaRole = (id: string) => registry.get(id);
/** Squad roles; event-only roles are left out. */
export const listArenaRoles = () => [...registry.values()].filter(role => !role.eventOnly);

registerArenaRole({
  id: 'assault', name: 'Assault squad', description: 'Mobile rifle bots that close distance and strafe around their target.',
  health: 100, armor: 25, absorption: 0.35, speed: 3.1, sightRange: 65, reaction: 0.65,
  armament: [{ variant: 'xm8-carbine', weight: 5 }, { variant: 'g36-rifle', weight: 5 }, { variant: 'xm8-compact', weight: 2 }, { variant: 'g36k', weight: 2 }, { variant: 'g36c', weight: 1.5 }],
  weapon: { ...FPS_WEAPONS[0] }, burst: [2, 4], medkits: 1,
  think: ({ distance, visible, strafeDirection }) => ({
    approach: !visible || distance > 18 ? 1 : distance < 8 ? -0.65 : 0,
    strafe: strafeDirection * (visible ? 0.85 : 0.35), fire: visible,
    shotDelay: 0.85, spread: 0.045,
  }),
});
registerArenaRole({
  id: 'tank', name: 'Tank squad', description: 'Heavy infantry: extra plates, slow advances and sustained support-weapon fire.',
  health: 130, armor: 100, absorption: 0.65, speed: 1.7, sightRange: 60, reaction: 0.85,
  armament: [{ variant: 'mg4-standard', weight: 5 }, { variant: 'mg4ke', weight: 2 }, { variant: 'mg36', weight: 1.5 }, { variant: 'xm8-automatic', weight: 1.5 }, { variant: 'mg4-sustained', weight: 1 }],
  weapon: { ...FPS_WEAPONS[1], damage: 27, capacity: 75 }, burst: [4, 8], medkits: 2,
  think: ({ distance, visible, strafeDirection }) => ({
    approach: !visible || distance > 7 ? 1 : 0, strafe: visible ? strafeDirection * 0.18 : strafeDirection * 0.3,
    fire: visible, shotDelay: 1.35, spread: 0.075,
  }),
});
registerArenaRole({
  id: 'sniper', name: 'Sniper squad', description: 'Long-range marksmen that hold their ground and retreat when crowded.',
  health: 80, armor: 10, absorption: 0.25, speed: 2.3, sightRange: 110, reaction: 1.1,
  armament: [{ variant: 'xm8-sharpshooter', weight: 3 }, { variant: 'g36-rifle', weight: 2 }],
  weapon: { ...FPS_WEAPONS[0], damage: 68, interval: 1.4, capacity: 6, reload: 2.5 }, burst: [1, 1], medkits: 1,
  think: ({ distance, visible, strafeDirection }) => ({
    approach: !visible || distance > 52 ? 0.8 : distance < 27 ? -1 : 0,
    strafe: !visible ? strafeDirection * 0.25 : distance < 27 ? strafeDirection * 0.2 : 0,
    fire: visible, shotDelay: 1.55, spread: 0.012,
  }),
});

// Combat events place these where the event needs them and they hold that spot.
registerArenaRole({
  id: 'mortar-crew', name: 'Mortar crew', description: 'Two soldiers working a mortar; kill both and it stops firing.',
  health: 90, armor: 25, absorption: 0.3, speed: 2.6, sightRange: 55, reaction: 0.8, eventOnly: true,
  armament: [{ variant: 'xm8-carbine', weight: 3 }, { variant: 'g36k', weight: 2 }],
  weapon: { ...FPS_WEAPONS[0] }, burst: [2, 3], medkits: 0,
  think: ({ visible }) => ({ approach: 0, strafe: 0, fire: visible, shotDelay: 1, spread: 0.05 }),
});
registerArenaRole({
  id: 'overwatch', name: 'Overwatch sniper', description: 'A marksman on a rooftop. Their scope glints for a moment before each shot.',
  health: 90, armor: 0, absorption: 0, speed: 2, sightRange: 125, reaction: 1.4, eventOnly: true,
  armament: [{ variant: 'xm8-sharpshooter', weight: 1 }],
  weapon: { ...FPS_WEAPONS[0], damage: 68, interval: 1.4, capacity: 6, reload: 2.5 }, burst: [1, 1], medkits: 0,
  think: ({ visible }) => ({ approach: 0, strafe: 0, fire: visible, shotDelay: 2.4, spread: 0.006 }),
});

export const ARENA_ROLE_OPTIONS = [
  { id: 'mixed', name: 'Mixed squad', description: 'A mix of assault, heavy infantry and sniper bots.' },
  ...listArenaRoles().map(({ id, name, description }) => ({ id, name, description })),
];
