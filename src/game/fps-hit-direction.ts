/**
 * Where incoming fire came from, as arcs around the crosshair. The source is
 * fixed in the world when the hit lands; the bearing is recomputed from the
 * player's current position and facing every frame, so turning towards the
 * shooter swings the arc to the top of the screen.
 */
export const HIT_DIRECTION_SECONDS = 1.8;
/** Hits from sources closer together than this, in radians of bearing, refresh one arc. */
const MERGE_BEARING = .35;
export interface HitDirection { id: number; x: number; z: number; age: number; strength: number; kind: 'shot' | 'blast' }
interface Viewer { x: number; z: number; yaw: number }

/** Bearing of `from` seen by `viewer`, clockwise from straight ahead: 0 ahead, π/2 right, ±π behind. */
export function hitBearing(viewer: Viewer, from: { x: number; z: number }) {
  const dx = from.x - viewer.x, dz = from.z - viewer.z;
  const ahead = -Math.sin(viewer.yaw) * dx - Math.cos(viewer.yaw) * dz, right = Math.cos(viewer.yaw) * dx - Math.sin(viewer.yaw) * dz;
  return Math.atan2(right, ahead);
}
const angleBetween = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
/** Opacity of an arc: full for the first half of its life, then fading out. */
export const hitDirectionFade = (age: number) => Math.max(0, Math.min(1, 2 - 2 * age / HIT_DIRECTION_SECONDS));
/** A 10-point hit reads faintly; a hit for half a health bar or more reads at full weight. */
export const hitStrength = (damage: number, maxHealth = 100) => Math.max(.35, Math.min(1, damage / Math.max(1, maxHealth) * 2));

export function createHitDirections(limit = 6) {
  const list: HitDirection[] = [];
  let serial = 0;
  return {
    get list(): readonly HitDirection[] { return list; },
    /** Ignored when the source is on top of the viewer: there is no direction to show. */
    add(viewer: Viewer, from: { x: number; z: number }, strength: number, kind: HitDirection['kind'] = 'shot') {
      if (![from.x, from.z, strength].every(Number.isFinite) || Math.hypot(from.x - viewer.x, from.z - viewer.z) < .75) return null;
      const bearing = hitBearing(viewer, from);
      const near = list.find(entry => entry.kind === kind && angleBetween(hitBearing(viewer, entry), bearing) < MERGE_BEARING);
      if (near) { Object.assign(near, { x: from.x, z: from.z, age: 0, strength: Math.min(1, Math.max(near.strength, strength) + .1) }); return near; }
      const entry: HitDirection = { id: ++serial, x: from.x, z: from.z, age: 0, strength: Math.min(1, strength), kind };
      list.push(entry); if (list.length > limit) list.shift();
      return entry;
    },
    advance(dt: number) {
      for (let i = list.length - 1; i >= 0; i--) if ((list[i].age += Math.max(0, dt)) >= HIT_DIRECTION_SECONDS) list.splice(i, 1);
    },
    clear() { list.length = 0; },
  };
}

/**
 * The arcs themselves: a fixed pool of absolutely positioned elements inside
 * the game's host, restyled in place each frame. No React render per frame.
 */
export function createHitDirectionOverlay(host: HTMLElement, limit = 6) {
  const root = document.createElement('div'); root.className = 'fps-hit-directions'; root.setAttribute('aria-hidden', 'true');
  const arcs = Array.from({ length: limit }, () => {
    const arm = document.createElement('div'); arm.className = 'fps-hit-direction';
    const arc = document.createElement('i'); arm.append(arc); root.append(arm); arm.hidden = true;
    return arm;
  });
  host.append(root);
  return {
    render(viewer: Viewer, list: readonly HitDirection[], visible: boolean) {
      root.hidden = !visible;
      arcs.forEach((arm, index) => {
        const entry = list[index];
        arm.hidden = !visible || !entry;
        if (!entry || arm.hidden) return;
        arm.dataset.kind = entry.kind;
        arm.style.transform = `rotate(${(hitBearing(viewer, entry) * 180 / Math.PI).toFixed(1)}deg)`;
        arm.style.opacity = (hitDirectionFade(entry.age) * (.45 + entry.strength * .55)).toFixed(3);
        arm.style.setProperty('--hit-weight', entry.strength.toFixed(2));
      });
      root.dataset.count = String(visible ? list.length : 0);
    },
    dispose() { root.remove(); },
  };
}
