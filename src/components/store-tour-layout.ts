export type TourRect = { left: number; top: number; right: number; bottom: number };
type Size = { width: number; height: number };
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(value, Math.max(low, high)));

/** Position the coach beside its target, keeping both usable on narrow screens. */
export function placeStoreTour(target: TourRect, panel: Size, viewport: Size) {
  const edge = 12, gap = 18;
  const centerX = (target.left + target.right) / 2, centerY = (target.top + target.bottom) / 2;
  const room = {
    bottom: viewport.height - target.bottom - gap - edge - panel.height,
    top: target.top - gap - edge - panel.height,
    right: viewport.width - target.right - gap - edge - panel.width,
    left: target.left - gap - edge - panel.width,
  };
  // Prefer vertical placement, then the side with enough room. On short screens
  // use a side placement so the card does not cover a wide, shallow target.
  const sides = ['bottom', 'top', 'right', 'left'] as const;
  const side = sides.find(s => room[s] >= 0) ?? (room.bottom >= room.top ? 'bottom' : 'top');
  const horizontal = side === 'top' || side === 'bottom';
  const maxHeight = Math.min(viewport.height - edge * 2, Math.max(100, horizontal ? side === 'bottom' ? viewport.height - target.bottom - gap - edge : target.top - gap - edge : viewport.height - edge * 2));
  const height = Math.min(panel.height, maxHeight);
  const left = clamp(horizontal ? centerX - panel.width / 2 : side === 'right' ? target.right + gap : target.left - gap - panel.width, edge, viewport.width - panel.width - edge);
  const top = clamp(horizontal ? side === 'bottom' ? target.bottom + gap : target.top - gap - height : centerY - height / 2, edge, viewport.height - height - edge);
  return {
    left, top, side, maxHeight,
    arrowLeft: horizontal ? clamp(centerX - left, 24, panel.width - 24) : side === 'right' ? 0 : panel.width,
    arrowTop: horizontal ? side === 'bottom' ? 0 : height : clamp(centerY - top, 24, height - 24),
  };
}
