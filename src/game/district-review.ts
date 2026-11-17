import * as THREE from 'three';
import type { ReviewAnchor, ReviewSceneView, ReviewShape, ReviewShapePoint, ReviewShapeTone, ReviewThread } from './level-review';
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

/** Shared by the schematic and the 3D layout so a drawing reads the same in both. */
export const REVIEW_SHAPE_COLORS: Record<ReviewShapeTone, string> = { existing: '#2c6fbb', problem: '#cf3f2c', proposal: '#1f9d57' };
/** Drawn points float a little above their surface so a line on the ground is not buried in it. */
export const districtShapePoint = (p: ReviewShapePoint, bounds: RegionBounds, lift = .6) => new THREE.Vector3(p.x, (p.y ?? districtGround(bounds, p.x, p.z)) + lift, p.z);
/**
 * Routes, areas and sightlines as scene geometry. They draw over the district (no depth test) so a route stays
 * readable behind a tower, and are tagged as effects so picking and the detached-pin check ignore them.
 */
/** Line thickness for a camera distance, in steps, so a route is a few pixels wide from the overview and from the street. */
export const districtShapeScale = (distance: number) => 1.3 ** Math.round(Math.log(clamp(distance / 150, .4, 6)) / Math.log(1.3));
export function buildDistrictShapes(shapes: readonly { shape: ReviewShape; selected?: boolean }[], bounds: RegionBounds, scale = 1) {
  const group = new THREE.Group(); group.name = 'Review drawings'; group.userData.fpsEffect = true; group.renderOrder = 20;
  const up = new THREE.Vector3(0, 1, 0);
  for (const { shape, selected } of shapes) {
    const points = shape.points.map(p => districtShapePoint(p, bounds, .6 * Math.max(1, scale))), color = REVIEW_SHAPE_COLORS[shape.tone];
    const line = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: selected ? 1 : .82, depthTest: false, depthWrite: false });
    const radius = (shape.kind === 'sightline' ? .45 : shape.kind === 'zone' ? .6 : 1) * (selected ? 1.5 : 1) * scale;
    const path = shape.kind === 'zone' ? [...points, points[0]] : points;
    const add = (geometry: THREE.BufferGeometry, at: THREE.Vector3, direction?: THREE.Vector3) => {
      const mesh = new THREE.Mesh(geometry, line); mesh.position.copy(at); mesh.renderOrder = 20;
      if (direction) mesh.quaternion.setFromUnitVectors(up, direction);
      group.add(mesh); return mesh;
    };
    for (let i = 1; i < path.length; i++) {
      const delta = path[i].clone().sub(path[i - 1]), length = delta.length();
      if (length < .01) continue;
      // A sightline is drawn as dashes so it is not mistaken for somewhere to walk.
      const pieces = shape.kind === 'sightline' ? Math.max(1, Math.round(length / (6 * scale))) : 1, direction = delta.clone().normalize();
      for (let k = 0; k < pieces; k++) add(new THREE.CylinderGeometry(radius, radius, length / pieces * (pieces > 1 ? .6 : 1), 6), path[i - 1].clone().addScaledVector(delta, (k + .5) / pieces), direction);
      if (shape.kind !== 'sightline') add(new THREE.SphereGeometry(radius, 8, 6), path[i]);
    }
    const last = path[path.length - 1], before = path[path.length - 2];
    if (shape.kind === 'route') add(new THREE.ConeGeometry(radius * 2.6, radius * 6, 10), last, last.clone().sub(before).normalize());
    if (shape.kind === 'sightline') for (const end of points) add(new THREE.SphereGeometry(radius * 2.4, 10, 8), end);
    if (shape.kind === 'zone') {
      const outline = new THREE.Shape(points.map(p => new THREE.Vector2(p.x, p.z))), fill = new THREE.ShapeGeometry(outline);
      fill.rotateX(Math.PI / 2);
      const mesh = new THREE.Mesh(fill, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: selected ? .4 : .26, depthWrite: false, side: THREE.DoubleSide }));
      mesh.position.y = Math.max(...points.map(p => p.y)) - .25; mesh.renderOrder = 19; group.add(mesh);
    }
  }
  return group;
}
export function disposeDistrictShapes(group: THREE.Object3D) {
  group.removeFromParent();
  group.traverse(object => { if (object instanceof THREE.Mesh) { object.geometry.dispose(); (object.material as THREE.Material).dispose(); } });
}
