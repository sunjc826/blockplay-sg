import { itemById } from './armory-catalog';
import { getArenaFaction } from './arena-factions';
import { getBotRank } from './arena-ranks';
import type { ArenaActor, ArenaFeed, ArenaShot } from './arena-rules';
import { FPS_WEAPONS } from './fps-rules';

/** How long an expedition holds the scene of death before the respawn map; skippable. Arena matches hold it until the respawn. */
export const DEATH_WINDOW_SECONDS = 4;
/** After this long the camera has finished collapsing and pulling back. */
export const DEATH_CAM_SETTLED = 2.1;
/** The view leaves the body here, so the body can be shown: until now the camera was inside it. */
export const DEATH_CAM_LEAVES_BODY = .85;
const COLLAPSE_SECONDS = .7, RISE_FROM = DEATH_CAM_LEAVES_BODY;
const VANTAGE_DISTANCE = 3.6, VANTAGE_HEIGHT = 2.1, VANTAGE_SIDE = .42, ORBIT_RATE = .05;

export interface DeathRecapKiller {
  id: string; name: string; rank: string | null; faction: string; weapon: string;
  /** Metres from where the last hit came from, or null when nothing says. */
  range: number | null;
  /** What they had left when you fell. */
  health: number; armor: number; alive: boolean;
  friendly: boolean;
}
export interface DeathRecapAttacker { name: string; damage: number; hits: number; killer: boolean }
export interface DeathRecapLife {
  seconds: number; kills: number; shots: number; hits: number;
  /** Whole percent, or null if no round was fired. */
  accuracy: number | null;
  damageDealt: number; distance: number; longestKill: number; credits: number;
}
export interface DeathRecap {
  serial: number;
  /** Null when no one is to blame, or you are: see `cause`. */
  killer: DeathRecapKiller | null;
  selfInflicted: boolean;
  /** What did it when no one did, or what you did it with. */
  cause: string;
  dealtToKiller: { damage: number; hits: number };
  attackers: DeathRecapAttacker[];
  life: DeathRecapLife;
  session: { kills: number; deaths: number };
  notes: string[];
}
/** The recap as the HUD shows it. */
export interface DeathRecapView extends DeathRecap {
  /** Seconds until the window closes, or null if it lasts until the respawn. */
  windowLeft: number | null;
}

type Point = { x: number; z: number };
const NEMESIS_TIMES = 2, CLOSE_CALL_HP = 25, DEPLOY_SNIPED_SECONDS = 6, LONG_SHOT_METRES = 80;

