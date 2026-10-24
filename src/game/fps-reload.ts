/**
 * What stops a reload. A fresh trigger pull with rounds still in the gun, or a
 * fresh sprint, interrupts it (`interruptReload` in fps-rules decides what that
 * costs). Inputs already held when the reload began do not: the trigger still
 * down from the burst that emptied the magazine, or the sprint key the player
 * was running on. A held sprint is walked down to a run for the reload instead,
 * and either input counts as fresh again once it has been let go.
 */
export interface ReloadGate { trigger: boolean; sprint: boolean }
export const armReloadGate = (trigger: boolean, sprint: boolean): ReloadGate => ({ trigger, sprint });
export function reloadInterrupt(gate: ReloadGate, trigger: boolean, sprint: boolean, loaded: boolean): 'fire' | 'sprint' | null {
  if (!trigger) gate.trigger = false;
  if (!sprint) gate.sprint = false;
  if (trigger && !gate.trigger && loaded) return 'fire';
  if (sprint && !gate.sprint) return 'sprint';
  return null;
}
