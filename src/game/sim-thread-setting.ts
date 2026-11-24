import { useSyncExternalStore } from 'react';

/**
 * Where the simulation (bots, vehicles, structures) runs for a solo game or
 * the host of a LAN or public match: an Open World district, or a Team
 * Deathmatch, Hardpoint or Free for All match. A guest simulates nothing.
 * Chosen in Settings › Video: `worker` hosts it on a second thread
 * (sim-remote.ts); `main` runs it beside the drawing, as every other mode does.
 * Saved per browser. `main` by default.
 *
 * A worker that cannot start, or stops answering mid-match, switches this page
 * back to `main` until it is reloaded; the saved choice is left alone.
 */
export type SimThread = 'main' | 'worker';
export const SIM_THREADS: readonly { value: SimThread; name: string }[] = [{ value: 'main', name: 'Off' }, { value: 'worker', name: 'On' }];

const KEY = 'blockplay-sg-sim-thread-v1';
let saved: SimThread | undefined, failure: string | null = null;
const listeners = new Set<() => void>();
const isThread = (value: unknown): value is SimThread => value === 'main' || value === 'worker';
const tell = () => listeners.forEach(listener => listener());

export function getSimThread(): SimThread {
  if (saved === undefined) {
    try { const stored = localStorage.getItem(KEY); saved = isThread(stored) ? stored : 'main'; }
    catch { saved = 'main'; }
  }
  return saved;
}
export function setSimThread(next: SimThread) {
  saved = isThread(next) ? next : 'main';
  // Choosing again is asking to try again.
  failure = null;
  try { localStorage.setItem(KEY, saved); } catch { /* Play works without storage. */ }
  tell();
}
export function subscribeSimThread(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
export const useSimThread = () => useSyncExternalStore(subscribeSimThread, getSimThread, getSimThread);

/** Why the worker was given up on this page, or null while it has not been. */
export const simWorkerFailure = () => failure;
export const useSimWorkerFailure = () => useSyncExternalStore(subscribeSimThread, simWorkerFailure, simWorkerFailure);
export function markSimWorkerFailed(reason: string) { failure = reason.split('\n')[0].slice(0, 200) || 'Unknown failure'; tell(); }

/**
 * The thread the next district's simulation should start on. Tests and smokes
 * force the choice with `globalThis.blockplayWorkerSim = true | false`; a worker
 * that failed on this page is not tried again either way.
 */
export function simThreadForMatch(): SimThread {
  const forced = (globalThis as { blockplayWorkerSim?: boolean }).blockplayWorkerSim;
  const wanted = forced === undefined ? getSimThread() === 'worker' : forced === true;
  return wanted && !failure && typeof Worker !== 'undefined' ? 'worker' : 'main';
}

/** Forgets the saved choice and any failure (tests). */
export function resetSimThread() { saved = undefined; failure = null; }
