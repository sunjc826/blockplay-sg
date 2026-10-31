import type { FpsHud } from './fps-engine';
import type { FpsDistrict } from './fps-districts';

/** Shared by scenery, progression, map and browser checks. Travel is south, then east to the range. */
export const COURSE_LAYOUT = {
  bounds: { minX: -75, maxX: 75, minZ: -105, maxZ: 105 },
  laneX: -26, laneHalfWidth: 3.5,
  spawnZ: 84, walkZ: 64, sprintZ: 14, sprintRequired: 35,
  hurdleZ: -4, jumpZ: -12,
  crouch: { entryZ: -25, exitZ: -31, clearance: 1.3 }, crouchZ: -38,
  crawl: { entryZ: -49, exitZ: -57, clearance: .8 }, proneZ: -64,
  bendZ: -72, rangeX: 24, firingZ: -76,
} as const;
const layout = COURSE_LAYOUT;
export const TUTORIAL_DISTRICT: FpsDistrict = {
  label: 'Recruit course', setting: 'training compound', spawn: { x: layout.laneX, z: layout.spawnZ, yaw: 0, pitch: -.03 },
  targets: [{ x: layout.rangeX, z: -91 }, { x: layout.rangeX - 3, z: -94 }, { x: layout.rangeX + 3, z: -94 }],
  vehicles: { car: { x: 48, z: 70, yaw: 0 }, helicopter: { x: 48, z: 30, yaw: 0 } }, props: [],
};
export const COURSE_STEPS = [
  { id: 'look', title: 'Get your bearings', detail: 'Look around the yard. The numbered gates mark your route.', desktop: 'Move your mouse to look.', touch: 'Drag the open scene to look.' },
  { id: 'walk', title: 'Leave the assembly yard', detail: 'Follow the lane to the glowing ring at station 01.', desktop: 'WASD moves. W walks forward; A and D step sideways.', touch: 'Drag the left stick to walk. Keep it inside the outer ring.', x: layout.laneX, z: layout.walkZ },
  { id: 'sprint', title: 'The 50-metre straight', detail: 'Sprint at least 35 m along the marked track, then reach station 02. You can turn back to practise more.', desktop: 'Hold Shift while moving forward.', touch: 'Push the left stick all the way to its outer ring.', x: layout.laneX, z: layout.sprintZ },
  { id: 'jump', title: 'Clear the timber hurdle', detail: 'Use the run-up, jump over the striped hurdle and land beyond it. Continue to station 03.', desktop: 'Press Space while moving forward.', touch: 'Tap Jump while moving forward.', x: layout.laneX, z: layout.jumpZ },
  { id: 'crouch', title: 'Through the covered passage', detail: 'Crouch beneath the timber beams, then reach station 04. Stand up once you are clear.', desktop: 'Press C to crouch; press it again to stand. Or hold Ctrl.', touch: 'Tap Crouch, then move under the beams. Tap it again to stand.', x: layout.laneX, z: layout.crouchZ },
  { id: 'prone', title: 'Crawl beneath the mesh', detail: 'Lie down before the low mesh. Crawl all the way through the 8 m lane, then reach station 05. Crouching will not fit.', desktop: 'Press Z to go prone. Crawl with W; press Z again after the exit.', touch: 'Tap Prone, crawl with the left stick, then tap Stand after the exit.', x: layout.laneX, z: layout.proneZ },
  { id: 'aim', title: 'Enter the firing range', detail: 'Get up and follow the arrows to the right, then turn into the firing bay at station 06. Aim at a round target.', desktop: 'Press Q to toggle aim, or hold the right mouse button.', touch: 'Tap Aim to raise your sights.', x: layout.rangeX, z: layout.firingZ },
  { id: 'fire', title: 'Make a hit', detail: 'Hit any round target. Short bursts are easier to control.', desktop: 'Left-click fires. Pull down gently to control recoil.', touch: 'Hold Fire. Slide the same thumb to adjust your aim.' },
  { id: 'reload', title: 'Ready the next magazine', detail: 'Reload after firing. Let the reload animation finish before moving on.', desktop: 'Press R. Firing or sprinting can interrupt a reload.', touch: 'Tap Reload and wait for it to finish.' },
  { id: 'switch', title: 'Try your sidearm', detail: 'Switch to your other carried weapon. The slots match your store loadout.', desktop: 'Press 2 for your second carried weapon.', touch: 'Tap your other weapon in the weapon selector.' },
  { id: 'map', title: 'Find your way', detail: 'Open and close the map. In a district, it helps you find targets, vehicles and contacts.', desktop: 'Press M to expand the map.', touch: 'Tap the Map button below.' },
] as const;
export type CourseStep = typeof COURSE_STEPS[number];
/** Skipping an obstacle puts the player beyond it, at the next lesson's approach. */
export function tutorialCheckpoint(step: number) {
  const previous = COURSE_STEPS[Math.min(step - 1, 6)];
  return previous && 'x' in previous ? { x: previous.x, z: previous.z } : { x: layout.laneX, z: layout.spawnZ };
}
export interface CourseProgress { step: number; yaw: number; pitch: number; jumped: boolean; crouched: boolean; crawlEntered: boolean; crawled: boolean; sprintMetres: number; lastX: number; lastZ: number; reloadStarted: boolean; reloadWeapon: number; weapon: number; mapOpened: boolean }
export const startCourse = (): CourseProgress => ({ step: 0, yaw: 0, pitch: -.03, jumped: false, crouched: false, crawlEntered: false, crawled: false, sprintMetres: 0, lastX: layout.laneX, lastZ: layout.spawnZ, reloadStarted: false, reloadWeapon: 0, weapon: 0, mapOpened: false });
export function advanceCourse(progress: CourseProgress, hud: FpsHud): CourseProgress {
  if (hud.phase !== 'playing' || !hud.tutorial || progress.step >= COURSE_STEPS.length) return progress;
  const step = COURSE_STEPS[progress.step], motion = hud.tutorial;
  const near = 'x' in step && Math.hypot(hud.x - step.x, hud.z - step.z) < 1.8;
  const next = { ...progress, lastX: hud.x, lastZ: hud.z };
  const inLane = Math.abs(hud.x - layout.laneX) < layout.laneHalfWidth - .38;
  // Count actual forward sprint travel inside the track, never a single endpoint tap or a teleport.
  const travel = progress.lastZ - hud.z;
  if (step.id === 'sprint' && inLane && Math.abs(progress.lastX - layout.laneX) < layout.laneHalfWidth && motion.sprinting && motion.grounded && hud.z <= layout.walkZ && progress.lastZ >= layout.sprintZ && travel > 0 && travel < 5) {
    next.sprintMetres += Math.max(0, Math.min(progress.lastZ, layout.walkZ) - Math.max(hud.z, layout.sprintZ));
  }
  if (step.id === 'jump' && inLane && motion.feet > .4 && Math.abs(hud.z - layout.hurdleZ) < 3) next.jumped = true;
  if (step.id === 'crouch' && inLane && motion.stance === 'crouch' && hud.z < layout.crouch.entryZ && hud.z > layout.crouch.exitZ) next.crouched = true;
  if (step.id === 'prone') {
    // The engine keeps the body low under a roof even if pause cleared the stance toggle.
    const low = inLane && motion.stance === 'prone' && motion.grounded;
    if (!low && hud.z > layout.crawl.exitZ) next.crawlEntered = false;
    if (low && hud.z <= layout.crawl.entryZ && hud.z >= layout.crawl.entryZ - 1.5) next.crawlEntered = true;
    if (inLane && motion.grounded && next.crawlEntered && hud.z <= layout.crawl.exitZ - .5) next.crawled = true;
  }
  if (step.id === 'reload' && hud.reloading > 0) { next.reloadStarted = true; next.reloadWeapon = hud.weapon; }
  if (step.id === 'map' && hud.mapExpanded) next.mapOpened = true;
  const done = step.id === 'look' ? Math.hypot(Math.atan2(Math.sin(hud.yaw - progress.yaw), Math.cos(hud.yaw - progress.yaw)), hud.pitch - progress.pitch) > .25
    : step.id === 'walk' ? near
    : step.id === 'sprint' ? near && next.sprintMetres >= layout.sprintRequired
    : step.id === 'jump' ? near && next.jumped && motion.grounded
    : step.id === 'crouch' ? near && next.crouched
    : step.id === 'prone' ? near && next.crawled
    : step.id === 'aim' ? near && !hud.prone && hud.aiming
    : step.id === 'fire' ? hud.landed > 0
    : step.id === 'reload' ? next.reloadStarted && hud.weapon === next.reloadWeapon && hud.reloading === 0 && hud.reloadSaved === 0 && hud.magazine > 1
    : step.id === 'switch' ? hud.weapon !== progress.weapon
    : next.mapOpened && !hud.mapExpanded;
  if (done) { next.step++; next.weapon = hud.weapon; }
  return next;
}
