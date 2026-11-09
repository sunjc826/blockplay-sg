/**
 * The radio itself: what is said and when, with cooldowns and priorities so a
 * firefight does not turn into a monologue. *Which* words come out lives in
 * `encik-registers`, because that changes with the player's rank.
 */
import { addressLine, DEFAULT_ADDRESS, encikLines, encikRegister, ENCIK_LINES, type EncikAddress, type EncikEvent } from './encik-registers';
import { MATCH_LINES, type MatchCallEvent } from './match-callout-lines';
export { ENCIK_LINES };
export type { EncikEvent, EncikAddress };
export interface EncikCallout { id: number; event: EncikEvent | MatchCallEvent; text: string; until: number; priority: number;
  /** Which register said it, so a caller can tell deference from a shouting. */
  register: string }
const priority = (event: EncikEvent) => event === 'death' ? 7 : event === 'medical' ? 6 : ['multi', 'complete'].includes(event) ? 5 : event === 'triple' ? 4 : event === 'double' ? 3 : ['contact', 'hurt', 'kill'].includes(event) ? 2 : 1;
/**
 * `address` is read at every callout rather than captured, so a level-up
 * mid-exercise is heard in the next line rather than at the next range.
 */
export function createEncikRadio(random = Math.random, address: () => EncikAddress = () => DEFAULT_ADDRESS) {
  let active: EncikCallout | null = null, lastAt = -Infinity, sequence = 0;
  const heard = new Map<EncikEvent, number>(), previous = new Map<EncikEvent | MatchCallEvent, number>();
  return {
    /** A scripted line whose wording is outside the recorded base pack. */
    announce(text: string, now: number, register: string) {
      active = { id: ++sequence, event: 'start', text, until: now + 6, priority: 8, register }; lastAt = now; return active;
    },
    emit(event: EncikEvent, now: number): EncikCallout | null {
      const rank = priority(event), cooldown = ['double', 'triple', 'multi', 'kill'].includes(event) ? 6 : 22;
      if (now - (heard.get(event) ?? -Infinity) < cooldown) return null;
      if (now - lastAt < 8 && !(active && rank > active.priority && (event === 'death' || now - lastAt >= .8))) return null;
      const speaking = address(), lines = encikLines(event, speaking);
      let index = Math.min(lines.length - 1, Math.max(0, Math.floor(random() * lines.length)));
      if (index === previous.get(event)) index = (index + 1) % lines.length;
      // Substitute before lookup so the spoken rank matches the subtitle.
      active = { id: ++sequence, event, text: addressLine(lines[index], speaking.rank), until: now + 6, priority: rank, register: encikRegister(speaking).id };
      heard.set(event, now); previous.set(event, index); lastAt = now;
      return active;
    },
    /**
     * A match announcement (match-callouts). It cuts in over anything less
     * important and otherwise waits until the last line has roughly finished
     * (recorded delivery runs ~11 characters a second), so a caller can queue
     * it and try again. Returns null when the channel is busy.
     */
    match(event: MatchCallEvent, priority: number, now: number): EncikCallout | null {
      if (active && priority <= active.priority && now - lastAt < Math.max(2.5, active.text.length / 11 + .5)) return null;
      const lines = MATCH_LINES[event];
      let index = Math.min(lines.length - 1, Math.max(0, Math.floor(random() * lines.length)));
      if (lines.length > 1 && index === previous.get(event)) index = (index + 1) % lines.length;
      active = { id: ++sequence, event, text: lines[index], until: now + 6, priority, register: 'match' };
      previous.set(event, index); lastAt = now;
      return active;
    },
    current(now: number) { return active && now < active.until ? active : null; },
    clear() { active = null; },
    reset() { active = null; lastAt = -Infinity; heard.clear(); previous.clear(); },
  };
}
