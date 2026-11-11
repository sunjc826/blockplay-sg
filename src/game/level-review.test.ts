import { describe, expect, it } from 'vitest';
import { emptyReview, mapRevision, mergeReviews, parseReview, reviewBrief, reviewPoint, threadStatus, type ReviewDocument, type ReviewEvent } from './level-review';
import seeds from '../../docs/level-reviews/developer-notes.json';
const fixture = () => parseReview(JSON.stringify(seeds));
const reply = (id: string, at = '2026-11-11T02:00:00.000Z', status?: 'open' | 'resolved'): ReviewEvent => ({ id, at, author: 'designer', body: 'Test both approaches in game.', ...(status ? { status } : {}) });
const branch = (event: ReviewEvent) => { const data = fixture(); data.threads[0].events.push(event); return data; };
describe('level review handoff', () => {
  it('round-trips repository notes and independent replies without losing or duplicating history', () => {
    const a = branch(reply('designer-reply')), b = branch({ ...reply('ai-reply'), author: 'ai' });
    const merged = mergeReviews(a, b);
    expect(merged.threads[0].events).toHaveLength(3);
    expect(mergeReviews(merged, a, b)).toEqual(merged);
    expect(mergeReviews(b, a)).toEqual(merged);
    expect(parseReview(JSON.stringify(merged))).toEqual(merged);
    expect(a.threads[0].events).toHaveLength(2);
  });
  it('retains resolution and reopening as timestamp-ordered comments', () => {
    const closed = branch(reply('resolved', '2026-11-11T02:00:00.000Z', 'resolved'));
    const reopened = branch(reply('reopened', '2026-11-11T03:00:00.000Z', 'open'));
    expect(threadStatus(closed.threads[0])).toBe('resolved');
    const merged = mergeReviews(reopened, closed);
    expect(threadStatus(merged.threads[0])).toBe('open');
    expect(merged.threads[0].events).toHaveLength(3);
  });
  it('rejects edited comments and moved pins instead of silently overwriting either side', () => {
    const edited = fixture(); edited.threads[0].events[0].body = 'Replacement';
    expect(() => mergeReviews(fixture(), edited)).toThrow('was edited');
    const moved = fixture(); moved.threads[0].anchor.x += 1;
    expect(() => mergeReviews(fixture(), moved)).toThrow('conflicting locations');
  });
  it.each([
    (d: ReviewDocument) => { d.version = 2 as 1; },
    (d: ReviewDocument) => { d.threads[0].district = 'unknown' as never; },
    (d: ReviewDocument) => { d.threads[0].anchor.x = Infinity; },
    (d: ReviewDocument) => { d.threads[0].events[0].at = 'invalid'; },
    (d: ReviewDocument) => { d.threads[0].events[0].body = ' '; },
    (d: ReviewDocument) => { d.threads[0].events[0].author = 'admin' as never; },
    (d: ReviewDocument) => { d.threads.push(d.threads[0]); },
    (d: ReviewDocument) => { d.threads[1].events = d.threads[0].events; },
  ])('rejects malformed handoffs atomically', mutate => {
    const data = fixture(); mutate(data);
    expect(() => parseReview(JSON.stringify(data))).toThrow();
    expect(fixture().threads).toHaveLength(2);
  });
  it('rejects an oversized file before parsing', () => expect(() => parseReview(' '.repeat(2_000_001))).toThrow('too large'));
  it('exports actionable coordinates, provenance and reply IDs in the brief', () => {
    const brief = reviewBrief(fixture(), 'marina-bay');
    expect(brief).toContain('[marina-islet-access]');
    expect(brief).toContain('x=0, z=-12');
    expect(brief).toContain('AI developer');
    expect(reviewBrief(fixture(), 'queenstown')).not.toContain('marina-islet-access');
  });
  it('fingerprints layout changes and clamps pointer/keyboard anchors to district bounds', () => {
    const map = { bounds: { minX: -100, maxX: 100, minZ: -50, maxZ: 50 }, mapRoads: [], decor: [], stamps: [] };
    expect(mapRevision(map)).toBe(mapRevision(structuredClone(map)));
    expect(mapRevision(map)).not.toBe(mapRevision({ ...map, stamps: [{ x: 5, z: 5 }] }));
    expect(reviewPoint(1000, -50.111, map.bounds)).toEqual({ x: 100, z: -50 });
    expect(reviewPoint(1.234, 2.345, map.bounds)).toEqual({ x: 1.2, z: 2.3 });
    expect(mergeReviews(emptyReview(), fixture())).toEqual(fixture());
  });
});
