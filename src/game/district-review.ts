import * as THREE from 'three';
import type { ReviewAnchor, ReviewSceneView, ReviewThread } from './level-review';
import type { RegionBounds } from './region-collision';

/** Vertical field of view of the review camera, in degrees. */
export const DISTRICT_REVIEW_FOV = 45;
/** A 3D pin with no surface this close (metres) is reported as detached from the current build. */
export const DISTRICT_PIN_REACH = .6;
const MIN_DISTANCE = 3, MIN_PITCH = .03, MAX_PITCH = 1.5;
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
const round = (n: number, places = 2) => { const f = 10 ** places; return Math.round(n * f) / f; };
const radius = (b: RegionBounds) => Math.hypot(b.maxX - b.minX, b.maxZ - b.minZ) / 2;
/** Pins and the orbit target may leave the playable bounds a little: backdrop buildings are part of the layout. */
const margin = (b: RegionBounds) => Math.max(30, radius(b) * .25);
export const districtGround = (bounds: RegionBounds, x: number, z: number) => bounds.groundHeight?.(x, z) ?? 0;

/**
 * North is -Z, as on the schematic: yaw 0 looks north from the south, positive yaw moves the camera east.
 * The overview backs away until all four corners of the playable bounds are inside the frame.
 */
export function districtOverview(bounds: RegionBounds, aspect = 1.5): ReviewSceneView {
  const view = { x: (bounds.minX + bounds.maxX) / 2, y: 0, z: (bounds.minZ + bounds.maxZ) / 2, yaw: .55, pitch: .8, distance: radius(bounds) };
  const camera = new THREE.PerspectiveCamera(DISTRICT_REVIEW_FOV, Math.max(.2, aspect), .5, 6000), corner = new THREE.Vector3();
  const inside = () => { placeDistrictCamera(camera, view); return [[bounds.minX, bounds.minZ], [bounds.maxX, bounds.minZ], [bounds.minX, bounds.maxZ], [bounds.maxX, bounds.maxZ]].every(([x, z]) => { corner.set(x, districtGround(bounds, x, z), z).project(camera); return Math.abs(corner.x) < .94 && Math.abs(corner.y) < .94 && corner.z < 1; }); };
  for (let i = 0; i < 60 && !inside(); i++) view.distance *= 1.06;
  return { ...view, distance: round(view.distance) };
}
export function clampDistrictView(view: ReviewSceneView, bounds: RegionBounds): ReviewSceneView {
  const m = margin(bounds);
  return {
    x: clamp(view.x, bounds.minX - m, bounds.maxX + m), y: clamp(view.y, -50, 600), z: clamp(view.z, bounds.minZ - m, bounds.maxZ + m),
    yaw: Math.abs(view.yaw) <= Math.PI ? view.yaw : THREE.MathUtils.euclideanModulo(view.yaw + Math.PI, Math.PI * 2) - Math.PI, pitch: clamp(view.pitch, MIN_PITCH, MAX_PITCH),
    distance: clamp(view.distance, MIN_DISTANCE, Math.max(200, radius(bounds) * 6)),
  };
}
export function placeDistrictCamera(camera: THREE.PerspectiveCamera, view: ReviewSceneView) {
  const target = new THREE.Vector3(view.x, view.y, view.z);
  camera.position.set(Math.sin(view.yaw) * Math.cos(view.pitch), Math.sin(view.pitch), Math.cos(view.yaw) * Math.cos(view.pitch)).multiplyScalar(view.distance).add(target);
  camera.lookAt(target); camera.updateMatrixWorld();
}
/** Slide the looked-at point along the ground so that it follows a drag of (dx, dy) viewport heights. */
export function panDistrictView(view: ReviewSceneView, dx: number, dy: number): ReviewSceneView {
  const span = 2 * view.distance * Math.tan(DISTRICT_REVIEW_FOV * Math.PI / 360);
  // A grazing view would turn a small vertical drag into a huge slide; cap that stretch at 3x.
  const right = -dx * span, forward = dy * span / Math.max(Math.sin(view.pitch), 1 / 3);
  return { ...view, x: view.x + Math.cos(view.yaw) * right - Math.sin(view.yaw) * forward, z: view.z - Math.sin(view.yaw) * right - Math.cos(view.yaw) * forward };
}
/** Where a thread is drawn in the scene. Schematic pins carry no height, so they sit on the ground. */
export function districtAnchorWorld(anchor: ReviewAnchor, bounds: RegionBounds) {
  return new THREE.Vector3(anchor.x, anchor.space ? anchor.space.y : districtGround(bounds, anchor.x, anchor.z), anchor.z);
}

