import { setImmediate as nextLoopTurn } from 'node:timers';
import { afterEach } from 'vitest';

/**
 * A worker's calls to Vitest's main process fail after a fixed 60 s, and the reply
 * is only read when the event loop turns. Synchronous world tests can run back to
 * back without turning it for that long on a slower machine, so give it a turn
 * after each test. Imported from node:timers so fake timers cannot stall it.
 */
afterEach(() => new Promise<void>(resolve => { nextLoopTurn(resolve); }));
