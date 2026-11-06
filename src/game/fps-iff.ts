import * as THREE from 'three';
import { visiblePilotContacts, type PilotSubject } from './fps-pilot-perception';

/**
 * The friend-or-foe overlay of IFF goggles (vision-devices holds the devices).
 * Whoever the reader can see gets a box round their body: red for hostile,
 * green for friendly, white for neutral (proxies not after you, people in the
 * street). It reads what is in sight, so walls, vehicles and smoke still hide
 * people; sight is checked a few times a second, and the boxes follow the
 * bodies every frame in between.
 *
 * Through a magnified scope the reader is linked to the sight: each box is
 * also drawn in the scope's picture where the magnified body is, clipped to
 * the lens, while the unmagnified boxes keep out of it. A mark under the
 * reticle takes the colour of whoever the reticle is on, since at high power
 * one person's box can be bigger than the lens.
 */
export type IffSide = 'enemy' | 'ally' | 'neutral';
export const IFF_COLOURS: Readonly<Record<IffSide, string>> = { enemy: '#ff3b30', ally: '#3dff6e', neutral: '#ffffff' };

export interface IffSubject {
  id: string; side: IffSide;
  /** The figure or target, for line of sight: a ray that reaches it must hit something under this root. */
  root: THREE.Object3D;
  /** Points the reader tries to see, nearest to the middle of the body first. */
  points: THREE.Vector3[];
  /** Fills `out` with a world-space box round the body and returns it. */
  bounds(out: THREE.Box3): THREE.Box3;
}
/** A box on screen in normalised device coordinates, -1 to 1 each way. `zoomed` boxes belong in the scope's lens. */
export interface IffBox { id: string; side: IffSide; x0: number; y0: number; x1: number; y1: number; distance: number; zoomed?: boolean }
/** A magnified scope being looked through: the camera its picture is drawn with, and the lens it is shown on. */
export interface IffScope {
  camera: THREE.PerspectiveCamera; lens: THREE.Object3D; radius: number; viewCamera: THREE.Camera;
  /** How far into the eye box the raise has come, 0–1: the scope picture's own opacity. */
  visibility: number;
}
/** The lens on screen, in NDC: its centre and a point on its rim, and how much of the scope picture is up. */
export interface IffLens { x: number; y: number; rimX: number; rimY: number; visibility: number }
export interface IffFrame { boxes: IffBox[]; lens: IffLens | null; aim: IffSide | null }
export const EMPTY_IFF_FRAME: IffFrame = { boxes: [], lens: null, aim: null };
/** The share of the lens radius its picture fills; beyond, the eye-box shadow and the housing. */
const LENS_PICTURE = .98;

/** Seconds between line-of-sight checks. */
export const IFF_SCAN_SECONDS = .2;

const JOINTS = ['rig-head', 'rig-hips', 'rig-handL', 'rig-handR', 'rig-footL', 'rig-footR'] as const;
const cachedJoints = new WeakMap<THREE.Object3D, (THREE.Object3D | undefined)[]>();
const point = new THREE.Vector3();
/**
 * A box round a character rig from its joints, so it follows a crouch, prone or
 * a sprawl, and leaves out the name tag and health bar floating over it.
 */
export function characterBounds(root: THREE.Object3D, out: THREE.Box3) {
  let joints = cachedJoints.get(root);
  if (!joints) { joints = JOINTS.map(name => root.getObjectByName(name)); cachedJoints.set(root, joints); }
  // Read after the frame has drawn, when every matrix is already current.
  out.makeEmpty();
  out.expandByPoint(point.setFromMatrixPosition(root.matrixWorld));
  joints.forEach((joint, i) => {
    if (!joint) return;
    point.setFromMatrixPosition(joint.matrixWorld);
    // The head joint is the neck end of the skull; feet sit on their soles.
    if (i === 0) point.y += .2; else if (i >= 4) point.y -= .08;
    out.expandByPoint(point);
  });
  return out.expandByVector(point.set(.18, .04, .18));
}
/** The aim points on a character rig, chest first; its root's height if it has none. */
export function characterPoints(root: THREE.Object3D) {
  const named = ['avatar-aim-chest', 'avatar-aim-head'].map(name => root.getObjectByName(name)?.getWorldPosition(new THREE.Vector3()));
  return named.every(Boolean) ? named as THREE.Vector3[] : [1.15, 1.62].map(y => root.localToWorld(new THREE.Vector3(0, y, 0)));
}

