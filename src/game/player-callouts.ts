/**
 * What a player can say from the callout wheel: three pages of eight, one per
 * direction. A callout travels between peers as its id only, never as typed
 * text, so a room cannot be used for free chat and every screen shows the same
 * words; the host picks which of a callout's lines is said.
 *
 * `reply` asks the bots for an answer: a nearby friendly acknowledges an
 * order, and an enemy close enough to hear a taunt takes it personally.
 * `ping` marks the spot the player is looking at, so "Contact!" says where.
 */
export type CalloutReply = 'ack' | 'taunt';
export interface PlayerCallout {
  id: string;
  /** On the wheel. */
  label: string;
  /** What is said; the host picks one. */
  lines: readonly string[];
  reply?: CalloutReply;
  ping?: boolean;
}
export interface CalloutPage { id: string; name: string; callouts: readonly PlayerCallout[] }

export const CALLOUT_PAGES: readonly CalloutPage[] = [
  { id: 'tactical', name: 'Tactical', callouts: [
    { id: 'contact', label: 'Contact!', lines: ['Contact! Over there!', 'Enemy there! Eyes on!', 'Got people there!'], reply: 'ack', ping: true },
    { id: 'need-ammo', label: 'Need ammo', lines: ['Need ammo! Anyone got spare mag?', 'Running dry! Ammo, please!', 'Ammo! I’m shooting air already!'], reply: 'ack' },
    { id: 'need-medic', label: 'Medic!', lines: ['Medic! I kena already!', 'Need medic! Fast fast!', 'Bandage! Anybody got bandage?'], reply: 'ack' },
    { id: 'cover-me', label: 'Cover me', lines: ['Cover me, I’m moving!', 'Cover! Moving now!', 'Watch my back ah!'], reply: 'ack' },
    { id: 'push', label: 'Chiong!', lines: ['Chiong ah! Push up!', 'Move up! Go go go!', 'Push! Don’t give them chance!'], reply: 'ack' },
    { id: 'fall-back', label: 'Fall back', lines: ['Fall back, fall back!', 'Too hot! Pull back!', 'Retreat! Regroup at the back!'], reply: 'ack' },
    { id: 'go-here', label: 'Go here', lines: ['Go there! Move!', 'Regroup there!', 'That spot! Go!'], reply: 'ack', ping: true },
    { id: 'hold', label: 'Hold here', lines: ['Hold here. Don’t anyhow move.', 'Hold position!', 'Stay put, watch your sector.'], reply: 'ack' },
  ] },
  { id: 'singlish', name: 'Singlish', callouts: [
    { id: 'knn', label: 'Knn', lines: ['Knn, who shoot me sia?!', 'Knn! Camping ah?!', 'Knn, again?!'], reply: 'taunt' },
    { id: 'walao', label: 'Walao eh', lines: ['Walao eh!', 'Walao, like that also can?!', 'Walao, so jialat!'] },
    { id: 'steady', label: 'Steady lah', lines: ['Steady lah!', 'Steady pom pi pi!', 'Wah, steady sia!'] },
    { id: 'shiok', label: 'Shiok', lines: ['Shiok ah!', 'Wah, damn shiok!', 'Shiok sia, that one!'] },
    { id: 'paiseh', label: 'Paiseh', lines: ['Paiseh, paiseh, my bad.', 'Paiseh ah, I anyhow shoot.', 'Sorry ah, hand slip.'] },
    { id: 'bo-jio', label: 'Bo jio', lines: ['Wah, fight also bo jio!', 'Bo jio!', 'Got loot never jio me?'] },
    { id: 'sian', label: 'Sian', lines: ['Sian… respawn again.', 'Sian half…', 'So sian, where are they?'] },
    { id: 'abuden', label: 'Abuden', lines: ['Abuden?', 'Abuden, obviously lah.', 'Then abuden, you think?'] },
  ] },
  { id: 'banter', name: 'Banter', callouts: [
    { id: 'own-time', label: 'Own time', lines: ['Own time, own target!', 'Relax, own time own target.'] },
    { id: 'dont-play', label: 'Don’t play', lines: ['Don’t play play!', 'Oi, don’t play play ah!'], reply: 'taunt' },
    { id: 'can-or-not', label: 'Can or not?', lines: ['Can or not?!', 'Eh, can do or cannot?', 'Can lah, sure can one.'] },
    { id: 'lag', label: 'Lag sia', lines: ['Wah lau, lag sia!', 'Not me, my wifi!', 'Lag! Confirm lag!'] },
    { id: 'kiasu', label: 'Kiasu', lines: ['Wah, so kiasu, camp until like that.', 'Kiasu until cannot.'], reply: 'taunt' },
    { id: 'thanks', label: 'Thanks, boss', lines: ['Thank you, boss!', 'Thanks ah, owe you kopi.', 'Steady, thanks!'] },
    { id: 'book-out', label: 'Book out', lines: ['Eh, book out already lah.', 'Can we book out now?', 'Wake me up when ORD.'] },
    { id: 'chope', label: 'Chope', lines: ['Chope! This spot mine.', 'Tissue packet on it. Chope already.', 'Don’t take, I chope already!'] },
  ] },
];
const BY_ID = new Map(CALLOUT_PAGES.flatMap(page => page.callouts.map(callout => [callout.id, callout] as const)));
export const getPlayerCallout = (id: unknown) => typeof id === 'string' ? BY_ID.get(id) : undefined;
/** Seconds between two callouts from one player, enforced by the host. */
export const CALLOUT_COOLDOWN = 1.2;
/** Which way on the wheel is which slot: 0 at the top, clockwise. */
export const WHEEL_SLOTS = 8;
/**
 * The slot a pointer offset points at, or null in the dead zone. `x` is right
 * and `y` down, as screen and mouse movement are.
 */
export function wheelSlot(x: number, y: number, deadZone = 28): number | null {
  if (!Number.isFinite(x) || !Number.isFinite(y) || Math.hypot(x, y) < deadZone) return null;
  const angle = Math.atan2(x, -y), step = Math.PI * 2 / WHEEL_SLOTS;
  return ((Math.round(angle / step) % WHEEL_SLOTS) + WHEEL_SLOTS) % WHEEL_SLOTS;
}