function solid(hit: THREE.Intersection) {
  if (!(hit.object instanceof THREE.Mesh)) return false;
  for (let object: THREE.Object3D | null = hit.object; object; object = object.parent) if (!object.visible || object.userData.fpsEffect) return false;
  const materials: THREE.Material[] = Array.isArray(hit.object.material) ? hit.object.material : [hit.object.material];
  const material = materials[hit.face?.materialIndex ?? 0] ?? materials[0];
  return !!material && material.visible && material.colorWrite && !(material.transparent && material.opacity < .05);
}
/** First drawn surface along a ray: skips sprites, lines, effects, hidden colliders and the sky. */
export function districtSurfaceHit(scene: THREE.Object3D, ray: THREE.Raycaster, bounds: RegionBounds) {
  const m = margin(bounds);
  return ray.intersectObject(scene, true).find(hit => solid(hit) && hit.point.x >= bounds.minX - m && hit.point.x <= bounds.maxX + m && hit.point.z >= bounds.minZ - m && hit.point.z <= bounds.maxZ + m && hit.point.y > -50 && hit.point.y < 600) ?? null;
}
function surfaceLabel(hit: THREE.Intersection, ground: number) {
  // Instances in these scenes are only ever turned about the vertical, so the mesh transform is enough to tell a roof from a wall.
  const up = hit.face ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld).y : 1, y = hit.point.y;
  const kind = up > .7 ? Math.abs(y - ground) < .75 ? 'Ground' : 'Deck or roof' : up < -.7 ? 'Underside' : Math.abs(up) < .3 ? 'Wall' : 'Slope';
  const height = kind === 'Ground' ? `y=${round(y, 1)} m` : `y=${round(y, 1)} m, ${round(y - ground, 1)} m above ground`;
  return `${kind} · ${height}${hit.object.name ? ` · ${hit.object.name}` : ''}`.slice(0, 100);
}
/** Raycast the built district at a screen point. The anchor is world space; `view` is what the designer was looking at. */
export function pickDistrictAnchor(scene: THREE.Object3D, camera: THREE.Camera, ndc: THREE.Vector2, view: ReviewSceneView, bounds: RegionBounds): ReviewAnchor | null {
  scene.updateMatrixWorld(); camera.updateMatrixWorld();
  const ray = new THREE.Raycaster(); ray.setFromCamera(ndc, camera);
  const hit = districtSurfaceHit(scene, ray, bounds);
  if (!hit) return null;
  const x = round(hit.point.x), z = round(hit.point.z);
  return { x, z, level: surfaceLabel(hit, districtGround(bounds, x, z)), space: { y: round(hit.point.y), view: {
    x: round(view.x), y: round(view.y), z: round(view.z), yaw: round(view.yaw, 4), pitch: round(view.pitch, 4), distance: round(view.distance) } } };
}
/**
 * Whether a 3D pin still touches the district as it is built now: a surface faces it within `reach` along some axis.
 * This is a local check per pin; it does not notice new geometry that buries or hides the place.
 */
export function districtPinAttached(scene: THREE.Object3D, anchor: ReviewAnchor, bounds: RegionBounds, camera: THREE.Camera, reach = DISTRICT_PIN_REACH) {
  if (!anchor.space) return true;
  const point = new THREE.Vector3(anchor.x, anchor.space.y, anchor.z), ray = new THREE.Raycaster();
  ray.camera = camera; ray.far = reach * 2;
  for (const axis of [[0, 1, 0], [0, -1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]]) {
    const direction = new THREE.Vector3(...axis);
    ray.set(point.clone().addScaledVector(direction, -reach), direction);
    if (districtSurfaceHit(scene, ray, bounds)) return true;
  }
  return false;
}
/** Threads whose 3D pin no longer touches a surface. */
export function detachedDistrictPins(scene: THREE.Object3D, threads: readonly ReviewThread[], bounds: RegionBounds, camera: THREE.Camera) {
  scene.updateMatrixWorld();
  return threads.filter(thread => !districtPinAttached(scene, thread.anchor, bounds, camera)).map(thread => thread.id);
}
