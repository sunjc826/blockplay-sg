import { isEnemyIssue, type ShopItem } from './armory-catalog';

export const RENTAL_DAY_MS = 24 * 60 * 60 * 1000;
export const WEAPON_TERMS = [
  { id: '1d', label: '1 day', days: 1, rate: .10 },
  { id: '7d', label: '7 days', days: 7, rate: .30 },
  { id: '30d', label: '30 days', days: 30, rate: .60 },
] as const;
export type WeaponTerm = typeof WEAPON_TERMS[number]['id'];
export const isWeaponTerm = (term: unknown): term is WeaponTerm => WEAPON_TERMS.some(option => option.id === term);
export const canRentWeapon = (item: ShopItem) => item.category === 'weapon' && item.price > 0 && !isEnemyIssue(item);
export const weaponTermPrice = (item: ShopItem, term: WeaponTerm) => Math.max(1, Math.ceil(item.price * WEAPON_TERMS.find(option => option.id === term)!.rate));

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
