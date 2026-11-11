import { mix, pointIn, pose, supplyMotion, type SupplyMotion, type SupplyStyle } from './fps-healing';
import { smoothStep } from './fps-weapon-motion';

const ramp = (p: number, a: number, b: number) => smoothStep((p - a) / (b - a));
export interface UtilityMotion extends SupplyMotion {
  open: number;
  treatment: number;
  unwrap: number;
  transfer: number;
}
/** Rigid props and hand contact derived from one clock, including reverse seeks and replay. */
export function utilityMotion(style: SupplyStyle, progress: number, id: string): UtilityMotion {
  const p = Math.max(0, Math.min(1, progress));
  const base = supplyMotion(style, p);
  const present = ramp(p, 0, .16) * (1 - ramp(p, .9, 1));
  const hidden = pose(.16, -.65, -.42), hiddenLeft = pose(-.16, -.65, -.42);
  let right = base.right, left = base.left, item = base.item;
  let open = 0, treatment = 0, unwrap = 0, transfer = 0;
  if (style === 'bandage') {
    const dressing = id === 'kit-dressing';
    unwrap = ramp(p, .15, .28);
    const winding = ramp(p, .29, .79), angle = winding * Math.PI * 2 * 3;
    left = pose(-.055, -.12, -.53, -.2, .2, -.85);
    // The wrap runs around the forearm in its own coordinate system.
    const around = pointIn(left, { x: Math.cos(angle) * .07, y: -.105 - winding * .015, z: .01 + Math.sin(angle) * .065 });
    const turn = pose(around.x, around.y, around.z, -.2, .2, -.85);
    const press = { ...pointIn(left, { x: .025, y: -.13, z: .055 }), rx: -.2, ry: .2, rz: -.85 };
    right = mix(pose(.07 + unwrap * .06, -.16, -.42, -.2, .2, -.4), turn, ramp(p, .26, .31));
    right = mix(right, press, ramp(p, .79, .84));
    item = { ...pointIn(right, { x: 0, y: .055, z: -.025 }), rx: right.rx, ry: right.ry, rz: right.rz };
    treatment = winding;
    return { ...base, right: mix(hidden, right, present), left: mix(hiddenLeft, left, present), item: mix(hidden, item, present),
      rightGrip: p > .8 ? .15 : .6, leftGrip: .15, remaining: 1, action: winding, open, unwrap, treatment, transfer,
      view: { pitch: -.009 * ramp(p, .79, .84) * (1 - ramp(p, .85, .93)), roll: dressing ? -.005 * present : 0 } };
  }
  if (style === 'medkit') {
    open = ramp(p, .16, .29) * (1 - ramp(p, .83, .91));
    treatment = ramp(p, .55, .62) * (1 - ramp(p, .8, .84));
    left = pose(-.035, -.075, -.57, -.2, .2, -.7);
    item = { ...pointIn(left, { x: 0, y: .055, z: -.025 }), rx: .15, ry: -.15, rz: -.1 };
    const turn = pose(0, 0, 0, -.15, .1, -.3);
    const contact = pointIn(left, { x: 0, y: -.125, z: .055 });
    const tip = pointIn(turn, { x: 0, y: .045, z: -.11 });
    const atArm = { ...turn, x: contact.x - tip.x, y: contact.y - tip.y, z: contact.z - tip.z + (id === 'kit-first-aid' ? .055 : 0) };
    const atPouch = { ...pointIn(item, { x: .025, y: -.025, z: .055 }), rx: -.3, ry: 0, rz: -.2 };
    right = mix(pose(.12, -.24, -.43), atPouch, ramp(p, .23, .36));
    right = mix(right, atArm, ramp(p, .38, .53) * (1 - ramp(p, .81, .9)));
    right = mix(hidden, right, present); left = mix(hiddenLeft, left, present); item = mix(hiddenLeft, item, present);
  }
  if (style === 'ammo') {
    open = ramp(p, .15, .27) * (1 - ramp(p, .8, .9));
    transfer = ramp(p, .37, .72);
    left = pose(-.13, -.21, -.48, -.15, .2, -.12);
    item = { ...pointIn(left, { x: 0, y: .055, z: -.025 }), rx: -.1, ry: .1, rz: -.1 };
    const take = pose(-.095, -.16, -.43, -.1, .1, -.2), lifted = pose(.035, -.1, -.44, -.15, .1, -.2);
    right = mix(pose(.14, -.25, -.45), take, ramp(p, .2, .32));
    right = mix(right, lifted, ramp(p, .34, .46));
    right = mix(right, pose(.16, -.38, -.29, -.3, .3, .2), ramp(p, .48, .72));
    right = mix(hidden, right, present); left = mix(hiddenLeft, left, present); item = mix(hiddenLeft, item, present);
  }
  return { ...base, right, left, item, remaining: style === 'plates' ? base.remaining : 1, open, treatment, unwrap, transfer };
}
