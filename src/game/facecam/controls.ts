import type { PilotAction } from '../fps-pilot';

export type Persona = 'pro' | 'rager' | 'comic-streamer';
export const clamp = (n: number, low = 0, high = 1) => Math.max(low, Math.min(n, high));
// Player coordinates: +x is the streamer's right, +z is away from the chair.
const feel = { pro: [0.0017, 12], rager: [0.001, 32], 'comic-streamer': [0.00125, 7] };
export const pad = { x: 0.245, z: 0.145 };
export class DeskInput {
  x = 0;
  z = 0;
  lift = 0;
  targetX = 0;
  targetZ = 0;
  held: PilotAction = {};
  private resetTime = -1;
  private originX = 0;
  private originZ = 0;
  private clickTime = 0;
  private stale = 0;
  constructor(readonly persona: Persona) {}
  pilot(action: PilotAction, handsBusy: boolean) {
    this.stale = 0.24;
    this.held = action;
    if (handsBusy || this.resetTime >= 0) return;
    const scale = feel[this.persona][0];
    const dx = this.targetX + (action.lookX ?? 0) * scale,
      dz = this.targetZ - (action.lookY ?? 0) * scale;
    this.targetX = clamp(dx, -pad.x, pad.x);
    this.targetZ = clamp(dz, -pad.z, pad.z);
    if (dx !== this.targetX || dz !== this.targetZ) {
      this.originX = this.targetX;
      this.originZ = this.targetZ;
      this.resetTime = 0;
    }
  }
  menu(x: number, z: number) {
    if (this.resetTime >= 0) return;
    this.targetX = (clamp(x) * 2 - 1) * pad.x;
    this.targetZ = (1 - clamp(z) * 2) * pad.z;
  }
  click() {
    this.clickTime = 0.16;
  }
  get fire() {
    return !!this.held.fire || this.clickTime > 0;
  }
  tick(dt: number, busy: boolean) {
    this.stale -= dt;
    if (this.stale <= 0) this.held = {};
    this.clickTime = Math.max(0, this.clickTime - dt);
    if (busy) return;
    if (this.resetTime >= 0) {
      this.resetTime += dt;
      const t = clamp((this.resetTime - 0.08) / 0.32);
      this.lift = 0.095 * Math.sin(Math.PI * t);
      this.targetX = this.originX * (1 - t);
      this.targetZ = this.originZ * (1 - t);
      if (t === 1) this.resetTime = -1;
    }
    const k = 1 - Math.exp(-dt * feel[this.persona][1]);
    this.x += (this.targetX - this.x) * k;
    this.z += (this.targetZ - this.z) * k;
  }
}

// Four fingers plus thumb, from little finger to thumb. Coordinates are in keyboard space.
export const keyboardKeys = {
  shift: [0.272, -0.106],
  c: [-0.0455, -0.106],
  a: [0.1365, -0.06],
  s: [0.0455, -0.06],
  w: [0.0455, 0.021],
  d: [-0.0455, -0.06],
  r: [-0.1365, 0.021],
  f: [-0.1365, -0.06],
  space: [0, -0.13],
  one: [0.1365, 0.102],
  two: [0.0455, 0.102],
  three: [-0.0455, 0.102],
} as const;
export function keyFingers(a: PilotAction) {
  const keys = keyboardKeys;
  const number = a.weapon === undefined ? null : [keys.one, keys.two, keys.three][Math.min(a.weapon, 2)];
  return [
    { at: keys.shift, down: !!a.sprint },
    { at: keys.a, down: !!a.left },
    { at: a.backward ? keys.s : keys.w, down: !!(a.forward || a.backward) },
    {
      at: number ?? (a.reload ? keys.r : a.useSupply ? keys.f : a.crouch ? keys.c : keys.d),
      down: !!(number || a.reload || a.useSupply || a.crouch || a.right),
    },
    { at: keys.space, down: !!a.jump },
  ];
}
export function mouthOpening(level: number | undefined, caption: boolean, time: number) {
  if (level !== undefined) return clamp(level * 4.8);
  return caption ? clamp(0.39 + 0.29 * Math.sin(time * 19) + 0.25 * Math.sin(time * 31.7)) : 0;
}
