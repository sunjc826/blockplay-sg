import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const made: FakeAudio[] = [];
class FakeAudio {
  preload = '';
  volume = 1;
  currentTime = 1;
  readyState = 4;
  paused = true;
  load = vi.fn();
  pause = vi.fn(() => { this.paused = true; });
  play = vi.fn(() => { this.paused = false; return Promise.resolve(); });
  constructor(public src: string) { made.push(this); }
}
beforeEach(() => {
  vi.resetModules(); made.length = 0;
  vi.stubGlobal('Audio', FakeAudio);
  vi.stubGlobal('document', { hidden: false });
  vi.spyOn(performance, 'now').mockReturnValue(100);
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('main menu recordings', () => {
  it('reuses two preloaded local clips across menu visits', async () => {
    const audio = await import('./menu-audio');
    audio.prepareMenuAudio(); audio.prepareMenuAudio();
    expect(made).toHaveLength(2);
    expect(made.every(a => a.src.includes('/audio/menu/glass-soft-') && a.preload === 'auto')).toBe(true);
  });
  it('drops unloaded hover and hidden-page sounds rather than playing them late', async () => {
    const audio = await import('./menu-audio'); audio.prepareMenuAudio();
    made[0].readyState = 0;
    audio.playMenuSound('hover');
    vi.stubGlobal('document', { hidden: true });
    audio.playMenuSound('click');
    expect(made.every(a => a.play.mock.calls.length === 0)).toBe(true);
  });
  it('bounds pointer sweeps and gives confirmation priority', async () => {
    const audio = await import('./menu-audio');
    audio.playMenuSound('hover'); audio.playMenuSound('hover');
    expect(made[0].play).toHaveBeenCalledTimes(1);
    audio.playMenuSound('click');
    expect(made[0].paused).toBe(true);
    vi.mocked(performance.now).mockReturnValue(200);
    audio.playMenuSound('hover');
    expect(made[0].play).toHaveBeenCalledTimes(1);
    expect(made[1].currentTime).toBe(0);
  });
  it('allows a short confirmation to finish after leaving the menu', async () => {
    const audio = await import('./menu-audio');
    audio.playMenuSound('click'); audio.stopMenuHover();
    expect(made[0].paused).toBe(true);
    expect(made[1].paused).toBe(false);
  });
  it('tolerates autoplay denial and unavailable audio', async () => {
    const audio = await import('./menu-audio'); audio.prepareMenuAudio();
    made[0].play.mockRejectedValueOnce(new Error('NotAllowedError'));
    expect(() => audio.playMenuSound('hover')).not.toThrow();
    await Promise.resolve();
    vi.resetModules(); vi.stubGlobal('Audio', undefined);
    const unsupported = await import('./menu-audio');
    expect(() => unsupported.playMenuSound('click')).not.toThrow();
  });
});
