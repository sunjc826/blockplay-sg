/**
 * How the Encik speaks to you, and how that changes as you outrank him.
 *
 * The recorded pack is 48 clips of one voice: a sergeant-major shouting at a
 * recruit. Those lines are the **base register** and they are frozen — a
 * changed character breaks the recording lookup, which matches on exact text.
 * Everything above is an **overlay**: a register declares only the events whose
 * wording changes, and resolution walks down to the nearest register that has
 * something to say. So a new register is as small as the joke needs it to be.
 *
 * Lines above the base have no recordings, and that is by design rather than
 * an oversight: `encikRecordingUrl` matches on exact text and finds nothing,
 * so the Encik simply goes quiet and keeps subtitling. The one thing a line
 * must not do is *become* a base line by accident, which the tests guard.
 *
 * `{rank}` is replaced with what the player's chosen insignia set calls them,
 * so he defers to a Colonel, a Marksman or a Legend in the player's own words.
 */
export type EncikTone = 'rank' | 'recruit';
export const DEFAULT_ENCIK_TONE: EncikTone = 'rank';
/** What the Encik calls a player whose insignia set has no titles at all. */
export const PLAIN_ADDRESS = 'boss';

/** The shipped lines. Recorded, and not to be edited without regenerating audio. */
export const ENCIK_LINES = {
  start: ['Alright, fall in! Eyes open, we move.', 'Stand by, ah. Weapon ready, brain also ready.', 'Listen in! Move together, come back together.'],
  contact: ['Contact front! Eyes open, don’t blur!', 'Got contact! Steady your aim, don’t kancheong.', 'Oi, front! This one not sightseeing tour!'],
  reload: ['Changing mag! Cover first, hero later.', 'Reloading, ah! Nobody say can take tea break.', 'Fresh mag going in. Steady, don’t fumble.'],
  lowAmmo: ['Ammo running low! Every round counts, ah.', 'Check your ammo! This one not unlimited buffet.', 'Rounds low already. Go find supplies.'],
  hurt: ['Find cover lah! You think your ILBV is magic?', 'Move, move! Don’t stand there like Merlion!', 'Taking fire! This one not the time to admire scenery.'],
  medical: ['Health low! Find medical supplies, don’t act hero.', 'You want to book out or not? Get patched up!', 'Wounded already! Cover first, then sort yourself out.'],
  kill: ['One down. Good shot, carry on!', 'Solid lah! Eyes up, still got work.', 'That one settled. Don’t anyhow celebrate yet.'],
  double: ['Double kill! Wah, today you on form ah!', 'Two down! Can lah, keep it steady.', 'Two already! Good grouping, soldier!'],
  triple: ['Triple kill! Encik saw that. Not bad, ah!', 'Three down! Steady lah, don’t get cocky.', 'Three already! This one got standard!'],
  multi: ['Wah, whole lot! Leave some for your section lah!', 'You clearing the whole parade square or what?', 'Solid work! Keep your head, don’t anyhow rush.'],
  pickup: ['Supplies secured. Check your kit, then move.', 'Got resupply! Take what you need, not shopping spree.', 'Good, gear sorted. Don’t leave anything behind, ah.'],
  moving: ['Move out! This one tactical movement, not route march.', 'Keep moving, ah. Don’t grow roots here.', 'Next bound! Eyes up, weapon ready.'],
  stuck: ['Eh, wall in front. Go around lah.', 'You fighting the enemy or fighting the wall?', 'Stuck again? Reverse, turn, try another way!'],
  death: ['Aiyoh. Next life, use the cover properly.', 'Down already. Learn from it, come back stronger.', 'Never mind. Regroup, then do properly.'],
  respawn: ['Back already? Good. This time, use your brain.', 'Fall in again! Same mission, better execution.', 'Another chance. Steady, don’t repeat the same stunt.'],
  complete: ['Exercise cut! Check clear, then we talk about book out.', 'End of exercise! Good effort, whole lot of you.', 'All targets down. Can lah! Now check your kit.'],
} as const;
export type EncikEvent = keyof typeof ENCIK_LINES;

export interface EncikRegister {
  id: string; name: string;
  /** Shown beside the setting, in the Encik's own terms. */
  description: string;
  /** First level that hears it. The base register must start at 1. */
  from: number;
  /** Only the events whose wording changes; the rest fall through below. */
  lines: Partial<Record<EncikEvent, readonly string[]>>;
}

/**
 * Four registers, and the arc is the joke: he stops insulting you, then starts
 * using your rank, then starts apologising for speaking at all. The thresholds
 * line up with the default insignia ladder — Veteran, Elite, Legend — so a
 * promotion and a change of tone land together.
 */
