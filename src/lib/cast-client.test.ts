import { expect, test, vi } from 'vitest';
import { CastFailure } from '../game/ai-cast';
import { requestCast } from './cast-client';

const quota = { used: 1, limit: 1000, resetsAt: 0 };
const reply = (status: number, body: object) => new Response(JSON.stringify({ quota, ...body }), { status });

test('a "too many at once" refusal is waited out and retried, not surfaced', async () => {
  vi.useFakeTimers();
  try {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(reply(429, { error: 'Concurrent calls', transient: true, resetsAt: Date.now() + 60000 }))
      .mockResolvedValueOnce(reply(200, { line: 'Steady.' }));
    const asked = requestCast('commentary', {}, new AbortController().signal, () => {}, fetcher);
    await vi.advanceTimersByTimeAsync(5000);
    await expect(asked).resolves.toMatchObject({ line: 'Steady.' });
    expect(fetcher).toHaveBeenCalledTimes(2);
  } finally { vi.useRealTimers(); }
});

test('it gives up quietly after a few tries, and a daily limit is not retried at all', async () => {
  vi.useFakeTimers();
  try {
    const busy = vi.fn<typeof fetch>(async () => reply(429, { error: 'Concurrent calls', transient: true, resetsAt: Date.now() + 2000 }));
    const asked = requestCast('commentary', {}, new AbortController().signal, () => {}, busy).catch(e => e);
    await vi.advanceTimersByTimeAsync(20000);
    const failure = await asked;
    expect(failure).toBeInstanceOf(CastFailure); expect(failure.transient).toBe(true); expect(busy).toHaveBeenCalledTimes(4);

    const daily = vi.fn<typeof fetch>(async () => reply(429, { error: 'IP daily limit', resetsAt: Date.now() + 3600000 }));
    const refused = await requestCast('commentary', {}, new AbortController().signal, () => {}, daily).catch(e => e);
    expect(refused.transient).toBe(false); expect(refused.message).toContain('IP daily limit'); expect(daily).toHaveBeenCalledTimes(1);
  } finally { vi.useRealTimers(); }
});
