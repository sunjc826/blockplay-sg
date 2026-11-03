import { afterEach, expect, it, vi } from 'vitest';
vi.mock('virtual:navigation-assets', () => ({ default: { queenstown: '/assets/navigation-queenstown-test.json' } }));
import { loadNavigationBake } from './navigation-bake-loader';

afterEach(() => vi.unstubAllGlobals());
const empty = { version: 1, key: 'empty', positions: [], offsets: [0], targets: [], costs: [] };
it('requests only the selected district and accepts valid data', async () => {
  const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify(empty)));
  vi.stubGlobal('fetch', fetcher);
  expect(await loadNavigationBake('queenstown')).toEqual(empty);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0][0]).toBe('/assets/navigation-queenstown-test.json');
  expect(await loadNavigationBake('unknown')).toBeUndefined();
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it.each(['network', 'http', 'invalid'])('permits lazy fallback on %s failure', async failure => {
  vi.stubGlobal('fetch', vi.fn(async () => {
    if (failure === 'network') throw new Error('offline');
    return failure === 'http' ? new Response('', { status: 404 }) : new Response('{"version":1}');
  }));
  expect(await loadNavigationBake('queenstown')).toBeUndefined();
});
