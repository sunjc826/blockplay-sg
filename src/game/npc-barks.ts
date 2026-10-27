import type { ArenaSide } from './arena-factions';
import type { BotRankId } from './arena-ranks';

/**
 * What soldiers shout in a fight, by who they are. The faction sets the voice
 * (forces talk like a section out of NS; Black Kite talk like contractors
 * counting the invoice), the rank sets the nerve (recruits panic, regulars
 * report, veterans give orders), and the role adds its own trade on top: a
 * gunner changes belts, a marksman relocates.
 *
 * Lines are subtitles only for now. When voices are recorded, a line's place
 * in its pool is its key (`barkKey`), so lines may be added at the end of a
 * pool but not reordered.
 */
export const BARK_EVENTS = ['contact', 'reloading', 'hurt', 'kill', 'man-down', 'healing', 'retreat', 'incoming', 'idle', 'ack', 'taunted'] as const;
export type BarkEvent = typeof BARK_EVENTS[number];
type BarkPool = Partial<Record<BarkEvent, readonly string[]>>;
export interface BarkVoice {
  /** By rank: every event must have lines at every rank. */
  ranks: Readonly<Record<BotRankId, Readonly<Record<BarkEvent, readonly string[]>>>>;
  /** By arena role id: only the events where the job changes the words. */
  roles: Readonly<Record<string, BarkPool>>;
}

const FORCES: BarkVoice = {
  ranks: {
    recruit: {
      contact: ['Contact! Contact! Got people shooting!', 'Wah, enemy there leh!', 'Contact front! I think…', 'Got movement! Got movement!'],
      reloading: ['Reloading! Cover me please!', 'Mag change! Wait ah, wait ah!', 'Aiyo, empty already!'],
      hurt: ['Ow! Kena hit!', 'Medic! I think I kena!', 'Walao, that one pain!'],
      kill: ['I got him! I actually got him!', 'Down already! Can book out now?', 'Eh, he drop already!'],
      'man-down': ['Man down! Man down!', 'Aiyo, he kena already!', 'Medic! Someone go help him!'],
      healing: ['Patching up, don’t leave me ah!', 'Wait, wrapping bandage…', 'Hold on, hold on, I fix myself first.'],
      retreat: ['Pulling back! Pulling back!', 'Cannot tahan, falling back!', 'Too many of them lah!'],
      incoming: ['Incoming! Take cover!', 'Walao, what is that?!', 'Get down! Get down!'],
      idle: ['Wah, so hot today…', 'Eh, when can book out ah?', 'Who took my mess tin?', 'My ORD countdown still got so long…', 'Got kopi after this or not?'],
      ack: ['Roger!', 'Okay okay, coming!', 'Copy, on the way!'],
      taunted: ['Eh, don’t scold me lah!', 'Why you so fierce?'],
    },
    regular: {
      contact: ['Contact front, engaging!', 'Enemy spotted, my front!', 'Tango in sight!'],
      reloading: ['Changing mag!', 'Reloading, cover!', 'Mag out!'],
      hurt: ['I’m hit, still can fight!', 'Took one, carry on!', 'Kena graze, okay one.'],
      kill: ['Tango down.', 'One down.', 'Got him.'],
      'man-down': ['Man down! Cover him!', 'We lost one!', 'Casualty! Covering fire!'],
      healing: ['Applying dressing, cover me.', 'Patching up, thirty seconds.'],
      retreat: ['Falling back to cover!', 'Moving back, cover me!'],
      incoming: ['Incoming fire, get down!', 'Take cover, incoming!'],
      idle: ['Stay sharp.', 'Eyes open, they’re out there.', 'Section, spread out a bit.', 'Don’t bunch up, one grenade settle all.'],
      ack: ['Roger that.', 'Copy, moving.', 'Wilco.'],
      taunted: ['Language, soldier.', 'Talk less, shoot more.'],
    },
    veteran: {
      contact: ['Section, contact front! Rapid fire!', 'Enemy! Return fire!', 'Contact. Suppress and move.'],
      reloading: ['Changing mag, keep their heads down!', 'Covering fire while I reload!'],
      hurt: ['Just a scratch. Carry on!', 'Hit. Don’t stop.', 'Small thing. Keep firing.'],
      kill: ['Next.', 'Neutralised. Keep moving.', 'Don’t celebrate, still got more.'],
      'man-down': ['Casualty! Drag him to cover!', 'Man down, keep firing!', 'Somebody cover the casualty, now!'],
      healing: ['Patching. Hold the line.', 'Give me ten seconds. Nobody move.'],
      retreat: ['Break contact, fall back by pairs!', 'Pull back to the last cover. Move!'],
      incoming: ['Incoming! Everybody down, now!', 'Shelling! Get off the open ground!'],
      idle: ['Wake up your idea, eyes on your sector!', 'Don’t anyhow walk.', 'Ownself check ownself.', 'You all walk like on a shopping trip.'],
      ack: ['Roger, I cover you.', 'Copy. Moving up.', 'On me. Go.'],
      taunted: ['Say that again, I make you knock it down.', 'Wah, very brave on the radio ah.'],
    },
  },
  roles: {
    tank: {
      contact: ['Gun up! Suppressing!', 'Machine gun, rapid fire!'],
      reloading: ['Changing belt! Gun down!', 'Gun down, belt change!'],
      kill: ['Gun got him.'],
    },
    sniper: {
      contact: ['Glass on target.', 'I have him in my scope.'],
      kill: ['Target down.', 'One shot.'],
      retreat: ['Too close, relocating.'],
    },
  },
};

