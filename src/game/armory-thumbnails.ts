import { ARMORY_CATALOG, isEnemyIssue, isShopFamily, type ShopItem } from './armory-catalog';
import { FPS_WEAPONS } from './fps-rules';
import type { VehicleKind } from './vehicle-rules';

/** Finishes are photographed on each platform; vehicle wraps on both vehicles. */
export function armoryThumbnailFile(item: ShopItem, family = 0, vehicle: VehicleKind = 'car') {
  const suffix = item.category === 'skin' ? `-${family}` : item.category === 'vehicleSkin' ? `-${vehicle}` : '';
  return `${item.id}${suffix}.webp`;
}

export function armoryThumbnailShots() {
  return ARMORY_CATALOG.filter(item => item.category !== 'loadout' && !isEnemyIssue(item)).flatMap(item => {
    const families = item.category === 'skin' ? FPS_WEAPONS.flatMap((_, i) => isShopFamily(i) ? [i] : []) : [item.family ?? 0];
    const vehicles: VehicleKind[] = item.category === 'vehicleSkin' ? ['car', 'helicopter'] : ['car'];
    return families.flatMap(family => vehicles.map(vehicle => ({ item, family, vehicle, file: armoryThumbnailFile(item, family, vehicle) })));
  });
}
