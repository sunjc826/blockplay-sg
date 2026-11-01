/** Appended family indexes. A launcher is a mode of its rifle, never another carry slot. */
export const OICW_RIFLE = 11, OICW_LAUNCHER = 13;
export const OICW_GRENADE = 'grenade-oicw';
export const primaryWeaponFamily = (family: number) => family === OICW_LAUNCHER ? OICW_RIFLE : family;
export const physicalWeaponFamilies = (families: readonly number[]) => families.filter(f => f !== OICW_LAUNCHER);
export const withWeaponModes = (families: readonly number[]) => families.includes(OICW_RIFLE)
  ? [...physicalWeaponFamilies(families), OICW_LAUNCHER] : physicalWeaponFamilies(families);
