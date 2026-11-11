import { describe, expect, it } from 'vitest';
import { readDebugWorkspace, debugWorkspaceUrl } from './debug-workspace';
describe('debug workspace entry', () => {
  it('opens lightweight design work and resumes the selected model without auto-starting games', () => {
    expect(readDebugWorkspace('').tool).toBe('maps');
    expect(readDebugWorkspace('', JSON.stringify({ tool: 'models', asset: 'operator/lancer', district: 'queenstown' }))).toEqual({ tool: 'models', asset: 'operator/lancer', district: 'queenstown' });
    expect(readDebugWorkspace('', JSON.stringify({ tool: 'street' })).tool).toBe('maps');
  });
  it('honors explicit shared links and legacy room invites over preferences', () => {
    const saved = JSON.stringify({ tool: 'models', asset: 'weapon/ff-oicw', district: 'queenstown' });
    expect(readDebugWorkspace('?review=marina-bay&thread=a', saved).tool).toBe('maps');
    expect(readDebugWorkspace('?asset=prop/vending', saved).asset).toBe('prop/vending');
    expect(readDebugWorkspace('?room=abcd', saved).tool).toBe('arena');
    expect(readDebugWorkspace('?tool=fps&district=queenstown').tool).toBe('fps');
  });
  it('handles blocked/corrupt preferences and unrecognized subjects safely', () => {
    for (const saved of ['bad', 'null', '42', '[]']) expect(readDebugWorkspace('', saved).district).toBe('marina-bay');
    expect(readDebugWorkspace('?review=unknown&asset=../../secret&tool=bad')).toEqual({ tool: 'models', district: 'marina-bay', asset: 'prop/vending' });
  });
  it('updates shareable state, preserves verification isolation and removes stale thread/invite targets', () => {
    const next = { tool: 'models' as const, district: 'queenstown' as const, asset: 'operator/lancer' };
    const url = debugWorkspaceUrl(next, '?review=marina-bay&thread=old&room=old&reviewCloudTest=1');
    expect(url).toContain('reviewCloudTest=1'); expect(url).not.toContain('thread='); expect(url).not.toContain('room=');
    expect(readDebugWorkspace(url.split('?')[1])).toMatchObject({ tool: 'models', asset: 'operator/lancer' });
  });
});
