import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import ReviewPointer from './ReviewPointer';
import { getReviewAsset } from '../game/review-assets';
import { modelAnchorWorld, modelRevision, pickModelAnchor } from '../game/model-review';
import type { ReviewAnchor, ReviewThread } from '../game/level-review';

export default function ModelReviewViewer({ assetId, placing, draft, threads, numbers, selected, onPick, onSelect, onRevision, onCancel }: {
  assetId: string; placing: boolean; draft: ReviewAnchor | null; threads: ReviewThread[]; selected?: ReviewThread; numbers: Record<string, number>;
  onCancel(): void; onPick(anchor: ReviewAnchor): void; onSelect(thread: ReviewThread): void; onRevision(revision: string): void;
}) {
  const [movingView, setMovingView] = useState(false), [placementVersion, setPlacementVersion] = useState(0);
  const pickSurface = useRef<(x: number, y: number) => ReviewAnchor | null>(() => null);
  useEffect(() => { setMovingView(false); }, [placing]);
  const changeView = (next: { yaw: number; pitch: number; zoom: number }) => { view.current = next; setPlacementVersion(n => n + 1); };
  const lastPlacement = useRef(-Infinity);
  const frontYaw = getReviewAsset(assetId)?.frontYaw ?? 0;
  const host = useRef<HTMLDivElement>(null), view = useRef({ yaw: frontYaw + .7, pitch: .22, zoom: 1 });
  const pins = useRef<HTMLDivElement>(null), latest = useRef({ placing, movingView, draft, threads, onRevision }); latest.current = { placing, movingView, draft, threads, onRevision };
  const [error, setError] = useState('');
  const restore = () => { if (selected?.anchor.surface) changeView({ ...selected.anchor.surface.view }); };
  useEffect(restore, [selected?.id]);
  useEffect(() => {
    const node = host.current!, asset = getReviewAsset(assetId);
    if (!asset) { setError('This asset is no longer in the catalog. Its threads remain available.'); return; }
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true }); }
    catch { setError('3D preview unavailable. You can still discuss the whole model and read existing threads.'); return; }
    let model: ReturnType<typeof asset.build>;
    try { model = asset.build(); } catch { renderer.dispose(); setError('Model could not be loaded. Whole-model discussions are still available.'); return; }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.setClearColor('#cedbd1'); renderer.domElement.tabIndex = 0;
    renderer.domElement.setAttribute('aria-label', '3D review model. Drag to orbit, scroll to zoom. In pin mode drag the pointer and choose Pin here. Enter focuses the pointer. Arrow keys orbit.');
    node.append(renderer.domElement);
    const scene = new THREE.Scene(); scene.add(model.root);
    model.root.updateWorldMatrix(true, true);
    const revision = modelRevision(model.root); latest.current.onRevision(revision);
    const bounds = new THREE.Box3().setFromObject(model.root), center = bounds.getCenter(new THREE.Vector3()), size = bounds.getSize(new THREE.Vector3());
    const radius = Math.max(.1, size.length() / 2);
    const camera = new THREE.PerspectiveCamera(35, 1, radius / 200, radius * 100);
    scene.add(new THREE.HemisphereLight('#f4f8ff', '#666752', 2.5));
    const sun = new THREE.DirectionalLight('#fff1dc', 3.3); sun.position.set(-3, 5, 4); scene.add(sun);
    const rim = new THREE.DirectionalLight('#d3e8ff', 1.5); rim.position.set(3, 2, -4); scene.add(rim);
    const resize = () => { const w = Math.max(1, node.clientWidth), h = Math.max(1, node.clientHeight); renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); };
    const observer = new ResizeObserver(resize); observer.observe(node); resize();
    let frame = 0, drag: { x: number; y: number; startX: number; startY: number; moved: boolean } | null = null;
    pickSurface.current = (x, y) => pickModelAnchor(model.root, camera, new THREE.Vector2(x * 2 - 1, 1 - y * 2), view.current);
    const down = (e: PointerEvent) => { if (e.button !== 0) return; e.preventDefault(); renderer.domElement.focus({ preventScroll: true }); drag = { x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY, moved: false }; renderer.domElement.setPointerCapture(e.pointerId); };
    const move = (e: PointerEvent) => { if (!drag) return; drag.moved ||= Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) > 5; if (drag.moved) { view.current.yaw -= (e.clientX - drag.x) * .01; view.current.pitch = THREE.MathUtils.clamp(view.current.pitch + (e.clientY - drag.y) * .007, -1.35, 1.35); } drag.x = e.clientX; drag.y = e.clientY; };
    const up = () => { drag = null; };
    const cancel = () => { drag = null; };
    const wheel = (e: WheelEvent) => { e.preventDefault(); view.current.zoom = THREE.MathUtils.clamp(view.current.zoom * Math.exp(-e.deltaY * .001), .4, 8); };
    const key = (e: KeyboardEvent) => {
      if (latest.current.placing && !latest.current.movingView && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) { e.preventDefault(); node.parentElement?.querySelector<HTMLButtonElement>('.lr-pointer-handle')?.focus(); return; }
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) { e.preventDefault(); if (e.key.includes('Left')) view.current.yaw -= .15; if (e.key.includes('Right')) view.current.yaw += .15; if (e.key.includes('Up')) view.current.pitch = Math.min(1.35, view.current.pitch + .1); if (e.key.includes('Down')) view.current.pitch = Math.max(-1.35, view.current.pitch - .1); }
      if (e.key === 'Enter' && latest.current.placing) { e.preventDefault(); node.parentElement?.querySelector<HTMLButtonElement>('.lr-pointer-handle')?.focus(); }
    };
    const canvas = renderer.domElement;
    canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointermove', move); canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', cancel); canvas.addEventListener('lostpointercapture', cancel); canvas.addEventListener('wheel', wheel, { passive: false }); canvas.addEventListener('keydown', key);
    const ray = new THREE.Raycaster();
    const render = () => {
      if (!node.clientWidth || !node.clientHeight || document.hidden) { frame = requestAnimationFrame(render); return; }
      const v = view.current; v.yaw = THREE.MathUtils.euclideanModulo(v.yaw + Math.PI, Math.PI * 2) - Math.PI;
      const distance = radius / Math.sin(Math.atan(Math.tan(35 * Math.PI / 360) * Math.min(1, camera.aspect))) * 1.13 / v.zoom;
      camera.position.copy(center).add(new THREE.Vector3(Math.sin(v.yaw) * Math.cos(v.pitch), Math.sin(v.pitch), Math.cos(v.yaw) * Math.cos(v.pitch)).multiplyScalar(distance)); camera.lookAt(center); camera.updateMatrixWorld();
      renderer.render(scene, camera);
      for (const el of pins.current?.querySelectorAll<HTMLElement>('[data-model-pin]') ?? []) {
        const id = el.dataset.modelPin, thread = latest.current.threads.find(t => t.id === id);
        const anchor = id === 'draft' ? latest.current.draft : thread?.anchor;
        const world = anchor && (id === 'draft' || thread?.mapRevision === revision) ? modelAnchorWorld(model.root, anchor) : null;
        let visible = false;
        if (world) {
          const projected = world.clone().project(camera), delta = world.clone().sub(camera.position), length = delta.length();
          ray.set(camera.position, delta.normalize());
          const first = ray.intersectObject(model.root, true)[0];
          visible = Math.abs(projected.x) < .97 && Math.abs(projected.y) < .97 && projected.z >= -1 && projected.z < 1 && (!first || first.distance >= length - radius * .003);
          el.style.left = `${(projected.x + 1) * 50}%`; el.style.top = `${(1 - projected.y) * 50}%`;
        }
        el.hidden = !visible;
      }
      node.dataset.ready = 'true'; node.dataset.revision = revision; node.dataset.asset = assetId; node.dataset.view = JSON.stringify(v);
      frame = requestAnimationFrame(render);
    };
    setError(''); frame = requestAnimationFrame(render);
    return () => { pickSurface.current = () => null; cancelAnimationFrame(frame); observer.disconnect(); model.dispose(); renderer.dispose(); canvas.remove(); delete node.dataset.ready; };
  }, [assetId]);
  return <div className="lr-model-review">
    <div className={`lr-model-stage ${placing ? 'is-placing' : ''}`} onClickCapture={event => { /* A touch can synthesize a click after pinning changes the visible panel. */ if (!(event.target as HTMLElement).closest('.lr-placement') && (placing || performance.now() - lastPlacement.current < 400)) { event.preventDefault(); event.stopPropagation(); } }}>
      <div className="lr-model-canvas" ref={host} />
      <div className="lr-model-pins" ref={pins}>{threads.filter(t => t.anchor.surface).map(thread => <button hidden key={thread.id} data-model-pin={thread.id} aria-label={`Open model thread: ${thread.title}`} aria-pressed={selected?.id === thread.id} onClick={() => onSelect(thread)}>{numbers[thread.id]}</button>)}{draft?.surface && <span hidden data-model-pin="draft">＋</span>}</div>
      {placing && !movingView && !error && <ReviewPointer key={placementVersion} pick={(x, y) => pickSurface.current(x, y)} onConfirm={point => { lastPlacement.current = performance.now(); onPick(point); }} onCancel={onCancel} surface="model" />}
      {error && <p className="lr-model-error" role="status">{error}</p>}
    </div>
    {placing && <div className="lr-placement-mode" role="group" aria-label="Pin interaction"><button aria-pressed={!movingView} onClick={() => setMovingView(false)}>Position pin</button><button aria-pressed={movingView} onClick={() => setMovingView(true)}>Move view</button></div>}
    <div className="lr-map-navigation" role="group" aria-label="Model view">
      <button onClick={() => { changeView({ yaw: frontYaw, pitch: .15, zoom: 1 }); }}>Front</button><button onClick={() => { changeView({ yaw: frontYaw + Math.PI / 2, pitch: .15, zoom: 1 }); }}>Side</button><button onClick={() => { changeView({ yaw: frontYaw + Math.PI, pitch: .15, zoom: 1 }); }}>Rear</button>
      <button aria-label="Zoom in" onClick={() => { changeView({ ...view.current, zoom: Math.min(8, view.current.zoom * 1.25) }); }}>＋</button><button aria-label="Zoom out" onClick={() => { changeView({ ...view.current, zoom: Math.max(.4, view.current.zoom / 1.25) }); }}>−</button><button disabled={!selected?.anchor.surface} onClick={restore}>Restore pin view</button>
    </div>
    <p className="lr-map-hint" role="status">{placing ? movingView ? 'Drag to orbit. Choose Position pin when the detail is in view.' : 'Drag or tap to position the pointer, release, then choose Pin here. Move view rotates the model.' : 'Drag to orbit · scroll or buttons to zoom. Hidden-side pins appear when visible. Select a thread to restore its viewing angle.'}</p>
  </div>;
}
