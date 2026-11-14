import { isRegionId, type RegionId } from './region-ids';
import type { MapBounds } from './minimap';

export const REVIEW_STORAGE_KEY = 'blockplay.level-review.v1';
export const MAX_REVIEW_BYTES = 2_000_000;
export type ReviewCollection = 'level' | 'asset';
export interface ReviewView { yaw: number; pitch: number; zoom: number; pan?: { x: number; y: number } }
export interface ReviewSurface { y: number; meshPath: number[]; view: ReviewView }
/** Orbit camera over a district: the point looked at (world metres), angles in radians and the distance to it. */
export interface ReviewSceneView { x: number; y: number; z: number; yaw: number; pitch: number; distance: number }
/** A district pin placed on the built 3D scene: world height of the surface, and the view it was placed from. */
export interface ReviewSpace { y: number; view: ReviewSceneView }
export interface ReviewAnchor { x: number; z: number; level: string; surface?: ReviewSurface; space?: ReviewSpace }
export type ReviewAuthor = 'designer' | 'ai';
export type ReviewStatus = 'open' | 'resolved';
export type ReviewEvent = { id: string; at: string; author: ReviewAuthor; body: string; status?: ReviewStatus };
export interface ReviewThread {
  id: string;
  district?: RegionId;
  asset?: string;
  title: string;
  kind: 'discussion' | 'design-note';
  anchor: ReviewAnchor;
  mapRevision: string;
  events: ReviewEvent[];
}
export interface ReviewDocument { format: 'blockplay-level-review' | 'blockplay-asset-review'; version: 1; threads: ReviewThread[] }
export const emptyReview = (collection: ReviewCollection = 'level'): ReviewDocument => ({ format: collection === 'asset' ? 'blockplay-asset-review' : 'blockplay-level-review', version: 1, threads: [] });
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const string = (value: unknown, max: number): value is string => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
const id = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(value);
const author = (value: unknown): value is ReviewAuthor => value === 'designer' || value === 'ai';

