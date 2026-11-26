import { expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { FacecamSlot, type StreamController } from './StreamerMode';

const load = vi.hoisted(() => vi.fn());
vi.mock('./StreamerFacecam', () => {
  load();
  return { default: () => null };
});
it('keeps the camera import and scheduler dormant until the running viewer shows it', async () => {
  const request = vi.fn();
  vi.stubGlobal('requestAnimationFrame', request);
  try {
    const props = { host: {} as Element, s: {} as StreamController, name: 'Pro gamer', target: null, voting: false };
    for (const [running, shown] of [
      [false, true],
      [true, false],
      [false, false],
    ]) {
      expect(renderToString(<FacecamSlot {...props} running={running} shown={shown} />)).toBe('');
    }
    await Promise.resolve();
    expect(load).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
    renderToString(<FacecamSlot {...props} running shown />);
    await vi.waitFor(() => expect(load).toHaveBeenCalledOnce());
  } finally {
    vi.unstubAllGlobals();
  }
});
