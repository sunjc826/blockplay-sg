import { emptyReview, MAX_REVIEW_BYTES, mergeReviews, parseReview, type ReviewDocument } from '../src/game/level-review';
import notes from '../docs/level-reviews/developer-notes.json';

export interface ReviewSnapshot { document: ReviewDocument; revision: number; updatedAt: string }
interface Sql { exec<T extends Record<string, unknown>>(query: string, ...bindings: unknown[]): { toArray(): T[] } }
export interface ReviewContext { storage: { sql: Sql; transactionSync<T>(work: () => T): T } }
interface ReviewBinding { getByName(name: string): { fetch(request: Request): Promise<Response> } }
export interface ReviewEnvironment { LEVEL_REVIEWS?: ReviewBinding; LEVEL_REVIEW_TOKEN?: string }
const seeds = parseReview(JSON.stringify(notes));
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });

export async function readReviewBody(request: Request) {
  const reader = request.body?.getReader();
  let raw = '', size = 0; const decoder = new TextDecoder();
  if (reader) try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > MAX_REVIEW_BYTES) { await reader.cancel(); throw new Error('Review request exceeds 2 MB.'); }
      raw += decoder.decode(value, { stream: true });
    }
  } finally { reader.releaseLock(); }
  return raw + decoder.decode();
}
async function authorized(request: Request, secret: string) {
  const token = request.headers.get('Authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
  if (!token) return false;
  const digest = (text: string) => crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  const [a, b] = await Promise.all([digest(token), digest(secret)]);
  const left = new Uint8Array(a), right = new Uint8Array(b);
  let difference = 0; for (let i = 0; i < left.length; i++) difference |= left[i] ^ right[i];
  return difference === 0;
}
/** One private project. Authorization happens before touching storage or reading bodies. */
export async function handleLevelReviews(request: Request, env: ReviewEnvironment): Promise<Response> {
  const path = new URL(request.url).pathname;
  if (!['/api/level-review', '/api/level-review/verification'].includes(path)) return json({ error: 'Not found.' }, 404);
  if (!['GET', 'POST'].includes(request.method)) return json({ error: 'Use GET to read or POST to append.' }, 405);
  if (!env.LEVEL_REVIEWS || !env.LEVEL_REVIEW_TOKEN) return json({ error: 'Cloud review is not configured. Your browser copy is still available.' }, 503);
  const origin = request.headers.get('Origin');
  if (origin && origin !== new URL(request.url).origin) return json({ error: 'Unexpected origin.' }, 403);
  if (!await authorized(request, env.LEVEL_REVIEW_TOKEN)) return json({ error: 'Private review access required. Open your collaboration link to connect.' }, 401);
  let body: string | undefined;
  if (request.method === 'POST') {
    if (!request.headers.get('Content-Type')?.startsWith('application/json')) return json({ error: 'Expected application/json.' }, 415);
    try { body = await readReviewBody(request); }
    catch { return json({ error: 'Review request exceeds 2 MB.' }, 413); }
  }
  try {
    // Strip credentials before the internal request. The verification board is isolated
    // from real discussions and only accessible with the same private credential.
    return await env.LEVEL_REVIEWS.getByName(path.endsWith('/verification') ? 'verification-v1' : 'design-v1').fetch(new Request(request.url, {
      method: request.method, headers: { 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body }),
    }));
  } catch { return json({ error: 'Cloud review is temporarily unavailable. Keep working locally and retry sync.' }, 503); }
}

/** SQL TEXT avoids the smaller per-value limit of the key/value API for a 2 MB board. */
export class LevelReviews {
  constructor(private ctx: ReviewContext) {
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS review_state (id INTEGER PRIMARY KEY CHECK (id = 1), document TEXT NOT NULL, revision INTEGER NOT NULL, updated_at TEXT NOT NULL)');
  }
  private merge(incoming = emptyReview()): ReviewSnapshot {
    return this.ctx.storage.transactionSync(() => {
      const previous = this.ctx.storage.sql.exec<{ document: string; revision: number; updated_at: string }>('SELECT document, revision, updated_at FROM review_state WHERE id = 1').toArray()[0];
      const document = mergeReviews(previous ? parseReview(previous.document) : emptyReview(), seeds, incoming);
      const raw = JSON.stringify(document), changed = raw !== previous?.document;
      const revision = (previous?.revision ?? 0) + (changed ? 1 : 0);
      const updatedAt = changed ? new Date().toISOString() : previous.updated_at;
      if (changed) this.ctx.storage.sql.exec('INSERT INTO review_state (id, document, revision, updated_at) VALUES (1, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET document=excluded.document, revision=excluded.revision, updated_at=excluded.updated_at', raw, revision, updatedAt);
      return { document, revision, updatedAt };
    });
  }
  async fetch(request: Request) {
    let incoming = emptyReview();
    if (request.method === 'POST') {
      try { incoming = parseReview(await readReviewBody(request)); }
      catch { return json({ error: 'Invalid review document. Check the version, IDs, comments and 2 MB limit.' }, 400); }
    } else if (request.method !== 'GET') return json({ error: 'Method not allowed.' }, 405);
    try { return json(this.merge(incoming)); }
    catch (error) {
      // Schema/merge errors are safe, bounded messages; unexpected storage errors escape
      // to the Worker and become a retryable 503, never a successful acknowledgement.
      if (error instanceof Error && /conflicting locations|was edited|Invalid or duplicate|too large|at most 500/.test(error.message)) return json({ error: error.message }, 409);
      throw error;
    }
  }
}
