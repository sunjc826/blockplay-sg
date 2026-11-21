import { describe, expect, it } from 'vitest';
// @ts-expect-error Node-only deploy helper has no declaration file.
import { deployDecision, parseStamp } from '../../scripts/lib/deploy-order.mjs';

const a = 'a'.repeat(40), b = 'b'.repeat(40);
describe('deploy order', () => {
  it('reads a stamp and refuses anything else', () => {
    expect(parseStamp({ depth: 12, sha: a, dirty: false, builtAt: 'now' })).toEqual({ depth: 12, sha: a, dirty: false, builtAt: 'now' });
    for (const bad of [null, '<!doctype html>', {}, { depth: 0, sha: a }, { depth: 1.5, sha: a }, { depth: 3, sha: 'main' }]) expect(parseStamp(bad)).toBeNull();
  });
  it('deploys over an unstamped or older site', () => {
    expect(deployDecision({ depth: 10, sha: a, dirty: false }, null).deploy).toBe(true);
    expect(deployDecision({ depth: 10, sha: a, dirty: false }, { depth: 9, sha: b, dirty: false }).deploy).toBe(true);
  });
  it('stands down when the live site is a later commit, however it got there', () => {
    const decision = deployDecision({ depth: 10, sha: a, dirty: false }, { depth: 11, sha: b, dirty: false });
    expect(decision.deploy).toBe(false); expect(decision.reason).toContain('ahead');
    expect(deployDecision({ depth: 10, sha: a, dirty: false }, { depth: 11, sha: b, dirty: true }).deploy).toBe(false);
  });
  it('stands down for the same clean commit, and deploys over a dirty or different build of the same depth', () => {
    expect(deployDecision({ depth: 10, sha: a, dirty: false }, { depth: 10, sha: a, dirty: false }).deploy).toBe(false);
    expect(deployDecision({ depth: 10, sha: a, dirty: false }, { depth: 10, sha: a, dirty: true }).deploy).toBe(true);
    expect(deployDecision({ depth: 10, sha: a, dirty: false }, { depth: 10, sha: b, dirty: false }).deploy).toBe(true);
  });
  it('deploys when forced', () => {
    expect(deployDecision({ depth: 10, sha: a, dirty: false }, { depth: 11, sha: b, dirty: false }, true).deploy).toBe(true);
  });
});
