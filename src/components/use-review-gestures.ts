import { useEffect, useRef, useState, type RefObject } from 'react';
import type { ReviewGesture } from '../lib/review-gestures';

/** Capture two-finger gestures before orbit/pin handlers; never resume one finger mid-gesture. */
/** `mount` changes when the host element is replaced, so the listeners move to the new node. */
export function useReviewGestures(host: RefObject<HTMLElement | null>, onChange: (gesture: ReviewGesture) => void, onStart?: () => void, mount: unknown = 0) {
  const latest = useRef({ onChange, onStart }); latest.current = { onChange, onStart };
  const [active, setActive] = useState(false), [version, setVersion] = useState(0);
  useEffect(() => {
    const node = host.current; if (!node) return;
    const points = new Map<number, { x: number; y: number }>(), gestureIds = new Set<number>();
    let latched = false, suppressUntil = 0;
    const frame = () => { if (points.size !== 2) return null; const [a, b] = [...points.values()]; return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, distance: Math.hypot(a.x - b.x, a.y - b.y) }; };
    let previous: ReturnType<typeof frame> = null;
    const block = (e: Event) => { e.preventDefault(); e.stopImmediatePropagation(); };
    const begin = () => { latched = true; gestureIds.clear(); latest.current.onStart?.(); setVersion(n => n + 1); setActive(true); };
    const down = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return;
      points.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (points.size >= 2 && !latched) begin();
      if (latched) { block(e); for (const id of points.keys()) { gestureIds.add(id); try { node.setPointerCapture(id); } catch { /* A canceled pointer may already be gone. */ } } previous = frame(); }
    };
    const move = (e: PointerEvent) => {
      if (!points.has(e.pointerId)) return;
      points.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (!latched) return;
      block(e); const next = frame(), rect = node.getBoundingClientRect();
      if (previous && next && previous.distance > 4 && next.distance > 4 && rect.width && rect.height) latest.current.onChange({
        from: { x: (previous.x - rect.left) / rect.width, y: (previous.y - rect.top) / rect.height },
        to: { x: (next.x - rect.left) / rect.width, y: (next.y - rect.top) / rect.height }, scale: next.distance / previous.distance,
      });
      previous = next;
    };
    const end = (e: PointerEvent) => {
      if (!points.has(e.pointerId)) return;
      if (latched) block(e); points.delete(e.pointerId); previous = frame();
      if (!points.size && latched) { latched = false; suppressUntil = performance.now() + 600; setActive(false); }
    };
    const lost = (e: PointerEvent) => { if (e.target === node) end(e); };
    const click = (e: MouseEvent) => {
      const id = (e as PointerEvent).pointerId;
      if (latched || (e.detail !== 0 && performance.now() < suppressUntil && (typeof id !== 'number' || gestureIds.has(id)))) block(e);
    };
    const cancel = () => {
      if (!points.size) return;
      latest.current.onStart?.(); setVersion(n => n + 1); suppressUntil = performance.now() + 600;
      const ids = [...points.keys()]; points.clear(); previous = null; latched = false; setActive(false);
      for (const id of ids) { gestureIds.add(id); if (node.hasPointerCapture(id)) node.releasePointerCapture(id); }
    };
    const hidden = () => { if (document.hidden) cancel(); };
    node.addEventListener('pointerdown', down, true); node.addEventListener('pointermove', move, true); node.addEventListener('pointerup', end, true); node.addEventListener('pointercancel', end, true); node.addEventListener('lostpointercapture', lost, true); node.addEventListener('click', click, true);
    // A single touch on the map need not capture; still retire it if released outside.
    window.addEventListener('pointerup', end, true); window.addEventListener('pointercancel', end, true);
    window.addEventListener('blur', cancel); window.addEventListener('resize', cancel); document.addEventListener('visibilitychange', hidden);
    return () => { node.removeEventListener('pointerdown', down, true); node.removeEventListener('pointermove', move, true); node.removeEventListener('pointerup', end, true); node.removeEventListener('pointercancel', end, true); node.removeEventListener('lostpointercapture', lost, true); node.removeEventListener('click', click, true); window.removeEventListener('pointerup', end, true); window.removeEventListener('pointercancel', end, true); window.removeEventListener('blur', cancel); window.removeEventListener('resize', cancel); document.removeEventListener('visibilitychange', hidden); };
  }, [host, mount]);
  return { active, version };
}
