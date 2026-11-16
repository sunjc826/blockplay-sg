import * as THREE from 'three';
import { createViewmodelHand } from './fps-viewmodel-hand';

/** One breaststroke, reach to reach. The stroke sound plays once per cycle, as the pull begins. */
export const SWIM_STROKE_SECONDS = 1.25;
/** The fraction of a stroke at which the glide ends and the hands start to pull. */
export const SWIM_PULL_AT = .26;
const PULL_END = .64, MOVING = .2;

export interface SwimState {
  /** 0..1 through the stroke: glide, pull out and back, in under the chin, shoot forward. */
  phase: number;
  /** 0 treading water, 1 swimming a stroke. */
  stroke: number;
  /** 0 hands away, 1 hands in the water in front. */
  afloat: number;
  /** Seconds of treading, for the scull. */
  tread: number;
}
export const createSwim = (): SwimState => ({ phase: 0, stroke: 0, afloat: 0, tread: 0 });
const damp = (from: number, to: number, rate: number, dt: number) => to + (from - to) * Math.exp(-rate * dt);

/**
 * Steps the stroke. `hands` is whether the hands are free to swim with (not holding a sidearm).
 * Returns true on the step a pull begins, which is when the water is heard.
 */
export function advanceSwim(state: SwimState, swimming: boolean, hands: boolean, speed: number, dt: number) {
  if (!swimming) { state.afloat = damp(state.afloat, 0, 12, dt); state.stroke = damp(state.stroke, 0, 8, dt); state.phase = 0; return false; }
  const moving = speed > MOVING;
  state.afloat = damp(state.afloat, hands ? 1 : 0, hands ? 7 : 12, dt);
  state.stroke = damp(state.stroke, moving ? 1 : 0, moving ? 7 : 3.5, dt);
  state.tread += dt;
  // A stroke that has begun is finished, then the hands stay out in front until the next.
  if (!moving && state.phase === 0) return false;
  const before = state.phase;
  state.phase += dt / SWIM_STROKE_SECONDS;
  if (state.phase >= 1) state.phase = moving ? state.phase % 1 : 0;
  return moving && before < SWIM_PULL_AT && state.phase >= SWIM_PULL_AT;
}

/** What the head does: it comes up out of the water on each pull, and rides the swell while treading. */
export function swimMotion(state: SwimState) {
  const pull = Math.min(1, Math.max(0, (state.phase - SWIM_PULL_AT) / (PULL_END - SWIM_PULL_AT + .12)));
  const lift = Math.sin(Math.PI * pull) ** 2 * state.stroke, idle = 1 - state.stroke;
  return {
    bob: lift * .05 - state.stroke * .012 + idle * Math.sin(state.tread * 2.4) * .018,
    pitch: lift * .03,
    roll: idle * Math.sin(state.tread * 1.2) * .008,
  };
}

/** The right hand through one stroke, in view space: where it is, and how far it is turned out, tipped up and rolled palm-outward. */
interface Key { t: number; x: number; y: number; z: number; yaw: number; pitch: number; roll: number; grip: number }
const STROKE: Key[] = [
  { t: 0, x: .045, y: -.18, z: -.54, yaw: -.12, pitch: .34, roll: .1, grip: .06 },
  { t: SWIM_PULL_AT, x: .06, y: -.18, z: -.53, yaw: 0, pitch: .3, roll: .3, grip: .06 },
  { t: .42, x: .25, y: -.18, z: -.5, yaw: .7, pitch: .25, roll: .9, grip: .12 },
  { t: .55, x: .34, y: -.2, z: -.4, yaw: .95, pitch: 0, roll: 1.05, grip: .16 },
  { t: PULL_END, x: .27, y: -.24, z: -.34, yaw: .4, pitch: -.2, roll: .5, grip: .2 },
  { t: .76, x: .08, y: -.27, z: -.34, yaw: -.5, pitch: .2, roll: -.45, grip: .22 },
  { t: .9, x: .04, y: -.22, z: -.44, yaw: -.3, pitch: .36, roll: -.2, grip: .12 },
];
const FIELDS = ['x', 'y', 'z', 'yaw', 'pitch', 'roll', 'grip'] as const;
type Pose = Record<typeof FIELDS[number], number>;
/** A smooth curve through the keys, round the loop. */
function strokePose(phase: number, into: Pose) {
  const n = STROKE.length, p = ((phase % 1) + 1) % 1;
  let i = n - 1; while (i > 0 && STROKE[i].t > p) i--;
  const at = (k: number) => STROKE[((k % n) + n) % n], time = (k: number) => at(k).t + Math.floor(k / n);
  const t0 = time(i), t1 = time(i + 1), span = t1 - t0, u = (p - t0) / span;
  const u2 = u * u, u3 = u2 * u;
  for (const f of FIELDS) {
    const a = at(i)[f], b = at(i + 1)[f];
    const ma = (b - at(i - 1)[f]) / (t1 - time(i - 1)) * span, mb = (at(i + 2)[f] - a) / (time(i + 2) - t0) * span;
    into[f] = (2 * u3 - 3 * u2 + 1) * a + (u3 - 2 * u2 + u) * ma + (-2 * u3 + 3 * u2) * b + (u3 - u2) * mb;
  }
  return into;
}
/** Sculling: the hands sweep out and in under the surface, each leading with its edge. */
function treadPose(time: number, into: Pose) {
  const w = time * 5.2, out = Math.sin(w);
  into.x = .2 + out * .07; into.y = -.2 + Math.cos(w * 2) * .008; into.z = -.45 - Math.cos(w) * .02;
  into.yaw = .25 + out * .12; into.pitch = .3; into.roll = Math.cos(w) * .42; into.grip = .1;
  return into;
}

