/** Compass bearing in whole degrees, 0 north (map up, -Z) and 90 east (+X); the minimap arrow turns the same way. */
export function compassBearing(yaw: number) {
  const degrees = Math.round(-yaw * 180 / Math.PI) % 360;
  return Number.isFinite(degrees) ? (degrees + 360) % 360 : 0;
}

const POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;
export interface CompassTick { bearing: number; /** Degrees right of the view's centre; negative is left. */ offset: number; label: string }

/** Ticks every `step` degrees within `span` either side of the heading; the eight points carry a letter. */
export function compassTicks(bearing: number, span = 60, step = 15): CompassTick[] {
  const ticks: CompassTick[] = [];
  for (let at = Math.ceil((bearing - span) / step) * step; at <= bearing + span; at += step) {
    const wrapped = ((at % 360) + 360) % 360;
    ticks.push({ bearing: wrapped, offset: at - bearing, label: wrapped % 45 === 0 ? POINTS[wrapped / 45] : '' });
  }
  return ticks;
}
