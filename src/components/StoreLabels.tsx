import type { ReactNode } from 'react';
import type { ItemTier, ShopItem } from '../game/armory-catalog';

export function TierLabel({ tier, children }: { tier: ItemTier; children?: ReactNode }) {
  return <span className={`store-tier tier-${tier.toLowerCase()}`}>{children ?? tier}</span>;
}
export function StoreMoney({ amount, currency }: { amount: number; currency: ShopItem['currency'] }) {
  return <span className={`store-currency currency-${currency}`}>{amount.toLocaleString()} {currency}</span>;
}
/** Messages remain plain strings in game state; only the presentation adds color. */
export function StoreMessage({ text }: { text: string }) {
  return <>{text.split(/(\b\d[\d,]*(?:\.\d+)? (?:credits|tokens|CR|TK)\b)/gi).map((part, index) => {
    const currency = /\b(tokens|TK)$/i.test(part) ? 'tokens' : /\b(credits|CR)$/i.test(part) ? 'credits' : undefined;
    return currency ? <span key={index} className={`store-currency currency-${currency}`}>{part}</span> : part;
  })}</>;
}
