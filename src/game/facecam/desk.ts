import type { Persona } from './controls';

export interface Body {
  id: string;
  shape: 'box' | 'cylinder';
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
  vx: number;
  vy: number;
  vz: number;
  angle: number;
  spin: number;
  mass: number;
  sleep: boolean;
  rest: number;
}
export const deskTop = { left: -1.65, right: 1.65, near: -0.23, far: 1.13, floor: -1.22 };
export const keyboardHome = { x: 0.45, z: 0.42 };
export const BODY_LIMIT = 32;
const step = 1 / 120;
function extent(b: Body) {
  const c = Math.abs(Math.cos(b.angle)),
    s = Math.abs(Math.sin(b.angle));
  return { x: (b.w * c + b.h * s) / 2, y: (b.h * c + b.w * s) / 2 };
}
export class Desk {
  bodies: Body[] = [];
  detached = 0;
  impacts = 0;
  headsetThrown = false;
  private remainder = 0;
  constructor(readonly persona: Persona, private seed = 27) {
    this.add('keyboard', 'box', keyboardHome.x, keyboardHome.z, 0.64, 0.065, 0.31, 1.6);
    this.add('monitor', 'box', -1.33, 0.88, 0.4, 0.86, 0.34, 4);
    if (persona === 'rager') {
      this.add('noodles', 'cylinder', 1.13, 0.54, 0.29, 0.32, 0.29, 0.36);
      this.add('bag', 'box', 1.39, 0.13, 0.21, 0.3, 0.18, 0.46);
      this.add('tissues', 'box', 0.98, 0.91, 0.3, 0.08, 0.17, 0.16);
      this.add('scrap', 'box', -0.06, 0.91, 0.1, 0.09, 0.1, 0.06);
      this.add('scrap2', 'box', -0.23, 0.78, 0.09, 0.08, 0.08, 0.06);
      this.add('phone', 'box', -0.93, 0.78, 0.18, 0.031, 0.31, 0.28);
    }
    if (persona === 'comic-streamer') {
      this.add('mug', 'cylinder', -0.84, 0.47, 0.24, 0.24, 0.24, 0.6);
      this.add('tin', 'cylinder', 1.12, 0.63, 0.35, 0.17, 0.35, 0.6);
    } else this.add('can', 'cylinder', -1.07, 0.26, 0.18, 0.34, 0.18, 0.48);
  }
  private rand() {
    this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }
  add(id: string, shape: Body['shape'], x: number, z: number, w: number, h: number, d: number, mass: number) {
    if (this.bodies.length >= BODY_LIMIT) return;
    const b: Body = {
      id,
      shape,
      x,
      y: h / 2,
      z,
      w,
      h,
      d,
      mass,
      vx: 0,
      vy: 0,
      vz: 0,
      angle: 0,
      spin: 0,
      sleep: true,
      rest: 0,
    };
    this.bodies.push(b);
    return b;
  }
  get(id: string) {
    return this.bodies.find((b) => b.id === id);
  }
  private onDesk(b: Body) {
    return b.x >= deskTop.left && b.x <= deskTop.right && b.z >= deskTop.near && b.z <= deskTop.far;
  }
  impact(slam: boolean, strength = 1) {
    this.impacts++;
    for (const b of this.bodies) {
      if (!this.onDesk(b) || b.y < -0.04) continue;
      const dx = b.x - keyboardHome.x,
        dz = b.z - keyboardHome.z;
      const kick = ((slam ? 2.55 : 1.28) * strength) / (1 + Math.hypot(dx, dz) * 0.65) / Math.sqrt(b.mass + 0.35);
      b.sleep = false;
      b.rest = 0;
      b.vy += kick;
      b.vx += kick * (dx * 0.17 + this.rand() * 0.28 - 0.14);
      b.vz += kick * (dz * 0.2 + this.rand() * 0.22 - 0.11);
      b.spin += b.id === 'noodles' && slam ? 8 * strength : (this.rand() - 0.48) * kick * 3;
    }
    const before = this.detached;
    if (slam) {
      const kb = this.get('keyboard')!;
      for (let i = 0; i < 3 && this.detached < 18; i++) {
        const b = this.add(
          'key-' + this.detached,
          'box',
          kb.x + ((this.detached % 6) - 2.5) * 0.091,
          kb.z + (0.09 - Math.floor(this.detached / 6) * 0.078),
          0.071,
          0.038,
          0.06,
          0.045
        );
        if (!b) break;
        this.detached++;
        b.y = kb.y + 0.067;
        b.sleep = false;
        b.vy = (2.6 + this.rand() * 1.7) * strength;
        b.vx = (this.rand() - 0.43) * 4 * strength;
        b.vz = (this.rand() - 0.28) * 2.8 * strength;
        b.spin = (this.rand() - 0.5) * 23;
      }
    }
    return this.detached - before;
  }
  throwHeadset(strength: number) {
    if (this.headsetThrown) return false;
    const b = this.add('headset', 'box', -0.26, 0.04, 0.57, 0.42, 0.18, 0.45);
    if (!b) return false;
    this.headsetThrown = true;
    b.y = 1.25;
    b.vx = -1.7 * strength;
    b.vz = 1.25 * strength;
    b.vy = 0.4;
    b.spin = -7 * strength;
    b.sleep = false;
    return true;
  }
  step(dt: number) {
    if (this.bodies.every((body) => body.sleep)) return;
    this.remainder += Math.min(0.25, dt);
    while (this.remainder + 1e-10 >= step) {
      this.remainder -= step;
      this.integrate();
    }
  }
  private integrate() {
    for (let i = 0; i < this.bodies.length; i++) {
      const b = this.bodies[i];
      if (b.sleep) continue;
      const previousBase = b.y - extent(b).y;
      b.vy -= 9.81 * step;
      b.x += b.vx * step;
      b.y += b.vy * step;
      b.z += b.vz * step;
      b.angle += b.spin * step;
      const floor = this.onDesk(b) && previousBase >= -0.025 ? 0 : deskTop.floor;
      const support = extent(b).y;
      if (b.y <= floor + support + 0.00001 && b.vy <= 0) {
        b.y = floor + support;
        b.vy = Math.abs(b.vy) > 0.48 ? -b.vy * 0.26 : 0;
        const side = Math.PI / 2,
          stable = Math.round(b.angle / side) * side;
        b.spin += (stable - b.angle) * 42 * step;
        b.spin *= 0.945;
        b.vx *= b.shape === 'cylinder' && Math.abs(Math.sin(b.angle)) > 0.7 ? 0.983 : 0.94;
        b.vz *= 0.94;
        if (Math.abs(b.vx) + Math.abs(b.vz) + Math.abs(b.vy) + Math.abs(b.spin) < 0.085) {
          b.rest += step;
          if (b.rest > 0.18) {
            b.angle = stable;
            b.y = floor + extent(b).y;
            b.vx = b.vy = b.vz = b.spin = 0;
            b.sleep = true;
          }
        } else b.rest = 0;
      }
    }
    for (let i = 0; i < this.bodies.length; i++)
      for (let j = i + 1; j < this.bodies.length; j++) {
        const a = this.bodies[i],
          b = this.bodies[j];
        if (a.sleep && b.sleep) continue;
        const dz = b.z - a.z,
          oz = (a.d + b.d) / 2 - Math.abs(dz);
        if (oz <= 0.001) continue;
        const A = extent(a),
          B = extent(b),
          dx = b.x - a.x,
          dy = b.y - a.y;
        const ox = A.x + B.x - Math.abs(dx),
          oy = A.y + B.y - Math.abs(dy);
        if (ox <= 0.001 || oy <= 0.001) continue;
        // Use radial contact in plan for two upright round props.
        if (
          a.shape === 'cylinder' &&
          b.shape === 'cylinder' &&
          Math.abs(Math.sin(a.angle)) + Math.abs(Math.sin(b.angle)) < 0.25 &&
          Math.hypot(dx, dz) > A.x + B.x
        )
          continue;
        const overlap = Math.min(ox, oy, oz),
          axis = overlap === oy ? 'y' : overlap === ox ? 'x' : 'z';
        const v = axis === 'y' ? 'vy' : axis === 'x' ? 'vx' : 'vz';
        const sign = Math.sign(b[axis] - a[axis]) || 1;
        const wa = axis === 'y' && sign > 0 && a.sleep ? 0 : 1 / a.mass,
          wb = axis === 'y' && sign < 0 && b.sleep ? 0 : 1 / b.mass;
        const amount = (overlap - 0.0005) / (wa + wb);
        if (axis === 'y') {
          const lower = sign > 0 ? a : b,
            upper = sign > 0 ? b : a;
          const halfHeight = sign > 0 ? A.y : B.y;
          const plane = this.onDesk(lower) && lower.y - halfHeight >= -0.025 ? 0 : deskTop.floor;
          // A stacked pair cannot resolve its overlap by pushing the bottom prop through the desk.
          const travel = Math.min(amount * (sign > 0 ? wa : wb), Math.max(0, lower.y - halfHeight - plane));
          lower.y -= travel;
          upper.y += overlap - 0.0005 - travel;
        } else {
          a[axis] -= sign * amount * wa;
          b[axis] += sign * amount * wb;
        }
        const speed = (a[v] - b[v]) * sign;
        if (speed > 0) {
          const impulse = (speed * (speed > 0.4 ? 1.2 : 1)) / (wa + wb);
          a[v] -= sign * impulse * wa;
          b[v] += sign * impulse * wb;
          if (speed > 0.18) {
            if (wa) a.sleep = false;
            if (wb) b.sleep = false;
          }
          if (axis === 'y' && speed < 0.2) {
            const top = sign > 0 ? b : a,
              base = sign > 0 ? a : b;
            if (base.sleep && Math.abs(top.vx) + Math.abs(top.vz) + Math.abs(top.spin) < 0.08) {
              top.sleep = true;
              top.vy = 0;
            }
          }
        }
      }
  }
}
