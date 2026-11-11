import { mergeReviews, parseReview, REVIEW_STORAGE_KEY, type ReviewCollection, type ReviewDocument } from '../game/level-review';

export const REVIEW_ACCESS_KEY = 'blockplay.level-review.access.v1';
export const validReviewToken = (token: string) => /^[a-f0-9]{64}$/.test(token);
export const reviewCacheKey = (collection: ReviewCollection = 'level') => (collection === 'asset' ? 'blockplay.asset-review.v1' : REVIEW_STORAGE_KEY) + (new URLSearchParams(window.location.search).has('reviewCloudTest') ? '.verification' : '');
export const reviewEndpoint = (collection: ReviewCollection = 'level') => `/api/${collection}-review` + (new URLSearchParams(window.location.search).has('reviewCloudTest') ? '/verification' : '');
export function tokenFromLink(value: string) {
  if (validReviewToken(value.trim())) return value.trim();
  try { const token = new URLSearchParams(new URL(value.trim()).hash.slice(1)).get('review-key') ?? ''; return validReviewToken(token) ? token : ''; }
  catch { return ''; }
}
export function readReviewAccess() {
  try {
    const params = new URLSearchParams(window.location.hash.slice(1)), token = params.get('review-key');
    if (token && validReviewToken(token)) {
      localStorage.setItem(REVIEW_ACCESS_KEY, token);
      params.delete('review-key');
      history.replaceState(history.state, '', window.location.pathname + window.location.search + (params.size ? `#${params}` : ''));
      return token;
    }
    const saved = localStorage.getItem(REVIEW_ACCESS_KEY) ?? ''; return validReviewToken(saved) ? saved : '';
  } catch { return ''; }
}
interface Snapshot { document: ReviewDocument; revision: number; updatedAt: string }
export class ReviewCloudError extends Error { constructor(message: string, public status: number) { super(message); } }
/** Re-read local state after each request, so edits made during network latency survive. */
export async function syncReview(options: {
  token: string; endpoint: string; signal: AbortSignal;
  read: () => ReviewDocument; apply: (document: ReviewDocument) => void;
  request?: typeof fetch;
}) {
  const { token, endpoint, signal, read, apply, request = fetch } = options;
  const call = async (document?: ReviewDocument): Promise<Snapshot> => {
    const response = await request(endpoint, { method: document ? 'POST' : 'GET', cache: 'no-store', signal,
      headers: { Authorization: `Bearer ${token}`, ...(document ? { 'Content-Type': 'application/json' } : {}) }, ...(document ? { body: JSON.stringify(document) } : {}) });
    if (!response.ok) {
      let message = 'Cloud unavailable. Your browser copy is safe; retry sync when connected.';
      try { const data = await response.json(); if (typeof data.error === 'string') message = data.error; } catch { /* Keep the bounded fallback. */ }
      throw new ReviewCloudError(message, response.status);
    }
    const snapshot = await response.json();
    if (!Number.isSafeInteger(snapshot.revision) || snapshot.revision < 1 || typeof snapshot.updatedAt !== 'string') throw new Error('Invalid cloud response. Browser data was preserved.');
    return { ...snapshot, document: parseReview(JSON.stringify(snapshot.document)) };
  };
  let remote = await call();
  signal.throwIfAborted();
  let merged = mergeReviews(remote.document, read());
  apply(merged);
  if (JSON.stringify(merged) !== JSON.stringify(remote.document)) {
    remote = await call(merged);
    signal.throwIfAborted();
    merged = mergeReviews(remote.document, read());
    apply(merged);
  }
  return { revision: remote.revision, updatedAt: remote.updatedAt, pending: JSON.stringify(merged) !== JSON.stringify(remote.document) };
}