const corner = new THREE.Vector3(), box = new THREE.Box3(), onLens = new THREE.Vector3();
/** A point on the lens at scope NDC (x, y), on screen in NDC. */
function lensPoint(scope: IffScope, x: number, y: number) {
  return onLens.set(x * scope.radius, y * scope.radius, 0).applyMatrix4(scope.lens.matrixWorld).project(scope.viewCamera);
}
/** Where the lens sits on screen, for clipping. */
export function lensOnScreen(scope: IffScope): IffLens {
  const centre = lensPoint(scope, 0, 0), x = centre.x, y = centre.y, rim = lensPoint(scope, LENS_PICTURE, 0);
  return { x, y, rimX: rim.x, rimY: rim.y, visibility: scope.visibility };
}
/** A box from the scope's picture, carried onto the lens on screen; its corners follow a rolled lens. */
export function zoomedBox(bounds: THREE.Box3, scope: IffScope) {
  const shown = projectBox(bounds, scope.camera, .06);
  if (!shown) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of [[shown.x0, shown.y0], [shown.x1, shown.y0], [shown.x0, shown.y1], [shown.x1, shown.y1]]) {
    const at = lensPoint(scope, x, y);
    x0 = Math.min(x0, at.x); x1 = Math.max(x1, at.x); y0 = Math.min(y0, at.y); y1 = Math.max(y1, at.y);
  }
  // Whether the reticle, at the picture's centre, is on this body.
  return { x0, y0, x1, y1, onReticle: shown.x0 <= 0 && shown.x1 >= 0 && shown.y0 <= 0 && shown.y1 >= 0 };
}
/**
 * Where a world box lands on screen. Nothing when any of it is behind the
 * camera, as the corners would fold over, or when it is entirely off screen.
 * `minimum` keeps a far figure's box readable, in NDC units of the height.
 */
export function projectBox(bounds: THREE.Box3, camera: THREE.Camera, minimum = 0) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < 8; i++) {
    corner.set(i & 1 ? bounds.max.x : bounds.min.x, i & 2 ? bounds.max.y : bounds.min.y, i & 4 ? bounds.max.z : bounds.min.z).project(camera);
    if (corner.z < -1 || corner.z > 1) return null;
    x0 = Math.min(x0, corner.x); x1 = Math.max(x1, corner.x); y0 = Math.min(y0, corner.y); y1 = Math.max(y1, corner.y);
  }
  if (x1 < -1 || x0 > 1 || y1 < -1 || y0 > 1) return null;
  const aspect = camera instanceof THREE.PerspectiveCamera ? camera.aspect : 1;
  const grow = (low: number, high: number, least: number) => { const pad = Math.max(0, least - (high - low)) / 2; return [low - pad, high + pad]; };
  [x0, x1] = grow(x0, x1, minimum / aspect); [y0, y1] = grow(y0, y1, minimum);
  return { x0, y0, x1, y1 };
}

/**
 * Which subjects the reader sees, rescanned every IFF_SCAN_SECONDS, and their
 * boxes this frame. `reset` forgets everyone, for a device switched off.
 */