export const ENCIK_REGISTERS: readonly EncikRegister[] = [
  {
    id: 'recruit', name: 'Recruit', from: 1,
    description: 'Shouts at you like you just booked in. The recorded pack.',
    lines: ENCIK_LINES,
  },
  {
    id: 'noticed', name: 'Noticed', from: 12,
    description: 'Drops the insults. Still gruff, but he has been watching.',
    lines: {
      start: ['Fall in. You know the drill, so I won’t nag.', 'Stand by. Eyes open — you always do.', 'Listen in. Same as always: move together, come back together.'],
      contact: ['Contact front. You’ve seen worse.', 'Got contact. Steady, like you always are.', 'Front. You know what to do.'],
      reload: ['Changing mag. Cover first — you know this one.', 'Reloading. Take your time, no rush.', 'Fresh mag. Smooth, as usual.'],
      lowAmmo: ['Ammo low. You’re counting already, I know.', 'Rounds getting low. Keep an eye.', 'Check your ammo. Not that you forget.'],
      hurt: ['Taking fire. Get behind something.', 'You’re hit. Cover, then carry on.', 'Move. You’ve walked out of worse.'],
      medical: ['Health low. Patch up, don’t push it.', 'You’re hurt. Sort it out before the next bound.', 'Get patched. No shame in it.'],
      kill: ['Clean. Carry on.', 'Down. Good shot.', 'That one settled. Eyes up.'],
      double: ['Two down. Steady hands.', 'Double. You’re warmed up already.', 'Two in a row. Nice.'],
      triple: ['Three. Encik saw that one.', 'Triple. That’s a proper grouping.', 'Three down. Not bad at all.'],
      multi: ['Whole lot down. Wah.', 'You cleared it before I could call it.', 'That’s the whole lot. Respect.'],
      pickup: ['Supplies secured. You know your kit.', 'Resupply in. Carry on.', 'Got it. Sort your kit, move.'],
      moving: ['Next bound. Lead on.', 'Moving. Eyes up.', 'Keep going. You’ve got the tempo.'],
      stuck: ['Wall there. You saw it.', 'Eh, that one’s solid. Go around.', 'Blocked. Try the other side.'],
      death: ['Aiyoh. Even you can make mistake. Shake it off.', 'Down. Learn it, come back.', 'That one got you. Happens.'],
      respawn: ['Back up. Carry on where you left off.', 'Fall in again. Same mission.', 'Good. Go again.'],
      complete: ['All targets down. Steady, as expected.', 'Exercise cut. Good work.', 'Clear. That’s how it’s done.'],
    },
  },
  {
    id: 'respect', name: 'Respect', from: 20,
    description: 'Calls you by rank. Offers rather than orders.',
    lines: {
      start: ['Section ready when you are, {rank}.', 'Range is set, {rank}. Say the word.', 'Standing by, {rank}. Your pace.'],
      contact: ['Contact front, {rank}. Your call.', 'Contact, {rank} — I’ll leave it to you.', 'Front, {rank}. Ready when you are.'],
      reload: ['Changing mag, {rank}. Cover’s yours if you want it.', 'Reloading. Take the time you need, {rank}.', 'Fresh mag going in, {rank}.'],
      lowAmmo: ['Ammo low, {rank}. Flagging it, that’s all.', 'Rounds down, {rank}. Your call on resupply.', 'Getting low, {rank}. Thought you should know.'],
      hurt: ['You’re taking fire, {rank}. Cover when you can.', 'Hit, {rank}. I’ll watch the flank.', 'Incoming, {rank}. Say if you want me to call it.'],
      medical: ['Health’s low, {rank}. Patch up when you’re ready.', '{rank}, you’re hurt. I’d take a moment.', 'Wounded, {rank}. Your decision.'],
      kill: ['Target down. Nice work, {rank}.', 'Clean, {rank}.', 'Down. Textbook, {rank}.'],
      double: ['Two down, {rank}. Sharp.', 'Double, {rank}. Very good.', 'Two, {rank}. You’re on it.'],
      triple: ['Three, {rank}. Outstanding.', 'Triple, {rank}. That’s the standard.', 'Three down, {rank}. Well shot.'],
      multi: ['Whole lot, {rank}. I’ve got nothing to add.', 'Cleared, {rank}. Nothing for me to say.', 'All of them, {rank}. Noted.'],
      pickup: ['Supplies secured, {rank}.', 'Resupply in hand, {rank}.', 'Kit sorted, {rank}. Move when ready.'],
      moving: ['Moving on your lead, {rank}.', 'Next bound when you call it, {rank}.', 'With you, {rank}.'],
      stuck: ['Wall there, {rank}. Just flagging it.', 'That one’s solid, {rank}.', 'Blocked, {rank}. Other side’s open.'],
      death: ['Down, {rank}. Take your time, we’ll reset.', '{rank} is down. Reset when you’re ready.', 'Aiyoh — {rank}, that was a bad one. We go again.'],
      respawn: ['Back with us, {rank}.', 'Ready when you are, {rank}.', '{rank} on deck. Your call.'],
      complete: ['Exercise complete, {rank}. Anything you want run again?', 'All down, {rank}. Good session.', 'Clear, {rank}. Your debrief.'],
    },
  },
  {
    id: 'defers', name: 'Defers', from: 35,
    description: 'Apologises for speaking. Asks you what to tell the recruits.',
    lines: {
      start: ['Range is yours, {rank}. I’ll stay out of the way.', '{rank} on the range. Everybody look and learn.', 'Whenever you’re ready, {rank}. No rush from me.'],
      contact: ['Contact front, {rank} — sorry, you saw it already.', 'Contact, {rank}. Ignore me, carry on.', '{rank}, front. Though you’d have called it first.'],
      reload: ['Reloading, {rank}. I’ll cover — if that’s alright.', 'Changing mag, {rank}. Say if you’d rather I didn’t call it.', 'Fresh mag, {rank}. You don’t need the reminder.'],
      lowAmmo: ['Ammo, {rank} — sorry, you’re counting already.', 'Rounds low, {rank}. I’ll stop mentioning it.', '{rank}, ammo. You knew. Of course you knew.'],
      hurt: ['{rank} is hit! Sorry — should have called that sooner.', 'Taking fire, {rank}. My fault, I was slow.', '{rank}, cover — sorry, you’re already moving.'],
      medical: ['{rank}, please patch up. Please.', 'Health low, {rank}. I’d never tell you what to do, but.', '{rank} is wounded! Somebody — no, {rank} has it.'],
      kill: ['Textbook, {rank}. I’ll use that for the next batch.', 'Beautiful, {rank}.', 'Down. I couldn’t have called it better, {rank}.'],
      double: ['Two, {rank}. The recruits should see this.', 'Double, {rank}. I’m taking notes.', 'Two down. Wah, {rank}.'],
      triple: ['Three, {rank}! Sorry — three, {rank}.', 'Triple. {rank}, that goes in the brief.', 'Three down, {rank}. Incredible.'],
      multi: ['{rank}… I’ve got nothing. That was the whole lot.', 'All of them, {rank}. I’ll be quiet now.', 'Whole lot down. {rank}, teach me that one.'],
      pickup: ['Supplies, {rank}. I’ll carry it if you want.', 'Kit’s yours, {rank}.', 'Resupply, {rank}. Anything else you need?'],
      moving: ['After you, {rank}.', 'Leading where, {rank}? I’ll follow.', 'Moving, {rank}. Your bound, your pace.'],
      stuck: ['Wall there, {rank}. Not that you need me to say.', 'That one’s solid, {rank}. Sorry.', '{rank}, the wall. I’ll shut up.'],
      death: ['{rank}! Sorry — I should have called it earlier. My fault.', '{rank} is down. That one’s on me.', 'Aiyoh, {rank}. I’ll take the blame for that one.'],
      respawn: ['{rank} is back. Carry on, everyone.', 'Welcome back, {rank}. Ready when you are.', '{rank} on deck again. Nothing from me.'],
      complete: ['All clear, {rank}. Anything I should tell the recruits?', 'Exercise complete, {rank}. Was that to your standard?', 'Clear, {rank}. I’ll write it up however you like.'],
    },
  },
];
export const BASE_REGISTER = ENCIK_REGISTERS[0];

