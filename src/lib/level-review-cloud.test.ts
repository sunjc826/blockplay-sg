import { describe, expect, it, vi } from 'vitest';
import { syncReview, tokenFromLink } from './level-review-cloud';
import { emptyReview, mergeReviews, parseReview } from '../game/level-review';
import notes from '../../docs/level-reviews/developer-notes.json';
const base = () => parseReview(JSON.stringify(notes));
const append = (id: string) => { const data = base(); data.threads[0].events.push({ id, author: 'designer', at: '2026-11-11T12:00:00.000Z', body: id }); return data; };
const snapshot = (document = base(), revision = 1) => Response.json({ document, revision, updatedAt: '2026-11-11T12:00:00.000Z' });
describe('cloud review reconciliation', () => {
  it('merges independent replies and retains edits made during an in-flight POST', async () => {
    let local = append('local'), remote = append('remote');
    const request = vi.fn<typeof fetch>(async (_url, init) => {
      if (init?.method === 'POST') {
        remote = mergeReviews(remote, parseReview(String(init.body)));
        local = mergeReviews(local, append('during-post'));
      }
      return snapshot(remote, 2);
    });
    const options = { token: 'a'.repeat(64), endpoint: '/api/level-review', signal: new AbortController().signal, read: () => local, apply: (data: typeof local) => { local = data; }, request };
    expect((await syncReview(options)).pending).toBe(true);
    expect(local.threads[0].events).toHaveLength(4);
    expect((await syncReview(options)).pending).toBe(false);
    expect(remote).toEqual(local);
  });
  it('does not write on a read-only poll or replay existing comments', async () => {
    let local = base(); const request = vi.fn<typeof fetch>(async () => snapshot());
    await syncReview({ token: 'a'.repeat(64), endpoint: '/api/level-review', signal: new AbortController().signal, read: () => local, apply: data => { local = data; }, request });
    expect(request).toHaveBeenCalledTimes(1); expect(request.mock.calls[0][1]?.method).toBe('GET');
  });
  it('preserves the local outbox after failed writes and merges it on reconnection', async () => {
    let local = append('offline'); const original = structuredClone(local);
    const request = vi.fn<typeof fetch>(async (_url, init) => init?.method === 'POST' ? Response.json({ error: 'Unavailable' }, { status: 503 }) : snapshot());
    const options = { token: 'a'.repeat(64), endpoint: '/api/level-review', signal: new AbortController().signal, read: () => local, apply: (data: typeof local) => { local = data; }, request };
    await expect(syncReview(options)).rejects.toThrow('Unavailable'); expect(local).toEqual(original);
    request.mockImplementation(async (_url, init) => snapshot(init?.method === 'POST' ? parseReview(String(init.body)) : base()));
    expect((await syncReview(options)).pending).toBe(false); expect(local).toEqual(original);
  });
  it('ignores late responses after disconnect and rejects invalid authentication/data', async () => {
    const controller = new AbortController(), apply = vi.fn();
    await expect(syncReview({ token: 'a'.repeat(64), endpoint: '/api/level-review', signal: controller.signal, read: base, apply, request: vi.fn(async () => { controller.abort(); return snapshot(); }) })).rejects.toThrow();
    expect(apply).not.toHaveBeenCalled();
    await expect(syncReview({ token: 'bad', endpoint: '/api/level-review', signal: new AbortController().signal, read: base, apply, request: vi.fn(async () => Response.json({ error: 'Private access required' }, { status: 401 })) })).rejects.toThrow('Private access required');
    await expect(syncReview({ token: 'a'.repeat(64), endpoint: '/api/level-review', signal: new AbortController().signal, read: base, apply, request: vi.fn(async () => snapshot(emptyReview(), -1)) })).rejects.toThrow('Invalid cloud response');
    expect(apply).not.toHaveBeenCalled();
  });
  it('accepts only the intended high-entropy access format', () => {
    const token = 'a'.repeat(64); expect(tokenFromLink(`https://example.com/debug?review=marina-bay#review-key=${token}`)).toBe(token);
    expect(tokenFromLink(token)).toBe(token); expect(tokenFromLink('short-password')).toBe('');
    expect(tokenFromLink(`https://example.com/?review-key=${token}`)).toBe('');
  });
});