export function createIffTracker() {
  let seen = new Map<string, number>(), clock = IFF_SCAN_SECONDS;
  return {
    update(dt: number, camera: THREE.PerspectiveCamera, scene: THREE.Scene, subjects: readonly IffSubject[], range: number, scope?: IffScope): IffFrame {
      clock += dt;
      if (clock >= IFF_SCAN_SECONDS) {
        clock = 0;
        const near = subjects.filter(s => s.points.length && s.points[0].distanceTo(camera.position) <= range);
        const pilot: PilotSubject[] = near.map(s => ({ id: s.id, root: s.root, points: s.points, radius: .3 }));
        seen = new Map((pilot.length ? visiblePilotContacts(camera, scene, pilot) : []).filter(c => c.distance <= range).map(c => [c.id, c.distance]));
      }
      const boxes: IffBox[] = [];
      let aim: IffSide | null = null, aimDistance = Infinity;
      const zooming = !!scope && scope.visibility > 0;
      for (const subject of subjects) {
        const distance = seen.get(subject.id);
        if (distance === undefined) continue;
        subject.bounds(box);
        const shown = projectBox(box, camera, .035);
        if (shown) boxes.push({ id: subject.id, side: subject.side, distance, ...shown });
        const zoomed = zooming ? zoomedBox(box, scope!) : null;
        if (!zoomed) continue;
        boxes.push({ id: subject.id, side: subject.side, distance, x0: zoomed.x0, y0: zoomed.y0, x1: zoomed.x1, y1: zoomed.y1, zoomed: true });
        // The nearest body under the reticle, as the nearer one hides what stands behind it.
        if (zoomed.onReticle && distance < aimDistance) { aim = subject.side; aimDistance = distance; }
      }
      return { boxes, lens: zooming ? lensOnScreen(scope!) : null, aim };
    },
    reset() { seen.clear(); clock = IFF_SCAN_SECONDS; },
  };
}

