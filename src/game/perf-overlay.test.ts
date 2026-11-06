import { afterEach, describe, expect, it, vi } from 'vitest';
import { beginProfiledFrame, endProfiledFrame, getPerfOverlay, perfSnapshot, resetPerfFrames, setPerfOverlay, summarizeFrames } from './perf-overlay';

describe('performance overlay', () => {
  afterEach(() => { setPerfOverlay('off'); resetPerfFrames(); vi.restoreAllMocks(); });

  it('summarises the last second and the slowest 1%', () => {
    const intervals = [...Array(20).fill(16.7), 50, 40, ...Array(138).fill(16.7)], work = intervals.map(() => 4);
    work[work.length - 1] = 9;
    const s = summarizeFrames(intervals, work)!;
    expect(s.fps).toBeGreaterThan(59); expect(s.fps).toBeLessThan(61);
    expect(s.frameMs).toBeCloseTo(16.7, 1);
    expect(s.worstMs).toBe(50);
    expect(s.lowFps).toBeCloseTo(25, 5);
    expect(s.workMaxMs).toBe(9);
    expect(summarizeFrames([], [])).toBeUndefined();
  });

  it('records nothing while off, and counts drawn frames once on', () => {
    let clock = 0; vi.spyOn(performance, 'now').mockImplementation(() => clock);
    for (let f = 0; f < 10; f++) { clock = f * 33.3; beginProfiledFrame(clock); endProfiledFrame(); }
    expect(perfSnapshot(clock)).toBeUndefined();
    setPerfOverlay('fps'); expect(getPerfOverlay()).toBe('fps');
    for (let f = 0; f < 40; f++) { clock = 1000 + f * 33.3; beginProfiledFrame(clock); clock += 5; endProfiledFrame(); clock -= 5; }
    const s = perfSnapshot(clock)!;
    expect(s.history).toHaveLength(39);
    expect(Math.round(s.fps)).toBe(30);
    expect(s.workMs).toBeCloseTo(5, 5);
    // A long gap is a restart, not a slow frame; and the overlay hides once frames stop.
    clock += 5000; beginProfiledFrame(clock); endProfiledFrame();
    expect(perfSnapshot(clock)!.worstMs).toBeCloseTo(33.3, 5);
    expect(perfSnapshot(clock + 2000)).toBeUndefined();
  });

  it('totals every render call in a frame and gives the reset back when turned off', () => {
    const renderer = { info: { autoReset: true, reset: vi.fn(), render: { calls: 7, triangles: 1200 }, memory: { geometries: 3, textures: 2 }, programs: [1, 2] },
      domElement: { width: 800, height: 600 }, getPixelRatio: () => 1.5 };
    setPerfOverlay('profiler');
    beginProfiledFrame(0, renderer as never); endProfiledFrame(renderer as never);
    beginProfiledFrame(16, renderer as never);
    expect(renderer.info.autoReset).toBe(false); expect(renderer.info.reset).toHaveBeenCalledTimes(2);
    endProfiledFrame(renderer as never);
    expect(perfSnapshot()!.renderer).toEqual({ calls: 7, triangles: 1200, geometries: 3, textures: 2, programs: 2, width: 800, height: 600, pixelRatio: 1.5 });
    setPerfOverlay('off'); beginProfiledFrame(32, renderer as never);
    expect(renderer.info.autoReset).toBe(true);
  });
});
