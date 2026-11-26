import type { MenuScreen } from './streamer-contract';

export function waitFor(ms: number, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  return new Promise((resolve,reject) => {
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener('abort',abort); resolve(); },ms);
    signal.addEventListener('abort',abort,{once:true});
  });
}

interface MenuIO {
  read(): MenuScreen | null;
  request(screen: MenuScreen, note: string, signal: AbortSignal): Promise<{actionId:string;line:string|null;ticket?:string}>;
  act(screen: MenuScreen, id: string, signal: AbortSignal, onClick: () => void): Promise<void>;
  speak(line: string, ticket?: string): void;
  wait(ms: number, signal: AbortSignal): Promise<void>;
  now(): number;
}
export function menuTrip() { return { count:0, previous:'', repeats:0, note:'Visit the store, choose solo equipment, then start a game.' }; }

/** Cancellation belongs to the session. Keep the trip counters across a human pause. */
export async function runMenu(io: MenuIO, trip: ReturnType<typeof menuTrip>, signal: AbortSignal) {
  let waitingSince = io.now();
  while (!signal.aborted) {
    await io.wait(750,signal);
    signal.throwIfAborted();
    const screen = io.read();
    if (!screen) {
      if (io.now()-waitingSince >= 45000) throw new Error('The next menu did not become ready.');
      continue;
    }
    if (trip.count >= 25) throw new Error('Reached 25 menu actions without entering play.');
    if (!screen.actions.some(a => a.state !== 'disabled')) throw new Error('This screen has no available streamer actions.');
    const reply = await io.request(screen,trip.note,signal);
    signal.throwIfAborted();
    const choice = screen.actions.find(a => a.id === reply.actionId && a.state !== 'disabled');
    if (!choice) throw new Error('The streamer chose an unavailable control.');
    const key = screen.screenId+'/'+choice.id;
    trip.repeats = trip.previous === key ? trip.repeats+1 : 1;
    trip.previous = key;
    if (trip.repeats >= 3) throw new Error('The streamer repeated the same menu choice three times.');
    await io.act(screen,choice.id,signal,() => { if (reply.line) io.speak(reply.line,reply.ticket); });
    signal.throwIfAborted();
    trip.count++;
    trip.note = 'Last choice: '+choice.label+'. Finish shopping and setup, then play. Menu choices so far: '+trip.count+'.';
    waitingSince = io.now();
  }
}
