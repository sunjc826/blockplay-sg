import { useEffect, useId, useRef, useState } from 'react';
import { getRegion, type RegionMapShape } from '../game/regions';
import type { RegionId } from '../game/region-ids';
import { minimapProjection } from '../game/minimap';
import { minimapLabels } from '../game/minimap-presentation';
import { emptyReview, mapRevision, MAX_REVIEW_BYTES, mergeReviews, parseReview, reviewBrief, reviewPoint, sortEvents, threadStatus, type ReviewAnchor, type ReviewCollection, type ReviewDocument, type ReviewEvent, type ReviewThread } from '../game/level-review';
import developerNotes from '../../docs/level-reviews/developer-notes.json';
import modelNotes from '../../docs/level-reviews/asset-notes.json';
import './level-review.css';
import { reviewCacheKey } from '../lib/level-review-cloud';
import { useLevelReviewCloud } from './use-level-review-cloud';
import { getReviewAsset, REVIEW_ASSETS } from '../game/review-assets';
import ModelReviewViewer from './ModelReviewViewer';
import DistrictReviewViewer from './DistrictReviewViewer';
import { DISTRICT_PIN_REACH } from '../game/district-review';
import ReviewPointer from './ReviewPointer';
import { useReviewGestures } from './use-review-gestures';
import { gestureMapView } from '../lib/review-gestures';
import { requestLeave, useNavigationGuard } from '../lib/navigation-guard';

