import { afterEach, describe, expect, it } from 'vitest';
import { getSimThread, markSimWorkerFailed, resetSimThread, setSimThread, simThreadForMatch, simWorkerFailure, subscribeSimThread } from './sim-thread-setting';

const scope = globalThis as { blockplayWorkerSim?: boolean; Worker?: unknown };
describe('background simulation setting', () => {
  const hadWorker = 'Worker' in scope, worker = scope.Worker;
  afterEach(() => { resetSimThread(); delete scope.blockplayWorkerSim; if (hadWorker) scope.Worker = worker; else delete scope.Worker; try { localStorage.clear(); } catch { /* No storage here. */ } });

  it('is off until chosen, and only starts a worker where one can exist', () => {
    expect(getSimThread()).toBe('main'); expect(simThreadForMatch()).toBe('main');
    setSimThread('worker'); expect(getSimThread()).toBe('worker');
    delete scope.Worker; expect(simThreadForMatch()).toBe('main');
    scope.Worker = class {}; expect(simThreadForMatch()).toBe('worker');
    setSimThread('sideways' as never); expect(getSimThread()).toBe('main');
  });

  it('gives up on a failed worker for this page, until the player chooses again', () => {
    scope.Worker = class {}; setSimThread('worker');
    let told = 0; const stop = subscribeSimThread(() => told++);
    markSimWorkerFailed('Simulation worker stopped answering\n    at somewhere');
    expect(told).toBe(1); expect(simWorkerFailure()).toBe('Simulation worker stopped answering');
    expect(getSimThread()).toBe('worker'); expect(simThreadForMatch()).toBe('main');
    setSimThread('worker'); expect(simWorkerFailure()).toBeNull(); expect(simThreadForMatch()).toBe('worker');
    stop();
  });

  it('lets a test force either thread, but not past a failure', () => {
    scope.Worker = class {};
    scope.blockplayWorkerSim = true; expect(simThreadForMatch()).toBe('worker');
    markSimWorkerFailed('gone'); expect(simThreadForMatch()).toBe('main');
    resetSimThread(); setSimThread('worker'); scope.blockplayWorkerSim = false; expect(simThreadForMatch()).toBe('main');
  });
});
