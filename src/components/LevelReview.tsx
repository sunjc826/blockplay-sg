import { useEffect, useId, useRef, useState } from 'react';
import { getRegion, type RegionMapShape } from '../game/regions';
import type { RegionId } from '../game/region-ids';
import { minimapProjection } from '../game/minimap';
import { minimapLabels } from '../game/minimap-presentation';
import { emptyReview, mapRevision, MAX_REVIEW_BYTES, mergeReviews, parseReview, reviewBrief, reviewPoint, sortEvents, threadStatus, type ReviewDocument, type ReviewEvent, type ReviewThread } from '../game/level-review';
import developerNotes from '../../docs/level-reviews/developer-notes.json';
import './level-review.css';
import { reviewCacheKey } from '../lib/level-review-cloud';
import { useLevelReviewCloud } from './use-level-review-cloud';

const seeds = parseReview(JSON.stringify(developerNotes));
function loadReview(): { document: ReviewDocument; error: string } {
  try { const raw = localStorage.getItem(reviewCacheKey()); return { document: mergeReviews(seeds, raw ? parseReview(raw) : emptyReview()), error: '' }; }
  catch { return { document: seeds, error: 'Saved review could not be loaded. Export the saved backup before repairing browser storage; writing is blocked to protect it.' }; }
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
export default function LevelReview({ district }: { district: RegionId }) {
  const [initial] = useState(loadReview);
  const [document, setDocument] = useState(initial.document);
  const [error, setError] = useState(initial.error);
  const [notice, setNotice] = useState('');
  const current = useRef(document); current.current = document;
  const [access, setAccess] = useState('');
  const cloud = useLevelReviewCloud(document, () => current.current, incoming => {
    if (initial.error) throw new Error(initial.error);
    const raw = localStorage.getItem(reviewCacheKey());
    const merged = mergeReviews(incoming, current.current, raw ? parseReview(raw) : emptyReview());
    if (JSON.stringify(merged) !== JSON.stringify(current.current)) {
      localStorage.setItem(reviewCacheKey(), JSON.stringify(merged)); current.current = merged; setDocument(merged);
    }
  }, !!initial.error);
  const [selected, setSelected] = useState(() => new URLSearchParams(window.location.search).get('thread') ?? '');
  const [filter, setFilter] = useState<'all' | 'open' | 'resolved' | 'design-note'>('all');
  const [search, setSearch] = useState('');
  const [placing, setPlacing] = useState(false);
  const [anchor, setAnchor] = useState<{ x: number; z: number } | null>(null);
  const [title, setTitle] = useState(''), [body, setBody] = useState(''), [level, setLevel] = useState('Ground / unspecified');
  const [kind, setKind] = useState<ReviewThread['kind']>('discussion');
  const [reply, setReply] = useState('');
  const [zoom, setZoom] = useState(1), [center, setCenter] = useState<{ x: number; z: number } | null>(null);
  const frame = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 800, height: 560 });
  const { width: WIDTH, height: HEIGHT } = size;
  const file = useRef<HTMLInputElement>(null), titleInput = useRef<HTMLInputElement>(null), svg = useRef<SVGSVGElement>(null);
  const clip = useId();
  const region = getRegion(district), bounds = region.bounds, revision = mapRevision(region);
  const middle = { x: (bounds.minX + bounds.maxX) / 2, z: (bounds.minZ + bounds.maxZ) / 2 };
  const focus = center ?? middle, spanX = (bounds.maxX - bounds.minX) / zoom, spanZ = (bounds.maxZ - bounds.minZ) / zoom;
  const view = { minX: focus.x - spanX / 2, maxX: focus.x + spanX / 2, minZ: focus.z - spanZ / 2, maxZ: focus.z + spanZ / 2 };
  const map = minimapProjection(view, WIDTH, HEIGHT, 24);
  const labels = minimapLabels(region.stamps.map((stamp, i) => ({ id: String(i), name: stamp.name, x: map.x(stamp.x), y: map.y(stamp.z) - 8, priority: 1 })).filter(p => p.x > 0 && p.x < WIDTH && p.y > 0 && p.y < HEIGHT), WIDTH, HEIGHT);
  useEffect(() => {
    if (!frame.current) return;
    const observer = new ResizeObserver(([entry]) => {
      const width = Math.max(240, Math.min(800, entry.contentRect.width));
      setSize({ width, height: Math.max(300, width * .7) });
    });
    observer.observe(frame.current); return () => observer.disconnect();
  }, []);
  const threads = document.threads.filter(t => t.district === district);
  const visible = threads.filter(t => (filter === 'all' || (filter === 'design-note' ? t.kind === filter : threadStatus(t) === filter)) && `${t.title} ${t.anchor.level} ${t.events.map(e => e.body).join(' ')}`.toLowerCase().includes(search.toLowerCase()));
  const active = threads.find(t => t.id === selected);
  const select = (thread: ReviewThread) => { setSelected(thread.id); setAnchor(null); setPlacing(false); setReply(''); setCenter(reviewPoint(thread.anchor.x, thread.anchor.z, bounds)); };
  // Refreshes and other tabs merge their append-only histories before any write.
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key !== reviewCacheKey() || !event.newValue) return;
      try { const incoming = parseReview(event.newValue); setDocument(current => { try { return mergeReviews(current, incoming); } catch { setError('Another tab contains a conflicting review. Export your review before importing it manually.'); return current; } }); }
      catch { setError('Another tab saved an unreadable review. Export your current review before repairing storage.'); }
    };
    window.addEventListener('storage', sync); return () => window.removeEventListener('storage', sync);
  }, []);
  useEffect(() => { if (anchor) titleInput.current?.focus(); }, [anchor]);
  function save(next: ReviewDocument) {
    try {
      if (initial.error) throw new Error(initial.error);
      const raw = localStorage.getItem(reviewCacheKey());
      const merged = mergeReviews(document, next, raw ? parseReview(raw) : emptyReview());
      localStorage.setItem(reviewCacheKey(), JSON.stringify(merged));
      current.current = merged; setDocument(merged); cloud.changed(); setError(''); setNotice(cloud.token ? 'Saved in this browser. Cloud sync follows automatically.' : 'Saved in this browser. Connect cloud sync or export to share.'); return true;
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save. Your draft is still here.'); return false; }
  }
  const event = (text: string, status?: 'open' | 'resolved'): ReviewEvent => ({ id: crypto.randomUUID(), at: new Date().toISOString(), author: 'designer', body: text.trim(), ...(status ? { status } : {}) });
  function addReply(status?: 'open' | 'resolved') {
    if (!active || !reply.trim()) return;
    if (save({ ...emptyReview(), threads: [{ ...active, events: [...active.events, event(reply, status)] }] })) setReply('');
  }
  async function importFile(upload: File) {
    try {
      if (upload.size > MAX_REVIEW_BYTES) throw new Error('Review file is too large (2 MB maximum).');
      const incoming = parseReview(await upload.text());
      if (save(incoming)) setNotice(`Merged ${incoming.threads.length} threads. Existing comments were preserved; repeated imports do not duplicate replies.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not import this file.'); }
  }
  async function copy(text: string, message: string, filename: string) {
    try { await navigator.clipboard.writeText(text); setNotice(message); }
    catch { download(text, filename, 'text/plain'); setNotice('Clipboard unavailable. Downloaded the text instead.'); }
  }
  function pick(clientX: number, clientY: number) {
    if (!placing || !svg.current) return;
    const matrix = svg.current.getScreenCTM(); if (!matrix) return;
    const point = new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse());
    const x = (point.x - map.offsetX) / map.scale, z = (point.y - map.offsetY) / map.scale;
    if (x < bounds.minX || x > bounds.maxX || z < bounds.minZ || z > bounds.maxZ) { setNotice('Choose a point inside the district boundary.'); return; }
    setAnchor(reviewPoint(x, z, bounds)); setSelected(''); setPlacing(false);
  }
  const pan = (dx: number, dz: number) => setCenter(reviewPoint(focus.x + dx * spanX * .2, focus.z + dz * spanZ * .2, bounds));
  return <section className="level-review" aria-label="Level design review" data-map-revision={revision}>
    <header className="lr-header"><div><span className="lr-eyebrow">DESIGN WORKSPACE / {region.shortName}</span><h2>Level review<span>●</span></h2><p>Point to a place. Discuss the intent. Test the change.</p></div><span className="lr-local" data-cloud-status aria-live="polite">{cloud.status}</span></header>
    <div className="lr-tools">
      <button className="lr-primary" aria-pressed={placing} onClick={() => { setPlacing(!placing); setAnchor(null); setSelected(''); setTitle(''); setBody(''); setLevel('Ground / unspecified'); }}>＋ {placing ? 'Cancel pin' : 'Pin a comment'}</button>
      <button onClick={() => download(JSON.stringify(document, null, 2), 'blockplay-level-review.json')}>Export review</button>
      <button onClick={() => file.current?.click()}>Import replies</button>
      <button onClick={() => void copy(reviewBrief(document, district), 'District brief copied. Attach the exported JSON for editable replies.', `${district}-review.txt`)}>Copy AI brief</button>
      <input ref={file} hidden type="file" accept=".json,application/json" aria-label="Import review JSON" onChange={e => { const upload = e.target.files?.[0]; if (upload) void importFile(upload); e.target.value = ''; }} />
    </div>
    {cloud.available && <details className="lr-cloud" open={cloud.token ? undefined : true}>
      <summary>{cloud.token ? 'Private cloud workspace' : 'Connect cloud sync'}</summary>
      <p>{cloud.token ? 'Connected to the shared board. Changes sync automatically; other devices refresh within 15 seconds. Anyone with the private link can read and edit.' : 'Open your private collaboration link, or paste it below. Connecting merges this browser’s threads into the shared board.'}</p>
      {cloud.token ? <div className="lr-actions"><button onClick={cloud.retry}>Sync now</button><button onClick={() => void copy(`${window.location.origin}/debug?review=${district}${new URLSearchParams(window.location.search).has('reviewCloudTest') ? '&reviewCloudTest=1' : ''}#review-key=${cloud.token}`, 'Private collaboration link copied. Anyone with it can read and edit this board.', 'private-level-review-link.txt')}>Copy private link</button><button onClick={cloud.disconnect}>Disconnect</button></div> : <form onSubmit={event => { event.preventDefault(); if (cloud.connect(access)) setAccess(''); }}><label>Private collaboration link<input type="password" autoComplete="off" value={access} onChange={event => setAccess(event.target.value)} /></label><button type="submit">Connect & sync threads</button></form>}
      {cloud.problem && <p role="alert" className="lr-warning">{cloud.problem} <button onClick={cloud.retry}>Retry sync</button></p>}
      <small>Cloud threads remain saved when you disconnect. A copy stays in this browser; export it before clearing site data while offline.</small>
    </details>}
    <div className="lr-feedback" aria-live="polite">{error ? <><strong role="alert">{error}</strong><button onClick={() => { try { download(localStorage.getItem(reviewCacheKey()) ?? '', 'level-review-storage-backup.txt', 'text/plain'); } catch { setNotice('Browser storage is unavailable. Export review still downloads the loaded threads.'); } }}>Export saved backup</button></> : notice || (cloud.token ? 'Cloud sync is connected. Keep the private collaboration link to use the same board on another device.' : 'Browser-only storage until you connect cloud sync. Export remains available for backups and file handoffs.')}</div>
    <div className="lr-layout">
      <div className="lr-map-column">
        <div className="lr-map-heading"><strong>{region.name}</strong><span>↑ N · SCHEMATIC</span></div>
        <div ref={frame} className={`lr-map ${placing ? 'is-placing' : ''}`}>
          <svg ref={svg} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} tabIndex={0} role="group" aria-label="Review map. In pin mode, click a place or use arrows to position the map and Enter to pin its center." onClick={e => pick(e.clientX, e.clientY)} onKeyDown={e => {
            if (e.target !== e.currentTarget) return;
            const directions: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
            if (directions[e.key]) { e.preventDefault(); pan(...directions[e.key]); }
            if (e.key === 'Enter' && placing) { e.preventDefault(); setAnchor(reviewPoint(focus.x, focus.z, bounds)); setSelected(''); setPlacing(false); }
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
            {placing && <g className="lr-cross" pointerEvents="none"><path d={`M${WIDTH / 2 - 10} ${HEIGHT / 2}h20M${WIDTH / 2} ${HEIGHT / 2 - 10}v20`} /></g>}
            <path d={`M24 ${HEIGHT - 34}v6h${50 * map.scale}v-6`} stroke="#344b45" fill="none" /><text x="24" y={HEIGHT - 42} fontSize="12" fill="#344b45">50 world units</text>
          </svg>
          <div className="lr-map-navigation" role="group" aria-label="Map navigation">
            <button aria-label="Zoom in" disabled={zoom >= 8} onClick={() => setZoom(Math.min(8, zoom * 1.5))}>＋</button><button aria-label="Zoom out" disabled={zoom <= 1} onClick={() => setZoom(Math.max(1, zoom / 1.5))}>−</button><button onClick={() => { setZoom(1); setCenter(null); }}>Fit</button>
            <button aria-label="Pan left" onClick={() => pan(-1, 0)}>←</button><button aria-label="Pan north" onClick={() => pan(0, -1)}>↑</button><button aria-label="Pan south" onClick={() => pan(0, 1)}>↓</button><button aria-label="Pan right" onClick={() => pan(1, 0)}>→</button>
          </div>
        </div>
        <p className="lr-map-hint">{placing ? 'Click or tap inside the map to place a pin. Keyboard: focus map, arrows to move, Enter to pin center.' : 'Select a numbered pin to read its thread. Gold: discussion · Teal: design note · ✓: resolved.'}</p>
        <details className="lr-method"><summary>How we collaborate</summary><ol><li><strong>You point and explain.</strong> Pin a place, name the floor, describe the problem or desired experience.</li><li><strong>Sync the discussion.</strong> Connect your private cloud workspace. The AI can fetch its threads and reply to the same IDs with intent, alternatives, tradeoffs and a test plan.</li><li><strong>Read replies here.</strong> Connected boards refresh automatically. Export/import is still available for backups and offline handoffs.</li><li><strong>Review in game, then resolve.</strong> Record what changed and how it played. Reopen with a comment if the result misses the intent.</li></ol><p>Connected threads are stored on Cloudflare. This board does not call an AI automatically. Author labels describe contributors, not verified identities. Pins use world X/Z plus your floor label; the map does not show every 3D detail.</p></details>
      </div>
      <aside className="lr-discussion" aria-label="Review threads">
        {anchor ? <form className="lr-compose" onSubmit={e => { e.preventDefault(); if (!title.trim() || !body.trim() || !level.trim()) return; const thread: ReviewThread = { id: crypto.randomUUID(), district, title: title.trim(), kind, anchor: { ...anchor, level: level.trim() }, mapRevision: revision, events: [event(body)] }; if (save({ ...emptyReview(), threads: [thread] })) { setSelected(thread.id); setAnchor(null); setFilter('all'); setSearch(''); } }}>
          <span className="lr-eyebrow">NEW THREAD · {anchor.x}, {anchor.z}</span><h3>What should happen here?</h3>
          <label>Title<input ref={titleInput} required maxLength={160} value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. This crossing feels too exposed" /></label>
          <label>Floor / height<input required maxLength={100} value={level} onChange={e => setLevel(e.target.value)} /></label>
          <label>Thread type<select value={kind} onChange={e => setKind(e.target.value as ReviewThread['kind'])}><option value="discussion">Discussion</option><option value="design-note">Design rationale</option></select></label>
          <label>Comment<textarea required maxLength={8000} rows={5} value={body} onChange={e => setBody(e.target.value)} placeholder="What you notice, what you want, and how we could test it…" /></label>
          <div className="lr-actions"><button className="lr-primary" type="submit">Post comment</button><button type="button" onClick={() => setAnchor(null)}>Cancel</button></div>
        </form> : active ? <div className="lr-thread">
          <button className="lr-back" onClick={() => setSelected('')}>← All threads</button><div className="lr-thread-meta">{active.kind === 'design-note' ? 'DESIGN NOTE' : 'DISCUSSION'} · {threadStatus(active).toUpperCase()}</div><h3>{active.title}</h3>
          <p className="lr-coordinate">X {active.anchor.x} · Z {active.anchor.z}<br />{active.anchor.level}</p>
          {active.mapRevision !== revision && <p className="lr-warning">The schematic has changed or this pin has not been checked against it. Verify the location in game before acting.</p>}
          <button onClick={() => void copy(`${window.location.origin}/debug?review=${district}&thread=${encodeURIComponent(active.id)}`, 'Thread link copied. Other devices need cloud access or the exported review file.', 'review-link.txt')}>Copy thread link</button>
          <ol className="lr-messages">{sortEvents(active.events).map(item => <li key={item.id} className={item.author === 'ai' ? 'by-ai' : ''}><div><strong>{item.author === 'ai' ? 'AI developer' : 'Designer'}</strong><time dateTime={item.at}>{new Date(item.at).toLocaleString()}</time></div>{item.status && <small>{item.status === 'resolved' ? 'Marked resolved' : 'Reopened'}</small>}<p>{item.body}</p></li>)}</ol>
          <form onSubmit={e => { e.preventDefault(); addReply(); }}><label>Reply as designer<textarea required maxLength={8000} rows={4} value={reply} onChange={e => setReply(e.target.value)} placeholder="Add feedback, a decision, or a playtest result…" /></label><div className="lr-actions"><button className="lr-primary" disabled={!reply.trim()}>Reply</button><button type="button" disabled={!reply.trim()} onClick={() => addReply(threadStatus(active) === 'open' ? 'resolved' : 'open')}>{threadStatus(active) === 'open' ? 'Reply & resolve' : 'Reply & reopen'}</button></div></form><small className="lr-id">Thread {active.id}</small>
        </div> : <><div className="lr-list-heading"><h3>Conversations <span>{threads.length}</span></h3><span>{threads.filter(t => threadStatus(t) === 'open').length} open</span></div>
          {selected && <p className="lr-warning">This thread is not available here. Import its review file, or choose a thread below.</p>}
          <label className="lr-search">Search threads<input value={search} onChange={e => setSearch(e.target.value)} placeholder="Title, comment or floor…" /></label>
          <div className="lr-filters" role="group" aria-label="Filter threads">{(['all', 'open', 'resolved', 'design-note'] as const).map(value => <button key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>{value === 'design-note' ? 'Design notes' : value[0].toUpperCase() + value.slice(1)}</button>)}</div>
          <div className="lr-thread-list">{visible.map(thread => <button key={thread.id} onClick={() => select(thread)}><span className={`lr-number ${thread.kind}`}>{threadStatus(thread) === 'resolved' ? '✓' : threads.indexOf(thread) + 1}</span><span><small>{thread.kind === 'design-note' ? 'DESIGN NOTE' : 'DISCUSSION'} · {threadStatus(thread)}</small><strong>{thread.title}</strong><p>{thread.events[0].body}</p><small>{thread.events.length} {thread.events.length === 1 ? 'comment' : 'comments'} · {thread.anchor.level}</small></span></button>)}</div>
          {!visible.length && <div className="lr-empty"><span>＋</span><h3>{threads.length ? 'No matching threads' : 'Start with a place'}</h3><p>{threads.length ? 'Try another filter or search.' : 'Pin a confusing route, a strong viewpoint, or an idea worth testing. We can discuss it in context.'}</p></div>}
        </>}
      </aside>
    </div>
  </section>;
}
