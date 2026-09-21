/**
 * The radio itself: what is said and when, with cooldowns and priorities so a
 * firefight does not turn into a monologue. *Which* words come out lives in
 * `encik-registers`, because that changes with the player's rank.
 */
import { addressLine, DEFAULT_ADDRESS, encikLines, encikRegister, ENCIK_LINES, type EncikAddress, type EncikEvent } from './encik-registers';
export { ENCIK_LINES };
export type { EncikEvent, EncikAddress };
export interface EncikCallout { id: number; event: EncikEvent; text: string; until: number; priority: number;
  /** Which register said it, so a caller can tell deference from a shouting. */
  register: string }
const priority = (event: EncikEvent) => event === 'death' ? 7 : event === 'medical' ? 6 : ['multi', 'complete'].includes(event) ? 5 : event === 'triple' ? 4 : event === 'double' ? 3 : ['contact', 'hurt', 'kill'].includes(event) ? 2 : 1;
/**
 * `address` is read at every callout rather than captured, so a level-up
 * mid-exercise is heard in the next line rather than at the next range.
 */
export function createEncikRadio(random = Math.random, address: () => EncikAddress = () => DEFAULT_ADDRESS) {
  let active: EncikCallout | null = null, lastAt = -Infinity, sequence = 0;
  const heard = new Map<EncikEvent, number>(), previous = new Map<EncikEvent, number>();
  return {
    emit(event: EncikEvent, now: number): EncikCallout | null {
      const rank = priority(event), cooldown = ['double', 'triple', 'multi', 'kill'].includes(event) ? 6 : 22;
      if (now - (heard.get(event) ?? -Infinity) < cooldown) return null;
      if (now - lastAt < 8 && !(active && rank > active.priority && (event === 'death' || now - lastAt >= .8))) return null;
      const speaking = address(), lines = encikLines(event, speaking);
      let index = Math.min(lines.length - 1, Math.max(0, Math.floor(random() * lines.length)));
      if (index === previous.get(event)) index = (index + 1) % lines.length;
      // The rank goes in here rather than in the data, so one line serves every
      // insignia set and a substituted line simply finds no recording.
      active = { id: ++sequence, event, text: addressLine(lines[index], speaking.rank), until: now + 6, priority: rank, register: encikRegister(speaking).id };
      heard.set(event, now); previous.set(event, index); lastAt = now;
      return active;
    },
    current(now: number) { return active && now < active.until ? active : null; },
    clear() { active = null; },
    reset() { active = null; lastAt = -Infinity; heard.clear(); previous.clear(); },
  };
}
