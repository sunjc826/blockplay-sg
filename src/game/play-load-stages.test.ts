import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPlayLoadTracker, DEFAULT_STAGE_MS, gpuCaughtUp, loadPace, msLeft, planStages, PLAY_LOAD_STAGES, readStageTimings, recordStageTimings, stageKeyframes, stageLabel, timeLeftLabel } from './play-load-stages';

const STORE = 'blockplay.load-timings.v1';
beforeEach(() => {
  const items = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (key: string) => items.get(key) ?? null, setItem: (key: string, value: string) => { items.set(key, value); } });
});
afterEach(() => vi.unstubAllGlobals());

describe('planStages', () => {
  it('gives each stage its share of the expected time and fills the whole bar', () => {
    const plan = planStages(PLAY_LOAD_STAGES, { district: 1000, models: 1000, shaders: 2000 });
    expect(plan.map(({ start, end }) => [start, end])).toEqual([[0, .25], [.25, .5], [.5, 1]]);
  });
  it('falls back to the defaults for stages it has no time for', () => {
    expect(planStages(PLAY_LOAD_STAGES, { district: 123 }).map(segment => segment.ms)).toEqual([123, DEFAULT_STAGE_MS.models, DEFAULT_STAGE_MS.shaders]);
  });
  it('survives a stage recorded as taking no time', () => {
    const plan = planStages(PLAY_LOAD_STAGES, { district: 0, models: 0, shaders: 0 });
    expect(plan.at(-1)!.end).toBe(1);
    plan.forEach(({ start, end }) => expect(end).toBeGreaterThan(start));
  });
});

describe('time left', () => {
  const plan = planStages(PLAY_LOAD_STAGES, { district: 1000, models: 1000, shaders: 2000 });
  it('counts the rest of this stage and all of the later ones', () => {
    expect(msLeft(plan, 0, 400, 1)).toBe(3600);
    expect(msLeft(plan, 2, 500, 1)).toBe(1500);
  });
  it('holds at the later stages when this one overruns, rather than going negative', () => {
    expect(msLeft(plan, 1, 9000, 1)).toBe(2000);
    expect(msLeft(plan, 2, 9000, 1)).toBe(0);
  });
  it('stretches what is left on a slower device', () => {
    expect(loadPace(plan, 1, 4000)).toBe(2);
    expect(msLeft(plan, 1, 0, 2)).toBe(6000);
  });
  it('keeps one odd stage from swinging the estimate wildly', () => {
    expect(loadPace(plan, 1, 50000)).toBe(2);
    expect(loadPace(plan, 1, 1)).toBe(.5);
    expect(loadPace(plan, 0, 0)).toBe(1);
  });
  it('stops quoting seconds when it is nearly done', () => {
    expect(timeLeftLabel(8200)).toBe('About 9 s left');
    expect(timeLeftLabel(2000)).toBe('About 2 s left');
    expect(timeLeftLabel(1999)).toBe('Almost there');
  });
});

describe('stageKeyframes', () => {
  it('nears the end of the stage on time, then creeps without arriving', () => {
    const { duration, keyframes } = stageKeyframes(.2, .6, 1000);
    expect(duration).toBe(4000);
    expect(keyframes.map(frame => frame.offset)).toEqual([0, .25, 1]);
    expect(keyframes.map(frame => frame.transform)).toEqual(['scaleX(0.2000)', 'scaleX(0.5600)', 'scaleX(0.5920)']);
  });
  it('never moves backwards if the bar is already past the stage', () => {
    const { keyframes } = stageKeyframes(.7, .6, 1000);
    expect(new Set(keyframes.map(frame => frame.transform))).toEqual(new Set(['scaleX(0.7000)']));
  });
  it('has a usable duration when a stage is expected to take no time', () => {
    expect(stageKeyframes(0, .5, 0).duration).toBe(1);
  });
});

describe('learned timings', () => {
  it('prefers the place itself, then the last place loaded on this device', () => {
    expect(readStageTimings('world:tuas')).toEqual({});
    recordStageTimings('world:tuas', { district: 600 });
    recordStageTimings('world:orchard', { district: 2000 });
    expect(readStageTimings('world:tuas')).toEqual({ district: 600 });
    expect(readStageTimings('world:bishan')).toEqual({ district: 2000 });
  });
  it('leans towards the latest visit, since the first has a cold shader cache', () => {
    recordStageTimings('world:tuas', { shaders: 6000 });
    recordStageTimings('world:tuas', { shaders: 1000 });
    expect(readStageTimings('world:tuas').shaders).toBe(2500);
  });
  it('keeps working when storage throws, as it can in a private window', () => {
    vi.stubGlobal('localStorage', { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } });
    expect(readStageTimings('world:tuas')).toEqual({});
    expect(() => recordStageTimings('world:tuas', { district: 1 })).not.toThrow();
  });
  it('treats unreadable storage as no record', () => {
    localStorage.setItem(STORE, '{not json');
    expect(readStageTimings('world:tuas')).toEqual({});
    localStorage.setItem(STORE, 'null');
    expect(readStageTimings('world:tuas')).toEqual({});
  });
});

