import { useEffect, useRef, useState, type PointerEvent } from 'react';
import type { ReviewAnchor } from '../game/level-review';
import './review-pointer.css';

/** A screen-space handle backed by the map transform or a real model raycast. */
export default function ReviewPointer({ pick, onConfirm, onCancel, surface = 'surface' }: {
  pick(x: number, y: number): ReviewAnchor | null;
  onConfirm(anchor: ReviewAnchor): void;
  onCancel(): void;
  surface?: string;
}) {
  const host = useRef<HTMLDivElement>(null), handle = useRef<HTMLButtonElement>(null);
  const activePointer = useRef<number | null>(null);
  const [point, setPoint] = useState({ x: .5, y: .5 });
  const [candidate, setCandidate] = useState<ReviewAnchor | null>(null);
  const [positioned, setPositioned] = useState(false), [dragging, setDragging] = useState(false);
  const reset = () => { activePointer.current = null; setDragging(false); setCandidate(null); setPositioned(false); };
  useEffect(() => {
    handle.current?.focus({ preventScroll: true });
    // Resizing changes the projection: require a fresh placement instead of reusing a stale screen point.
    let width = 0, height = 0;
    const observer = new ResizeObserver(([entry]) => { const r = entry.contentRect; if (width && (width !== r.width || height !== r.height)) reset(); width = r.width; height = r.height; });
    observer.observe(host.current!); return () => observer.disconnect();
  }, []);
  function position(x: number, y: number) {
    setPoint({ x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) });
    setCandidate(x >= 0 && x <= 1 && y >= 0 && y <= 1 ? pick(x, y) : null);
    setPositioned(true);
  }
  function move(event: PointerEvent<HTMLDivElement>) {
    const rect = host.current!.getBoundingClientRect();
    position((event.clientX - rect.left) / rect.width, (event.clientY - rect.top) / rect.height);
  }
  return <div ref={host} className={`lr-placement ${dragging ? 'is-dragging' : ''}`} data-positioned={positioned} data-valid={!!candidate}
    onClick={event => { event.preventDefault(); event.stopPropagation(); }}
    onPointerDown={event => {
      if ((event.target as HTMLElement).closest('.lr-pointer-actions') || event.button !== 0 || !event.isPrimary || activePointer.current !== null) return;
      event.preventDefault(); event.stopPropagation(); activePointer.current = event.pointerId;
      event.currentTarget.setPointerCapture(event.pointerId); handle.current?.focus({ preventScroll: true }); setDragging(true); move(event);
    }}
    onPointerMove={event => { if (event.pointerId === activePointer.current) { event.preventDefault(); move(event); } }}
    onPointerUp={event => { if (event.pointerId === activePointer.current) { event.preventDefault(); move(event); activePointer.current = null; setDragging(false); } }}
    onPointerCancel={event => { if (event.pointerId === activePointer.current) reset(); }}
    onLostPointerCapture={event => { if (event.pointerId === activePointer.current) reset(); }}>
    <button ref={handle} className="lr-pointer-handle" type="button" aria-label="Drag comment pointer. Arrow keys move; Enter offers Pin here; Escape cancels." style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }}
      onKeyDown={event => {
        const directions: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
        if (directions[event.key]) { event.preventDefault(); event.stopPropagation(); const [x, y] = directions[event.key], step = event.shiftKey ? .05 : .01; position(Math.max(0, Math.min(1, point.x + x * step)), Math.max(0, Math.min(1, point.y + y * step))); }
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); position(point.x, point.y); }
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onCancel(); }
      }}><span aria-hidden="true">＋</span></button>
    {!dragging && positioned && candidate && <div className={`lr-pointer-actions ${point.y > .5 ? 'above' : 'below'}`} style={{ left: `clamp(72px, ${point.x * 100}%, calc(100% - 72px))`, top: `${point.y * 100}%` }}>
      <button type="button" className="lr-primary" onClick={event => { event.stopPropagation(); onConfirm(candidate); }}>Pin here</button>
    </div>}
    <span className="lr-pointer-status" role="status">{dragging ? candidate ? 'Surface found · release to position' : `Move onto the ${surface}` : positioned ? candidate ? 'Drag again to adjust · Pin here to continue' : `No ${surface} here · drag to another point` : 'Drag the pointer, then release'}</span>
  </div>;
}
