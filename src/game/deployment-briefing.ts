/**
 * The mission feed over a deployment, after Call of Duty 4's intro text: letters
 * type on through a scrambled leading edge and flash as they lock, then, once the
 * weapon is up, each one re-encrypts on its own beat and fades.
 *
 * Everything is a pure function of the clock, so a pause holds the exact frame.
 */
const CHAR_SECONDS = .03;
const LINE_STAGGER = .42;
const FIRST_LINE = .15;
/** How long a new letter wears a random glyph, which gives the typing a scrambled front of about three letters. */
const CIPHER_SECONDS = .1;
const FLASH_SECONDS = .42;
/** Letters leave across this span rather than together. */
const DECAY_SPREAD = .5;
const DECAY_SECONDS = .75;
/** Part of a letter's decay spent scrambled at full strength before it fades. */
const ENCRYPT_SHARE = .35;
const CIPHER_RATE = 24;
const CIPHER_GLYPHS = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789/#%&*+=<>';
/** Without the descent, the landing comes too soon to read all the lines. */
const REDUCED_FADE_IN = .25;
const REDUCED_HOLD = 3.2;
const REDUCED_FADE_OUT = .6;

export interface BriefingInfo { respawn: boolean; time: string; weather: string; reduced: boolean }
export interface BriefingTime { elapsed: number; /** When the letters start to leave; unknown until the player lands. */ decayAt: number | null }
export interface BriefingGlyph { text: string; opacity: number; /** 0 settled, 1 the white flash of a letter changing state. */ glow: number }

const HIDDEN = (char: string): BriefingGlyph => ({ text: char, opacity: 0, glow: 0 });
function noise(a: number, b: number, c = 0) {
  const n = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453;
  return n - Math.floor(n);
}
function cipher(char: string, line: number, index: number, elapsed: number) {
  if (char === ' ') return ' ';
  return CIPHER_GLYPHS[Math.floor(noise(line, index, Math.floor(elapsed * CIPHER_RATE)) * CIPHER_GLYPHS.length)];
}

export const briefingLineDelay = (line: number) => FIRST_LINE + line * LINE_STAGGER;

export function briefingGlyph(char: string, line: number, index: number, { elapsed, decayAt }: BriefingTime, reduced: boolean): BriefingGlyph {
  if (reduced) {
    const fadeIn = Math.min(1, elapsed / REDUCED_FADE_IN);
    const fadeOut = decayAt === null ? 1 : 1 - Math.min(1, Math.max(0, elapsed - decayAt) / REDUCED_FADE_OUT);
    return { text: char, opacity: Math.min(fadeIn, fadeOut), glow: 0 };
  }
  const revealAt = briefingLineDelay(line) + index * CHAR_SECONDS;
  // Skipping decays what has been typed; the rest of the line never appears.
  if (elapsed < revealAt || decayAt !== null && revealAt >= decayAt) return HIDDEN(char);
  if (decayAt !== null) {
    const progress = (elapsed - (decayAt + noise(line, index) * DECAY_SPREAD)) / DECAY_SECONDS;
    if (progress >= 1) return HIDDEN(char);
    if (progress >= 0) {
      const fade = progress < ENCRYPT_SHARE ? 1 : ((1 - progress) / (1 - ENCRYPT_SHARE)) ** 1.4;
      const flicker = progress < ENCRYPT_SHARE ? 1 : .72 + .28 * noise(index, line, Math.floor(elapsed * CIPHER_RATE));
      return { text: cipher(char, line, index, elapsed), opacity: fade * flicker, glow: Math.max(0, 1 - progress / ENCRYPT_SHARE) };
    }
  }
  const age = elapsed - revealAt;
  if (age < CIPHER_SECONDS) return { text: cipher(char, line, index, elapsed), opacity: 1, glow: 1 };
  return { text: char, opacity: 1, glow: Math.max(0, 1 - (age - CIPHER_SECONDS) / FLASH_SECONDS) ** 2 };
}

/** Runs on past the landing, since the feed leaves after the weapon is up. Holds while the game is paused. */
export function createBriefingClock() {
  let info: BriefingInfo | null = null, elapsed = 0, decayAt: number | null = null;
  const clear = () => { info = null; elapsed = 0; decayAt = null; };
  return {
    get info() { return info; },
    get time(): BriefingTime | null { return info ? { elapsed, decayAt } : null; },
    begin(next: BriefingInfo) { clear(); info = next; },
    advance(dt: number) {
      if (!info) return;
      elapsed += Number.isFinite(dt) ? Math.max(0, dt) : 0;
      if (decayAt !== null && elapsed >= decayAt + (info.reduced ? REDUCED_FADE_OUT : DECAY_SPREAD + DECAY_SECONDS)) clear();
    },
    /** The weapon is up. A skip goes at once; a reduced-motion landing still leaves time to read. */
    land(skipped: boolean) {
      if (info && decayAt === null) decayAt = info.reduced && !skipped ? Math.max(elapsed, REDUCED_HOLD) : elapsed;
    },
    clear,
  };
}
