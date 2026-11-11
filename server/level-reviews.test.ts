import { afterEach, describe, expect, it, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { handleLevelReviews, LevelReviews, type ReviewContext } from './level-reviews';
import { emptyReview, parseReview } from '../src/game/level-review';
import notes from '../docs/level-reviews/developer-notes.json';
const databases: DatabaseSync[] = [];
afterEach(() => { for (const db of databases.splice(0)) db.close(); });
function context(): ReviewContext {
  const db = new DatabaseSync(':memory:'); databases.push(db);
  return { storage: {
    sql: { exec: <T extends Record<string, unknown>>(query: string, ...bindings: unknown[]) => {
      const statement = db.prepare(query);
      if (query.startsWith('SELECT')) return { toArray: () => statement.all(...bindings as never[]) as T[] };
      statement.run(...bindings as never[]); return { toArray: () => [] as T[] };
    } },
    transactionSync: <T>(work: () => T) => { db.exec('BEGIN'); try { const result = work(); db.exec('COMMIT'); return result; } catch (error) { db.exec('ROLLBACK'); throw error; } },
  } };
}
const token = 'a'.repeat(64);
const request = (body?: unknown, headers: Record<string, string> = {}, path = '') => new Request(`https://example.com/api/level-review${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
function reply(id: string) { const data = parseReview(JSON.stringify(notes)); data.threads[0].events.push({ id, author: 'ai', at: '2026-11-11T12:00:00.000Z', body: `Review ${id}` }); return data; }
describe('private Cloudflare level review', () => {
  it('blocks unauthenticated and cross-origin reads/writes before accessing storage', async () => {
    const fetch = vi.fn(), getByName = vi.fn(() => ({ fetch }));
    const env = { LEVEL_REVIEW_TOKEN: token, LEVEL_REVIEWS: { getByName } };
    for (const body of [undefined, emptyReview()]) {
      expect((await handleLevelReviews(request(body, { Authorization: '' }), env)).status).toBe(401);
      expect((await handleLevelReviews(request(body, { Authorization: `Bearer ${'b'.repeat(64)}` }), env)).status).toBe(401);
      expect((await handleLevelReviews(request(body, { Origin: 'https://other.example' }), env)).status).toBe(403);
    }
    expect(getByName).not.toHaveBeenCalled();
  });
  it('persists concurrent replies across object recreation and makes retries idempotent', async () => {
    const ctx = context(), object = new LevelReviews(ctx);
    const base = await (await object.fetch(request())).json(); expect(base.revision).toBe(1);
    await Promise.all([object.fetch(request(reply('reply-one'))), object.fetch(request(reply('reply-two')))]);
    const reopened = new LevelReviews(ctx), current = await (await reopened.fetch(request())).json();
    expect(current.document.threads[0].events).toHaveLength(3); expect(current.revision).toBe(3);
    const retry = await (await reopened.fetch(request(reply('reply-one')))).json(); expect(retry).toEqual(current);
  });
  it('rejects altered records atomically while preserving valid history', async () => {
    const object = new LevelReviews(context()); const before = await (await object.fetch(request(reply('first')))).json();
    const edited = reply('second'); edited.threads[0].anchor.x = 999;
    expect((await object.fetch(request(edited))).status).toBe(409);
    expect(await (await object.fetch(request())).json()).toEqual(before);
    expect((await object.fetch(request({ broken: true }))).status).toBe(400);
    expect(await (await object.fetch(request())).json()).toEqual(before);
  });
  it('routes verification data separately, strips credentials and bounds streamed bodies', async () => {
    const object = new LevelReviews(context()), fetch = vi.fn((r: Request) => object.fetch(r)), getByName = vi.fn(() => ({ fetch }));
    const env = { LEVEL_REVIEW_TOKEN: token, LEVEL_REVIEWS: { getByName } };
    expect((await handleLevelReviews(request(), env)).status).toBe(200); expect(getByName).toHaveBeenLastCalledWith('design-v1');
    expect(fetch.mock.calls[0][0].headers.has('Authorization')).toBe(false);
    expect((await handleLevelReviews(request(emptyReview(), {}, '/verification'), env)).status).toBe(200); expect(getByName).toHaveBeenLastCalledWith('verification-v1');
    const tooLarge = request('x'.repeat(2_000_001));
    expect((await handleLevelReviews(tooLarge, env)).status).toBe(413);
    expect((await handleLevelReviews(request(emptyReview(), { 'Content-Type': 'text/plain' }), env)).status).toBe(415);
    expect((await handleLevelReviews(request(undefined, {}, '/unknown'), env)).status).toBe(404);
    expect((await handleLevelReviews(request(), {})).status).toBe(503);
  });
  it('does not acknowledge a storage outage as a saved review', async () => {
    const env = { LEVEL_REVIEW_TOKEN: token, LEVEL_REVIEWS: { getByName: () => ({ fetch: async () => { throw new Error('disk failed'); } }) } };
    const response = await handleLevelReviews(request(reply('one')), env);
    expect(response.status).toBe(503); expect(response.headers.get('Cache-Control')).toBe('no-store');
  });
});
