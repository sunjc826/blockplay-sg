import { describe, it, expect } from 'vitest';
import { claimElimination, createProfile, restoreProfile } from './armory-state';
import { combatFeedReward, RAIDER_BOUNTIES } from './combat-rewards';
import { createArena } from './arena-rules';
import { validArenaSnapshot } from './arena-runtime';

describe('raider bounties', () => {
  for (const kind of ['gunship', 'drone'] as const) it(`pays the ${kind} bounty once, persists it, and never adds an infantry reward`, () => {
    const p = createProfile(), id = `round-1:bounty:${kind}`, reward = RAIDER_BOUNTIES[kind];
    const paid = claimElimination(p, id, kind);
    expect(paid.credits - p.credits).toBe(reward.credits);
    expect(paid.xp - p.xp).toBe(reward.xp);
    expect(combatFeedReward({ killerId: 'one', bounty: kind })).toEqual(reward);
    expect(claimElimination(paid, id, kind)).toBe(paid);
    const restored = restoreProfile(JSON.stringify(paid));
    expect(claimElimination(restored, id, kind)).toBe(restored);
    expect(claimElimination(paid, `round-2:bounty:${kind}`, kind).credits).toBe(paid.credits + reward.credits);
  });
  it('keeps infantry rewards and excludes destruction announcements, environmental kills and uncredited outcomes', () => {
    expect(combatFeedReward({ killerId: 'one', victimId: 'bot-1' })).toEqual({ credits: 20, xp: 25 });
    expect(combatFeedReward({ killerId: 'one' })).toBeNull();
    expect(combatFeedReward({ victimId: 'bot-1' })).toBeNull();
    expect(combatFeedReward({ bounty: 'gunship' })).toBeNull();
  });
  it('accepts only known, credited bounty records in host snapshots', () => {
    const a = createArena([], 0); a.addPlayer('one', 'Alpha'); const snapshot = a.snapshot();
    const feed = { id: 'reward-1', text: 'Alpha downed the raid helicopter', killerId: 'one', bounty: 'gunship' };
    expect(validArenaSnapshot({ ...snapshot, feed: [feed] })).toBe(true);
    expect(validArenaSnapshot({ ...snapshot, feed: [{ ...feed, bounty: 'transport' }] })).toBe(false);
    expect(validArenaSnapshot({ ...snapshot, feed: [{ ...feed, killerId: undefined }] })).toBe(false);
    expect(validArenaSnapshot({ ...snapshot, feed: [{ ...feed, victimId: 'bot-1' }] })).toBe(false);
  });
});
