import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import ReviewPointer from './ReviewPointer';
import { useReviewGestures } from './use-review-gestures';
import { getRegion } from '../game/regions';
import type { RegionId } from '../game/region-ids';
import { buildDistrictShapes, disposeDistrictShapes, districtShapeScale, clampDistrictView, detachedDistrictPins, districtAnchorWorld, districtOverview, districtSurfaceHit, DISTRICT_REVIEW_FOV, panDistrictView, pickDistrictAnchor, placeDistrictCamera } from '../game/district-review';
import { threadStatus, type ReviewAnchor, type ReviewSceneView, type ReviewShape, type ReviewThread } from '../game/level-review';
import { DEFAULT_STAGE_OVERLAYS, createStageReview, districtStageArenas, stagePhase, stageSpan, stageTicks, type StageOverlays, type StageReviewArena } from '../game/levelution-review';
import { createStageReviewAudio } from '../game/stage-review-audio';

/** The district as built for play, held still under an orbit camera. Pins are world-space points on its surfaces. */
export default function DistrictReviewViewer({ district, placing, draft, draftShape, threads, numbers, selected, onPick, onSelect, onCancel, onDetached }: {
  district: RegionId; placing: boolean; draft: ReviewAnchor | null; draftShape?: ReviewShape | null; threads: ReviewThread[]; selected?: ReviewThread; numbers: Record<string, number>;
  onCancel(): void; onPick(anchor: ReviewAnchor): void; onSelect(thread: ReviewThread): void; onDetached(ids: string[]): void;
}) {
  const region = getRegion(district), bounds = region.bounds;
  const [movingView, setMovingView] = useState(false), [placementVersion, setPlacementVersion] = useState(0);
  const [state, setState] = useState<'building' | 'ready' | 'error'>('building'), [error, setError] = useState('');
  useEffect(() => { setMovingView(false); }, [placing]);
  const host = useRef<HTMLDivElement>(null), stage = useRef<HTMLDivElement>(null), pins = useRef<HTMLDivElement>(null);
  const view = useRef<ReviewSceneView>(selected?.anchor.space ? { ...selected.anchor.space.view } : districtOverview(bounds));
  const aspect = () => { const rect = stage.current?.getBoundingClientRect(); return rect && rect.height ? rect.width / rect.height : 1.5; };
  /** Buttons and restored views invalidate a pointer that was positioned under the old camera. */
  const changeView = (next: ReviewSceneView) => { view.current = clampDistrictView(next, bounds); setPlacementVersion(n => n + 1); };
  const pickSurface = useRef<(x: number, y: number) => ReviewAnchor | null>(() => null), cancelDrag = useRef(() => {});
  const lastPlacement = useRef(-Infinity);
  const [slides, setSlides] = useState(false);
  // Levelution: the district's events on a timeline (docs/LEVELUTION.md, "Reviewing events in the debug view").
  const [arenas, setArenas] = useState<StageReviewArena[]>([]), [arenaId, setArenaId] = useState(''), [off, setOff] = useState<string[]>([]);
  const [stageTime, setStageTime] = useState(0), [playing, setPlaying] = useState(false), [speed, setSpeed] = useState(1), [overlays, setOverlays] = useState<StageOverlays>(DEFAULT_STAGE_OVERLAYS), [sound, setSound] = useState(true);
  const arena = arenas.find(a => a.area.id === arenaId) ?? arenas[0], events = arena ? arena.events.filter(e => !off.includes(e.binding.id)) : [], span = stageSpan(events);
  const clock = useRef(0), audio = useRef<ReturnType<typeof createStageReviewAudio> | null>(null);
  const seekTo = (t: number) => { clock.current = Math.max(0, Math.min(span, t)); setStageTime(clock.current); };
  const latest = useRef({ placing, movingView, slides, draft, draftShape, threads, selected, onDetached, arena, events, span, playing, speed, overlays, sound }); latest.current = { placing, movingView, slides, draft, draftShape, threads, selected, onDetached, arena, events, span, playing, speed, overlays, sound };
  const gestures = useReviewGestures(stage, gesture => {
    const a = aspect(), moved = panDistrictView(view.current, (gesture.to.x - gesture.from.x) * a, gesture.to.y - gesture.from.y);
    view.current = clampDistrictView({ ...moved, distance: moved.distance / gesture.scale }, bounds);
  }, () => cancelDrag.current());
  const focus = (thread: ReviewThread) => {
    if (thread.anchor.space) { changeView({ ...thread.anchor.space.view }); return; }
    const point = districtAnchorWorld(thread.anchor, bounds);
    changeView({ ...view.current, x: point.x, y: point.y, z: point.z, distance: Math.min(view.current.distance, 90) });
  };
  useEffect(() => { if (selected) focus(selected); }, [selected?.id]);
  useEffect(() => {
    const node = host.current!, surface = stage.current!;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true }); }
    catch { setState('error'); setError('3D preview unavailable in this browser. The schematic map and every discussion still work.'); return; }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = .9;
    const canvas = renderer.domElement; canvas.tabIndex = 0;
    canvas.setAttribute('aria-label', `3D layout of ${region.name}. Drag to orbit, Shift-drag or arrow keys to slide, scroll to zoom, double-click to centre on a surface. In pin mode drag the pointer and choose Pin here.`);
    node.append(canvas);
    const camera = new THREE.PerspectiveCamera(DISTRICT_REVIEW_FOV, 1, .5, 6000);
    let world: ReturnType<typeof region.build> | null = null, frame = 0, drawn = '', detachedFor = '', drawings: THREE.Group | null = null, drawingsFor = '';
    let review: ReturnType<typeof createStageReview> | null = null, staged = '', lastFrame = performance.now(), shownAt = 0;
    audio.current = createStageReviewAudio();
    let drag: { x: number; y: number; startX: number; startY: number; moved: boolean; pan: boolean } | null = null;
    const resize = () => { const w = Math.max(1, node.clientWidth), h = Math.max(1, node.clientHeight); renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); drawn = ''; };
    const observer = new ResizeObserver(resize); observer.observe(node); resize();
    const ray = new THREE.Raycaster(); ray.camera = camera;
    const down = (e: PointerEvent) => {
      if (!e.isPrimary || (e.button !== 0 && e.button !== 1 && e.button !== 2)) return;
      e.preventDefault(); canvas.focus({ preventScroll: true });
      drag = { x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY, moved: false, pan: e.button !== 0 || e.shiftKey || latest.current.slides }; canvas.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (!drag) return;
      drag.moved ||= Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) > 5;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y, v = view.current;
      if (drag.moved) view.current = clampDistrictView(drag.pan ? panDistrictView(v, dx / Math.max(1, node.clientHeight), dy / Math.max(1, node.clientHeight)) : { ...v, yaw: v.yaw - dx * .008, pitch: v.pitch + dy * .006 }, bounds);
      drag.x = e.clientX; drag.y = e.clientY;
    };
    const release = () => { drag = null; }; cancelDrag.current = release;
    const zoom = (e: WheelEvent) => { e.preventDefault(); view.current = clampDistrictView({ ...view.current, distance: view.current.distance * Math.exp(e.deltaY * .0012) }, bounds); if (latest.current.placing) setPlacementVersion(n => n + 1); };
    const centre = (e: MouseEvent) => {
      if (!world) return;
      const rect = canvas.getBoundingClientRect(); ray.far = Infinity;
      ray.setFromCamera(new THREE.Vector2((e.clientX - rect.left) / rect.width * 2 - 1, 1 - (e.clientY - rect.top) / rect.height * 2), camera);
      const hit = districtSurfaceHit(world.scene, ray, bounds);
      if (hit) view.current = clampDistrictView({ ...view.current, x: hit.point.x, y: hit.point.y, z: hit.point.z, distance: Math.min(view.current.distance, Math.max(25, hit.distance * .6)) }, bounds);
    };
    const key = (e: KeyboardEvent) => {
      const arrows: Record<string, [number, number]> = { ArrowLeft: [1, 0], ArrowRight: [-1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }, v = view.current;
      if (latest.current.placing && !latest.current.movingView && (arrows[e.key] || e.key === 'Enter')) { e.preventDefault(); surface.querySelector<HTMLButtonElement>('.lr-pointer-handle')?.focus(); return; }
      let next: ReviewSceneView | null = null;
      if (arrows[e.key]) { const [x, y] = arrows[e.key]; next = e.shiftKey ? { ...v, yaw: v.yaw + x * .12, pitch: v.pitch + y * .08 } : panDistrictView(v, x * .12, y * .12); }
      if (e.key === '+' || e.key === '=') next = { ...v, distance: v.distance / 1.25 };
      if (e.key === '-') next = { ...v, distance: v.distance * 1.25 };
      if (e.key === 'PageUp' || e.key === 'PageDown') next = { ...v, y: v.y + (e.key === 'PageUp' ? 1 : -1) * Math.max(1.5, v.distance * .05) };
      if (next) { e.preventDefault(); view.current = clampDistrictView(next, bounds); }
    };
    const menu = (e: Event) => e.preventDefault();
    canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointermove', move); canvas.addEventListener('pointerup', release); canvas.addEventListener('pointercancel', release); canvas.addEventListener('lostpointercapture', release);
    canvas.addEventListener('dblclick', centre); canvas.addEventListener('keydown', key); canvas.addEventListener('contextmenu', menu); surface.addEventListener('wheel', zoom, { passive: false });
    const render = () => {
      frame = requestAnimationFrame(render);
      if (!world || !node.clientWidth || !node.clientHeight || document.hidden) return;
      const now = latest.current, known = now.threads.map(thread => thread.id).join();
      const time = performance.now(), dt = Math.min(.1, (time - lastFrame) / 1000); lastFrame = time;
      if (review) {
        if (now.playing) {
          if (clock.current <= 0 && now.sound) audio.current?.alert();
          clock.current = Math.min(now.span, clock.current + dt * now.speed);
          if (clock.current >= now.span) setPlaying(false);
          // The slider follows at a few updates a second: every frame would re-render the whole board.
          if (Math.abs(clock.current - shownAt) > .08 || clock.current >= now.span) { shownAt = clock.current; setStageTime(clock.current); }
        }
        const stage = JSON.stringify([now.arena?.area.id, now.events.map(e => e.binding.id), Math.round(clock.current * 200) / 200, now.overlays]);
        if (stage !== staged) {
          staged = stage;
          const landed = review.seek(now.events, clock.current); review.overlays(now.events, clock.current, now.overlays, now.arena);
          if (now.sound && now.playing) for (const landing of landed) audio.current?.thump(landing.size);
          node.dataset.stage = `${now.events.length}/${clock.current.toFixed(2)}`; drawn = '';
          // Pins are checked against the map as it now stands, but not on every frame of a playing collapse.
          if (!now.playing) detachedFor = '';
        }
      }
      if (known !== detachedFor) { detachedFor = known; now.onDetached(detachedDistrictPins(world.scene, now.threads, bounds, camera)); }
      // The scene is held still, so a frame is only drawn when the camera or the pins change.
      const thickness = districtShapeScale(view.current.distance), shapes = JSON.stringify([known, now.selected?.id, now.draftShape, thickness]);
      if (shapes !== drawingsFor) {
        drawingsFor = shapes; if (drawings) disposeDistrictShapes(drawings);
        drawings = buildDistrictShapes([...now.threads.flatMap(thread => thread.anchor.shape ? [{ shape: thread.anchor.shape, selected: thread.id === now.selected?.id }] : []), ...(now.draftShape ? [{ shape: now.draftShape, selected: true }] : [])], bounds, thickness);
        world.scene.add(drawings); node.dataset.drawings = String(drawings.children.length);
      }
      const signature = JSON.stringify([view.current, shapes, now.draft, staged]);
      if (signature === drawn) return;
      drawn = signature; placeDistrictCamera(camera, view.current); renderer.render(world.scene, camera);
      for (const el of pins.current?.querySelectorAll<HTMLElement>('[data-scene-pin]') ?? []) {
        const id = el.dataset.scenePin, anchor = id === 'draft' ? now.draft : now.threads.find(thread => thread.id === id)?.anchor;
        if (!anchor) { el.hidden = true; continue; }
        const point = districtAnchorWorld(anchor, bounds), projected = point.clone().project(camera), delta = point.clone().sub(camera.position), length = delta.length();
        el.hidden = !(Math.abs(projected.x) < .98 && Math.abs(projected.y) < .98 && projected.z > -1 && projected.z < 1);
        if (el.hidden) continue;
        ray.far = Infinity; ray.set(camera.position, delta.normalize());
        const first = districtSurfaceHit(world.scene, ray, bounds);
        // Pins behind a building stay selectable but faded: where discussions are is part of reading a layout.
        el.dataset.occluded = String(!!first && first.distance < length - Math.max(.4, length * .004));
        el.style.left = `${(projected.x + 1) * 50}%`; el.style.top = `${(1 - projected.y) * 50}%`;
      }
      node.dataset.ready = 'true'; node.dataset.district = district; node.dataset.view = JSON.stringify(view.current);
    };
    // Building a district blocks for up to a few seconds; paint the notice first.
    const building = window.setTimeout(() => {
      try {
        world = region.build(); world.scene.fog = null; world.animate(0); world.scene.updateMatrixWorld(true);
        const scene = world.scene;
        pickSurface.current = (x, y) => { placeDistrictCamera(camera, view.current); return pickDistrictAnchor(scene, camera, new THREE.Vector2(x * 2 - 1, 1 - y * 2), view.current, bounds); };
        if (!latest.current.selected) view.current = districtOverview(bounds, camera.aspect);
        const found = districtStageArenas(district, scene);
        if (found.length) { review = createStageReview(world, found, bounds); clock.current = 0; setArenas(found); setArenaId(found[0].area.id); setOff([]); setStageTime(0); setPlaying(false); }
        setState('ready');
      } catch { world?.dispose(); world = null; setState('error'); setError('This district could not be built for review. The schematic map and every discussion still work.'); }
    }, 30);
    frame = requestAnimationFrame(render);
    return () => {
      window.clearTimeout(building); cancelAnimationFrame(frame); observer.disconnect(); pickSurface.current = () => null; cancelDrag.current = () => {};
      surface.removeEventListener('wheel', zoom); if (drawings) disposeDistrictShapes(drawings); review?.dispose(); audio.current?.dispose(); audio.current = null; setArenas([]); world?.dispose(); renderer.dispose(); canvas.remove(); delete node.dataset.ready;
    };
  }, [district]);
  const step = (change: (v: ReviewSceneView) => ReviewSceneView) => changeView(change(view.current));
  return <div className="lr-model-review lr-scene-review">
    <div ref={stage} className={`lr-model-stage ${placing ? 'is-placing' : ''}`} onClickCapture={event => { /* A touch can synthesize a click after pinning changes the visible panel. */ if (!(event.target as HTMLElement).closest('.lr-placement') && (placing || performance.now() - lastPlacement.current < 400)) { event.preventDefault(); event.stopPropagation(); } }}>
      <div className="lr-model-canvas" ref={host} />
      <div className="lr-model-pins lr-scene-pins" ref={pins}>
        {threads.map(thread => <button hidden key={thread.id} data-scene-pin={thread.id} data-flat={!thread.anchor.space} className={`${thread.kind} ${threadStatus(thread)}`} aria-label={`Open thread: ${thread.title}, ${threadStatus(thread)}${thread.anchor.space ? '' : ' (schematic pin, shown at ground level)'}`} aria-pressed={selected?.id === thread.id} onClick={() => onSelect(thread)}>{threadStatus(thread) === 'resolved' ? '✓' : numbers[thread.id]}</button>)}
        {draft && <span hidden data-scene-pin="draft">＋</span>}
      </div>
      {placing && !movingView && state === 'ready' && <ReviewPointer key={placementVersion} resetKey={String(gestures.version)} gesturing={gestures.active} pick={(x, y) => pickSurface.current(x, y)} onConfirm={point => { lastPlacement.current = performance.now(); onPick(point); }} onCancel={onCancel} surface="scene" />}
      {state === 'building' && <p className="lr-model-error" role="status">Building {region.name} in 3D…</p>}
      {state === 'error' && <p className="lr-model-error" role="status">{error}</p>}
    </div>
    {placing && <div className="lr-placement-mode" role="group" aria-label="Pin interaction"><button aria-pressed={!movingView} onClick={() => setMovingView(false)}>Position pin</button><button aria-pressed={movingView} onClick={() => setMovingView(true)}>Move view</button></div>}
    <div className="lr-map-navigation" role="group" aria-label="3D view">
      <button aria-label="Zoom in" onClick={() => step(v => ({ ...v, distance: v.distance / 1.4 }))}>＋</button><button aria-label="Zoom out" onClick={() => step(v => ({ ...v, distance: v.distance * 1.4 }))}>−</button>
      <button aria-label="Turn left" onClick={() => step(v => ({ ...v, yaw: v.yaw - Math.PI / 8 }))}>⟲</button><button aria-label="Turn right" onClick={() => step(v => ({ ...v, yaw: v.yaw + Math.PI / 8 }))}>⟳</button>
      <button aria-label="Slide left" onClick={() => step(v => panDistrictView(v, .2, 0))}>←</button><button aria-label="Slide forward" onClick={() => step(v => panDistrictView(v, 0, .2))}>↑</button><button aria-label="Slide back" onClick={() => step(v => panDistrictView(v, 0, -.2))}>↓</button><button aria-label="Slide right" onClick={() => step(v => panDistrictView(v, -.2, 0))}>→</button>
      <button aria-pressed={slides} aria-label="Drag slides the view instead of orbiting" onClick={() => setSlides(on => !on)}>{slides ? 'Drag: slide' : 'Drag: orbit'}</button><button onClick={() => changeView(districtOverview(bounds, aspect()))}>Overview</button><button onClick={() => step(v => ({ ...v, yaw: 0, pitch: 1.5 }))}>Top</button><button disabled={!selected} onClick={() => selected && focus(selected)}>{selected?.anchor.space ? 'Restore pin view' : 'Go to pin'}</button>
    </div>
    {arena && <div className="lr-stage" role="group" aria-label="Levelution timeline">
      <div className="lr-stage-head"><strong>Levelution</strong>
        {arenas.length > 1 && <select aria-label="Arena" value={arena.area.id} onChange={e => { setArenaId(e.target.value); setOff([]); setPlaying(false); seekTo(0); }}>{arenas.map(a => <option key={a.area.id} value={a.area.id}>{a.area.name}</option>)}</select>}
        {arenas.length === 1 && <span>{arena.area.name}</span>}
        <span className="lr-stage-chips">{arena.events.map(e => <button key={e.binding.id} aria-pressed={!off.includes(e.binding.id)} title={e.plugin.name} onClick={() => { setOff(list => list.includes(e.binding.id) ? list.filter(id => id !== e.binding.id) : [...list, e.binding.id]); setPlaying(false); seekTo(0); }}>{e.binding.name}</button>)}</span>
        <button onClick={() => { const ends = arena.area.bounds, cx = (ends.minX + ends.maxX) / 2, cz = (ends.minZ + ends.maxZ) / 2; changeView({ x: cx, y: 0, z: cz, yaw: .35, pitch: .75, distance: Math.max(ends.maxX - ends.minX, ends.maxZ - ends.minZ) * 1.15 }); }}>Frame arena</button>
      </div>
      <div className="lr-stage-transport">
        <button onClick={() => { setPlaying(false); seekTo(0); }}>As built</button>
        <button className="lr-primary" disabled={!events.length} onClick={() => { if (sound) audio.current?.wake(); if (!playing && stageTime >= span) seekTo(0); setPlaying(on => !on); }}>{playing ? 'Pause' : stageTime > 0 && stageTime < span ? 'Resume' : 'Play'}</button>
        <button disabled={!events.length} aria-label="Step back a tenth of a second" onClick={() => { setPlaying(false); seekTo(stageTime - .1); }}>−0.1 s</button>
        <button disabled={!events.length} aria-label="Step forward a tenth of a second" onClick={() => { setPlaying(false); seekTo(stageTime + .1); }}>+0.1 s</button>
        <button disabled={!events.length} onClick={() => { setPlaying(false); seekTo(span); }}>Settled</button>
        <label>Speed<select value={speed} onChange={e => setSpeed(Number(e.target.value))}><option value={1}>1×</option><option value={.5}>0.5×</option><option value={.25}>0.25×</option></select></label>
        <button aria-pressed={sound} onClick={() => { if (!sound) audio.current?.wake(); setSound(on => !on); }}>{sound ? 'Sound on' : 'Sound off'}</button>
      </div>
      <label className="lr-stage-scrub">{stageTime.toFixed(2)} s of {span.toFixed(1)} · {stagePhase(events, stageTime)}
        <input type="range" min={0} max={span} step={.05} value={stageTime} disabled={!events.length} list="lr-stage-ticks" onChange={e => { setPlaying(false); seekTo(Number(e.target.value)); }} />
        <datalist id="lr-stage-ticks">{stageTicks(events).map(tick => <option key={tick.at} value={tick.at} label={tick.label} />)}</datalist>
      </label>
      <ol className="lr-stage-ticks">{stageTicks(events).map(tick => <li key={tick.at} data-past={stageTime >= tick.at}><button onClick={() => { setPlaying(false); seekTo(tick.at); }}>{tick.at.toFixed(1)} s</button> {tick.label}</li>)}</ol>
      <div className="lr-stage-overlays">{([['dressing', 'Arena: bounds, spawns, rings, cover'], ['ring', 'Warning ring'], ['crush', 'Where it lands (lethal)'], ['dust', 'Dust'], ['colliders', 'Colliders']] as const).map(([key, label]) => <label key={key}><input type="checkbox" checked={overlays[key]} onChange={e => setOverlays(current => ({ ...current, [key]: e.target.checked }))} /> {label}</label>)}</div>
    </div>}
    <p className="lr-map-hint" role="status">{placing ? movingView ? 'Drag to orbit; Shift-drag, right-drag or two fingers slide; scroll or pinch zooms. Choose Position pin when ready.' : 'Drag or tap to position the pointer on a surface, release, then choose Pin here. Scroll or pinch still zooms; Move view orbits.' : 'Drag to orbit, or switch Drag: orbit to Drag: slide to move across the map with one finger · Shift-drag, right-drag or two fingers also slide · scroll or pinch zooms · double-click centres on a surface. Faded pins are behind geometry; dashed pins came from the schematic and sit at ground level. Drawn routes, areas and dashed sightlines show through buildings: blue is the level as built, red a problem, green a proposal.'}</p>
  </div>;
}
