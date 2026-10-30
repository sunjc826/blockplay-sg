import { ELIMINATION_CREDITS, ELIMINATION_XP } from './progression';

export const RAIDER_BOUNTIES = {
  gunship: { credits: 100, xp: 125 },
  drone: { credits: 40, xp: 50 },
} as const;
export type RaiderBounty = keyof typeof RAIDER_BOUNTIES;
export const validRaiderBounty = (value: unknown): value is RaiderBounty => value === 'gunship' || value === 'drone';
/** A destruction notice alone never pays an infantry kill as well as a bounty. */
export function combatFeedReward(event: { killerId?: string; victimId?: string; bounty?: RaiderBounty }) {
  if (!event.killerId) return null;
  if (validRaiderBounty(event.bounty)) return RAIDER_BOUNTIES[event.bounty];
  return event.victimId ? { credits: ELIMINATION_CREDITS, xp: ELIMINATION_XP } : null;
}
