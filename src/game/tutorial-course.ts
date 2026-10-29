import type { FpsHud } from './fps-engine';
import type { FpsDistrict } from './fps-districts';

export const TUTORIAL_DISTRICT: FpsDistrict = {
  label: 'Recruit course', setting: 'training yard', spawn: { x: 0, z: 28, yaw: 0, pitch: -.03 },
  targets: [{ x: 0, z: -24 }, { x: -2, z: -26 }, { x: 2, z: -26 }],
  vehicles: { car: { x: -17, z: 22, yaw: 0 }, helicopter: { x: 20, z: 12, yaw: 0 } }, props: [],
};
export const COURSE_STEPS = [
  { id: 'look', title: 'Get your bearings', detail: 'Look around the yard. The numbered gates mark your route.', desktop: 'Move your mouse to look.', touch: 'Drag the open scene to look.' },
  { id: 'walk', title: 'Through the first gate', detail: 'Walk into the glowing ring at gate 01.', desktop: 'WASD moves. W walks forward; A and D step sideways.', touch: 'Drag the left stick to walk. Keep it inside the outer ring.', x: 0, z: 22 },
  { id: 'sprint', title: 'Pick up the pace', detail: 'Sprint into the ring at gate 02.', desktop: 'Hold Shift while moving forward.', touch: 'Push the left stick all the way to its outer ring.', x: 0, z: 12 },
  { id: 'jump', title: 'Over the hurdle', detail: 'Jump over the orange hurdle, then reach gate 03.', desktop: 'Press Space while moving forward.', touch: 'Tap Jump while moving forward.', x: 0, z: 3 },
  { id: 'crouch', title: 'Under the beam', detail: 'Crouch through the low tunnel to gate 04.', desktop: 'Press C to crouch; press it again to stand. Or hold Ctrl.', touch: 'Tap Crouch, then move under the beam. Tap it again to stand.', x: 0, z: -5 },
  { id: 'prone', title: 'Make yourself small', detail: 'Go prone in the ring at gate 05. A lower stance steadies your weapon.', desktop: 'Press Z to go prone. Press Z again to get up.', touch: 'Tap Prone to lie down; tap it again to get up.', x: 0, z: -10 },
  { id: 'aim', title: 'Line up the sights', detail: 'Get up, reach the firing line and aim at a round target.', desktop: 'Press Q to toggle aim, or hold the right mouse button.', touch: 'Tap Aim to raise your sights.', x: 0, z: -15 },
  { id: 'fire', title: 'Make a hit', detail: 'Hit any round target. Short bursts are easier to control.', desktop: 'Left-click fires. Pull down gently to control recoil.', touch: 'Hold Fire. Slide the same thumb to adjust your aim.' },
  { id: 'reload', title: 'Ready the next magazine', detail: 'Reload after firing. Let the reload animation finish before moving on.', desktop: 'Press R. Firing or sprinting can interrupt a reload.', touch: 'Tap Reload and wait for it to finish.' },
  { id: 'switch', title: 'Try your sidearm', detail: 'Switch to your other carried weapon. The slots match your store loadout.', desktop: 'Press 2 for your second carried weapon.', touch: 'Tap your other weapon in the weapon selector.' },
  { id: 'map', title: 'Find your way', detail: 'Open and close the map. In a district, it helps you find targets, vehicles and contacts.', desktop: 'Press M to expand the map.', touch: 'Tap the Map button below.' },
] as const;
export type CourseStep = typeof COURSE_STEPS[number];
export interface CourseProgress { step: number; yaw: number; pitch: number; jumped: boolean; crouched: boolean; reloadStarted: boolean; reloadWeapon: number; weapon: number; mapOpened: boolean }
export const startCourse = (): CourseProgress => ({ step: 0, yaw: 0, pitch: -.03, jumped: false, crouched: false, reloadStarted: false, reloadWeapon: 0, weapon: 0, mapOpened: false });
export function advanceCourse(progress: CourseProgress, hud: FpsHud): CourseProgress {
  if (hud.phase !== 'playing' || !hud.tutorial || progress.step >= COURSE_STEPS.length) return progress;
  const step = COURSE_STEPS[progress.step], motion = hud.tutorial;
  const near = 'x' in step && Math.hypot(hud.x - step.x, hud.z - step.z) < 1.8;
  const next = { ...progress };
  if (step.id === 'jump' && motion.feet > .4 && hud.z > 4 && hud.z < 10) next.jumped = true;
  if (step.id === 'crouch' && motion.stance === 'crouch' && hud.z > -4 && hud.z < 2) next.crouched = true;
  if (step.id === 'reload' && hud.reloading > 0) { next.reloadStarted = true; next.reloadWeapon = hud.weapon; }
  if (step.id === 'map' && hud.mapExpanded) next.mapOpened = true;
  const done = step.id === 'look' ? Math.hypot(Math.atan2(Math.sin(hud.yaw - progress.yaw), Math.cos(hud.yaw - progress.yaw)), hud.pitch - progress.pitch) > .25
    : step.id === 'walk' ? near
    : step.id === 'sprint' ? near && motion.sprinting
    : step.id === 'jump' ? near && next.jumped && motion.grounded
    : step.id === 'crouch' ? near && next.crouched
    : step.id === 'prone' ? near && hud.prone
    : step.id === 'aim' ? near && !hud.prone && hud.aiming
    : step.id === 'fire' ? hud.landed > 0
    : step.id === 'reload' ? next.reloadStarted && hud.weapon === next.reloadWeapon && hud.reloading === 0 && hud.reloadSaved === 0 && hud.magazine > 1
    : step.id === 'switch' ? hud.weapon !== progress.weapon
    : next.mapOpened && !hud.mapExpanded;
  if (done) { next.step++; next.weapon = hud.weapon; }
  return next;
}
