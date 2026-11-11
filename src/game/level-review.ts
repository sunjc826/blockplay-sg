import { isRegionId, type RegionId } from './region-ids';
import type { MapBounds } from './minimap';

export const REVIEW_STORAGE_KEY = 'blockplay.level-review.v1';
export const MAX_REVIEW_BYTES = 2_000_000;
export type ReviewAuthor = 'designer' | 'ai';
export type ReviewStatus = 'open' | 'resolved';
export type ReviewEvent = { id: string; at: string; author: ReviewAuthor; body: string; status?: ReviewStatus };
export interface ReviewThread {
  id: string;
  district: RegionId;
  title: string;
  kind: 'discussion' | 'design-note';
  anchor: { x: number; z: number; level: string };
  mapRevision: string;
  events: ReviewEvent[];
}
export interface ReviewDocument { format: 'blockplay-level-review'; version: 1; threads: ReviewThread[] }
export const emptyReview = (): ReviewDocument => ({ format: 'blockplay-level-review', version: 1, threads: [] });
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const string = (value: unknown, max: number): value is string => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
const id = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(value);
const author = (value: unknown): value is ReviewAuthor => value === 'designer' || value === 'ai';

/** Parse into fresh, whitelisted objects; an invalid file never partially imports. */
export function parseReview(raw: string): ReviewDocument {
  if (raw.length > MAX_REVIEW_BYTES || new TextEncoder().encode(raw).byteLength > MAX_REVIEW_BYTES) throw new Error('Review file is too large (2 MB maximum).');
  const data: unknown = JSON.parse(raw);
  if (!record(data) || data.format !== 'blockplay-level-review' || data.version !== 1 || !Array.isArray(data.threads) || data.threads.length > 500) throw new Error('Expected a version 1 Blockplay level review with at most 500 threads.');
  const threadIds = new Set<string>(), eventIds = new Set<string>();
  const threads = data.threads.map((t): ReviewThread => {
    if (!record(t) || !id(t.id) || threadIds.has(t.id) || !isRegionId(t.district) || !string(t.title, 160) || !['discussion', 'design-note'].includes(String(t.kind)) || !string(t.mapRevision, 100) || !record(t.anchor) || typeof t.anchor.x !== 'number' || typeof t.anchor.z !== 'number' || !Number.isFinite(t.anchor.x) || !Number.isFinite(t.anchor.z) || Math.abs(t.anchor.x) > 100000 || Math.abs(t.anchor.z) > 100000 || !string(t.anchor.level, 100) || !Array.isArray(t.events) || !t.events.length || t.events.length > 500) throw new Error('Invalid or duplicate thread, anchor, or event list.');
    threadIds.add(t.id);
    const events = t.events.map((e): ReviewEvent => {
      if (!record(e) || !id(e.id) || eventIds.has(e.id) || !author(e.author) || !string(e.body, 8000) || typeof e.at !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(e.at) || !Number.isFinite(Date.parse(e.at)) || (e.status !== undefined && e.status !== 'open' && e.status !== 'resolved')) throw new Error('Invalid or duplicate comment. Comments need an author, UTC date and text.');
      eventIds.add(e.id);
      return { id: e.id, at: e.at, author: e.author, body: e.body, ...(e.status ? { status: e.status } : {}) };
    });
    return { id: t.id, district: t.district, title: t.title, kind: t.kind as ReviewThread['kind'], mapRevision: t.mapRevision, anchor: { x: t.anchor.x, z: t.anchor.z, level: t.anchor.level }, events: sortEvents(events) };
  });
  return { format: 'blockplay-level-review', version: 1, threads };
}
export const sortEvents = (events: readonly ReviewEvent[]) => [...events].sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
export const threadStatus = (thread: ReviewThread): ReviewStatus => sortEvents(thread.events).reduce<ReviewStatus>((status, event) => event.status ?? status, 'open');

/** Append-only union: repeat imports are harmless; edits to existing IDs are rejected. */
export function mergeReviews(...documents: ReviewDocument[]): ReviewDocument {
  const threads = new Map<string, ReviewThread>();
  for (const document of documents) for (const thread of parseReview(JSON.stringify(document)).threads) {
    const previous = threads.get(thread.id);
    if (!previous) { threads.set(thread.id, { ...thread, events: [...thread.events] }); continue; }
    const { events: oldEvents, ...oldHeader } = previous;
    const { events, ...header } = thread;
    if (JSON.stringify(oldHeader) !== JSON.stringify(header)) throw new Error(`Thread ${thread.id} has conflicting locations or titles. Preserve the original and create a new thread for a moved pin.`);
    const combined = new Map(oldEvents.map(event => [event.id, event]));
    for (const event of events) {
      const old = combined.get(event.id);
      if (old && JSON.stringify(old) !== JSON.stringify(event)) throw new Error(`Comment ${event.id} was edited. Add a reply with a new ID instead.`);
      combined.set(event.id, event);
    }
    threads.set(thread.id, { ...previous, events: sortEvents([...combined.values()]) });
  }
  return parseReview(JSON.stringify({ ...emptyReview(), threads: [...threads.values()] }));
}

/** Revision describes the schematic, not all geometry or gameplay in the level. */
export function mapRevision(map: { bounds: MapBounds; mapRoads: unknown; decor: unknown; stamps: unknown }) {
  const source = JSON.stringify([map.bounds, map.mapRoads, map.decor, map.stamps]);
  let hash = 2166136261;
  for (let i = 0; i < source.length; i++) hash = Math.imul(hash ^ source.charCodeAt(i), 16777619);
  return `schematic-${(hash >>> 0).toString(16)}`;
}
export function reviewPoint(x: number, z: number, bounds: MapBounds) {
  return { x: Math.round(Math.max(bounds.minX, Math.min(bounds.maxX, x)) * 10) / 10, z: Math.round(Math.max(bounds.minZ, Math.min(bounds.maxZ, z)) * 10) / 10 };
}
export function reviewBrief(document: ReviewDocument, district: RegionId) {
  return [`Level review: ${district}`, 'Please reply by thread ID. Explain intent, tradeoffs and how to verify each proposal. Add events; preserve existing IDs and coordinates. Resolve only after the designer reviews the change.', ...document.threads.filter(t => t.district === district).map(t => `\n[${t.id}] ${t.title} (${threadStatus(t)})\n${t.kind} · x=${t.anchor.x}, z=${t.anchor.z} · ${t.anchor.level} · ${t.mapRevision}\n${sortEvents(t.events).map(e => `${e.author === 'ai' ? 'AI developer' : 'Designer'} · ${e.at}${e.status ? ` · ${e.status}` : ''}\n${e.body}`).join('\n\n')}`)].join('\n');
}