const DOWN = new THREE.Vector3(0, -1, 0), X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0);
/** Fingers forward and palm down, for a hand built fingers up and palm towards the eye's front. */
const FLAT = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 1, 0)));

/**
 * The hands that swim: free hands in the viewmodel scene, doing a breaststroke while
 * the body moves and sculling while it treads water. Procedural, like the climbing hands.
 */
export function createSwimHands(parent: THREE.Object3D) {
  const root = new THREE.Group(); root.name = 'fps-swim'; root.visible = false; parent.add(root);
  const geometries: THREE.BufferGeometry[] = [], materials: THREE.Material[] = [];
  const material = (color: string) => { const m = new THREE.MeshStandardMaterial({ color, roughness: .8 }); materials.push(m); return m; };
  const kit = { glove: material('#474b39'), pad: material('#202722'), sleeve: material('#626a50'),
    mesh(into: THREE.Object3D, geometry: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) {
      geometries.push(geometry); const object = new THREE.Mesh(geometry, m); object.position.set(x, y, z); into.add(object); return object;
    } };
  const hands = [-1, 1].map(side => ({ side, ...createViewmodelHand(side < 0, kit) }));
  hands.forEach(hand => root.add(hand.group));
  const stroke = {} as Pose, tread = {} as Pose, turn = new THREE.Quaternion(), inverse = new THREE.Quaternion(), toShoulder = new THREE.Vector3();
  return {
    root,
    /** Poses the hands for this frame, or puts them away for `null`. A narrow view (`aspect`) brings them in to stay on screen. */
    update(state: SwimState | null, aspect = 16 / 9) {
      if (!state || state.afloat < .01) { root.visible = false; return; }
      root.visible = true;
      strokePose(state.phase, stroke); treadPose(state.tread, tread);
      const k = state.stroke, squeeze = Math.min(1, Math.max(.45, aspect / 1.5)), mix = (f: typeof FIELDS[number]) => tread[f] + (stroke[f] - tread[f]) * k;
      for (const { side, group, arm, setGrip } of hands) {
        // They come up from under the chest as the body settles into the water.
        group.position.set(side * mix('x') * squeeze, mix('y') - (1 - state.afloat) * .3, mix('z') + (1 - state.afloat) * .12);
        group.quaternion.setFromAxisAngle(Y, -side * mix('yaw')).multiply(turn.setFromAxisAngle(X, mix('pitch'))).multiply(FLAT)
          .multiply(turn.setFromAxisAngle(Y, -side * mix('roll')));
        setGrip(mix('grip'));
        // The sleeve runs back to the shoulder, which is level with the eye in the water.
        toShoulder.set(side * .21, -.24, .12).sub(group.position).applyQuaternion(inverse.copy(group.quaternion).invert());
        toShoulder.y = Math.min(toShoulder.y, -.04);
        arm.quaternion.setFromUnitVectors(DOWN, toShoulder.normalize());
      }
    },
    dispose() { root.removeFromParent(); geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); },
  };
}