/** Parse into fresh, whitelisted objects; an invalid file never partially imports. */
export function parseReview(raw: string): ReviewDocument {
  if (raw.length > MAX_REVIEW_BYTES || new TextEncoder().encode(raw).byteLength > MAX_REVIEW_BYTES) throw new Error('Review file is too large (2 MB maximum).');
  const data: unknown = JSON.parse(raw);
  if (!record(data) || !['blockplay-level-review', 'blockplay-asset-review'].includes(String(data.format)) || data.version !== 1 || !Array.isArray(data.threads) || data.threads.length > 500) throw new Error('Expected a version 1 Blockplay level review with at most 500 threads.');
  const assets = data.format === 'blockplay-asset-review';
  const threadIds = new Set<string>(), eventIds = new Set<string>();
  const threads = data.threads.map((t): ReviewThread => {
    if (!record(t) || !id(t.id) || threadIds.has(t.id) || !(assets ? t.district === undefined && typeof t.asset === 'string' && /^[a-z][a-z0-9-]{0,39}\/[a-z0-9-]{1,80}$/.test(t.asset) : isRegionId(t.district) && t.asset === undefined) || !string(t.title, 160) || !['discussion', 'design-note'].includes(String(t.kind)) || !string(t.mapRevision, 100) || !record(t.anchor) || typeof t.anchor.x !== 'number' || typeof t.anchor.z !== 'number' || !Number.isFinite(t.anchor.x) || !Number.isFinite(t.anchor.z) || Math.abs(t.anchor.x) > 100000 || Math.abs(t.anchor.z) > 100000 || !string(t.anchor.level, 100) || !Array.isArray(t.events) || !t.events.length || t.events.length > 500) throw new Error('Invalid or duplicate thread, anchor, or event list.');
    let surface: ReviewSurface | undefined;
    if (t.anchor.surface !== undefined) {
      const p = t.anchor.surface;
      if (!assets || !record(p) || typeof p.y !== 'number' || !Number.isFinite(p.y) || Math.abs(p.y) > 100000 || !Array.isArray(p.meshPath) || p.meshPath.length > 32 || !p.meshPath.every(i => Number.isInteger(i) && i >= 0 && i <= 100000) || !record(p.view) || !['yaw', 'pitch', 'zoom'].every(k => typeof p.view === 'object' && p.view !== null && typeof (p.view as Record<string, unknown>)[k] === 'number' && Number.isFinite((p.view as Record<string, number>)[k])) || Math.abs(Number(p.view.yaw)) > 1000 || Math.abs(Number(p.view.pitch)) > Math.PI / 2 || Number(p.view.zoom) < .4 || Number(p.view.zoom) > 8) throw new Error('Invalid model surface or saved view.');
      const pan = p.view.pan;
      if (pan !== undefined && (!record(pan) || !['x', 'y'].every(k => typeof pan[k] === 'number' && Number.isFinite(pan[k]) && Math.abs(Number(pan[k])) <= 10))) throw new Error('Invalid model camera pan.');
      surface = { y: p.y, meshPath: [...p.meshPath], view: { yaw: Number(p.view.yaw), pitch: Number(p.view.pitch), zoom: Number(p.view.zoom), ...(record(pan) ? { pan: { x: Number(pan.x), y: Number(pan.y) } } : {}) } };
    }
    let space: ReviewSpace | undefined;
    if (t.anchor.space !== undefined) {
      const p = t.anchor.space, v = record(p) ? p.view : undefined, finite = (n: unknown, max: number): n is number => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= max;
      if (assets || !record(p) || !finite(p.y, 100000) || !record(v) || !finite(v.x, 100000) || !finite(v.y, 100000) || !finite(v.z, 100000) || !finite(v.yaw, 1000) || !finite(v.pitch, Math.PI / 2) || !finite(v.distance, 100000) || v.distance <= 0) throw new Error('Invalid 3D district position or saved view.');
      space = { y: p.y, view: { x: v.x, y: v.y, z: v.z, yaw: v.yaw, pitch: v.pitch, distance: v.distance } };
    }
    if (assets && !surface && (t.anchor.x !== 0 || t.anchor.z !== 0)) throw new Error('Whole-model notes must use a zero anchor.');
    threadIds.add(t.id);
    const events = t.events.map((e): ReviewEvent => {
      if (!record(e) || !id(e.id) || eventIds.has(e.id) || !author(e.author) || !string(e.body, 8000) || typeof e.at !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(e.at) || !Number.isFinite(Date.parse(e.at)) || (e.status !== undefined && e.status !== 'open' && e.status !== 'resolved')) throw new Error('Invalid or duplicate comment. Comments need an author, UTC date and text.');
      eventIds.add(e.id);
      return { id: e.id, at: e.at, author: e.author, body: e.body, ...(e.status ? { status: e.status } : {}) };
    });
    return { id: t.id, ...(assets ? { asset: t.asset as string } : { district: t.district as RegionId }), title: t.title, kind: t.kind as ReviewThread['kind'], mapRevision: t.mapRevision, anchor: { x: t.anchor.x, z: t.anchor.z, level: t.anchor.level, ...(surface ? { surface } : {}), ...(space ? { space } : {}) }, events: sortEvents(events) };
  });
  return { format: assets ? 'blockplay-asset-review' : 'blockplay-level-review', version: 1, threads };
}
export const sortEvents = (events: readonly ReviewEvent[]) => [...events].sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
export const threadStatus = (thread: ReviewThread): ReviewStatus => sortEvents(thread.events).reduce<ReviewStatus>((status, event) => event.status ?? status, 'open');

/** Append-only union: repeat imports are harmless; edits to existing IDs are rejected. */
export function mergeReviews(...documents: ReviewDocument[]): ReviewDocument {
  const format = documents[0]?.format ?? 'blockplay-level-review';
  if (documents.some(d => d.format !== format)) throw new Error('Map and model reviews use separate collections. Import this file in the matching workspace.');
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
  return parseReview(JSON.stringify({ format, version: 1, threads: [...threads.values()] }));
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
export function reviewBrief(document: ReviewDocument, target: string) {
  return [`Design review: ${target}`, 'Please reply by thread ID. Explain intent, tradeoffs and how to verify each proposal. Add events; preserve existing IDs and coordinates. Resolve only after the designer reviews the change.', ...document.threads.filter(t => (t.asset ?? t.district) === target).map(t => `\n[${t.id}] ${t.title} (${threadStatus(t)})\n${t.kind} · x=${t.anchor.x}, z=${t.anchor.z}${t.anchor.surface ? ` · y=${t.anchor.surface.y} · mesh path ${t.anchor.surface.meshPath.join("/")} · view ${JSON.stringify(t.anchor.surface.view)}` : ""}${t.anchor.space ? ` · y=${t.anchor.space.y} (placed on the 3D scene) · view ${JSON.stringify(t.anchor.space.view)}` : ""} · ${t.anchor.level} · ${t.mapRevision}\n${sortEvents(t.events).map(e => `${e.author === 'ai' ? 'AI developer' : 'Designer'} · ${e.at}${e.status ? ` · ${e.status}` : ''}\n${e.body}`).join('\n\n')}`)].join('\n');
}