const seeds = parseReview(JSON.stringify(developerNotes)), assetSeeds = parseReview(JSON.stringify(modelNotes));
function loadReview(collection: ReviewCollection): { document: ReviewDocument; error: string } {
  try { const raw = localStorage.getItem(reviewCacheKey(collection)); return { document: mergeReviews(collection === 'asset' ? assetSeeds : seeds, raw ? parseReview(raw) : emptyReview(collection)), error: '' }; }
  catch { return { document: collection === 'asset' ? assetSeeds : seeds, error: 'Saved review could not be loaded. Export the saved backup before repairing browser storage; writing is blocked to protect it.' }; }
}
function download(text: string, filename: string, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a'); link.href = url; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function Shapes({ shapes }: { shapes: readonly RegionMapShape[] }) {
  return <>{shapes.map((shape, i) => shape.kind === 'rect'
    ? <rect key={i} x={shape.x} y={shape.z} width={shape.width} height={shape.depth} rx={shape.radius} fill={shape.fill} />
    : <path key={i} d={`M${shape.from.x},${shape.from.z}L${shape.to.x},${shape.to.z}`} fill="none" stroke={shape.stroke} strokeWidth={shape.width} />)}</>;
}
export default function LevelReview({ district, assetId, onAssetChange, onWorkspaceChange }: { district: RegionId; assetId?: string; onAssetChange?: (id: string) => void; onWorkspaceChange?: (tool: 'maps' | 'models') => void }) {
  const collection: ReviewCollection = assetId ? 'asset' : 'level';
  const asset = assetId ? getReviewAsset(assetId) : undefined;
  const target = assetId ?? district;
  const targetQuery = assetId ? `asset=${encodeURIComponent(assetId)}` : `review=${district}`;
  const testQuery = new URLSearchParams(window.location.search).has('reviewCloudTest') ? '&reviewCloudTest=1' : '';
  const [assetRevision, setAssetRevision] = useState('unverified-model');
  const [initial] = useState(() => loadReview(collection));
  const [document, setDocument] = useState(initial.document);
  const [error, setError] = useState(initial.error);
  const [notice, setNotice] = useState('');
  const current = useRef(document); current.current = document;
  const [access, setAccess] = useState('');
  const cloud = useLevelReviewCloud(document, () => current.current, incoming => {
    if (initial.error) throw new Error(initial.error);
    const raw = localStorage.getItem(reviewCacheKey(collection));
    const merged = mergeReviews(incoming, current.current, raw ? parseReview(raw) : emptyReview(collection));
    if (JSON.stringify(merged) !== JSON.stringify(current.current)) {
      localStorage.setItem(reviewCacheKey(collection), JSON.stringify(merged)); current.current = merged; setDocument(merged);
    }
  }, !!initial.error, collection);
  const [panel, setPanel] = useState<'canvas' | 'discussion'>(() => new URLSearchParams(window.location.search).has('thread') ? 'discussion' : 'canvas');
  const [cloudOpen, setCloudOpen] = useState(false);
  const [selected, setSelected] = useState(() => new URLSearchParams(window.location.search).get('thread') ?? '');
  const [filter, setFilter] = useState<'all' | 'open' | 'resolved' | 'design-note'>('all');
  const [search, setSearch] = useState('');
  const [placing, setPlacing] = useState(false);
  const [anchor, setAnchor] = useState<ReviewAnchor | null>(null);
  const [title, setTitle] = useState(''), [body, setBody] = useState(''), [level, setLevel] = useState('Ground / unspecified');
  const [kind, setKind] = useState<ReviewThread['kind']>('discussion');
  const [reply, setReply] = useState('');
  useNavigationGuard(!!((anchor && (title.trim() || body.trim())) || reply.trim()), { title: 'Leave this draft?', detail: 'This comment has not been posted. Stay to finish it, or leave and discard the draft. Saved threads are unaffected.', confirmLabel: 'Discard draft & leave' });
  // The schematic is the light default; the built district only loads when the 3D layout is asked for.
  const [layout, setLayout] = useState<'map' | 'scene'>(() => !assetId && new URLSearchParams(window.location.search).get('view') === '3d' ? 'scene' : 'map');
  const [detached, setDetached] = useState<string[] | null>(null);
  const showLayout = (next: 'map' | 'scene') => {
    setLayout(next); setPlacing(false); if (next === 'map') setDetached(null);
    const query = new URLSearchParams(window.location.search); if (next === 'scene') query.set('view', '3d'); else query.delete('view');
    window.history.replaceState(window.history.state, '', `${window.location.pathname}?${query}${window.location.hash}`);
  };
  const scene = !assetId && layout === 'scene';
  const [zoom, setZoom] = useState(1), [center, setCenter] = useState<{ x: number; z: number } | null>(null);
  const more = useRef<HTMLDetailsElement>(null);
  useEffect(() => { const close = (event: PointerEvent) => { if (more.current && !more.current.contains(event.target as Node)) more.current.open = false; }; window.document.addEventListener('pointerdown', close); return () => window.document.removeEventListener('pointerdown', close); }, []);
  const discussion = useRef<HTMLElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 800, height: 560 });
  const { width: WIDTH, height: HEIGHT } = size;
  const file = useRef<HTMLInputElement>(null), titleInput = useRef<HTMLInputElement>(null), svg = useRef<SVGSVGElement>(null);
  const clip = useId();
  const region = getRegion(district), bounds = region.bounds, revision = assetId ? assetRevision : mapRevision(region);
  const middle = { x: (bounds.minX + bounds.maxX) / 2, z: (bounds.minZ + bounds.maxZ) / 2 };
  const focus = center ?? middle, spanX = (bounds.maxX - bounds.minX) / zoom, spanZ = (bounds.maxZ - bounds.minZ) / zoom;
  const view = { minX: focus.x - spanX / 2, maxX: focus.x + spanX / 2, minZ: focus.z - spanZ / 2, maxZ: focus.z + spanZ / 2 };
  const mapSurface = useRef<HTMLDivElement>(null), liveMapView = useRef({ zoom, center: focus }); liveMapView.current = { zoom, center: focus };
  const gestures = useReviewGestures(mapSurface, gesture => mapGesture.current(gesture), undefined, scene);
  const applyMapGesture = (gesture: Parameters<typeof gestureMapView>[4]) => { const next = gestureMapView(bounds, WIDTH, HEIGHT, liveMapView.current, gesture); liveMapView.current = next; setZoom(next.zoom); setCenter(next.center); };
  const mapGesture = useRef(applyMapGesture); mapGesture.current = applyMapGesture;
  // Mouse parity with the touch gestures: the wheel zooms about the cursor and a background drag slides the map.
  useEffect(() => {
    const node = mapSurface.current; if (!node) return;
    const at = (e: MouseEvent) => { const rect = node.getBoundingClientRect(); return { x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height }; };
    const wheel = (e: WheelEvent) => { e.preventDefault(); const point = at(e); mapGesture.current({ from: point, to: point, scale: Math.exp(-e.deltaY * .0015) }); };
    let last: { x: number; y: number } | null = null;
    const down = (e: PointerEvent) => { if (e.pointerType === 'mouse' && e.button === 0 && !(e.target as Element).closest('.lr-pin,.lr-placement')) { last = at(e); node.setPointerCapture(e.pointerId); } };
    const move = (e: PointerEvent) => { if (!last) return; const point = at(e); mapGesture.current({ from: last, to: point, scale: 1 }); last = point; };
    const up = () => { last = null; };
    node.addEventListener('wheel', wheel, { passive: false }); node.addEventListener('pointerdown', down); node.addEventListener('pointermove', move); node.addEventListener('pointerup', up); node.addEventListener('pointercancel', up); node.addEventListener('lostpointercapture', up);
    return () => { node.removeEventListener('wheel', wheel); node.removeEventListener('pointerdown', down); node.removeEventListener('pointermove', move); node.removeEventListener('pointerup', up); node.removeEventListener('pointercancel', up); node.removeEventListener('lostpointercapture', up); };
  }, [scene]);
  const map = minimapProjection(view, WIDTH, HEIGHT, 24);
  const labels = minimapLabels(region.stamps.map((stamp, i) => ({ id: String(i), name: stamp.name, x: map.x(stamp.x), y: map.y(stamp.z) - 8, priority: 1 })).filter(p => p.x > 0 && p.x < WIDTH && p.y > 0 && p.y < HEIGHT), WIDTH, HEIGHT);
  useEffect(() => {
    if (!frame.current) return;
    const observer = new ResizeObserver(([entry]) => {
      const width = Math.max(240, entry.contentRect.width);
      const controls = frame.current?.querySelector('.lr-map-navigation')?.getBoundingClientRect().height ?? 0;
      const height = frame.current?.closest('.debug-shell') ? Math.max(160, entry.contentRect.height - controls) : Math.max(300, width * .7);
      setSize({ width, height });
    });
    observer.observe(frame.current); return () => observer.disconnect();
  }, [scene]);
  const threads = document.threads.filter(t => assetId ? t.asset === assetId : t.district === district);
  const visible = threads.filter(t => (filter === 'all' || (filter === 'design-note' ? t.kind === filter : threadStatus(t) === filter)) && `${t.title} ${t.anchor.level} ${t.events.map(e => e.body).join(' ')}`.toLowerCase().includes(search.toLowerCase()));
  const active = threads.find(t => t.id === selected);
  useEffect(() => { if (active && panel === 'discussion') { discussion.current?.scrollTo(0, 0); discussion.current?.focus({ preventScroll: true }); } }, [active?.id, panel]);
  const select = (thread: ReviewThread) => requestLeave(() => { setPanel('discussion'); setSelected(thread.id); setAnchor(null); setPlacing(false); setReply(''); if (!assetId) setCenter(reviewPoint(thread.anchor.x, thread.anchor.z, bounds)); });
  // Refreshes and other tabs merge their append-only histories before any write.
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key !== reviewCacheKey(collection) || !event.newValue) return;
      try { const incoming = parseReview(event.newValue); setDocument(current => { try { return mergeReviews(current, incoming); } catch { setError('Another tab contains a conflicting review. Export your review before importing it manually.'); return current; } }); }
      catch { setError('Another tab saved an unreadable review. Export your current review before repairing storage.'); }
    };
    window.addEventListener('storage', sync); return () => window.removeEventListener('storage', sync);
  }, []);
  useEffect(() => { if (anchor) setPanel('discussion'); }, [anchor]);
  useEffect(() => { if (anchor && panel === 'discussion') titleInput.current?.focus({ preventScroll: true }); }, [anchor, panel]);
  function save(next: ReviewDocument) {
    try {
      if (initial.error) throw new Error(initial.error);
      const raw = localStorage.getItem(reviewCacheKey(collection));
      const merged = mergeReviews(document, next, raw ? parseReview(raw) : emptyReview(collection));
      localStorage.setItem(reviewCacheKey(collection), JSON.stringify(merged));
      current.current = merged; setDocument(merged); cloud.changed(); setError(''); setNotice(cloud.token ? 'Saved in this browser. Cloud sync follows automatically.' : 'Saved in this browser. Connect cloud sync or export to share.'); return true;
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save. Your draft is still here.'); return false; }
  }
  const event = (text: string, status?: 'open' | 'resolved'): ReviewEvent => ({ id: crypto.randomUUID(), at: new Date().toISOString(), author: 'designer', body: text.trim(), ...(status ? { status } : {}) });
  function addReply(status?: 'open' | 'resolved') {
    if (!active || !reply.trim()) return;
    if (save({ ...emptyReview(collection), threads: [{ ...active, events: [...active.events, event(reply, status)] }] })) setReply('');
  }
  async function importFile(upload: File) {
    try {
      if (upload.size > MAX_REVIEW_BYTES) throw new Error('Review file is too large (2 MB maximum).');
      const incoming = parseReview(await upload.text());
      if (incoming.format !== emptyReview(collection).format) throw new Error('Import this file in its matching map or model workspace.');
      if (save(incoming)) setNotice(`Merged ${incoming.threads.length} threads. Existing comments were preserved; repeated imports do not duplicate replies.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not import this file.'); }
  }
  async function copy(text: string, message: string, filename: string) {
    try { await navigator.clipboard.writeText(text); setNotice(message); }
    catch { download(text, filename, 'text/plain'); setNotice('Clipboard unavailable. Downloaded the text instead.'); }
  }
  function pickMap(u: number, v: number): ReviewAnchor | null {
    const x = (u * WIDTH - map.offsetX) / map.scale, z = (v * HEIGHT - map.offsetY) / map.scale;
    if (x < bounds.minX || x > bounds.maxX || z < bounds.minZ || z > bounds.maxZ) return null;
    return { ...reviewPoint(x, z, bounds), level: 'Ground / unspecified' };
  }
  const confirmPin = (point: ReviewAnchor) => { setAnchor(point); setLevel(point.level); setSelected(''); setPlacing(false); };
  const pan = (dx: number, dz: number) => setCenter(reviewPoint(focus.x + dx * spanX * .2, focus.z + dz * spanZ * .2, bounds));
  return <section className={`level-review ${assetId ? "asset-review" : ""}`} aria-label={assetId ? "3D asset review" : "Level design review"} data-map-revision={revision} data-review-panel={panel}>
    <header className="lr-header"><div><span className="lr-eyebrow">DESIGN WORKSPACE / {assetId ? asset?.category ?? "ASSET" : region.shortName}</span><h2>{assetId ? "Model review" : "Level review"}<span>●</span></h2><p>{assetId ? "Point to a surface. Discuss the detail. Revisit the same view." : "Point to a place. Discuss the intent. Test the change."}</p></div><button className="lr-local" aria-live="polite" aria-expanded={cloudOpen} aria-controls="review-cloud-panel" disabled={!cloud.available} onClick={() => setCloudOpen(!cloudOpen)}><span data-cloud-status>{cloud.status}</span> · Sync</button></header>
    <nav className="lr-workspaces" aria-label="Design review workspaces"><a onClick={e => { if (onWorkspaceChange) { e.preventDefault(); onWorkspaceChange('maps'); } }} href={`/debug?review=${district}${testQuery}`} aria-current={!assetId ? 'page' : undefined}>Maps</a><a onClick={e => { if (onWorkspaceChange) { e.preventDefault(); onWorkspaceChange('models'); } }} href={`/debug?asset=prop/vending${testQuery}`} aria-current={assetId ? 'page' : undefined}>3D models</a></nav>
    {assetId && <label className="lr-asset-picker">Review asset<select value={assetId} onChange={e => onAssetChange ? onAssetChange(e.target.value) : window.location.assign(`/debug?asset=${encodeURIComponent(e.target.value)}${testQuery}`)}>{!asset && <option value={assetId}>Unavailable asset: {assetId}</option>}{(['Street props', 'Animals', 'Weapons', 'Operators'] as const).map(category => <optgroup key={category} label={category}>{REVIEW_ASSETS.filter(a => a.category === category).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</optgroup>)}</select></label>}
    <div className="lr-tools">
      <button className="lr-primary" aria-pressed={placing} onClick={() => requestLeave(() => { setPanel('canvas'); setKind('discussion'); setReply(''); setPlacing(!placing); setAnchor(null); setSelected(''); setTitle(''); setBody(''); setLevel('Ground / unspecified'); })}>＋ {placing ? 'Cancel pin' : 'Pin a comment'}</button>
      {assetId && <button onClick={() => requestLeave(() => { setKind('discussion'); setReply(''); setPlacing(false); setSelected(''); setAnchor({ x: 0, z: 0, level: 'Whole model' }); setLevel('Whole model'); setTitle(''); setBody(''); })}>Comment on whole model</button>}
      <details ref={more} className="lr-more" onKeyDown={e => { if (e.key === 'Escape') { e.currentTarget.open = false; e.currentTarget.querySelector('summary')?.focus(); } }} onClick={e => { if ((e.target as HTMLElement).closest('button')) e.currentTarget.open = false; }}><summary>Share & files</summary><div className="lr-more-actions"><button onClick={() => download(JSON.stringify(document, null, 2), `blockplay-${collection}-review.json`)}>Export review</button>
      <button onClick={() => file.current?.click()}>Import replies</button>
      <button onClick={() => void copy(reviewBrief(document, target), 'Review brief copied. Attach the exported JSON for editable replies.', `${target.replace("/", "-")}-review.txt`)}>Copy AI brief</button>
      </div></details>
      <input ref={file} hidden type="file" accept=".json,application/json" aria-label="Import review JSON" onChange={e => { const upload = e.target.files?.[0]; if (upload) void importFile(upload); e.target.value = ''; }} />
    </div>
    {cloud.available && <details id="review-cloud-panel" className="lr-cloud" open={cloudOpen} onToggle={e => setCloudOpen(e.currentTarget.open)}>
      <summary>{cloud.token ? 'Private cloud workspace' : 'Connect cloud sync'}</summary>
      <p>{cloud.token ? 'Connected to the shared board. Changes sync automatically; other devices refresh within 15 seconds. Anyone with the private link can read and edit.' : 'Open your private collaboration link, or paste it below. Connecting merges this browser’s threads into the shared board.'}</p>
      {cloud.token ? <div className="lr-actions"><button onClick={cloud.retry}>Sync now</button><button onClick={() => void copy(`${window.location.origin}/debug?${targetQuery}${testQuery}#review-key=${cloud.token}`, 'Private collaboration link copied. Anyone with it can read and edit this board.', 'private-level-review-link.txt')}>Copy private link</button><button onClick={cloud.disconnect}>Disconnect</button></div> : <form onSubmit={event => { event.preventDefault(); if (cloud.connect(access)) setAccess(''); }}><label>Private collaboration link<input type="password" autoComplete="off" value={access} onChange={event => setAccess(event.target.value)} /></label><button type="submit">Connect & sync threads</button></form>}
      {cloud.problem && <p role="alert" className="lr-warning">{cloud.problem} <button onClick={cloud.retry}>Retry sync</button></p>}
      <small>Cloud threads remain saved when you disconnect. A copy stays in this browser; export it before clearing site data while offline.</small>
    </details>}
    {(error || notice || cloud.problem) && <div className="lr-feedback" aria-live="polite">{error ? <><strong role="alert">{error}</strong><button onClick={() => { try { download(localStorage.getItem(reviewCacheKey(collection)) ?? '', 'level-review-storage-backup.txt', 'text/plain'); } catch { setNotice('Browser storage is unavailable. Export review still downloads the loaded threads.'); } }}>Export saved backup</button></> : cloud.problem || notice}<button className="lr-dismiss" aria-label="Dismiss notification" onClick={() => setNotice('')} hidden={!notice || !!error || !!cloud.problem}>×</button></div>}
    <div className="lr-panel-switch" role="group" aria-label="Review panels"><button aria-pressed={panel === 'canvas'} onClick={() => setPanel('canvas')}>{assetId ? 'Model' : scene ? '3D layout' : 'Map'}</button><button aria-pressed={panel === 'discussion'} onClick={() => setPanel('discussion')}>Discussion · {threads.length}{anchor ? ' · Draft' : ''}</button></div>
    <div className="lr-layout">
      <div className="lr-map-column">
        <div className="lr-map-heading"><strong>{assetId ? asset?.name ?? assetId : region.name}</strong>{assetId ? <span>3D / STATIC STUDY</span> : <div className="lr-view-switch" role="group" aria-label="Review view"><button aria-pressed={!scene} onClick={() => showLayout('map')}>Schematic</button><button aria-pressed={scene} onClick={() => showLayout('scene')}>3D layout</button></div>}</div>
        {assetId ? <><ModelReviewViewer assetId={assetId} placing={placing} draft={anchor} threads={visible} numbers={Object.fromEntries(threads.map((thread, i) => [thread.id, i + 1]))} selected={active} onPick={confirmPin} onCancel={() => setPlacing(false)} onSelect={select} onRevision={setAssetRevision} />
          {asset && <details className="lr-method"><summary>Developer context · {asset.name}</summary><p>{asset.description}</p><p>{asset.rationale}</p><p>Source: {asset.source.startsWith('https://') ? <a href={asset.source} target="_blank" rel="noreferrer">Species reference ↗</a> : <code>{asset.source}</code>} · <a href={asset.gallery}>Original gallery ↗</a></p><button onClick={() => requestLeave(() => { setReply(''); setPlacing(false); setAnchor({ x: 0, z: 0, level: 'Whole model' }); setLevel('Whole model'); setTitle(`Design intent: ${asset.name}`.slice(0, 160)); setBody(''); setKind('design-note'); setSelected(''); })}>Discuss the design intent</button></details>}</> : scene ? <DistrictReviewViewer district={district} placing={placing} draft={anchor} threads={visible} numbers={Object.fromEntries(threads.map((thread, i) => [thread.id, i + 1]))} selected={active} onPick={confirmPin} onCancel={() => setPlacing(false)} onSelect={select} onDetached={setDetached} /> : <>
        <div ref={frame} className={`lr-map ${placing ? 'is-placing' : ''}`}>
          <div ref={mapSurface} className="lr-map-surface" data-map-zoom={zoom} data-map-center={JSON.stringify(focus)}><svg ref={svg} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} tabIndex={0} role="group" aria-label="Review map. In pin mode drag the pointer, then choose Pin here. Enter focuses the pointer. Arrows pan the map." onKeyDown={e => {
            if (e.target !== e.currentTarget) return;
            const directions: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
            if (directions[e.key]) { e.preventDefault(); pan(...directions[e.key]); }
            if (e.key === 'Enter' && placing) { e.preventDefault(); frame.current?.querySelector<HTMLButtonElement>('.lr-pointer-handle')?.focus(); }
            if (e.key === 'Escape') setPlacing(false);
          }}>
            <defs><clipPath id={clip}><rect width={WIDTH} height={HEIGHT} /></clipPath></defs>
            <g clipPath={`url(#${clip})`}>
              <g transform={map.transform}>
                <rect data-review-bounds x={bounds.minX} y={bounds.minZ} width={bounds.maxX - bounds.minX} height={bounds.maxZ - bounds.minZ} fill={region.mapPaper} stroke="#7b8b7e" strokeWidth={1 / map.scale} />
                <Shapes shapes={region.decor.filter(s => s.layer === 'under')} />
                {region.mapRoads.map((road, i) => <polyline key={i} points={road.points.map(p => `${p.x},${p.z}`).join(' ')} fill="none" stroke={region.roadStroke} strokeWidth={region.roadWidth} />)}
                <Shapes shapes={region.decor.filter(s => s.layer !== 'under')} />
              </g>
              {region.stamps.map((stamp, i) => <g key={i} className="lr-landmark" pointerEvents="none"><circle cx={map.x(stamp.x)} cy={map.y(stamp.z)} r="3" />{labels.has(String(i)) && <text x={labels.get(String(i))!.x} y={labels.get(String(i))!.y} textAnchor="middle">{stamp.name}</text>}</g>)}
              {visible.map((thread) => <g key={thread.id} className={`lr-pin ${threadStatus(thread)} ${thread.kind}`} data-review-pin={thread.id} transform={`translate(${map.x(thread.anchor.x)},${map.y(thread.anchor.z)})`} role="button" tabIndex={placing ? -1 : 0} pointerEvents={placing ? "none" : undefined} aria-label={`${thread.title}, ${threadStatus(thread)}`} aria-pressed={selected === thread.id} onClick={e => { e.stopPropagation(); select(thread); }} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); select(thread); } }}>
                <title>{thread.title} · {thread.anchor.level}</title><circle className="lr-pin-ring" r="20" /><circle r="14" /><text textAnchor="middle" dy="5">{threadStatus(thread) === 'resolved' ? '✓' : threads.indexOf(thread) + 1}</text>
              </g>)}
              {anchor && <g transform={`translate(${map.x(anchor.x)},${map.y(anchor.z)})`} className="lr-draft-pin"><circle r="17" /><text textAnchor="middle" dy="5">＋</text></g>}
            </g>
            <path d={`M24 ${HEIGHT - 34}v6h${50 * map.scale}v-6`} stroke="#344b45" fill="none" /><text x="24" y={HEIGHT - 42} fontSize="12" fill="#344b45">50 world units</text>
          </svg>{placing && <ReviewPointer resetKey={`${zoom}:${focus.x}:${focus.z}:${gestures.version}`} gesturing={gestures.active} pick={pickMap} onConfirm={confirmPin} onCancel={() => setPlacing(false)} surface="map" />}</div>
          <div className="lr-map-navigation" role="group" aria-label="Map navigation">
            <button aria-label="Zoom in" disabled={zoom >= 8} onClick={() => setZoom(Math.min(8, zoom * 1.5))}>＋</button><button aria-label="Zoom out" disabled={zoom <= 1} onClick={() => setZoom(Math.max(1, zoom / 1.5))}>−</button><button onClick={() => { setZoom(1); setCenter(null); }}>Fit</button>
            <button aria-label="Pan left" onClick={() => pan(-1, 0)}>←</button><button aria-label="Pan north" onClick={() => pan(0, -1)}>↑</button><button aria-label="Pan south" onClick={() => pan(0, 1)}>↓</button><button aria-label="Pan right" onClick={() => pan(1, 0)}>→</button>
          </div>
        </div>
        <p className="lr-map-hint">{placing ? 'Drag the pointer, release, then choose Pin here. Arrow keys move the pointer; Enter offers Pin here. Two fingers pan and pinch to zoom.' : 'Two fingers pan and pinch to zoom. Select a pin to read its thread. Gold: discussion · Teal: design note · ✓: resolved.'}</p>
        </>}
        <details className="lr-method"><summary>How we collaborate</summary><ol><li><strong>You point and explain.</strong> Pin a place on the schematic or on the 3D layout, name it, describe the problem or desired experience.</li><li><strong>Sync the discussion.</strong> Connect your private cloud workspace. The AI can fetch its threads and reply to the same IDs with intent, alternatives, tradeoffs and a test plan.</li><li><strong>Read replies here.</strong> Connected boards refresh automatically. Export/import is still available for backups and offline handoffs.</li><li><strong>Review in game, then resolve.</strong> Record what changed and how it played. Reopen with a comment if the result misses the intent.</li></ol><p>Connected threads are stored on Cloudflare. This board does not call an AI automatically. Author labels describe contributors, not verified identities. Schematic pins use world X/Z plus a floor label you type. 3D layout pins sit on a surface of the built district and save world X/Y/Z with the view they were placed from. Model pins store a mesh-local surface point and viewing angle in the frozen study pose; changed geometry asks for re-verification.</p></details>
      </div>
      <aside ref={discussion} className="lr-discussion" aria-label="Review threads" tabIndex={-1}>
        {anchor ? <form className="lr-compose" onSubmit={e => { e.preventDefault(); if (!title.trim() || !body.trim() || !level.trim()) return; const thread: ReviewThread = { id: crypto.randomUUID(), ...(assetId ? { asset: assetId } : { district }), title: title.trim(), kind, anchor: { ...anchor, level: level.trim() }, mapRevision: revision, events: [event(body)] }; if (save({ ...emptyReview(collection), threads: [thread] })) { setSelected(thread.id); setAnchor(null); setFilter('all'); setSearch(''); } }}>
          <span className="lr-eyebrow">NEW THREAD · {assetId && !anchor.surface ? "WHOLE MODEL" : `${anchor.x.toFixed(2)}, ${anchor.z.toFixed(2)}${anchor.surface ? ` · Y ${anchor.surface.y.toFixed(2)}` : ""}${anchor.space ? ` · HEIGHT ${anchor.space.y.toFixed(2)} M` : ""}`}</span><h3>{assetId ? "What should we refine?" : "What should happen here?"}</h3>
          <label>Title<input ref={titleInput} required maxLength={160} value={title} onChange={e => setTitle(e.target.value)} placeholder={assetId ? "e.g. This edge needs a softer profile" : "e.g. This crossing feels too exposed"} /></label>
          <label>{assetId ? "Part / detail" : anchor.space ? "Surface / height (from the 3D scene; edit to name the place)" : "Floor / height (the schematic records none; pin in 3D layout to capture it)"}<input required maxLength={100} value={level} onChange={e => setLevel(e.target.value)} /></label>
          <label>Thread type<select value={kind} onChange={e => setKind(e.target.value as ReviewThread['kind'])}><option value="discussion">Discussion</option><option value="design-note">Design rationale</option></select></label>
          <label>Comment<textarea required maxLength={8000} rows={5} value={body} onChange={e => setBody(e.target.value)} placeholder="What you notice, what you want, and how we could test it…" /></label>
          <div className="lr-actions"><button className="lr-primary" type="submit">Post comment</button><button type="button" onClick={() => requestLeave(() => { setAnchor(null); setTitle(''); setBody(''); })}>Cancel</button></div>
        </form> : active ? <div className="lr-thread">
          <button className="lr-back" onClick={() => requestLeave(() => { setReply(''); setSelected(''); })}>← All threads</button><div className="lr-thread-meta">{active.kind === 'design-note' ? 'DESIGN NOTE' : 'DISCUSSION'} · {threadStatus(active).toUpperCase()}</div><h3>{active.title}</h3>
          <p className="lr-coordinate">{assetId ? active.anchor.surface ? `Surface · X ${active.anchor.x.toFixed(3)} · Y ${active.anchor.surface.y.toFixed(3)} · Z ${active.anchor.z.toFixed(3)}` : "Whole model" : active.anchor.space ? `X ${active.anchor.x} · Y ${active.anchor.space.y} · Z ${active.anchor.z} · placed in 3D` : `X ${active.anchor.x} · Z ${active.anchor.z} · schematic pin, no height recorded`}<br />{active.anchor.level}</p>
          {active.mapRevision !== revision && <p className="lr-warning">{assetId ? "The model changed or this note predates a verified model revision. Verify the part before acting; stale surface pins are hidden." : "The schematic has changed or this pin has not been checked against it. Verify the location in game before acting."}</p>}
          {scene && detached?.includes(active.id) && <p className="lr-warning" data-pin-detached>No surface lies within {DISTRICT_PIN_REACH} m of this pin in the district as it is built now, so the geometry here has changed since the comment. The pin is kept where it was; check the place before acting.</p>}
          {!assetId && !scene && active.anchor.space && <button onClick={() => showLayout('scene')}>View in 3D</button>}
          <button onClick={() => void copy(`${window.location.origin}/debug?${targetQuery}${testQuery}${active.anchor.space ? '&view=3d' : ''}&thread=${encodeURIComponent(active.id)}`, 'Thread link copied. Other devices need cloud access or the exported review file.', 'review-link.txt')}>Copy thread link</button>
          <ol className="lr-messages">{sortEvents(active.events).map(item => <li key={item.id} className={item.author === 'ai' ? 'by-ai' : ''}><div><strong>{item.author === 'ai' ? 'AI developer' : 'Designer'}</strong><time dateTime={item.at}>{new Date(item.at).toLocaleString()}</time></div>{item.status && <small>{item.status === 'resolved' ? 'Marked resolved' : 'Reopened'}</small>}<p>{item.body}</p></li>)}</ol>
          <form onSubmit={e => { e.preventDefault(); addReply(); }}><label>Reply as designer<textarea required maxLength={8000} rows={4} value={reply} onChange={e => setReply(e.target.value)} placeholder="Add feedback, a decision, or a playtest result…" /></label><div className="lr-actions"><button className="lr-primary" disabled={!reply.trim()}>Reply</button><button type="button" disabled={!reply.trim()} onClick={() => addReply(threadStatus(active) === 'open' ? 'resolved' : 'open')}>{threadStatus(active) === 'open' ? 'Reply & resolve' : 'Reply & reopen'}</button></div></form><small className="lr-id">Thread {active.id}</small>
        </div> : <><div className="lr-list-heading"><h3>Conversations <span>{threads.length}</span></h3><span>{threads.filter(t => threadStatus(t) === 'open').length} open</span></div>
          {selected && <p className="lr-warning">This thread is not available here. Import its review file, or choose a thread below.</p>}
          <label className="lr-search">Search threads<input value={search} onChange={e => setSearch(e.target.value)} placeholder="Title, comment or floor…" /></label>
          <div className="lr-filters" role="group" aria-label="Filter threads">{(['all', 'open', 'resolved', 'design-note'] as const).map(value => <button key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>{value === 'design-note' ? 'Design notes' : value[0].toUpperCase() + value.slice(1)}</button>)}</div>
          <div className="lr-thread-list">{visible.map(thread => <button key={thread.id} onClick={() => select(thread)}><span className={`lr-number ${thread.kind}`}>{threadStatus(thread) === 'resolved' ? '✓' : threads.indexOf(thread) + 1}</span><span><small>{thread.kind === 'design-note' ? 'DESIGN NOTE' : 'DISCUSSION'} · {threadStatus(thread)}</small><strong>{thread.title}</strong><p>{thread.events[0].body}</p><small>{thread.events.length} {thread.events.length === 1 ? 'comment' : 'comments'} · {thread.anchor.level}</small></span></button>)}</div>
          {!visible.length && <div className="lr-empty"><span>＋</span><h3>{threads.length ? 'No matching threads' : assetId ? 'Start with a detail' : 'Start with a place'}</h3><p>{threads.length ? 'Try another filter or search.' : assetId ? 'Pin a surface detail, or comment on the whole model. We can discuss shape, materials and visual clarity in context.' : 'Pin a confusing route, a strong viewpoint, or an idea worth testing. We can discuss it in context.'}</p></div>}
        </>}
      </aside>
    </div>
  </section>;
}
