import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { getReviewAsset } from '../game/review-assets';
import { modelAnchorWorld, modelRevision, pickModelAnchor } from '../game/model-review';
import type { ReviewAnchor, ReviewThread } from '../game/level-review';

export default function ModelReviewViewer({ assetId, placing, draft, threads, numbers, selected, onPick, onSelect, onRevision }: {
  assetId: string; placing: boolean; draft: ReviewAnchor | null; threads: ReviewThread[]; selected?: ReviewThread; numbers: Record<string, number>;
  onPick(anchor: ReviewAnchor): void; onSelect(thread: ReviewThread): void; onRevision(revision: string): void;
}) {
  const lastPlacement = useRef(-Infinity);
  const frontYaw = getReviewAsset(assetId)?.frontYaw ?? 0;
  const host = useRef<HTMLDivElement>(null), view = useRef({ yaw: frontYaw + .7, pitch: .22, zoom: 1 });
  const pins = useRef<HTMLDivElement>(null), latest = useRef({ placing, draft, threads, onPick, onRevision }); latest.current = { placing, draft, threads, onPick, onRevision };
  const [error, setError] = useState(''), [hint, setHint] = useState('');
  const restore = () => { if (selected?.anchor.surface) view.current = { ...selected.anchor.surface.view }; };
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
    renderer.domElement.setAttribute('aria-label', '3D review model. Drag to orbit, scroll to zoom. In pin mode click a surface, or press Enter to pin the center. Arrow keys orbit.');
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
    const point = (x: number, y: number) => {
      const rect = renderer.domElement.getBoundingClientRect();
      const anchor = pickModelAnchor(model.root, camera, new THREE.Vector2((x - rect.left) / rect.width * 2 - 1, 1 - (y - rect.top) / rect.height * 2), view.current);
      if (anchor) { lastPlacement.current = performance.now(); setHint(''); latest.current.onPick(anchor); } else setHint('That point missed the model. Choose a visible surface or use a whole-model comment.');
    };
    const down = (e: PointerEvent) => { if (e.button !== 0) return; e.preventDefault(); renderer.domElement.focus({ preventScroll: true }); drag = { x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY, moved: false }; renderer.domElement.setPointerCapture(e.pointerId); };
    const move = (e: PointerEvent) => { if (!drag) return; drag.moved ||= Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) > 5; if (drag.moved) { view.current.yaw -= (e.clientX - drag.x) * .01; view.current.pitch = THREE.MathUtils.clamp(view.current.pitch + (e.clientY - drag.y) * .007, -1.35, 1.35); } drag.x = e.clientX; drag.y = e.clientY; };
    const up = (e: PointerEvent) => { if (drag && !drag.moved && latest.current.placing) point(e.clientX, e.clientY); drag = null; };
    const cancel = () => { drag = null; };
    const wheel = (e: WheelEvent) => { e.preventDefault(); view.current.zoom = THREE.MathUtils.clamp(view.current.zoom * Math.exp(-e.deltaY * .001), .4, 8); };
    const key = (e: KeyboardEvent) => {
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) { e.preventDefault(); if (e.key.includes('Left')) view.current.yaw -= .15; if (e.key.includes('Right')) view.current.yaw += .15; if (e.key.includes('Up')) view.current.pitch = Math.min(1.35, view.current.pitch + .1); if (e.key.includes('Down')) view.current.pitch = Math.max(-1.35, view.current.pitch - .1); }
      if (e.key === 'Enter' && latest.current.placing) { e.preventDefault(); const r = renderer.domElement.getBoundingClientRect(); point(r.left + r.width / 2, r.top + r.height / 2); }
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
    return () => { cancelAnimationFrame(frame); observer.disconnect(); model.dispose(); renderer.dispose(); canvas.remove(); delete node.dataset.ready; };
  }, [assetId]);
  return <div className="lr-model-review">
    <div className={`lr-model-stage ${placing ? 'is-placing' : ''}`} onClickCapture={event => { /* A touch can synthesize a click after pinning changes the visible panel. */ if (placing || performance.now() - lastPlacement.current < 400) { event.preventDefault(); event.stopPropagation(); } }}>
      <div className="lr-model-canvas" ref={host} />
      <div className="lr-model-pins" ref={pins}>{threads.filter(t => t.anchor.surface).map(thread => <button hidden key={thread.id} data-model-pin={thread.id} aria-label={`Open model thread: ${thread.title}`} aria-pressed={selected?.id === thread.id} onClick={() => onSelect(thread)}>{numbers[thread.id]}</button>)}{draft?.surface && <span hidden data-model-pin="draft">＋</span>}</div>
      {placing && <span className="lr-model-cross" aria-hidden="true">＋</span>}
      {error && <p className="lr-model-error" role="status">{error}</p>}
    </div>
    <div className="lr-map-navigation" role="group" aria-label="Model view">
      <button onClick={() => { view.current = { yaw: frontYaw, pitch: .15, zoom: 1 }; }}>Front</button><button onClick={() => { view.current = { yaw: frontYaw + Math.PI / 2, pitch: .15, zoom: 1 }; }}>Side</button><button onClick={() => { view.current = { yaw: frontYaw + Math.PI, pitch: .15, zoom: 1 }; }}>Rear</button>
      <button aria-label="Zoom in" onClick={() => { view.current.zoom = Math.min(8, view.current.zoom * 1.25); }}>＋</button><button aria-label="Zoom out" onClick={() => { view.current.zoom = Math.max(.4, view.current.zoom / 1.25); }}>−</button><button disabled={!selected?.anchor.surface} onClick={restore}>Restore pin view</button>
    </div>
    <p className="lr-map-hint" role="status">{hint || (placing ? 'Click a surface to pin it. Drag to orbit; Enter pins the center. Background clicks do not create pins.' : 'Drag to orbit · scroll or buttons to zoom. Hidden-side pins appear when visible. Select a thread to restore its viewing angle.')}</p>
  </div>;
}