const MAX_BOXES = 48;
/** Two strokes per edge, a dark one under the colour, so a white box still reads on a pale wall; one more box's worth for the reticle mark. */
const STROKES = 2, VERTICES_PER_BOX = STROKES * 4 * 6;
const OVERLAY_VERTEX = /* glsl */`
attribute vec4 colour;
attribute float zone;
varying vec4 vColour;
varying float vZone;
void main() { vColour = colour; vZone = zone; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const OVERLAY_FRAGMENT = /* glsl */`
varying vec4 vColour;
varying float vZone;
uniform vec2 uResolution;
uniform float uAperture;
uniform float uOpacity;
uniform vec3 uLens;
uniform float uLensVisibility;
void main() {
  // Inside a tube the reader is injected into the image, so it ends at the image circle.
  float r = length(gl_FragCoord.xy - 0.5 * uResolution) / (0.5 * max(uResolution.x, uResolution.y));
  if (r > uAperture) discard;
  // Zone 0 is the unmagnified view, zone 1 the scope's picture: each gives way to the other on the lens as the raise brings it up.
  float inLens = 1.0 - step(uLens.z, length(gl_FragCoord.xy - uLens.xy));
  float alpha = vColour.a * uOpacity;
  if (vZone > 0.5) { if (inLens < 0.5) discard; alpha *= uLensVisibility; }
  else alpha *= 1.0 - inLens * uLensVisibility;
  gl_FragColor = vec4(vColour.rgb, alpha);
}`;

/** Draws boxes straight onto the canvas, over the world, the weapon and any tube picture. */
export function createIffOverlay() {
  const vertices = (MAX_BOXES + 1) * VERTICES_PER_BOX;
  const positions = new Float32Array(vertices * 3), colours = new Float32Array(vertices * 4), zones = new Float32Array(vertices);
  const geometry = new THREE.BufferGeometry();
  const position = new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage), colour = new THREE.BufferAttribute(colours, 4).setUsage(THREE.DynamicDrawUsage);
  const zone = new THREE.BufferAttribute(zones, 1).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', position); geometry.setAttribute('colour', colour); geometry.setAttribute('zone', zone); geometry.setDrawRange(0, 0);
  const material = new THREE.ShaderMaterial({ vertexShader: OVERLAY_VERTEX, fragmentShader: OVERLAY_FRAGMENT, transparent: true, depthTest: false, depthWrite: false, toneMapped: false,
    uniforms: { uResolution: { value: new THREE.Vector2(1, 1) }, uAperture: { value: 9 }, uOpacity: { value: 1 }, uLens: { value: new THREE.Vector3(0, 0, -1) }, uLensVisibility: { value: 0 } } });
  const mesh = new THREE.Mesh(geometry, material); mesh.frustumCulled = false;
  const scene = new THREE.Scene(); scene.add(mesh);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), size = new THREE.Vector2();
  // The canvas is sRGB and this pass writes it directly, so colours go in as written.
  const palette = Object.fromEntries(Object.entries(IFF_COLOURS).map(([side, hex]) => [side, new THREE.Color(hex).convertLinearToSRGB()])) as Record<IffSide, THREE.Color>;
  let count = 0, area = 0;
  const quad = (ax: number, ay: number, bx: number, by: number, r: number, g: number, b: number, a: number) => {
    const at = count * 3, tint = count * 4;
    positions.set([ax, ay, 0, bx, ay, 0, bx, by, 0, ax, ay, 0, bx, by, 0, ax, by, 0], at);
    for (let i = 0; i < 6; i++) { colours.set([r, g, b, a], tint + i * 4); zones[count + i] = area; }
    count += 6;
  };
  return {
    /** `aperture` is the image circle the boxes stay inside (9 for none); `opacity` fades the whole overlay. */
    draw(renderer: THREE.WebGLRenderer, frame: IffFrame, aperture: number, opacity: number) {
      const { boxes, lens, aim } = frame;
      if (!boxes.length || opacity <= 0) return;
      renderer.getDrawingBufferSize(size);
      // Two device pixels wide at 1x, a little more on dense screens, and a pixel either side for the shadow.
      const line = Math.max(2, 1.5 * renderer.getPixelRatio()), shadow = line + 2;
      count = 0;
      for (const b of boxes.slice(0, MAX_BOXES)) {
        area = b.zoomed ? 1 : 0;
        // Far boxes thin out a little, so a crowd at range does not turn into a wall of frames.
        const fade = 1 - Math.min(.35, Math.max(0, b.distance - 40) / 200);
        const c = palette[b.side];
        for (const [width, r, g, bl, a] of [[shadow, 0, 0, 0, .45 * fade], [line, c.r, c.g, c.b, .95 * fade]] as const) {
          const wx = width / size.x * 2, wy = width / size.y * 2, ox = (shadow - width) / size.x, oy = (shadow - width) / size.y;
          const x0 = b.x0 - ox, x1 = b.x1 + ox, y0 = b.y0 - oy, y1 = b.y1 + oy;
          quad(x0 - wx, y1, x1 + wx, y1 + wy, r, g, bl, a); quad(x0 - wx, y0 - wy, x1 + wx, y0, r, g, bl, a);
          quad(x0 - wx, y0, x0, y1, r, g, bl, a); quad(x1, y0, x1 + wx, y1, r, g, bl, a);
        }
      }
      const centre = { x: (lens ? lens.x + 1 : 1) * size.x / 2, y: (lens ? lens.y + 1 : 1) * size.y / 2 };
      const lensPixels = lens ? Math.hypot((lens.rimX - lens.x) * size.x / 2, (lens.rimY - lens.y) * size.y / 2) : -1;
      if (lens && aim) {
        // A bar under the reticle in the colour of whoever it is on, a fifth of the lens radius below the centre.
        area = 1;
        const c = palette[aim], half = lensPixels * .09, drop = lensPixels * .2, thick = line * 1.5;
        const px = (v: number) => v / size.x * 2, py = (v: number) => v / size.y * 2;
        const cx = lens.x, cy = lens.y - py(drop);
        quad(cx - px(half + 1), cy - py(thick / 2 + 1), cx + px(half + 1), cy + py(thick / 2 + 1), 0, 0, 0, .55);
        quad(cx - px(half), cy - py(thick / 2), cx + px(half), cy + py(thick / 2), c.r, c.g, c.b, 1);
      }
      material.uniforms.uLens.value.set(centre.x, centre.y, lensPixels); material.uniforms.uLensVisibility.value = lens?.visibility ?? 0;
      position.needsUpdate = colour.needsUpdate = zone.needsUpdate = true;
      geometry.setDrawRange(0, count);
      material.uniforms.uResolution.value.copy(size); material.uniforms.uAperture.value = aperture; material.uniforms.uOpacity.value = opacity;
      const previous = renderer.getRenderTarget(), autoClear = renderer.autoClear;
      renderer.setRenderTarget(null); renderer.autoClear = false;
      renderer.render(scene, camera);
      renderer.autoClear = autoClear; renderer.setRenderTarget(previous);
    },
    warm(renderer: THREE.WebGLRenderer) { return renderer.compileAsync(scene, camera); },
    dispose() { geometry.dispose(); material.dispose(); },
  };
}
