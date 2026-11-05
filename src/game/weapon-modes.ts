/** Appended family indexes. A launcher is a mode of its rifle, never another carry slot. */
export const OICW_RIFLE = 11, OICW_LAUNCHER = 13, QTS_RIFLE = 16, QTS_LAUNCHER = 17;
/** The 20 mm round both integral launchers fire. */
export const OICW_GRENADE = 'grenade-oicw';
const LAUNCHERS: ReadonlyMap<number, number> = new Map([[OICW_RIFLE, OICW_LAUNCHER], [QTS_RIFLE, QTS_LAUNCHER]]);
const RIFLES: ReadonlyMap<number, number> = new Map([...LAUNCHERS].map(([rifle, launcher]) => [launcher, rifle]));
export const isLauncherMode = (family: number) => RIFLES.has(family);
/** The launcher fitted to a rifle family, if it has one. */
export const launcherOf = (family: number) => LAUNCHERS.get(family);
/** Either mode of a rifle that has a launcher. */
export const hasLauncherMode = (family: number) => LAUNCHERS.has(family) || RIFLES.has(family);
export const primaryWeaponFamily = (family: number) => RIFLES.get(family) ?? family;
export const physicalWeaponFamilies = (families: readonly number[]) => families.filter(f => !RIFLES.has(f));
export const withWeaponModes = (families: readonly number[]) => {
  const physical = physicalWeaponFamilies(families);
  return [...physical, ...physical.flatMap(family => LAUNCHERS.get(family) ?? [])];
};