/** Who the Encik is talking to, resolved fresh so a level-up is heard mid-session. */
export interface EncikAddress { level: number; rank: string; tone: EncikTone }
export const DEFAULT_ADDRESS: EncikAddress = { level: 1, rank: PLAIN_ADDRESS, tone: DEFAULT_ENCIK_TONE };

/** The register a level hears; `recruit` tone pins it to the recorded base. */
export function encikRegister(address: EncikAddress = DEFAULT_ADDRESS): EncikRegister {
  if (address.tone === 'recruit') return BASE_REGISTER;
  const level = Number.isFinite(address.level) ? address.level : 1;
  let found = BASE_REGISTER;
  for (const register of ENCIK_REGISTERS) if (register.from <= level) found = register;
  return found;
}
/**
 * Lines for an event, from the nearest register at or below the player's that
 * has any. A register saying nothing about `stuck` keeps the one below rather
 * than needing a copy of it.
 */
export function encikLines(event: EncikEvent, address: EncikAddress = DEFAULT_ADDRESS): readonly string[] {
  if (address.tone === 'recruit') return ENCIK_LINES[event];
  const level = Number.isFinite(address.level) ? address.level : 1;
  for (let i = ENCIK_REGISTERS.length - 1; i >= 0; i--) {
    const register = ENCIK_REGISTERS[i];
    if (register.from > level) continue;
    const lines = register.lines[event];
    if (lines?.length) return lines;
  }
  return ENCIK_LINES[event];
}
/** Puts the player's own rank into a line. An empty rank never leaves a gap. */
export const addressLine = (text: string, rank: string) =>
  text.replace(/\{rank\}/g, rank.trim() || PLAIN_ADDRESS);