describe('createPlayLoadTracker', () => {
  function run(place = 'tuas') {
    let time = 0;
    return { tracker: createPlayLoadTracker('world', place, () => time), advance(ms: number) { time += ms; } };
  }
  it('records how long each stage took once the load finishes', () => {
    const { tracker, advance } = run();
    advance(700); tracker.report('models', 0);
    advance(300); tracker.report('shaders');
    advance(2000); tracker.finish();
    expect(readStageTimings('world:tuas')).toEqual({ district: 700, models: 300, shaders: 2000 });
    expect(tracker.getSnapshot().finished).toBe(true);
  });
  it('sizes the next visit by what it recorded', () => {
    const first = run();
    first.advance(1000); first.tracker.report('models'); first.advance(1000); first.tracker.report('shaders'); first.advance(2000); first.tracker.finish();
    expect(run().tracker.plan.map(segment => segment.end)).toEqual([.25, .5, 1]);
  });
  it('only moves forward', () => {
    const { tracker } = run();
    tracker.report('shaders');
    tracker.report('models', .5);
    expect(tracker.getSnapshot()).toEqual({ index: 2, done: 0, finished: false });
  });
  it('counts finished models, ignoring an out-of-order lower count', () => {
    const { tracker } = run();
    tracker.report('models', .5); tracker.report('models', .25);
    expect(tracker.getSnapshot().done).toBe(.5);
  });
  it('stops listening once finished, as a later district crossing reports through the same callback', () => {
    const { tracker } = run();
    tracker.report('shaders'); tracker.finish();
    const finished = tracker.getSnapshot();
    tracker.report('models');
    expect(tracker.getSnapshot()).toBe(finished);
  });
  it('covers the game only until it finishes', () => {
    const { tracker } = run();
    expect(tracker.covering()).toBe(true);
    tracker.finish();
    expect(tracker.covering()).toBe(false);
  });
  it('records nothing for a load that failed before the last stage', () => {
    const { tracker, advance } = run();
    advance(500); tracker.report('models'); advance(100); tracker.finish(false);
    expect(localStorage.getItem(STORE)).toBeNull();
  });
  it('dismisses a graphics-stage failure without showing completion or saving timings', () => {
    const { tracker, advance } = run();
    advance(500); tracker.report('models'); tracker.report('shaders');
    advance(100); tracker.finish(false);
    expect(tracker.covering()).toBe(false);
    expect(tracker.getSnapshot().finished).toBe(false);
    tracker.report('shaders', 1);
    expect(tracker.getSnapshot().done).toBe(0);
    expect(localStorage.getItem(STORE)).toBeNull();
  });
  it('records nothing from a hidden tab, whose timers say nothing about the device', () => {
    const { tracker, advance } = run();
    vi.stubGlobal('document', { hidden: true });
    advance(500); tracker.report('models'); tracker.report('shaders'); advance(100); tracker.finish();
    expect(localStorage.getItem(STORE)).toBeNull();
  });
  it('corrects its pace after a stage that ran slow', () => {
    const { tracker, advance } = run();
    advance(DEFAULT_STAGE_MS.district * 4); tracker.report('models');
    expect(tracker.pace()).toBe(2);
  });
  it('tells listeners about changes until they unsubscribe', () => {
    const { tracker } = run();
    let calls = 0;
    const stop = tracker.subscribe(() => calls++);
    tracker.report('models'); stop(); tracker.report('shaders');
    expect(calls).toBe(1);
  });
});

describe('gpuCaughtUp', () => {
  const SIGNALED = 1, UNSIGNALED = 0;
  function context(signalAfterPolls: number) {
    let polls = 0;
    return { SYNC_GPU_COMMANDS_COMPLETE: 2, SYNC_STATUS: 3, SIGNALED, fenceSync: vi.fn(() => ({})), flush: vi.fn(), deleteSync: vi.fn(), getSyncParameter: vi.fn(() => ++polls > signalAfterPolls ? SIGNALED : UNSIGNALED) };
  }
  it('waits for the fence and cleans it up', async () => {
    const gl = context(2);
    await gpuCaughtUp(gl as unknown as WebGL2RenderingContext);
    expect(gl.getSyncParameter).toHaveBeenCalledTimes(3);
    expect(gl.flush).toHaveBeenCalledOnce();
    expect(gl.deleteSync).toHaveBeenCalledOnce();
  });
  it('gives up rather than hang on a context that never signals', async () => {
    const gl = context(Infinity);
    await gpuCaughtUp(gl as unknown as WebGL2RenderingContext, 40);
    expect(gl.deleteSync).toHaveBeenCalledOnce();
  });
  it('carries on if no fence could be made', async () => {
    const gl = { ...context(0), fenceSync: () => null };
    await expect(gpuCaughtUp(gl as unknown as WebGL2RenderingContext)).resolves.toBeUndefined();
  });
});

describe('stageLabel', () => {
  it('names the district and matches the mode', () => {
    expect(stageLabel('district', 'world', 'Tuas')).toBe('Building Tuas');
    expect(stageLabel('models', 'training', 'Tuas')).toBe('Loading models and targets');
    expect(stageLabel('models', 'world', 'Tuas')).toBe('Loading models and patrols');
    expect(stageLabel('models', 'tutorial', 'Field School')).toBe('Loading models and training gear');
    expect(stageLabel('models', 'arena', 'Marina Bay')).toBe('Loading models and arena equipment');
  });
});
