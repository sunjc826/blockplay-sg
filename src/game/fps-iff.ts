import * as THREE from 'three';
import { visiblePilotContacts, type PilotSubject } from './fps-pilot-perception';

/**
 * The friend-or-foe overlay of IFF goggles (vision-devices holds the devices).
 * Whoever the reader can see gets a box round their body: red for hostile,
 * green for friendly, white for neutral (proxies not after you, people in the
 * street). It reads what is in sight, so walls, vehicles and smoke still hide
 * people; sight is checked a few times a second, and the boxes follow the
 * bodies every frame in between.
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
/** A box on screen in normalised device coordinates, -1 to 1 each way. */
export interface IffBox { id: string; side: IffSide; x0: number; y0: number; x1: number; y1: number; distance: number }

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

const corner = new THREE.Vector3(), box = new THREE.Box3();
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
    update(dt: number, camera: THREE.PerspectiveCamera, scene: THREE.Scene, subjects: readonly IffSubject[], range: number): IffBox[] {
      clock += dt;
      if (clock >= IFF_SCAN_SECONDS) {
        clock = 0;
        const near = subjects.filter(s => s.points.length && s.points[0].distanceTo(camera.position) <= range);
        const pilot: PilotSubject[] = near.map(s => ({ id: s.id, root: s.root, points: s.points, radius: .3 }));
        seen = new Map((pilot.length ? visiblePilotContacts(camera, scene, pilot) : []).filter(c => c.distance <= range).map(c => [c.id, c.distance]));
      }
      const boxes: IffBox[] = [];
      for (const subject of subjects) {
        const distance = seen.get(subject.id);
        if (distance === undefined) continue;
        const shown = projectBox(subject.bounds(box), camera, .035);
        if (shown) boxes.push({ id: subject.id, side: subject.side, distance, ...shown });
      }
      return boxes;
    },
    reset() { seen.clear(); clock = IFF_SCAN_SECONDS; },
  };
}

const MAX_BOXES = 48;
/** Two strokes per edge, a dark one under the colour, so a white box still reads on a pale wall. */
const STROKES = 2, VERTICES_PER_BOX = STROKES * 4 * 6;
const OVERLAY_VERTEX = /* glsl */`
attribute vec4 colour;
varying vec4 vColour;
void main() { vColour = colour; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const OVERLAY_FRAGMENT = /* glsl */`
varying vec4 vColour;
uniform vec2 uResolution;
uniform float uAperture;
uniform float uOpacity;
void main() {
  // Inside a tube the reader is injected into the image, so it ends at the image circle.
  float r = length(gl_FragCoord.xy - 0.5 * uResolution) / (0.5 * max(uResolution.x, uResolution.y));
  if (r > uAperture) discard;
  gl_FragColor = vec4(vColour.rgb, vColour.a * uOpacity);
}`;

/** Draws boxes straight onto the canvas, over the world, the weapon and any tube picture. */
export function createIffOverlay() {
  const positions = new Float32Array(MAX_BOXES * VERTICES_PER_BOX * 3), colours = new Float32Array(MAX_BOXES * VERTICES_PER_BOX * 4);
  const geometry = new THREE.BufferGeometry();
  const position = new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage), colour = new THREE.BufferAttribute(colours, 4).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', position); geometry.setAttribute('colour', colour); geometry.setDrawRange(0, 0);
  const material = new THREE.ShaderMaterial({ vertexShader: OVERLAY_VERTEX, fragmentShader: OVERLAY_FRAGMENT, transparent: true, depthTest: false, depthWrite: false, toneMapped: false,
    uniforms: { uResolution: { value: new THREE.Vector2(1, 1) }, uAperture: { value: 9 }, uOpacity: { value: 1 } } });
  const mesh = new THREE.Mesh(geometry, material); mesh.frustumCulled = false;
  const scene = new THREE.Scene(); scene.add(mesh);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), size = new THREE.Vector2();
  // The canvas is sRGB and this pass writes it directly, so colours go in as written.
  const palette = Object.fromEntries(Object.entries(IFF_COLOURS).map(([side, hex]) => [side, new THREE.Color(hex).convertLinearToSRGB()])) as Record<IffSide, THREE.Color>;
  let count = 0;
  const quad = (ax: number, ay: number, bx: number, by: number, r: number, g: number, b: number, a: number) => {
    const at = count * 3, tint = count * 4;
    positions.set([ax, ay, 0, bx, ay, 0, bx, by, 0, ax, ay, 0, bx, by, 0, ax, by, 0], at);
    for (let i = 0; i < 6; i++) colours.set([r, g, b, a], tint + i * 4);
    count += 6;
  };
  return {
    /** `aperture` is the image circle the boxes stay inside (9 for none); `opacity` fades the whole overlay. */
    draw(renderer: THREE.WebGLRenderer, boxes: readonly IffBox[], aperture: number, opacity: number) {
      if (!boxes.length || opacity <= 0) return;
      renderer.getDrawingBufferSize(size);
      // Two device pixels wide at 1x, a little more on dense screens, and a pixel either side for the shadow.
      const line = Math.max(2, 1.5 * renderer.getPixelRatio()), shadow = line + 2;
      count = 0;
      for (const b of boxes.slice(0, MAX_BOXES)) {
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
      position.needsUpdate = colour.needsUpdate = true;
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
