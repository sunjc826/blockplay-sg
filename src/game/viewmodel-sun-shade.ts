import * as THREE from 'three';

/**
 * Whether the sun reaches the carried gun.
 *
 * The gun and hands are drawn in their own scene, lit by hand to match the
 * world's hour, and the sun's shadow map never reaches them: under a roof or
 * behind a wall they stayed in full sun. A few times a second this traces the
 * line from the eye to the sun, against the same meshes the shadow pass draws,
 * and eases the answer so the gun's key light can be scaled by it. Stepping
 * across a shadow's edge then dims the gun as it dims the ground.
 *
 * The line is traced both ways. A raycast skips faces turned away from it, the
 * shadow pass does not, and a one-sided awning seen from below is exactly that.
 *
 * Only worth running while sun shadows are drawn: with them off nothing in the
 * world is shaded either, and the gun should not be the one thing that is.
 */
export const VIEW_SHADE = {
  /** Seconds between rays. */
  interval: 1 / 15,
  /** Seconds for the gun to follow most of a change, about the width of a soft shadow edge at a walk. */
  ease: .09,
  /** Metres the ray starts from the eye, clear of the player's own figure. */
  near: .3,
  /** Metres towards the sun that can still shade the gun. */
  far: 400,
} as const;

/** Whether a mesh the ray struck is one the sun-shadow pass draws (see fps-sun-shadows and shadow-proxy). */
export function throwsSunShadow(object: THREE.Object3D) {
  for (let node: THREE.Object3D | null = object; node; node = node.parent) if (!node.visible) return false;
  if ((object as THREE.Mesh).castShadow) return true;
  if (!object.userData.noShadowCast || object.userData.fpsEffect) return false;
  // A vehicle's parts cast through a merged stand-in that raycasts ignore; the parts themselves answer for it.
  for (let node = object.parent; node; node = node.parent) if (node.children.some(child => child.userData.shadowProxy)) return true;
  return false;
}

/** What a ray may strike: `refresh` brings it up to date, `query` lists the objects near one ray. */
export interface ShadeSource { refresh(): void; query(ray: THREE.Raycaster): THREE.Object3D[] }

export function createViewmodelSunShade(source: ShadeSource) {
  const ray = new THREE.Raycaster(), hits: THREE.Intersection[] = [];
  const blocked = () => { hits.length = 0; ray.intersectObjects(source.query(ray), false, hits); return hits.some(hit => throwsSunShadow(hit.object)); };
  let lit = 1, target = 1, wait = 0, running = false;
  return {
    /** 1 in full sun, 0 in shadow, eased between. */
    get lit() { return lit; },
    /**
     * `active` is whether sun shadows are being drawn; `toward` points at the sun.
     * Call once a frame with the world's matrices current. Returns `lit`.
     */
    update(dt: number, active: boolean, eye: THREE.Vector3, toward: { x: number; y: number; z: number }) {
      if (!active) { running = false; return lit = target = 1; }
      if (!running || (wait -= dt) <= 0) {
        wait = VIEW_SHADE.interval;
        source.refresh();
        ray.ray.origin.copy(eye); ray.ray.direction.set(toward.x, toward.y, toward.z).normalize();
        ray.near = VIEW_SHADE.near; ray.far = VIEW_SHADE.far;
        let shaded = blocked();
        if (!shaded) {
          ray.ray.origin.addScaledVector(ray.ray.direction, VIEW_SHADE.far); ray.ray.direction.negate();
          ray.near = 0; ray.far = VIEW_SHADE.far - VIEW_SHADE.near;
          shaded = blocked();
        }
        target = shaded ? 0 : 1;
        // Shadows just came on, or the game just started: there is no earlier light to ease from.
        if (!running) lit = target;
        running = true;
      }
      return lit += (target - lit) * (1 - Math.exp(-Math.max(0, dt) / VIEW_SHADE.ease));
    },
  };
}
