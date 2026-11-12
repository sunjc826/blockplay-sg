import type { MovementMotion } from './fps-movement';
import type { WeaponSpec } from './fps-rules';

type Pose = readonly [x: number, y: number, z: number, pitch: number, yaw: number, roll: number];
interface RunCarry { pose: Pose; sway: Pose; mass: number }
const rifleSway: Pose = [.024, .014, .010, .025, .030, .040];
const supportSway: Pose = [.016, .011, .008, .018, .020, .025];
// Camera-space metres/radians. Local -Z is the muzzle: positive yaw turns it
// left across the chest, and positive roll brings the receiver top inward.
// Keep the firing and support hands attached to the same rig throughout.
const carries: Readonly<Record<string, RunCarry>> = {
  // Short bullpups tuck close; longer rifles lie diagonally across the chest.
  'sar21-inspired': { pose: [-.035, -.065, .075, -.16, .42, .32], sway: rifleSway, mass: 3.8 },
  'cc-gatekeeper': { pose: [-.045, -.070, .080, -.14, .46, .35], sway: rifleSway, mass: 3.5 },
  'xm8-inspired': { pose: [-.032, -.080, .065, -.20, .35, .27], sway: [.028, .016, .012, .030, .035, .045], mass: 3.4 },
  'g36-inspired': { pose: [-.045, -.075, .055, -.18, .48, .34], sway: rifleSway, mass: 3.6 },
  'ff-scar-l': { pose: [-.040, -.070, .060, -.17, .44, .30], sway: rifleSway, mass: 3.6 },
  'ff-scar-h': { pose: [-.050, -.090, .050, -.19, .48, .28], sway: [.020, .013, .009, .022, .026, .034], mass: 4.2 },
  'cc-network': { pose: [-.040, -.075, .060, -.18, .45, .33], sway: rifleSway, mass: 3.4 },
  // Precision barrels stay flatter; the long sniper has a restrained cradle.
  'ff-longwatch': { pose: [-.055, -.095, .035, -.12, .52, .25], sway: [.018, .012, .008, .018, .022, .028], mass: 5.2 },
  'ff-intervention': { pose: [-.060, -.115, .020, -.10, .58, .22], sway: [.012, .009, .006, .013, .015, .020], mass: 12 },
  // Bulky top-mounted electronics and launchers need a lower, flatter carry.
  'ff-oicw': { pose: [-.035, -.115, .045, -.13, .38, .22], sway: supportSway, mass: 6.8 },
  'cc-qts11': { pose: [-.040, -.100, .055, -.15, .41, .26], sway: [.019, .012, .009, .022, .025, .032], mass: 5.6 },
  // Support weapons sit low with room for the drum/box and less wrist motion.
  'ultimax-inspired': { pose: [-.025, -.120, .035, -.18, .38, .20], sway: [.020, .014, .010, .023, .026, .032], mass: 5 },
  'mg4-inspired': { pose: [-.035, -.130, .025, -.16, .40, .18], sway: supportSway, mass: 8.2 },
  'mag-inspired': { pose: [-.045, -.145, .015, -.12, .46, .16], sway: [.013, .010, .007, .015, .018, .022], mass: 11.8 },
  'cis50-inspired': { pose: [-.020, -.175, -.015, -.08, .25, .10], sway: [.009, .008, .005, .010, .012, .015], mass: 30 },
  // Pistol stays close to the right side in a compact, muzzle-down tuck.
  'p30-inspired': { pose: [.015, -.115, .120, -.42, .16, .12], sway: [.032, .022, .015, .050, .040, .055], mass: .8 },
};

/** Footfall-driven running carry. The body's damped sprint weight eases both
 * entry and exit; ADS removes it, and reduced motion retains only the pose. */
export function runningWeaponMotion(state: MovementMotion, weapon: Pick<WeaponSpec, 'id' | 'weightKg'>, aim = 0, reduced = false) {
  // Integral firing modes share a physical gun, including its mass (mode mass
  // is deliberately zero in the equipment rules to avoid double counting).
  const physicalId = weapon.id.replace(/-launcher$/, '');
  const carry = carries[physicalId] ?? carries['g36-inspired'];
  const mass = physicalId !== weapon.id ? carry.mass : weapon.weightKg ?? carry.mass;
  const run = state.sprint * (1 - Math.max(0, Math.min(1, aim)));
  const swing = run * state.gaitWeight * (reduced ? 0 : 1) * Math.max(.55, Math.min(1, 1 - mass * .018));
  const side = Math.sin(state.gait), step = Math.cos(state.gait * 2);
  // Fore/aft weight trails the footfall a little instead of moving every axis
  // together. All oscillation is continuous at the two-footfall cycle boundary.
  const trail = Math.cos(state.gait * 2 - .45);
  const [x, y, z, pitch, yaw, roll] = carry.pose, sway = carry.sway;
  return { x: run * x + side * sway[0] * swing,
    y: run * y + step * sway[1] * swing,
    z: run * z + trail * sway[2] * swing,
    pitch: run * pitch + trail * sway[3] * swing,
    yaw: run * yaw + side * sway[4] * swing,
    roll: run * roll + side * sway[5] * swing };
}
