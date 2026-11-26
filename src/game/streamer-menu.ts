import { POLL_VOTE_SECONDS, applyViewerVote, pollVisit, shuffledScreen, summarizeGames, type PollRow } from './streamer-variety';
import type { PlayedGame } from './streamer-history';
import type { MenuScreen, MenuTurn } from './streamer-contract';

export function waitFor(ms: number, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  return new Promise((resolve,reject) => {
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener('abort',abort); resolve(); },ms);
    signal.addEventListener('abort',abort,{once:true});
  });
}

export interface VotingWindow { seconds:number; vote(id:string):boolean }
export interface MenuPoll {
  screenId:string;
  rows:PollRow[];
  viewerVote?:string;
  voting?:VotingWindow;
}
type MenuAdvice = Pick<MenuTurn,'history'|'poll'|'viewerVote'>;
interface MenuIO {
  games(): readonly PlayedGame[];
  showPoll(card:MenuPoll|null): void;
  read(): MenuScreen | null;
  request(screen: MenuScreen, note: string, signal: AbortSignal, advice:MenuAdvice): Promise<{actionId:string;line:string|null;ticket?:string}>;
  act(screen: MenuScreen, id: string, signal: AbortSignal, onClick: () => void): Promise<void>;
  speak(line: string, ticket?: string): void;
  wait(ms: number, signal: AbortSignal): Promise<void>;
  random?: () => number;
  now(): number;
}
/** How long to wait for a screen with choices. A district load is a screen without any, and on a
 * phone or a busy machine it runs well past a minute; the Stop chip is there the whole time. */
export const MENU_WAIT_MS = 180000;
export function menuTrip() { return { visit:pollVisit(), count:0, previous:'', repeats:0, note:'Visit the store, choose solo equipment, then start a game.' }; }

async function pollAdvice(io:MenuIO,screen:MenuScreen,trip:ReturnType<typeof menuTrip>,signal:AbortSignal):Promise<MenuAdvice> {
  const games = io.games();
  const history = summarizeGames(screen,games);
  const poll = trip.visit.read(screen,games);
  if (!poll) {
    io.showPoll(null);
    return {history};
  }
  const show = (voting?:VotingWindow) => io.showPoll({screenId:screen.screenId,rows:poll.rows,viewerVote:poll.viewerVote,voting});
  if (!poll.opened) {
    poll.opened = true;
    const deadline = io.now() + POLL_VOTE_SECONDS * 1000;
    const voted = new AbortController();
    const windowSignal = AbortSignal.any([signal,voted.signal]);
    const vote = (id:string) => {
      if (windowSignal.aborted || io.now() >= deadline || !poll.rows.some(row => row.id === id)) return false;
      poll.rows = applyViewerVote(poll.rows,id);
      poll.viewerVote = id;
      voted.abort();
      return true;
    };
    try {
      let left = deadline - io.now();
      while (left > 0 && !windowSignal.aborted) {
        const seconds = Math.ceil(left/1000);
        show({seconds,vote});
        await io.wait(left - (seconds-1)*1000,windowSignal);
        left = deadline - io.now();
      }
    } catch (error) {
      if (!voted.signal.aborted) throw error;
    } finally {
      if (signal.aborted) io.showPoll(null);
      else show();
    }
    signal.throwIfAborted();
  } else show();
  return {history,poll:poll.rows,...(poll.viewerVote && {viewerVote:poll.viewerVote})};
}

/** Cancellation belongs to the session. Keep the trip counters across a human pause. */
export async function runMenu(io: MenuIO, trip: ReturnType<typeof menuTrip>, signal: AbortSignal) {
  let waitingSince = io.now();
  while (!signal.aborted) {
    await io.wait(750,signal);
    signal.throwIfAborted();
    const screen = io.read();
    if (!screen) {
      if (io.now()-waitingSince >= MENU_WAIT_MS) throw new Error('The next menu did not become ready.');
      continue;
    }
    if (trip.count >= 25) throw new Error('Reached 25 menu actions without entering play.');
    if (!screen.actions.some(a => a.state !== 'disabled')) throw new Error('This screen has no available streamer actions.');
    const shuffled = shuffledScreen(screen,io.random ?? Math.random);
    const advice = await pollAdvice(io,shuffled,trip,signal);
    signal.throwIfAborted();
    const reply = await io.request(shuffled,trip.note,signal,advice);
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
