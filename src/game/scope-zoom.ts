import { opticMagnification, type WeaponSpec } from './fps-rules';

export interface ScopeZoom { value: number; min: number; max: number }

/** Local optical preference: it never changes weapon damage, ballistics or the shared spec. */
export function createScopeZoom() {
  const selected = new Map<string, number>();
  const read = (weapon: WeaponSpec): ScopeZoom | null => {
    const steps = weapon.zoomSteps;
    if (!steps?.length) return null;
    const wanted = selected.get(weapon.id) ?? opticMagnification(weapon);
    const value = steps.reduce((nearest, step) => Math.abs(step - wanted) < Math.abs(nearest - wanted) ? step : nearest, steps[0]);
    return { value, min: steps[0], max: steps[steps.length - 1] };
  };
  return {
    read,
    step(weapon: WeaponSpec, direction: number) {
      const current = read(weapon), steps = weapon.zoomSteps;
      if (!current || !steps || !Number.isFinite(direction) || direction === 0) return false;
      const index = Math.max(0, Math.min(steps.length - 1, steps.indexOf(current.value) + Math.sign(direction)));
      if (steps[index] === current.value) return false;
      selected.set(weapon.id, steps[index]); return true;
    },
  };
}

/** Keep each scope's default-power feel while making finer movements at higher power. */
export function scopeZoomLookScale(weapon: WeaponSpec, magnification: number, aiming: boolean) {
  return aiming && weapon.zoomSteps && Number.isFinite(magnification) && magnification > 0 ? opticMagnification(weapon) / magnification : 1;
}

/** Collect fine trackpad deltas, but move only one detent per wheel event. */
export function createScopeZoomWheel() {
  let sum = 0, lastAt = -Infinity;
  return (delta: number, mode: number, now: number) => {
    if (!Number.isFinite(delta) || !Number.isFinite(now) || !delta) return 0;
    if (now - lastAt > 200 || Math.sign(sum) !== Math.sign(delta)) sum = 0;
    lastAt = now; sum += delta * (mode === 1 ? 16 : mode === 2 ? 400 : 1);
    if (Math.abs(sum) < 40) return 0;
    const step = -Math.sign(sum); sum = 0; return step;
  };
}
