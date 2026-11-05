import { useLayoutEffect, useRef, useState, type RefObject } from 'react';

const OPEN_MS = 220, CLOSE_MS = 180, ARRIVE_MS = 90, FOLDED_OPACITY = .35;
const EASING = 'cubic-bezier(.3,.7,.2,1)';
type Box = Pick<DOMRectReadOnly, 'x' | 'y' | 'width' | 'height'>;

/** The panel's own transform, then moved and scaled so it covers `corner` instead of `panel`. */
export function foldTransform(base: string, panel: Box, corner: Box) {
  const dx = corner.x + corner.width / 2 - (panel.x + panel.width / 2);
  const dy = corner.y + corner.height / 2 - (panel.y + panel.height / 2);
  return `translate(${dx}px,${dy}px) ${base === 'none' ? '' : base} scale(${corner.width / panel.width},${corner.height / panel.height})`;
}
const motionAllowed = () => !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * Grows the map out of its corner and folds it back. The corner panel and the
 * district map are different content, so `closing` keeps the district map drawn
 * until it has folded away, while the game behind it has already moved on.
 */
export function useMapPanelMotion(panel: RefObject<HTMLElement | null>, open: boolean) {
  const [seen, setSeen] = useState(open), [closing, setClosing] = useState(false);
  const corner = useRef<DOMRect | null>(null), running = useRef<Animation | null>(null);
  if (seen !== open) {
    setSeen(open);
    // Only now is the corner panel still laid out: the commit turns it into the map.
    if (open && !closing) corner.current = panel.current?.getBoundingClientRect() ?? null;
    setClosing(!open && !!corner.current && motionAllowed());
  }
  useLayoutEffect(() => {
    const element = panel.current, target = corner.current, previous = running.current;
    if (!element) return;
    const style = getComputedStyle(element);
    // A switch mid-flight turns round from where the panel is, not from either end.
    const midway = previous?.playState === 'running' ? { transform: style.transform, opacity: style.opacity } : null;
    previous?.cancel(); running.current = null;
    if (!motionAllowed()) return;
    if (!open && !closing) {
      if (previous) running.current = element.animate([{ opacity: FOLDED_OPACITY }, { opacity: 1 }], { duration: ARRIVE_MS, easing: 'ease-out' });
      return;
    }
    if (!target) return;
    const base = style.transform, folded = { transform: foldTransform(base, element.getBoundingClientRect(), target), opacity: FOLDED_OPACITY };
    const whole = { transform: base, opacity: 1 };
    if (open) { running.current = element.animate([midway ?? folded, whole], { duration: OPEN_MS, easing: EASING }); return; }
    running.current = element.animate([midway ?? whole, folded], { duration: CLOSE_MS, easing: EASING, fill: 'forwards' });
    const done = window.setTimeout(() => setClosing(false), CLOSE_MS);
    return () => window.clearTimeout(done);
  }, [panel, open, closing]);
  return closing;
}
