import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ArmoryStore } from '../game/use-armory';

const made: FakeAudio[] = [];
class FakeAudio {
  preload = ''; volume = 1; readyState = 4; currentTime = 0; paused = true;
  load = vi.fn();
  pause = vi.fn(() => { this.paused = true; });
  play = vi.fn(() => { this.paused = false; return Promise.resolve(); });
  constructor(public src: string) { made.push(this); }
}
beforeEach(() => {
  vi.resetModules(); made.length = 0;
  vi.stubGlobal('Audio', FakeAudio); vi.stubGlobal('document', { hidden: false });
  vi.spyOn(performance, 'now').mockReturnValue(100);
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('store feedback', () => {
  it('plays one outcome after the mutation, preserving its arguments and result', async () => {
    const { storeWithAudio } = await import('./store-audio');
    const play = vi.fn();
    const source = { buy: vi.fn().mockReturnValueOnce(true).mockReturnValueOnce(false), buyLevel: vi.fn(() => true),
      equipItem: vi.fn(() => true), selectCarrySlot: vi.fn(() => false), demoTopUp: vi.fn(() => true) };
    const store = storeWithAudio(source as unknown as ArmoryStore, play);
    expect(play).not.toHaveBeenCalled();
    expect(store.buy('kit-bandage')).toBe(true);
    expect(store.buy('kit-bandage')).toBe(false);
    expect(store.equipItem('paint-issued', 0, 'helicopter')).toBe(true);
    expect(source.equipItem).toHaveBeenCalledWith('paint-issued', 0, 'helicopter');
    expect(store.selectCarrySlot('extra', null)).toBe(false);
    expect(source.selectCarrySlot).toHaveBeenCalledWith('extra', null);
    store.buyLevel(); store.demoTopUp();
    expect(play.mock.calls.map(([sound]) => sound)).toEqual(['purchase', 'blocked', 'equip', 'blocked', 'purchase', 'purchase']);
  });

  it('preloads once and reuses the approved menu pair for browsing', async () => {
    const { prepareStoreAudio } = await import('./store-audio');
    prepareStoreAudio(); prepareStoreAudio();
    expect(made).toHaveLength(5);
    expect(made.slice(0, 2).every(a => a.src.includes('/audio/menu/glass-soft-'))).toBe(true);
    expect(made.slice(2).every(a => a.src.includes('/audio/store/'))).toBe(true);
  });

  it('suppresses hover during confirmation and interrupts old voices instead of stacking', async () => {
    const { playStoreSound } = await import('./store-audio');
    playStoreSound('purchase'); playStoreSound('hover');
    expect(made[3].paused).toBe(false);
    expect(made[0].play).not.toHaveBeenCalled();
    playStoreSound('equip');
    expect(made[3].paused).toBe(true);
    expect(made[2].paused).toBe(false);
    expect(made.filter(a => !a.paused)).toHaveLength(1);
  });

  it('drops cold and hidden sounds and throttles pointer sweeps', async () => {
    const { prepareStoreAudio, playStoreSound, stopStoreAudio } = await import('./store-audio');
    prepareStoreAudio(); made[0].readyState = 0;
    playStoreSound('hover'); expect(made[0].play).not.toHaveBeenCalled();
    made[0].readyState = 4;
    playStoreSound('hover'); playStoreSound('hover');
    expect(made[0].play).toHaveBeenCalledTimes(1);
    stopStoreAudio(); expect(made.every(a => a.paused)).toBe(true);
    vi.stubGlobal('document', { hidden: true });
    playStoreSound('purchase'); expect(made[3].play).not.toHaveBeenCalled();
  });

  it('leaves the short action tail intact on exit and handles autoplay denial', async () => {
    const { prepareStoreAudio, playStoreSound, stopStoreHover } = await import('./store-audio');
    prepareStoreAudio(); made[3].play.mockRejectedValueOnce(new Error('NotAllowedError'));
    expect(() => playStoreSound('purchase')).not.toThrow();
    await Promise.resolve();
    playStoreSound('equip'); stopStoreHover();
    expect(made[2].paused).toBe(false);
    vi.resetModules(); vi.stubGlobal('Audio', undefined);
    const unsupported = await import('./store-audio');
    expect(() => unsupported.playStoreSound('select')).not.toThrow();
  });
});