const MERCENARIES: BarkVoice = {
  ranks: {
    recruit: {
      contact: ['Uh, contact! Contact!', 'Is that them? That’s them!', 'Hostiles! I see hostiles!'],
      reloading: ['Reloading! Is that bad?', 'Mag out, mag out!', 'Why is it empty already?'],
      hurt: ['I’m hit! This was not in the contract!', 'Argh! Medical’s covered, right?', 'They shot me! They actually shot me!'],
      kill: ['Did I get him? I got him!', 'Bonus! That’s a bonus!', 'Is he… okay, he’s down.'],
      'man-down': ['We lost one! Oh man…', 'He’s down! What do we do?', 'Medic! Do we have a medic?'],
      healing: ['Patching up, don’t look at me!', 'How do these bandages even work?'],
      retreat: ['Nope, nope, falling back!', 'I’m not paid enough for this!', 'Back! Everybody back!'],
      incoming: ['Incoming! Incoming!', 'What was that?! Down!'],
      idle: ['Does this job have dental?', 'They said it’d be a quiet posting.', 'Anyone know a good chicken rice place?', 'Is it always this humid?', 'My mum thinks I’m in logistics.'],
      ack: ['On it!', 'Okay! Okay!'],
      taunted: ['Did he just swear at me?', 'Hey! That’s rude!', 'What does that even mean?'],
    },
    regular: {
      contact: ['Hostiles, engaging.', 'Contact, moving to cover.', 'Eyes on target.'],
      reloading: ['Reloading.', 'Changing mags.', 'Mag out, cover me.'],
      hurt: ['Took a hit, still in it.', 'I’m hit. Not bad.', 'Plate caught it.'],
      kill: ['Hostile down.', 'Target neutralised.', 'That’s billable.'],
      'man-down': ['Operator down!', 'Lost one. Watch your sectors.', 'Man down, push them back!'],
      healing: ['Patching up. Cover.', 'Dressing on. Give me a second.'],
      retreat: ['Breaking contact.', 'Falling back to cover.'],
      incoming: ['Incoming, scatter!', 'Get off the street!'],
      idle: ['Quiet. Too quiet.', 'Payday’s Friday. Stay alive till then.', 'Check your corners.', 'Hate this weather.'],
      ack: ['Copy.', 'Moving.'],
      taunted: ['Big talk from a conscript.', 'Keep talking, we’ll find you.'],
    },
    veteran: {
      contact: ['Contact. Flank them, push left.', 'Hostiles. Pin them down.', 'There. Light them up.'],
      reloading: ['Reloading. Keep them pinned.', 'Changing. Don’t let up.'],
      hurt: ['Hit. Still standing.', 'That’ll cost them.', 'Plate held. Push.'],
      kill: ['Clean.', 'Scratch one.', 'Next.'],
      'man-down': ['Man down. Hold formation.', 'We’ll invoice them for that one.', 'Lost one. Make it count.'],
      healing: ['Stitching up. Hold.', 'Thirty seconds. Hold them.'],
      retreat: ['Fall back. Regroup on me.', 'Pull back, draw them in.'],
      incoming: ['Shelling! Off the street!', 'Incoming. Find a roof.'],
      idle: ['Stay frosty.', 'Twenty years in this trade. Never seen humidity like this.', 'If you see the soldiers, don’t be a hero. Be paid.', 'Eyes up. They know this town better than us.'],
      ack: ['Understood.', 'On it.'],
      taunted: ['Cute. Keep talking.', 'Words. I prefer invoices.'],
    },
  },
  roles: {
    tank: {
      contact: ['Laying down fire!', 'Heavy gun, suppressing!'],
      reloading: ['Belt change, gun’s down!', 'Feeding a new belt!'],
    },
    sniper: {
      contact: ['Scope on target.', 'I see him. Hold still…'],
      kill: ['Target down. Relocating.', 'One shot, one invoice.'],
      retreat: ['Too close for the long gun, moving!'],
    },
    'mortar-crew': {
      contact: ['They found the tube! Protect the mortar!', 'Hostiles on the pit!'],
      'man-down': ['Loader’s down! Tube’s half crewed!'],
    },
    overwatch: {
      contact: ['Overwatch has eyes on.', 'On the scope. Sending it.'],
      kill: ['Target down from up here.'],
    },
  },
};

