import { minimapProjection, type MapBounds } from '../game/minimap';
import type { ReviewView } from '../game/level-review';
export interface GesturePoint { x: number; y: number }
export interface ReviewGesture { from: GesturePoint; to: GesturePoint; scale: number }
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
/** Camera fit distance in units of the model's bounding radius. */
export function reviewCameraDistance(aspect: number, zoom: number) {
  return 1.13 / Math.sin(Math.atan(Math.tan(35 * Math.PI / 360) * Math.min(1, aspect))) / zoom;
}
export function gestureModelView(view: ReviewView, aspect: number, gesture: ReviewGesture): ReviewView {
  const zoom = clamp(view.zoom * gesture.scale, .4, 8);
  const span = (z: number) => 2 * reviewCameraDistance(aspect, z) * Math.tan(35 * Math.PI / 360);
  const oldSpan = span(view.zoom), newSpan = span(zoom);
  return { ...view, zoom, pan: {
    x: clamp((view.pan?.x ?? 0) + ((gesture.from.x - .5) * oldSpan - (gesture.to.x - .5) * newSpan) * aspect, -10, 10),
    y: clamp((view.pan?.y ?? 0) + (.5 - gesture.from.y) * oldSpan - (.5 - gesture.to.y) * newSpan, -10, 10),
  } };
}
export function gestureMapView(bounds: MapBounds, width: number, height: number, view: { zoom: number; center: { x: number; z: number } }, gesture: ReviewGesture) {
  const project = (zoom: number) => { const x = (bounds.maxX - bounds.minX) / zoom / 2, z = (bounds.maxZ - bounds.minZ) / zoom / 2; return minimapProjection({ minX: view.center.x - x, maxX: view.center.x + x, minZ: view.center.z - z, maxZ: view.center.z + z }, width, height, 24); };
  const zoom = clamp(view.zoom * gesture.scale, 1, 8), before = project(view.zoom), after = project(zoom);
  return { zoom, center: {
    x: clamp(view.center.x + (gesture.from.x * width - before.offsetX) / before.scale - (gesture.to.x * width - after.offsetX) / after.scale, bounds.minX, bounds.maxX),
    z: clamp(view.center.z + (gesture.from.y * height - before.offsetY) / before.scale - (gesture.to.y * height - after.offsetY) / after.scale, bounds.minZ, bounds.maxZ),
  } };
}