export const formatDuration = (seconds: number) => {
  const whole = Math.max(0, Math.round(seconds));
  return whole < 60 ? `${whole}s` : `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
};

const rankLabel = (grade: number) => { const id = getBotRank(grade)?.id; return id ? id[0].toUpperCase() + id.slice(1) : null; };

/** What was in their hands: the bot's catalog variant, else the family it belongs to. */
export function actorWeaponName(actor: Pick<ArenaActor, 'variant' | 'weapon' | 'vehicle'>) {
  if (actor.vehicle) return actor.vehicle === 'car' ? 'Vehicle gun' : 'Helicopter gun';
  return (actor.variant ? itemById(actor.variant)?.name : undefined) ?? FPS_WEAPONS[actor.weapon]?.name ?? 'Unknown weapon';
}

/**
 * Counts one player's life from what the arena publishes, so hosts and guests
 * get the same recap: nothing here reaches into the simulation.
 */
export function createDeathRecapTracker() {
  let lifeStart = 0, startKills = 0, startShots = 0, startEarned = 0, started = false;
  let distance = 0, longestKill = 0, damageDealt = 0, hitsLanded = 0;
  let last: Point | null = null, lastSerial = -1, lastStruck: ArenaActor['hurtFrom'] | null = null;
  let taken = new Map<string, { name: string; damage: number; hits: number }>();
  let dealt = new Map<string, { damage: number; hits: number }>();
  const killedBy = new Map<string, number>();
  let bestSeconds = 0, bestKills = 0, recaps = 0;

  function beginLife(self: ArenaActor, elapsed: number, earned: number) {
    lifeStart = elapsed; startKills = self.kills; startShots = self.shots; startEarned = earned; started = true;
    distance = longestKill = damageDealt = hitsLanded = 0; last = { x: self.x, z: self.z }; lastStruck = null;
    taken = new Map(); dealt = new Map();
  }
  function tally(key: string, name: string, damage: number, struck: boolean) {
    const entry = taken.get(key) ?? { name, damage: 0, hits: 0 };
    entry.damage += damage; if (struck) entry.hits++;
    taken.set(key, entry);
  }
  return {
    /** Once per frame, with the same frame the engine is about to act on. */
    observe(self: ArenaActor, previous: ArenaActor | null, frame: { elapsed: number; earned: number; actors: readonly ArenaActor[]; hit: ArenaShot | null; feed: readonly ArenaFeed[] }) {
      // A new match restarts the clock and every count.
      if (started && (frame.elapsed < lifeStart || self.kills < startKills || self.shots < startShots)) { started = false; killedBy.clear(); bestSeconds = bestKills = 0; recaps = 0; }
      if (self.alive && (!started || previous && !previous.alive)) beginLife(self, frame.elapsed, frame.earned);
      if (!started || !previous?.alive) return;
      if (last) { const step = Math.hypot(self.x - last.x, self.z - last.z); if (step < 25) distance += step; }
      last = { x: self.x, z: self.z };
      const struck = self.hurtFrom && self.hurtFrom.serial !== lastSerial ? self.hurtFrom : null;
      if (self.hurtFrom) lastSerial = self.hurtFrom.serial;
      if (struck) lastStruck = struck;
      const lost = previous.health + previous.armor - self.health - self.armor;
      if (lost > 0) {
        const by = struck?.by ? frame.actors.find(actor => actor.id === struck.by) : undefined;
        if (!struck) tally('hazard', 'Hazards', lost, false);
        else if (struck.by) tally(struck.by, by?.name ?? 'Unknown', lost, true);
        else tally(`cause:${struck.cause ?? 'Unknown'}`, struck.cause ?? 'Unknown', lost, true);
      }
      if (frame.hit?.hitId && frame.hit.damage > 0) {
        damageDealt += frame.hit.damage; hitsLanded++;
        const entry = dealt.get(frame.hit.hitId) ?? { damage: 0, hits: 0 };
        entry.damage += frame.hit.damage; entry.hits++; dealt.set(frame.hit.hitId, entry);
      }
      for (const event of frame.feed) {
        if (event.killerId !== self.id || !event.victimId || event.victimId === self.id) continue;
        const victim = frame.actors.find(actor => actor.id === event.victimId);
        if (victim) longestKill = Math.max(longestKill, Math.hypot(victim.x - self.x, victim.z - self.z));
      }
    },
    /** The recap for the life that just ended. Call on the frame the player falls, after observe. */
    die(self: ArenaActor, frame: { elapsed: number; earned: number; actors: readonly ArenaActor[]; feed: readonly ArenaFeed[] }): DeathRecap {
      const fatal = [...frame.feed].reverse().find(event => event.victimId === self.id);
      const killerId = fatal ? fatal.killerId : lastStruck?.by;
      const selfInflicted = killerId === self.id;
      const body = killerId && !selfInflicted ? frame.actors.find(actor => actor.id === killerId) : undefined;
      const seconds = Math.max(0, frame.elapsed - lifeStart), kills = self.kills - startKills, shots = self.shots - startShots;
      const named = killerId && !selfInflicted ? body?.name ?? taken.get(killerId)?.name ?? fatal?.text.replace(/ eliminated .*$/, '') : undefined;
      const killer: DeathRecapKiller | null = killerId && !selfInflicted && named ? {
        id: killerId, name: named, rank: body?.rank ? rankLabel(body.rank) : null,
        faction: body ? getArenaFaction(body.faction)?.name ?? '' : '',
        weapon: fatal?.cause ?? (body ? actorWeaponName(body) : 'Unknown weapon'),
        range: lastStruck && lastStruck.by === killerId ? Math.hypot(lastStruck.x - self.x, lastStruck.z - self.z) : body ? Math.hypot(body.x - self.x, body.z - self.z) : null,
        health: body?.health ?? 0, armor: body?.armor ?? 0, alive: !!body?.alive,
        friendly: !!body && body.faction === self.faction,
      } : null;
      const cause = fatal?.cause ?? lastStruck?.cause ?? (selfInflicted ? 'Your own hand' : 'Unknown causes');
      const dealtToKiller = (killer && dealt.get(killer.id)) || { damage: 0, hits: 0 };
      const attackers = [...taken.entries()].map(([key, entry]) => ({ ...entry, killer: key === killerId }))
        .sort((a, b) => b.damage - a.damage).slice(0, 3);
      const notes: string[] = [];
      if (killer) {
        const times = (killedBy.get(killer.id) ?? 0) + 1; killedBy.set(killer.id, times);
        if (times >= NEMESIS_TIMES) notes.push(`${killer.name} has killed you ${times} times. Nemesis.`);
        if (killer.alive && killer.health + killer.armor <= CLOSE_CALL_HP) notes.push(`So close: they are down to ${Math.ceil(killer.health + killer.armor)} HP.`);
        if ((killer.range ?? 0) >= LONG_SHOT_METRES) notes.push(`Picked off from ${Math.round(killer.range!)} m away.`);
      }
      const hadPrior = recaps > 0;
      if (hadPrior && seconds > bestSeconds) notes.push('Your longest life this session.');
      if (hadPrior && kills > bestKills) notes.push('Your most eliminations in a single life.');
      if (seconds < DEPLOY_SNIPED_SECONDS) notes.push(`Down within ${formatDuration(seconds)} of deploying.`);
      bestSeconds = Math.max(bestSeconds, seconds); bestKills = Math.max(bestKills, kills);
      recaps++;
      return {
        serial: self.deaths, killer, selfInflicted, cause, dealtToKiller, attackers,
        life: { seconds, kills, shots, hits: hitsLanded, accuracy: shots > 0 ? Math.min(100, Math.round(hitsLanded / shots * 100)) : null,
          damageDealt: Math.round(damageDealt), distance: Math.round(distance), longestKill: Math.round(longestKill), credits: Math.max(0, frame.earned - startEarned) },
        session: { kills: self.kills, deaths: self.deaths },
        notes: notes.slice(0, 2),
      };
    },
    /** Where the fatal hit came from, for a death nobody can be followed for. */
    lastSource: (): Point | null => lastStruck ? { x: lastStruck.x, z: lastStruck.z } : null,
  };
}

export interface DeathCamShot {
  x: number; y: number; z: number;
  look: { x: number; y: number; z: number };
  /** Radians around the view axis. */
  roll: number; fov: number;
  /** The shot has pulled away from the body and should keep clear of scenery. */
  clear: boolean;
}
const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const smoother = (value: number) => { const t = clamp01(value); return t * t * t * (t * (t * 6 - 15) + 10); };
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * The first-person view drops with the body, then lifts away behind it so the
 * body sits in the foreground with whoever did it beyond. `source` fixes which
 * side of the body that vantage is on, so a killer running around does not
 * swing the whole shot; only the look follows them. Reduced motion skips the
 * fall and the drift and holds the vantage from the first frame.
 */
export function createDeathCam(start: { eye: { x: number; y: number; z: number }; yaw: number; pitch: number; feet: number; body: Point; source: Point | null; reduced?: boolean }) {
  const { eye, yaw, pitch, feet, body, source, reduced } = start;
  const away = source && Math.hypot(body.x - source.x, body.z - source.z) > .5 ? Math.atan2(body.x - source.x, body.z - source.z) : yaw;
  const rollSide = Math.sin(yaw * 7.3) >= 0 ? 1 : -1;
  const groundEye = feet + .38;
  const forward = { x: -Math.sin(yaw) * Math.cos(pitch), y: Math.sin(pitch), z: -Math.cos(yaw) * Math.cos(pitch) };
  return {
    shot(age: number, target: { x: number; y: number; z: number } | null): DeathCamShot {
      const orbit = reduced ? 0 : Math.max(0, age - RISE_FROM) * ORBIT_RATE;
      const bearing = away + VANTAGE_SIDE * rollSide + orbit;
      const vantage = { x: body.x + Math.sin(bearing) * VANTAGE_DISTANCE, y: feet + VANTAGE_HEIGHT, z: body.z + Math.cos(bearing) * VANTAGE_DISTANCE };
      const span = target ? Math.hypot(target.x - body.x, target.z - body.z) : 0;
      // Look past the body at them, near or far; with nobody to look at, down at the body.
      const reach = target ? Math.min(span, 14) / Math.max(span, .001) : 0;
      const look = target
        ? { x: body.x + (target.x - body.x) * reach, y: mix(feet + .3, target.y - .4, reach), z: body.z + (target.z - body.z) * reach }
        : { x: body.x, y: feet + .4, z: body.z };
      const fov = mix(60, 50, clamp01((span - 25) / 90));
      if (reduced) return { ...vantage, look, roll: 0, fov, clear: true };
      const fall = clamp01(age / COLLAPSE_SECONDS), drop = fall * fall;
      const fallen = { x: eye.x, y: mix(eye.y, Math.min(eye.y, groundEye), drop), z: eye.z };
      const lying = { x: eye.x + forward.x * 10, y: fallen.y + forward.y * 10 * (1 - fall) + 1.2 * fall, z: eye.z + forward.z * 10 };
      const rise = smoother((age - RISE_FROM) / (DEATH_CAM_SETTLED - RISE_FROM));
      return {
        x: mix(fallen.x, vantage.x, rise), y: mix(fallen.y, vantage.y, rise), z: mix(fallen.z, vantage.z, rise),
        look: { x: mix(lying.x, look.x, rise), y: mix(lying.y, look.y, rise), z: mix(lying.z, look.z, rise) },
        roll: rollSide * .55 * (1 - (1 - fall) * (1 - fall)) * (1 - rise), fov: mix(65, fov, rise), clear: rise > 0,
      };
    },
  };
}