const VOICES: Readonly<Record<string, BarkVoice>> = { 'armed-forces': FORCES, mercenaries: MERCENARIES };
/** A faction without its own voice speaks like the side it fights on. */
const SIDE_VOICE: Readonly<Record<ArenaSide, BarkVoice>> = { forces: FORCES, opposition: MERCENARIES };
export const RANK_IDS: readonly BotRankId[] = ['recruit', 'regular', 'veteran'];

export interface BarkSpeaker { faction: string; side?: ArenaSide; role: string; rank?: number }
const voiceOf = (speaker: BarkSpeaker) => VOICES[speaker.faction] ?? SIDE_VOICE[speaker.side ?? 'opposition'];
const rankOf = (rank?: number): BotRankId => RANK_IDS[Math.max(0, Math.min(2, (rank ?? 2) - 1))];

/** Everything this speaker might say for an event: their role's lines, then their rank's. */
export function barkLines(speaker: BarkSpeaker, event: BarkEvent): readonly string[] {
  const voice = voiceOf(speaker);
  return [...voice.roles[speaker.role]?.[event] ?? [], ...voice.ranks[rankOf(speaker.rank)][event]];
}
/** A stable name for a line, for a recording to be found by. */
export function barkKey(speaker: BarkSpeaker, event: BarkEvent, text: string) {
  const voice = voiceOf(speaker), faction = VOICES[speaker.faction] ? speaker.faction : speaker.side === 'forces' ? 'armed-forces' : 'mercenaries';
  const role = voice.roles[speaker.role]?.[event]?.indexOf(text) ?? -1;
  if (role >= 0) return `${faction}.${speaker.role}.${event}.${role}`;
  const rank = rankOf(speaker.rank), index = voice.ranks[rank][event].indexOf(text);
  return index >= 0 ? `${faction}.${rank}.${event}.${index}` : null;
}

/**
 * How often anyone speaks. A firefight is full of reasons to shout; without
 * these it would be a wall of text. `gap` is the quiet between any two barks
 * in the district (urgent ones skip it), `speaker` between two from one
 * soldier, `event` between two of one kind from one faction, and `chance`
 * the share of reasons that are actually voiced.
 */
export const BARK_TUNING = {
  gap: 1.1, speaker: 6,
  event: { contact: 7, reloading: 8, hurt: 7, kill: 5, 'man-down': 5, healing: 12, retreat: 10, incoming: 8, idle: 25, ack: 0, taunted: 3 } satisfies Record<BarkEvent, number>,
  chance: { contact: .9, reloading: .55, hurt: .45, kill: .7, 'man-down': .9, healing: .7, retreat: .7, incoming: .8, idle: 1, ack: 1, taunted: 1 } satisfies Record<BarkEvent, number>,
  urgent: ['man-down', 'incoming', 'ack', 'taunted'] as readonly BarkEvent[],
  /** Seconds a soldier must go without a fight before they idle-chat, and the gap between idle lines in the district. */
  calm: 15, idleEvery: [22, 40] as const,
  /** How far an idle bark may be from a player for it to be worth saying. */
  idleRange: 40,
};
/** Who hears what, in metres: enemies are overheard nearby, friendlies are on the radio, and a bubble shows over a speaker's head within `bubble`. */
export const BARK_RANGE = { overheard: 35, radio: 150, bubble: 60, reply: 40 };

/** Decides whether a reason to speak is voiced, and with which line. Its own random stream, so the fight it narrates replays unchanged. */
export function createBarkDirector(random: () => number) {
  let lastAt = -Infinity;
  const bySpeaker = new Map<string, number>(), byEvent = new Map<string, number>(), lastLine = new Map<string, string>();
  return {
    offer(id: string, speaker: BarkSpeaker, event: BarkEvent, now: number): string | null {
      const urgent = BARK_TUNING.urgent.includes(event), key = `${speaker.faction}:${event}`;
      if (!urgent && now - lastAt < BARK_TUNING.gap) return null;
      if (event !== 'ack' && event !== 'taunted' && now - (bySpeaker.get(id) ?? -Infinity) < BARK_TUNING.speaker) return null;
      if (now - (byEvent.get(key) ?? -Infinity) < BARK_TUNING.event[event]) return null;
      if (random() >= BARK_TUNING.chance[event]) return null;
      const lines = barkLines(speaker, event); if (!lines.length) return null;
      let index = Math.min(lines.length - 1, Math.floor(random() * lines.length));
      // Never the same line twice running from one voice.
      if (lines.length > 1 && lines[index] === lastLine.get(key)) index = (index + 1) % lines.length;
      lastAt = now; bySpeaker.set(id, now); byEvent.set(key, now); lastLine.set(key, lines[index]);
      return lines[index];
    },
    reset() { lastAt = -Infinity; bySpeaker.clear(); byEvent.clear(); lastLine.clear(); },
  };
}
