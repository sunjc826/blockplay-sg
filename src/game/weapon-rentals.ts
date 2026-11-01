import { isEnemyIssue, type ShopItem } from './armory-catalog';

export const RENTAL_HOUR_MS = 60 * 60 * 1000;
export const WEAPON_TERMS = [
  { id: '1h', label: '1 hour', hours: 1, discount: 0 },
  { id: '2h', label: '2 hours', hours: 2, discount: .10 },
  { id: '4h', label: '4 hours', hours: 4, discount: .20 },
] as const;
export type WeaponTerm = typeof WEAPON_TERMS[number]['id'];
export const isWeaponTerm = (term: unknown): term is WeaponTerm => WEAPON_TERMS.some(option => option.id === term);
export const canRentWeapon = (item: ShopItem) => item.category === 'weapon' && item.price > 0 && !isEnemyIssue(item);
const oneHourPrice = (item: ShopItem) => Math.max(1, Math.ceil(item.price * .10));
export function weaponTermPrice(item: ShopItem, term: WeaponTerm) {
  const option = WEAPON_TERMS.find(option => option.id === term)!;
  return Math.max(1, Math.ceil(oneHourPrice(item) * option.hours * (1 - option.discount)));
}
export function weaponTermSavings(item: ShopItem, term: WeaponTerm) {
  const hours = WEAPON_TERMS.find(option => option.id === term)!.hours;
  return oneHourPrice(item) * hours - weaponTermPrice(item, term);
}

/** Rental balances are remaining active-play milliseconds, independent of wall time. */
export function hasItemAccess(profile: { owned: readonly string[]; rentals?: Record<string, number> }, id: string) {
  return profile.owned.includes(id) || (profile.rentals?.[id] ?? 0) > 0;
}

export function rentalTimeLeft(remainingMs: number) {
  const seconds = Math.ceil(remainingMs / 1000);
  if (seconds <= 0) return 'Expired';
  if (seconds < 60) return `${seconds}s left`;
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `${minutes}m left`;
  const hours = Math.floor(minutes / 60), remainder = minutes % 60;
  if (hours < 24) return `${hours}h ${remainder}m left`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h left`;
}
