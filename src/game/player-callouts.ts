import type { OrderKind } from './squad-orders';

/**
 * What a player can say from the callout wheel, a page at a time, one slot per
 * direction. A callout travels between peers as its id only, never as typed
 * text, so a room cannot be used for free chat and every screen shows the same
 * words; the host picks which of a callout's lines is said.
 *
 * Only the Orders page changes what bots do (`order`, see squad-orders): the
 * rest is talk, and the wheel says so. No bot acknowledges talk, so nothing
 * that does nothing sounds as if it did.
 *
 * `reply: 'taunt'` lets an enemy close enough to hear it take it personally,
 * in words only. `ping` marks the spot the player is looking at, so
 * "Contact!" says where.
 */
export type CalloutReply = 'taunt';
export interface PlayerCallout {
  id: string;
  /** On the wheel. */
  label: string;
  /** What is said; the host picks one. */
  lines: readonly string[];
  reply?: CalloutReply;
  ping?: boolean;
  /** Allies act on it. */
  order?: OrderKind;
}
export interface CalloutPage { id: string; name: string; callouts: readonly PlayerCallout[] }

export const CALLOUT_PAGES: readonly CalloutPage[] = [
  { id: 'orders', name: 'Orders', callouts: [
    { id: 'gather', label: 'Gather on me', order: 'gather', lines: ['On me! Regroup!', 'Section, gather on me!', 'Everybody, form up on me!'] },
    { id: 'move-there', label: 'Move there', order: 'move', ping: true, lines: ['Move up there!', 'Go there, take that spot!', 'Section, move to that position!'] },
    { id: 'hold-position', label: 'Hold position', order: 'hold', lines: ['Hold position! Nobody move!', 'Stay where you are, hold!', 'Hold this line!'] },
    { id: 'focus-fire', label: 'Focus fire', order: 'focus', ping: true, lines: ['Focus fire on that one!', 'Everybody shoot that one!', 'Target there, all fire!'] },
    { id: 'scatter', label: 'Scatter', order: 'scatter', lines: ['Scatter! Spread out!', 'Don’t bunch up, scatter!', 'Split up, now!'] },
    { id: 'reinforce', label: 'Reinforce', order: 'reinforce', lines: ['HQ, need reinforcements at my position!', 'Request backup, over!', 'Send more men, we’re getting whacked!'] },
  ] },
  { id: 'tactical', name: 'Tactical', callouts: [
    { id: 'contact', label: 'Contact!', lines: ['Contact! Over there!', 'Enemy there! Eyes on!', 'Got people there!'], ping: true },
    { id: 'need-ammo', label: 'Need ammo', lines: ['Need ammo! Anyone got spare mag?', 'Running dry! Ammo, please!', 'Ammo! I’m shooting air already!'] },
    { id: 'need-medic', label: 'Medic!', lines: ['Medic! I kena already!', 'Need medic! Fast fast!', 'Bandage! Anybody got bandage?'] },
    { id: 'cover-me', label: 'Cover me', lines: ['Cover me, I’m moving!', 'Cover! Moving now!', 'Watch my back ah!'] },
    { id: 'reloading', label: 'Reloading', lines: ['Reloading! Cover!', 'Mag change!', 'Changing mag, wait ah!'] },
    { id: 'enemy-down', label: 'Enemy down', lines: ['Enemy down!', 'Got one!', 'One less, settled.'] },
    { id: 'clear', label: 'Area clear', lines: ['Clear!', 'Area clear, nobody here.', 'All clear on my side.'] },
    { id: 'sniper', label: 'Sniper!', lines: ['Sniper! There!', 'Got sniper, watch out!', 'Glint there, sniper!'], ping: true },
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
/** Most slots a page has; a page with fewer spaces them evenly. */
export const WHEEL_SLOTS = 8;
/**
 * The slot of `slots` a pointer offset points at, 0 at the top and clockwise,
 * or null in the dead zone. `x` is right and `y` down, as screen and mouse
 * movement are.
 */
export function wheelSlot(x: number, y: number, slots = WHEEL_SLOTS, deadZone = 28): number | null {
  if (!Number.isFinite(x) || !Number.isFinite(y) || Math.hypot(x, y) < deadZone || slots < 1) return null;
  const angle = Math.atan2(x, -y), step = Math.PI * 2 / slots;
  return ((Math.round(angle / step) % slots) + slots) % slots;
}
