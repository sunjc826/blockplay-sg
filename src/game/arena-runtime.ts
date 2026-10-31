import { validAircrewRole, aircrewPoint, helicopterCrew, rifleSeat } from './helicopter-crew';
import { validReinforcementClocks } from './naval-landings';
import { validTransport } from './combat-transports';
import { validRaiderBounty } from './combat-rewards';
import { MAX_CONFIRMED_IMPACTS, IMPACT_LIFETIME } from './confirmed-impacts';
import { createSceneCover } from './scene-cover';
import { validGrenadeConditions } from './grenade-effects';
import { MAX_GRENADES, MAX_GRENADE_EVENTS, validLiveGrenade, validGrenadeEvent, validThrowGrenade, type ThrowGrenade } from './grenade-system';
import { getWalkSurfaces, getTraversalObstacles } from './vertical-routes';
import { createVerticalMovement } from './vertical-movement';
import { createCharacterRig, type CharacterRig } from './character-rig';
import { arenaCharacterLook, arenaRoleColor } from './character-looks';
import { getArenaFaction, PLAYER_FACTION } from './arena-factions';
import { MARINA_BOUNDS } from './marina-collision';
import { PRONE_EYE_HEIGHT } from './fps-stance';
import { validVehicleControls, seatPoint } from './vehicle-seats';
import { VEHICLE_COMBAT } from './vehicle-combat';
import type { VehicleKind, VehicleState } from './vehicle-rules';
import { validWeaponIndex } from './fps-rules';
import * as THREE from 'three';
import { createArena, MAX_ARENA_ACTORS, MAX_ARENA_BARKS, MAX_ARENA_ROUNDS, SPAWN_SHIELD_SECONDS, type ArenaActor, type ArenaBark, type ArenaEnvironment, type ArenaFeed, type ArenaInput, type ArenaPoint, type ArenaRaiderState, type ArenaShot, type ArenaSnapshot, type ArenaVitals, type ArenaVehicleOptions } from './arena-rules';
import { createProfile, resolveLoadout, restoreProfile, type ArmoryProfile } from './armory-state';
import type { LanSession } from './lan-peer';
import { getArenaRole } from './arena-roles';
import { MAX_COMBAT_EVENTS, validCombatEvent, type CombatPlane } from './combat-events';
import { BARK_EVENTS, BARK_RANGE } from './npc-barks';
import { getPlayerCallout } from './player-callouts';
import { hostile } from './arena-factions';
import type { Obstacle } from './marina-collision';
import { FOOD_EFFECTS, type FoodEffectKind } from './food-effects';
import { createInputReconciliation } from './input-reconciliation';
import { createActorPresentation } from './actor-presentation';
import { validFacilitySnapshot } from './facilities';

export interface ArenaRuntimeFrame {
  snapshot: ArenaSnapshot | null; self: ArenaActor | null; connected: boolean; started: boolean;
  hit: ArenaShot | null; feed: ArenaFeed[]; spawn: boolean; vehicleNotice?: string; correction?: ArenaPoint; hardCorrection?: boolean;
  /** Barks and callouts said since the last frame, ours included. */
  barks: ArenaBark[];
}
export interface ArenaRuntimeOptions {
  scene: THREE.Scene; obstacles: readonly Obstacle[]; session: LanSession;
  profile?: ArmoryProfile; botCount: number; composition?: string;
  environment?: ArenaEnvironment; vehicles?: ArenaVehicleOptions; initialVitals?: Partial<ArenaVitals>;
}
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const RAIDER_STATES: readonly ArenaRaiderState[] = ['landing', 'landed', 'inbound', 'orbit', 'leaving', 'cruise', 'lock', 'dive', 'down', 'wreck', 'exploded'];
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
export function validArenaInput(value: unknown): value is ArenaInput {
  return object(value) && ['x', 'y', 'z', 'yaw', 'pitch'].every(key => finite(value[key])) &&
    validWeaponIndex(value.weapon) && typeof value.playing === 'boolean' &&
    (value.reloading === undefined || typeof value.reloading === 'boolean') &&
    (value.prone === undefined || typeof value.prone === 'boolean') &&
    (value.supply === undefined || finite(value.supply) && value.supply >= 0 && value.supply <= 1) &&
    (value.vehicleControls === undefined || validVehicleControls(value.vehicleControls));
}
export function validArenaSnapshot(value: unknown, environment?: ArenaEnvironment): value is ArenaSnapshot {
  if (object(value) && value.reinforcementClocks !== undefined && !validReinforcementClocks(value.reinforcementClocks)) return false;
  if (object(value) && value.facilities !== undefined && !validFacilitySnapshot(value.facilities)) return false;
  if (!object(value) || value.type !== 'arena-snapshot' || !finite(value.tick) || value.tick < 0 || !finite(value.elapsed) || value.elapsed < 0 || value.elapsed > (environment?.endless ? 1e9 : 181) ||
    typeof value.finished !== 'boolean' || typeof value.winner !== 'string' || value.winner.length > 80 || !Array.isArray(value.actors) || value.actors.length > MAX_ARENA_ACTORS || !Array.isArray(value.feed) || value.feed.length > 8) return false;
  const ids = new Set<string>();
  for (const actor of value.actors) {
    if (!object(actor) || typeof actor.id !== 'string' || actor.id.length > 100 || ids.has(actor.id) || typeof actor.name !== 'string' || actor.name.length > 24 ||
      !['x', 'y', 'z', 'yaw', 'pitch', 'health', 'armor', 'kills', 'deaths', 'respawnIn', 'shots', 'weapon'].every(key => finite(actor[key])) ||
      (actor.squad !== undefined && (typeof actor.squad !== 'string' || actor.squad.length > 100)) ||
      (actor.aircrew !== undefined && (!validAircrewRole(actor.aircrew) || typeof actor.transport !== 'string' || !actor.bot)) ||
      (actor.transport !== undefined && (typeof actor.transport !== 'string' || actor.transport.length > 100)) ||
      (actor.prone !== undefined && typeof actor.prone !== 'boolean') || (actor.aiming !== undefined && actor.aiming !== true) || (actor.scent !== undefined && actor.scent !== true) ||
      (actor.ground !== undefined && !(finite(actor.ground) && actor.ground >= -50 && actor.ground <= (actor.transport ? 405 : 124))) ||
      (actor.healing !== undefined && !(finite(actor.healing) && actor.healing >= 0 && actor.healing <= 1)) ||
      (actor.conditions !== undefined && !validGrenadeConditions(actor.conditions)) || (actor.grenade !== undefined && !['grenade-frag', 'grenade-smoke'].includes(String(actor.grenade))) || (actor.markedBy !== undefined && (!Array.isArray(actor.markedBy) || actor.markedBy.length > 8 || !actor.markedBy.every(id => typeof id === 'string' && id.length <= 100))) || (actor.food !== undefined && !validMeals(actor.food)) || (actor.ahMaSaves !== undefined && !(Number.isInteger(actor.ahMaSaves) && (actor.ahMaSaves as number) >= 0)) ||
      (actor.rank !== undefined && !(Number.isInteger(actor.rank) && (actor.rank as number) >= 1 && (actor.rank as number) <= 3)) ||
      (actor.shield !== undefined && !(finite(actor.shield) && actor.shield > 0 && actor.shield <= SPAWN_SHIELD_SECONDS)) ||
      (actor.reinforceIn !== undefined && !(Number.isInteger(actor.reinforceIn) && (actor.reinforceIn as number) > 0 && (actor.reinforceIn as number) <= 600)) ||
      (actor.hurtFrom !== undefined && !(object(actor.hurtFrom) && finite(actor.hurtFrom.x) && finite(actor.hurtFrom.z) && finite(actor.hurtFrom.serial) && (actor.hurtFrom.blast === undefined || actor.hurtFrom.blast === true))) || (actor.variant !== undefined && (typeof actor.variant !== 'string' || actor.variant.length > 40)) || !validWeaponIndex(actor.weapon) || typeof actor.alive !== 'boolean' || typeof actor.bot !== 'boolean' || typeof actor.faction !== 'string' || !getArenaFaction(actor.faction) || typeof actor.role !== 'string' || actor.role.length > 32 ||
      (actor.x as number) < (actor.transport ? -5000 : environment?.bounds.minX ?? -500) || (actor.x as number) > (actor.transport ? 5000 : environment?.bounds.maxX ?? 500) ||
      (actor.z as number) < (actor.transport ? -5000 : environment?.bounds.minZ ?? -500) || (actor.z as number) > (actor.transport ? 5000 : environment?.bounds.maxZ ?? 500) || (actor.y as number) < 0 || (actor.y as number) > (actor.transport ? 405 : 124) ||
      (actor.health as number) < 0 || (actor.health as number) > 300 || (actor.armor as number) < 0 || (actor.armor as number) > 150) return false;
    ids.add(actor.id);
  }
  if (value.grenades !== undefined && (!Array.isArray(value.grenades) || value.grenades.length > MAX_GRENADES || !value.grenades.every(validLiveGrenade) || new Set(value.grenades.map(g => g.serial)).size !== value.grenades.length)) return false;
  if (value.grenadeEvents !== undefined && (!Array.isArray(value.grenadeEvents) || value.grenadeEvents.length > MAX_GRENADE_EVENTS || !value.grenadeEvents.every(e => validGrenadeEvent(e, value.elapsed as number)) || new Set(value.grenadeEvents.map(e => e.serial)).size !== value.grenadeEvents.length)) return false;
  if (value.impacts !== undefined && !(Array.isArray(value.impacts) && value.impacts.length <= MAX_CONFIRMED_IMPACTS && value.impacts.every(e =>
    object(e) && Number.isSafeInteger(e.id) && (e.id as number) > 0 && finite(e.time) && e.time >= 0 && e.time <= (value.elapsed as number) && (value.elapsed as number) - e.time <= IMPACT_LIFETIME &&
    typeof e.victim === 'string' && e.victim.length <= 100 && point(e.point) && point(e.direction) && Math.abs(Math.hypot(e.direction.x, e.direction.y, e.direction.z) - 1) < .01 &&
    finite(e.calibre) && e.calibre >= 2 && e.calibre <= 25 && finite(e.power) && e.power > 0 && e.power <= 1000) && new Set(value.impacts.map(e => e.id)).size === value.impacts.length)) return false;
  if (value.rounds !== undefined && !(Array.isArray(value.rounds) && value.rounds.length <= MAX_ARENA_ROUNDS && value.rounds.every(r => object(r) && Number.isInteger(r.id) && point(r.origin) && point(r.direction) &&
    finite(r.velocity) && (r.velocity as number) > 0 && (r.velocity as number) <= 2000 && finite(r.drop) && (r.drop as number) >= 0 && (r.drop as number) <= 50 &&
    finite(r.limit) && (r.limit as number) >= 0 && (r.limit as number) <= 300 && finite(r.time) && (r.time as number) >= 0 && (r.time as number) <= 10 &&
    finite(r.calibre) && (r.calibre as number) >= 2 && (r.calibre as number) <= 25 && finite(r.power) && (r.power as number) >= 0 && (r.power as number) <= 300 &&
    (r.shooter === undefined || typeof r.shooter === 'string' && r.shooter.length <= 100) && (r.vehicle === undefined || r.vehicle === 'car' || r.vehicle === 'helicopter')))) return false;
  if (value.vehicles !== undefined) {
    if (!Array.isArray(value.vehicles) || value.vehicles.length !== 2) return false;
    const kinds = new Set<string>(), seated = new Set<string>();
    for (const v of value.vehicles) {
      if (!object(v) || (v.faction !== undefined && (typeof v.faction !== 'string' || !getArenaFaction(v.faction))) || (v.kind !== 'car' && v.kind !== 'helicopter') || kinds.has(v.kind) ||
        !['x', 'y', 'z', 'yaw', 'speed', 'climb', 'health', 'ammo', 'weaponCooldown', 'gunYaw', 'gunPitch', 'shots'].every(k => finite(v[k])) ||
        !Array.isArray(v.occupants) || v.occupants.length !== 4 || !Number.isInteger(v.ammo) || !Number.isInteger(v.shots) ||
        (v.shots as number) < 0 || (v.shots as number) > VEHICLE_COMBAT[v.kind].ammo ||
        (v.ammo as number) < 0 || (v.ammo as number) > VEHICLE_COMBAT[v.kind].ammo ||
        (v.health as number) < 0 || (v.health as number) > VEHICLE_COMBAT[v.kind].health ||
        (v.y as number) < .13 || (v.y as number) > 120 || Math.abs(v.speed as number) > 31 || Math.abs(v.climb as number) > 100 ||
        (v.weaponCooldown as number) < 0 || (v.weaponCooldown as number) > 3 ||
        (v.x as number) < (environment?.bounds.minX ?? -500) || (v.x as number) > (environment?.bounds.maxX ?? 500) ||
        (v.z as number) < (environment?.bounds.minZ ?? -500) || (v.z as number) > (environment?.bounds.maxZ ?? 500) ||
        !(v.shotEnd === null || point(v.shotEnd))) return false;
      kinds.add(v.kind);
      for (let seat = 0; seat < 4; seat++) {
        const id = v.occupants[seat]; if (id === null) continue;
        if (typeof id !== 'string' || seated.has(id) || v.health === 0) return false;
        const actor = value.actors.find(a => a.id === id);
        if (!actor?.alive || actor.vehicle !== v.kind || actor.seat !== seat) return false;
        seated.add(id);
      }
    }
    if (value.actors.some(a => (a.vehicle !== undefined || a.seat !== undefined) && !seated.has(a.id))) return false;
  } else if (value.actors.some(a => a.vehicle !== undefined || a.seat !== undefined)) return false;
  if (value.heat !== undefined && (!Array.isArray(value.heat) || value.heat.length > 64 || !value.heat.every(row => object(row) && typeof row.sector === 'string' && row.sector.length <= 64 &&
    [row['armed-forces'], row.mercenaries].every(h => finite(h) && h >= 0 && h <= 1)))) return false;
  if (value.events !== undefined) {
    if (!Array.isArray(value.events) || value.events.length > MAX_COMBAT_EVENTS) return false;
    const eventIds = new Set<string>();
    for (const event of value.events) {
      if (!validCombatEvent(event, value.elapsed as number, environment?.bounds) || eventIds.has(event.id)) return false;
      eventIds.add(event.id);
    }
  }
  if (value.transports !== undefined) {
    if (!Array.isArray(value.transports) || value.transports.length > MAX_COMBAT_EVENTS) return false;
    const owners = new Set<string>(), drivers = new Set<string>();
    for (const t of value.transports) {
      if (!validTransport(t) || owners.has(t.event) || drivers.has(t.driver)) return false;
      const event = Array.isArray(value.events) && value.events.find(e => object(e) && e.id === t.event);
      if (!event || event.kind !== `transport-${t.mode}`) return false;
      const driver = value.actors.find(a => a.id === t.driver);
      if (t.visible && t.driverAlive && (!driver?.alive || driver.transport !== t.event || !driver.bot)) return false;
      if (driver && (driver.alive !== t.driverAlive || driver.transport !== t.event || driver.faction !== (event.faction ?? 'mercenaries'))) return false;
      owners.add(t.event); drivers.add(t.driver);
    }
  }
  if (value.raiders !== undefined) {
    const events = new Set((Array.isArray(value.events) ? value.events : []).map(event => (event as { id: string }).id)), owners = new Set<string>();
    if (!Array.isArray(value.raiders) || value.raiders.length > MAX_COMBAT_EVENTS) return false;
    for (const r of value.raiders) {
      if (!object(r) || typeof r.event !== 'string' || !events.has(r.event) || owners.has(r.event) || (r.kind !== 'gunship' && r.kind !== 'drone') ||
        !['x', 'y', 'z', 'yaw', 'health', 'maxHealth', 'shots'].every(k => finite(r[k])) || !RAIDER_STATES.includes(r.state as ArenaRaiderState) ||
        (r.maxHealth as number) <= 0 || (r.maxHealth as number) > 1000 || (r.health as number) < 0 || (r.health as number) > (r.maxHealth as number) ||
        !Number.isInteger(r.shots) || (r.shots as number) < 0 || Math.abs(r.x as number) > 5000 || Math.abs(r.z as number) > 5000 || (r.y as number) < -50 || (r.y as number) > 400 ||
        (r.kind === 'gunship' ? !Number.isInteger(r.ammo) || (r.ammo as number) < 0 || (r.ammo as number) > VEHICLE_COMBAT.helicopter.ammo : r.ammo !== undefined || ['landing', 'landed'].includes(String(r.state))) ||
        !(r.aim === null || point(r.aim))) return false;
      owners.add(r.event);
    }
  }
  const crewSeats = new Set<string>();
  for (const actor of value.actors) if (actor.transport !== undefined) {
    const t = (value.transports as ArenaSnapshot['transports'])?.find(t => t.event === actor.transport);
    const r = (value.raiders as ArenaSnapshot['raiders'])?.find(r => r.event === actor.transport && r.kind === 'gunship');
    const event = (value.events as ArenaSnapshot['events'])?.find(e => e.id === actor.transport);
    if ((!t && !r) || !event || actor.faction !== (event.faction ?? 'mercenaries') || !actor.bot) return false;
    if (!actor.aircrew) { if (!t || !['land', 'sea'].includes(t.mode) || t.driver !== actor.id) return false; continue; }
    if (!helicopterCrew(event).includes(actor.aircrew)) return false;
    if (t && (t.mode !== 'air' || actor.aircrew === 'pilot' && t.driver !== actor.id || actor.aircrew !== 'pilot' && t.driver === actor.id)) return false;
    const key = `${actor.transport}/${actor.aircrew}`; if (crewSeats.has(key)) return false; crewSeats.add(key);
    const expected = aircrewPoint((t ?? r)!, actor.aircrew);
    if (Math.hypot(expected.x - actor.x, expected.y - actor.y, expected.z - actor.z) > .25) return false;
  }
  for (const r of (value.raiders as ArenaSnapshot['raiders']) ?? []) if (r.kind === 'gunship' && ['inbound', 'orbit', 'leaving'].includes(r.state) && r.health > 0 &&
    !value.actors.some(a => a.transport === r.event && a.aircrew === 'pilot' && a.alive)) return false;
  if (value.barks !== undefined && !(Array.isArray(value.barks) && value.barks.length <= MAX_ARENA_BARKS && value.barks.every(b => object(b) &&
    typeof b.id === 'string' && b.id.length <= 24 && typeof b.actor === 'string' && b.actor.length <= 100 && typeof b.text === 'string' && b.text.length <= 140 &&
    ((BARK_EVENTS as readonly unknown[]).includes(b.kind) || b.kind === 'callout' && !!getPlayerCallout(b.callout)) && (b.callout === undefined || b.kind === 'callout') && (b.at === undefined || point(b.at)) &&
    (b.order === undefined || object(b.order) && Number.isInteger(b.order.allies) && (b.order.allies as number) >= 0 && (b.order.allies as number) <= 20 && (b.order.note === undefined || typeof b.order.note === 'string' && b.order.note.length <= 100))))) return false;
  return value.feed.every(entry => object(entry) && typeof entry.id === 'string' && entry.id.length <= 100 && typeof entry.text === 'string' && entry.text.length <= 160 &&
    (entry.killerId === undefined || typeof entry.killerId === 'string') && (entry.victimId === undefined || typeof entry.victimId === 'string') &&
    (entry.bounty === undefined || validRaiderBounty(entry.bounty) && typeof entry.killerId === 'string' && entry.victimId === undefined));
}
function point(value: unknown): value is ArenaPoint { return object(value) && finite(value.x) && finite(value.y) && finite(value.z); }
/** A player's meals as the host publishes them: known effects, each with figures no meal exceeds. */
function validMeals(value: unknown) {
  return object(value) && Object.entries(value).every(([kind, effect]) => Object.hasOwn(FOOD_EFFECTS, kind as FoodEffectKind) && object(effect) &&
    finite(effect.strength) && effect.strength >= 0 && effect.strength <= 100 && finite(effect.remaining) && effect.remaining >= 0 && effect.remaining <= 600 &&
    finite(effect.seconds) && effect.seconds >= 0 && effect.seconds <= 600);
}

interface Avatar {
  rig: CharacterRig; root: THREE.Group; health: THREE.Sprite; label: THREE.Sprite | null; muzzle: THREE.Mesh | null;
  /** A rooftop sniper's scope catching the light while they aim. */
  glint: THREE.Sprite | null;
  /** A player's spawn shield: a blue rim of light round the figure while it holds. */
  halo: { mesh: THREE.Mesh; material: THREE.ShaderMaterial; time: number } | null;
  reveal: THREE.Mesh;
  shots: number; flash: number; maxHealth: number; resources: { dispose(): void }[];
  alive: boolean; lastHealth: number; yaw: number; fireTimer: number; ground: number; groundTimer: number;
  previous: THREE.Vector3; velocity: THREE.Vector3;
  /** What the figure and label were built from; a respawn with a new rank or name rebuilds them. */
  key: string;
  /** What they last said, over their head until `until` (performance.now ms); painted on first use. */
  bubble: SpeechBubble | null;
}
interface SpeechBubble { sprite: THREE.Sprite; context: CanvasRenderingContext2D; texture: THREE.CanvasTexture; until: number }
/** How long a bark stays over a speaker's head, in seconds. */
export const BUBBLE_SECONDS = 3.6;
/**
 * The speech bubble: up to two lines of the text in a rounded box with a tail
 * pointing down at the speaker. `tone` is the speaker's label colour.
 */
export function paintSpeechBubble(context: CanvasRenderingContext2D, text: string, tone: string) {
  const width = context.canvas.width, height = context.canvas.height;
  context.clearRect(0, 0, width, height); context.font = '600 26px sans-serif'; context.textAlign = 'center'; context.textBaseline = 'middle';
  const lines: string[] = [];
  for (const word of text.split(/\s+/)) {
    const last = lines.length - 1;
    if (last >= 0 && context.measureText(`${lines[last]} ${word}`).width <= width - 36) lines[last] += ` ${word}`;
    else if (lines.length < 2) lines.push(word);
    else { lines[last] = `${lines[last].replace(/…$/, '')}…`; break; }
  }
  const box = 24 + lines.length * 32, top = height - 16 - box;
  context.fillStyle = 'rgba(248,246,236,.94)'; context.strokeStyle = tone; context.lineWidth = 4;
  context.beginPath(); context.roundRect(4, top, width - 8, box, 16); context.fill(); context.stroke();
  context.beginPath(); context.moveTo(width / 2 - 12, top + box - 2); context.lineTo(width / 2, height - 2); context.lineTo(width / 2 + 12, top + box - 2); context.closePath(); context.fill();
  context.fillStyle = '#16211d';
  lines.forEach((line, i) => context.fillText(line, width / 2, top + 12 + 16 + i * 32));
}
function showBubble(avatar: Avatar, text: string, tone: string) {
  if (typeof document === 'undefined') return;
  if (!avatar.bubble) {
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 112;
    const context = canvas.getContext('2d'); if (!context) return;
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: true, depthWrite: false }); avatar.resources.push(texture, material);
    const sprite = new THREE.Sprite(material); sprite.position.set(0, 2.72, 0); sprite.scale.set(2.4, .525, 1); sprite.raycast = noRaycast; sprite.visible = false; avatar.root.add(sprite);
    avatar.bubble = { sprite, context, texture, until: 0 };
  }
  paintSpeechBubble(avatar.bubble.context, text, tone); avatar.bubble.texture.needsUpdate = true;
  avatar.bubble.until = performance.now() + BUBBLE_SECONDS * 1000; avatar.bubble.sprite.visible = true;
}
/** Seconds over which a lapsing shield's halo fades out. */
const HALO_FADE = .6;
/**
 * A capsule round the figure lit only at its silhouette (a fresnel rim), so a
 * shielded player reads as outlined in blue from any side without hiding the
 * uniform under it.
 */
export function createHalo(resources: { dispose(): void }[]) {
  const geometry = new THREE.CapsuleGeometry(.42, 1, 4, 18);
  const material = new THREE.ShaderMaterial({
    uniforms: { color: { value: new THREE.Color('#4fb4ff') }, opacity: { value: 1 } },
    vertexShader: 'varying vec3 vNormal; varying vec3 vView; void main() { vec4 view = modelViewMatrix * vec4(position, 1.0); vNormal = normalize(normalMatrix * normal); vView = normalize(-view.xyz); gl_Position = projectionMatrix * view; }',
    fragmentShader: 'uniform vec3 color; uniform float opacity; varying vec3 vNormal; varying vec3 vView; void main() { float rim = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), 2.2); gl_FragColor = vec4(color, (rim * .95 + .05) * opacity); }',
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
  });
  resources.push(geometry, material);
  const mesh = new THREE.Mesh(geometry, material); mesh.visible = false; mesh.raycast = noRaycast; mesh.renderOrder = 2;
  return { mesh, material, time: 0 };
}
const avatarKey = (actor: ArenaActor) => `${actor.faction}|${actor.role}|${actor.rank ?? 0}|${actor.name}`;
const noRaycast = () => {};
/** Several rounds landing in one step read as one marker: the last thing hit, a kill if any was, the damage summed. */
export function mergeHits(hits: readonly ArenaShot[]): ArenaShot | null {
  const struck = hits.filter(hit => hit.hitId && hit.damage > 0);
  if (!struck.length) return null;
  return { hitId: struck[struck.length - 1].hitId, killed: struck.some(hit => hit.killed), damage: Math.min(200, struck.reduce((sum, hit) => sum + hit.damage, 0)) };
}
/** The 256×48 tag over a figure's head: its name, after one chevron per grade for a ranked bot. */
export function paintNameLabel(context: CanvasRenderingContext2D, actor: Pick<ArenaActor, 'name' | 'bot' | 'rank'>, color: string) {
  context.fillStyle = 'rgba(10,19,25,.8)'; context.fillRect(0, 0, 256, 48); context.font = '600 22px sans-serif'; context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillStyle = color;
  const name = actor.name.slice(0, 20), chevrons = actor.bot && actor.rank ? actor.rank : 0;
  context.fillText(name, 128 + chevrons * 7, 25);
  if (!chevrons) return;
  const left = 128 + chevrons * 7 - Math.min(200, context.measureText(name).width) / 2 - chevrons * 14 - 6;
  context.strokeStyle = color; context.lineWidth = 3; context.lineJoin = 'miter';
  for (let i = 0; i < chevrons; i++) { const x = left + i * 14; context.beginPath(); context.moveTo(x, 31); context.lineTo(x + 6, 19); context.lineTo(x + 12, 31); context.stroke(); }
}
function createAvatar(actor: ArenaActor): Avatar {
  const rig = createCharacterRig(arenaCharacterLook(actor), `arena-${actor.id}`);
  const root = rig.root; root.userData.arenaActorId = actor.id;
  // A friendly squad's uniform is plain to see, so the AI pilot may read it off the figure.
  root.userData.arenaFriendly = actor.bot && actor.faction === PLAYER_FACTION;
  const color = arenaRoleColor(actor);
  const resources: { dispose(): void }[] = [...rig.resources];
  let muzzle: THREE.Mesh | null = null;
  if (rig.muzzle) {
    const glow = new THREE.MeshBasicMaterial({ color: '#ffce72', transparent: true, opacity: 0.9 }), geometry = new THREE.BoxGeometry(0.11, 0.1, 0.18);
    resources.push(glow, geometry);
    muzzle = new THREE.Mesh(geometry, glow); muzzle.position.z = -.08; muzzle.visible = false; muzzle.raycast = noRaycast; rig.muzzle.add(muzzle);
  }
  const barMaterial = new THREE.SpriteMaterial({ color, depthTest: true }); resources.push(barMaterial);
  const health = new THREE.Sprite(barMaterial); health.position.set(0, 2.02, 0); health.scale.set(0.75, 0.055, 1); health.raycast = noRaycast; root.add(health);
  let label: THREE.Sprite | null = null;
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 48;
    const context = canvas.getContext('2d');
    if (context) {
      paintNameLabel(context, actor, color);
      const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
      const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: true }); resources.push(texture, material);
      label = new THREE.Sprite(material); label.position.set(0, 2.23, 0); label.scale.set(1.6, 0.3, 1); label.raycast = noRaycast; root.add(label);
    }
  }
  let glint: THREE.Sprite | null = null;
  if (actor.role === 'overwatch') {
    const material = new THREE.SpriteMaterial({ map: glintTexture(), color: '#fff6d8', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    resources.push(material);
    glint = new THREE.Sprite(material); glint.position.set(.08, 1.12, -.45); glint.visible = false; glint.raycast = noRaycast; root.add(glint);
  }
  const revealGeo = new THREE.CapsuleGeometry(.34, .9, 4, 8), revealMat = new THREE.MeshBasicMaterial({ color: '#e79b5b', transparent: true, opacity: .28, depthTest: false, depthWrite: false });
  const reveal = new THREE.Mesh(revealGeo, revealMat); reveal.position.y = 1; reveal.visible = false; reveal.raycast = noRaycast; reveal.renderOrder = 10; root.add(reveal); resources.push(revealGeo, revealMat);
  const halo = actor.bot ? null : createHalo(resources);
  if (halo) root.add(halo.mesh);
  return { key: avatarKey(actor), reveal, rig, root, health, label, muzzle, glint, halo, shots: actor.shots, flash: 0, maxHealth: actor.bot ? getArenaRole(actor.role)?.health ?? Math.max(100, actor.health) : 100, resources,
    alive: actor.alive, lastHealth: actor.health, yaw: actor.yaw, fireTimer: 0, ground: 0, groundTimer: 0, previous: new THREE.Vector3(), velocity: new THREE.Vector3(), bubble: null };
}
/** A soft star for scope glint, shared by every sniper and never disposed with one. */
let glintMap: THREE.DataTexture | null = null;
function glintTexture() {
  if (glintMap) return glintMap;
  const size = 64, data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = (x + .5) / size * 2 - 1, v = (y + .5) / size * 2 - 1, core = Math.max(0, 1 - Math.hypot(u, v) * 2.2), ray = Math.max(0, 1 - Math.abs(u * v) * 40) * Math.max(0, 1 - Math.hypot(u, v));
    const i = (y * size + x) * 4; data[i] = data[i + 1] = data[i + 2] = 255; data[i + 3] = Math.round(Math.min(1, core + ray * .8) * 255);
  }
  glintMap = new THREE.DataTexture(data, size, size); glintMap.needsUpdate = true; return glintMap;
}
/** Falling bodies stay visible briefly but never stop a shot or read as a target. */
function setAvatarDown(avatar: Avatar, down: boolean) {
  avatar.rig.setDown(down); avatar.root.userData.arenaDown = down;
  avatar.root.traverse(node => { if (node instanceof THREE.Mesh && node !== avatar.muzzle && node !== avatar.halo?.mesh) node.raycast = down ? noRaycast : THREE.Mesh.prototype.raycast; });
}
const ARENA_CORPSE_SECONDS = 1.6;
const wrapAngle = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));

/** Host owns bots, damage, spawns and score. The renderer submits only local input. */
export function createArenaRuntime(options: ArenaRuntimeOptions) {
  const { scene, session } = options;
  let profile = restoreProfile(JSON.stringify(options.profile ?? createProfile()));
  const authority = session.role !== 'guest';
  // Every shot and every bot's line of sight is checked against the rendered
  // scene, not only the box footprints: mesh-only walls must stop bot fire.
  const simulation = authority ? createArena(options.obstacles, options.botCount, options.composition, options.environment, options.vehicles, { bounds: options.environment?.bounds ?? MARINA_BOUNDS, obstacles: options.obstacles, surfaces: getWalkSurfaces(scene), traversalObstacles: getTraversalObstacles(scene) },
    (origin, direction, distance) => coverLimit(origin, direction, distance), (from, to) => {
      const distance = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z); if (distance < 1e-8) return null;
      const d = coverLimit(from, { x: (to.x - from.x) / distance, y: (to.y - from.y) / distance, z: (to.z - from.z) / distance }, distance);
      if (d >= distance) return null;
      const hit = sceneCover.trace(from, { x: (to.x - from.x) / distance, y: (to.y - from.y) / distance, z: (to.z - from.z) / distance }, distance);
      return hit?.face ? { point: hit.point, normal: hit.face.normal.clone().transformDirection(hit.object.matrixWorld) } : null;
    }, (origin, direction, distance) => sceneCover.sightDistance(origin, direction, distance)) : null;
  const hostId = authority ? session.id : session.getPeers()[0]?.id;
  const avatars = new Map<string, Avatar>();
  const presentations = new Map<string, ReturnType<typeof createActorPresentation>>();
  const reconciliation = createInputReconciliation();
  const acknowledgements = new Map<string, { sequence: number; deaths: number; vehicle?: VehicleKind }>();
  const retiredMatches = new Set<string>();
  const newMatchId = () => `${session.id}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 10)}`;
  let matchId = authority ? newMatchId() : '', inputSequence = 0;
  const registered = new Set<string>();
  let grenadeRequest = 0;
  const grenadeRequests = new Map<number, ((accepted: boolean) => void) | undefined>();
  let snapshot: ArenaSnapshot | null = null, started = false, disposed = false, inputTime = 0, helloTime = 3;
  let pendingHit: ArenaShot | null = null, pendingFeed: ArenaFeed[] = [], pendingBarks: ArenaBark[] = [], spawnPending = false, localAdopted = false;
  let lastInput: ArenaInput | null = null, vehicleNotice = '';
  let previousSelf: ArenaActor | null = null, lastTick = -1;
  const seenFeed = new Set<string>(), seenBarks = new Set<string>();
  const initial = resolveLoadout(profile);
  const sceneCover = createSceneCover(scene);
  function coverLimit(origin: ArenaPoint, direction: ArenaPoint, supplied: number) {
    if (!point(origin) || !point(direction)) return 0;
    return sceneCover.distance(origin, direction, finite(supplied) ? Math.max(0, Math.min(240, supplied)) : 125);
  }
  if (simulation) { simulation.addPlayer(session.id, session.name, initial.armor, initial.absorption, initial.weapons, options.initialVitals, session.role === 'solo', initial.carriedFamilies, initial.insert); simulation.setPlayerGrenades(session.id, profile.consumables); registered.add(session.id); }
  function accept(next: ArenaSnapshot) {
    if (next.tick < lastTick) { seenFeed.clear(); seenBarks.clear(); localAdopted = false; }
    lastTick = next.tick; snapshot = next;
    const self = next.actors.find(actor => actor.id === session.id) ?? null;
    if (self && (!previousSelf || (!previousSelf.alive && self.alive) || (previousSelf.deaths !== self.deaths && self.alive) || !localAdopted)) spawnPending = true;
    if (spawnPending || self?.alive !== previousSelf?.alive || self?.vehicle !== previousSelf?.vehicle || self?.seat !== previousSelf?.seat) reconciliation.reset();
    previousSelf = self ? { ...self } : null;
    if (!authority) {
      const present = new Set<string>();
      for (const actor of next.actors) if (actor.id !== session.id) {
        present.add(actor.id);
        let presentation = presentations.get(actor.id);
        if (!presentation) { presentation = createActorPresentation(); presentations.set(actor.id, presentation); }
        presentation.accept(actor, next.elapsed, performance.now() / 1000);
      }
      for (const id of presentations.keys()) if (!present.has(id)) presentations.delete(id);
    }
    for (const event of next.feed) if (!seenFeed.has(event.id)) { seenFeed.add(event.id); pendingFeed.push(event); }
    if (seenFeed.size > 300) { seenFeed.clear(); for (const event of next.feed) seenFeed.add(event.id); }
    for (const said of next.barks ?? []) if (!seenBarks.has(said.id)) { seenBarks.add(said.id); pendingBarks.push(said); }
    if (seenBarks.size > 300) { seenBarks.clear(); for (const said of next.barks ?? []) seenBarks.add(said.id); }
  }
  const refresh = () => { if (simulation) accept(simulation.snapshot()); };
  const publish = () => {
    refresh();
    if (session.role !== 'host' || !snapshot) return;
    const acknowledgedInputs: Record<string, number> = {};
    for (const actor of snapshot.actors) {
      const ack = acknowledgements.get(actor.id);
      if (ack && ack.deaths === actor.deaths && ack.vehicle === actor.vehicle) acknowledgedInputs[actor.id] = ack.sequence;
    }
    session.send({ type: 'arena-state', snapshot, started, matchId, acknowledgedInputs });
  };
  if (simulation) accept(simulation.snapshot());
  const peersChanged = () => {
    if (!simulation) return;
    const present = new Set(session.getPeers().map(peer => peer.id));
    for (const id of registered) if (id !== session.id && !present.has(id)) { simulation.removePlayer(id); registered.delete(id); acknowledgements.delete(id); }
    publish();
  };
  const unsubscribePeers = session.onPeers(peersChanged);
  const unsubscribe = session.subscribe((from, payload) => {
    if (disposed || !object(payload)) return;
    if (simulation) {
      const peer = session.getPeers().find(candidate => candidate.id === from); if (!peer) return;
      if (payload.type === 'arena-hello' && !registered.has(from)) {
        let raw: string;
        try { raw = JSON.stringify(payload.profile); } catch { return; }
        if (typeof raw !== 'string' || raw.length > 16_000) return;
        const guest = restoreProfile(raw), loadout = resolveLoadout(guest);
        simulation.addPlayer(from, peer.name, loadout.armor, loadout.absorption, loadout.weapons, undefined, false, loadout.carriedFamilies, loadout.insert);
        // The host spends a guest's supplies from what they brought, as it already trusts the kit they brought.
        simulation.setPlayerSupplies(from, guest.consumables); registered.add(from); publish();
      } else if (registered.has(from) && started && payload.type === 'arena-vehicle' && ['enter', 'exit', 'switch'].includes(String(payload.action)) && (payload.kind === undefined || payload.kind === 'car' || payload.kind === 'helicopter')) {
        const accepted = simulation.vehicleAction(from, payload.action as 'enter' | 'exit' | 'switch', payload.kind as VehicleKind | undefined);
        if (accepted) acknowledgements.delete(from);
        session.send({ type: 'arena-vehicle-result', accepted }, from); publish();
      } else if (registered.has(from) && payload.type === 'arena-input' && validArenaInput(payload.input)) {
        const actor = snapshot?.actors.find(actor => actor.id === from);
        if (payload.sequence !== undefined) {
          if (!Number.isSafeInteger(payload.sequence) || (payload.sequence as number) <= 0 || payload.matchId !== matchId ||
            !actor?.alive || payload.deaths !== actor.deaths || payload.vehicle !== actor.vehicle ||
            (payload.sequence as number) <= (acknowledgements.get(from)?.sequence ?? 0)) return;
          simulation.setInput(from, payload.input);
          acknowledgements.set(from, { sequence: payload.sequence as number, deaths: actor.deaths, vehicle: actor.vehicle });
        } else { simulation.setInput(from, payload.input); acknowledgements.delete(from); }
      }
      else if (registered.has(from) && payload.type === 'arena-reload' && validWeaponIndex(payload.weapon)) simulation.reloadPlayer(from, payload.weapon);
      else if (registered.has(from) && started && payload.type === 'throwGrenade' && validThrowGrenade(payload.grenade)) {
        const accepted = simulation.throwGrenade(from, payload.grenade);
        if (Number.isSafeInteger(payload.request)) session.send({ type: 'grenade-result', request: payload.request, accepted }, from);
        if (accepted) publish();
      }
      else if (registered.has(from) && started && payload.type === 'arena-supply' && typeof payload.item === 'string' && payload.item.length <= 64) { if (simulation.useSupply(from, payload.item)) publish(); }
      else if (registered.has(from) && started && payload.type === 'facility-action' && typeof payload.site === 'string' && payload.site.length <= 100) { if (simulation.facilityAction(from, payload.site)) publish(); }
      else if (registered.has(from) && started && payload.type === 'arena-callout' && getPlayerCallout(payload.callout) && (payload.at === undefined || point(payload.at))) {
        if (simulation.callout(from, payload.callout as string, payload.at as ArenaPoint | undefined)) publish();
      }
      else if (registered.has(from) && started && payload.type === 'arena-shot' && point(payload.origin) && point(payload.direction) && validWeaponIndex(payload.weapon)) {
        // Rounds fly, so the hit is usually sent when one lands (see deliverHits); an instant one is sent now.
        const hit = simulation.shoot(from, payload.origin, payload.direction, payload.weapon, finite(payload.maxDistance) ? payload.maxDistance : 125);
        if (hit.hitId) session.send({ type: 'arena-hit', hit }, from);
        refresh();
      }
    } else if (from === hostId) {
      if (payload.type === 'grenade-result' && Number.isSafeInteger(payload.request) && typeof payload.accepted === 'boolean' && grenadeRequests.has(payload.request as number)) { const callback = grenadeRequests.get(payload.request as number); grenadeRequests.delete(payload.request as number); callback?.(payload.accepted); }
      if (payload.type === 'arena-vehicle-result' && payload.accepted === false) vehicleNotice = 'Seat unavailable. Approach a stopped vehicle; land and slow down to exit.';
      if (payload.type === 'arena-state' && validArenaSnapshot(payload.snapshot, options.environment) && typeof payload.started === 'boolean') {
        if (typeof payload.matchId === 'string' && payload.matchId.length <= 100) {
          if (retiredMatches.has(payload.matchId)) return;
          if (matchId && payload.matchId === matchId && payload.snapshot.tick < lastTick) return;
          if (payload.matchId !== matchId) {
            if (matchId) retiredMatches.add(matchId);
            if (retiredMatches.size > 8) retiredMatches.delete(retiredMatches.values().next().value!);
            matchId = payload.matchId; localAdopted = false; reconciliation.reset(); presentations.clear();
          }
        }
        started = payload.started; accept(payload.snapshot);
        const self = payload.snapshot.actors.find(actor => actor.id === session.id);
        const ack = object(payload.acknowledgedInputs) ? payload.acknowledgedInputs[session.id] : undefined;
        if (self?.alive && !self.vehicle && !spawnPending && Number.isSafeInteger(ack)) reconciliation.acknowledge(ack as number, self);
      }
      if (payload.type === 'arena-hit' && object(payload.hit) && (payload.hit.hitId === null || typeof payload.hit.hitId === 'string') && typeof payload.hit.killed === 'boolean' && finite(payload.hit.damage) && payload.hit.damage >= 0 && payload.hit.damage <= 200) pendingHit = payload.hit as unknown as ArenaShot;
    }
  });
  /** Hands each player the hits their rounds landed this step: ours to the HUD, a guest's over the wire. */
  function deliverHits() {
    if (!simulation) return;
    const own = mergeHits(simulation.takeHits(session.id)); if (own) pendingHit = own;
    for (const id of registered) if (id !== session.id) { const hit = mergeHits(simulation.takeHits(id)); if (hit) session.send({ type: 'arena-hit', hit }, id); }
  }
  let lastTime = performance.now(), broadcastTime = 0;
  const timer = simulation ? setInterval(() => {
    const now = performance.now(); const dt = Math.min(3, (now - lastTime) / 1000); lastTime = now;
    if (disposed || !started) return;
    for (let remaining = dt; remaining > 0.000001; remaining -= Math.min(0.25, remaining)) simulation.step(Math.min(0.25, remaining));
    deliverHits();
    broadcastTime += dt;
    if (broadcastTime >= 0.1 - 1e-6) { broadcastTime = Math.max(0, broadcastTime - .1 * Math.floor((broadcastTime + 1e-6) / .1)); publish(); }
    else refresh();
  }, 50) : undefined;

  /** Ground under an actor, probed as the simulation stands bots, so crouching and jumping read on any deck. */
  let footing: ReturnType<typeof createVerticalMovement> | null = null;
  function groundBelow(x: number, z: number, eye: number) {
    footing ??= createVerticalMovement({ bounds: options.environment?.bounds ?? MARINA_BOUNDS, obstacles: options.obstacles, surfaces: getWalkSurfaces(scene), traversalObstacles: getTraversalObstacles(scene) });
    return footing.supportHeight(x, z, eye - .5, .35, .6) ?? 0;
  }
  const destination = new THREE.Vector3(), local = { x: 0, z: 0 };
  function animateAvatar(avatar: Avatar, actor: ArenaActor, dt: number) {
    const { rig, root } = avatar;
    if (!actor.alive && avatar.alive) setAvatarDown(avatar, true);
    else if (actor.alive && !avatar.alive) { setAvatarDown(avatar, false); avatar.groundTimer = 0; }
    const respawned = actor.alive && !avatar.alive;
    avatar.alive = actor.alive;
    root.visible = actor.alive || (rig.down && rig.downTime < ARENA_CORPSE_SECONDS && !actor.vehicle && !actor.transport);
    const viewer = snapshot?.actors.find(a => a.id === session.id);
    avatar.reveal.visible = actor.alive && !!viewer && !!actor.markedBy?.some(id => { const caller = snapshot?.actors.find(a => a.id === id); return caller && (caller.id === viewer.id || !hostile(viewer, caller)); });
    avatar.health.visible = actor.alive; if (avatar.label) avatar.label.visible = actor.alive;
    if (!root.visible) { avatar.shots = actor.shots; avatar.lastHealth = actor.health; return; }
    avatar.groundTimer -= dt;
    if (actor.ground !== undefined) avatar.ground = actor.ground;
    else if (avatar.groundTimer <= 0) { avatar.groundTimer = .12; avatar.ground = groundBelow(actor.x, actor.z, actor.y); }
    const gunner = actor.vehicle === 'car' && actor.seat === 1, seated = !!actor.transport || !!actor.vehicle && !gunner;
    const eyeAbove = actor.y - avatar.ground;
    const crouch = actor.transport || actor.vehicle || actor.prone ? 0 : Math.max(0, Math.min(1, (1.75 - eyeAbove) / (1.75 - 1.15)));
    const airborne = !actor.transport && !actor.vehicle && !actor.prone && eyeAbove > 1.95;
    const feet = seated ? actor.y - 1.2 : actor.vehicle ? actor.y - 1.75 : actor.prone ? actor.y - PRONE_EYE_HEIGHT : crouch > .02 ? avatar.ground : Math.max(0, actor.y - 1.75);
    destination.set(actor.x, feet, actor.z);
    avatar.previous.copy(root.position);
    if (actor.alive) {
      if (!authority || actor.transport) root.position.copy(destination);
      else root.position.lerp(destination, respawned || root.position.distanceTo(destination) > 7 ? 1 : 1 - Math.exp(-15 * dt));
    }
    // Velocity from what is rendered, so the stride matches the glide.
    const moved = avatar.previous.distanceTo(root.position);
    if (dt > 0) avatar.velocity.lerp(moved > 3 ? destination.set(0, 0, 0) : destination.subVectors(root.position, avatar.previous).divideScalar(dt), 1 - Math.exp(-10 * dt));
    const turnStep = wrapAngle(actor.yaw - avatar.yaw) * (respawned || !authority ? 1 : 1 - Math.exp(-14 * dt));
    avatar.yaw = wrapAngle(avatar.yaw + turnStep);
    root.rotation.set(0, avatar.yaw, 0);
    const cos = Math.cos(avatar.yaw), sin = Math.sin(avatar.yaw);
    local.x = avatar.velocity.x * cos - avatar.velocity.z * sin; local.z = avatar.velocity.x * sin + avatar.velocity.z * cos;
    if (actor.shots > avatar.shots) { avatar.flash = 0.085; avatar.fireTimer = 1.6; rig.fire(); }
    if (actor.alive && actor.health < avatar.lastHealth - .5) rig.flinch();
    avatar.shots = actor.shots; avatar.lastHealth = actor.health;
    avatar.fireTimer = Math.max(0, avatar.fireTimer - dt); avatar.flash = Math.max(0, avatar.flash - dt);
    const speed = Math.hypot(local.x, local.z);
    if (avatar.halo) {
      const { mesh, material } = avatar.halo, shield = actor.alive ? actor.shield ?? 0 : 0;
      mesh.visible = shield > 0;
      if (mesh.visible) {
        avatar.halo.time += dt;
        // Standing, it wraps the body; crouched, it sinks with it; prone, it lies along the body behind the head.
        if (actor.prone) { mesh.rotation.set(Math.PI / 2, 0, 0); mesh.position.set(0, .3, .5); mesh.scale.set(1, 1, .8); }
        else { mesh.rotation.set(0, 0, 0); mesh.scale.set(1, 1 - crouch * .3, 1); mesh.position.set(0, .92 * (1 - crouch * .3), 0); }
        material.uniforms.opacity.value = Math.min(1, shield / HALO_FADE) * (.8 + .2 * Math.sin(avatar.halo.time * 6));
      } else avatar.halo.time = 0;
    }
    rig.update(dt, {
      velocity: actor.transport || actor.vehicle ? { x: 0, z: 0 } : local, turn: actor.transport || actor.vehicle ? 0 : turnStep / Math.max(dt, 1e-3), pitch: actor.pitch,
      crouch, prone: !!actor.prone, seated, driving: seated && (actor.seat === 0 || !!actor.transport && !rifleSeat(actor.aircrew)), airborne,
      aim: actor.healing !== undefined ? 0 : avatar.fireTimer > 0 || speed < 1.2 || actor.prone ? 1 : .15,
      ...(actor.healing !== undefined ? { healing: actor.healing } : {}),
    });
    if (rig.weapon) rig.weapon.visible = actor.aircrew !== 'pilot';
    avatar.health.scale.x = Math.max(0.01, 0.75 * actor.health / avatar.maxHealth);
    if (avatar.muzzle) avatar.muzzle.visible = avatar.flash > 0 && actor.alive && !!rig.weapon?.visible;
    if (avatar.glint) {
      // A flicker, not a lamp: bright enough to find on a skyline, brief enough to miss.
      avatar.glint.visible = !!actor.aiming && actor.alive;
      if (avatar.glint.visible) { const pulse = .6 + .4 * Math.sin(performance.now() / 90); avatar.glint.scale.setScalar(.55 + pulse * .5); avatar.glint.material.opacity = .55 + pulse * .45; }
    }
  }
  function update(dt: number, input: ArenaInput): ArenaRuntimeFrame {
    if (disposed) return { snapshot: null, self: null, connected: false, started: false, hit: null, feed: [], spawn: false, barks: [] };
    dt = Number.isFinite(dt) ? Math.max(0, Math.min(dt, 0.25)) : 0;
    const connected = (session.isConnected?.() ?? true) && (authority || !!hostId && session.getPeers().some(peer => peer.id === hostId));
    inputTime += dt; helloTime += dt;
    let self = snapshot?.actors.find(actor => actor.id === session.id) ?? null;
    if (!authority && !self && connected && helloTime >= 1) { helloTime = 0; session.send({ type: 'arena-hello', profile }); }
    self = snapshot?.actors.find(actor => actor.id === session.id) ?? null;
    if (validArenaInput(input)) lastInput = { ...input };
    if (simulation && input.playing && !started) { started = true; lastTime = performance.now(); publish(); }
    // Never overwrite an authoritative spawn with the renderer's previous position.
    if (localAdopted && !spawnPending && validArenaInput(input)) {
      if (simulation) simulation.setInput(session.id, input);
      else if (self && connected && inputTime >= 1 / 20) { inputTime %= 1 / 20; sendInput(input); }
    }
    const activeIds = new Set<string>();
    for (const actor of snapshot?.actors ?? []) {
      if (actor.id === session.id) continue;
      activeIds.add(actor.id);
      let avatar = avatars.get(actor.id);
      if (avatar && avatar.key !== avatarKey(actor)) { scene.remove(avatar.root); avatar.resources.forEach(resource => resource.dispose()); avatars.delete(actor.id); avatar = undefined; }
      if (!avatar) { avatar = createAvatar(actor); avatars.set(actor.id, avatar); scene.add(avatar.root); avatar.root.position.set(actor.x, actor.y - 1.75, actor.z); avatar.previous.copy(avatar.root.position); }
      animateAvatar(avatar, actor.transport ? actor : presentations.get(actor.id)?.sample(performance.now() / 1000) ?? actor, dt);
    }
    const listener = self ?? (validArenaInput(input) ? { ...input, bot: false, faction: 'armed-forces' } : null), now = performance.now();
    for (const said of pendingBarks) {
      const speaker = snapshot?.actors.find(actor => actor.id === said.actor), avatar = avatars.get(said.actor);
      if (!speaker || !avatar || !speaker.alive || !listener || self?.conditions?.deafened) continue;
      // Over a friendly head anywhere in sight; an enemy's only when near enough to overhear.
      const range = said.kind !== 'callout' && hostile(listener, speaker) ? BARK_RANGE.overheard : BARK_RANGE.bubble;
      if (Math.hypot(speaker.x - listener.x, speaker.z - listener.z) <= range) showBubble(avatar, said.text, arenaRoleColor(speaker));
    }
    for (const avatar of avatars.values()) if (avatar.bubble?.sprite.visible && (self?.conditions?.deafened || now > avatar.bubble.until || !avatar.alive)) avatar.bubble.sprite.visible = false;
    for (const [id, avatar] of avatars) if (!activeIds.has(id)) { scene.remove(avatar.root); avatar.resources.forEach(resource => resource.dispose()); avatars.delete(id); }
    const correction = self?.alive && !self.vehicle && localAdopted && !spawnPending
      ? authority
        ? Math.hypot(self.x - input.x, self.y - input.y, self.z - input.z) > 2.5 ? { point: self, hard: true } : null
        : reconciliation.correct(input, dt)
      : null;
    const frame = { snapshot, self, connected, started, hit: pendingHit, feed: pendingFeed, spawn: spawnPending, correction: correction?.point, hardCorrection: correction?.hard, vehicleNotice, barks: pendingBarks };
    vehicleNotice = '';
    pendingHit = null; pendingFeed = []; pendingBarks = []; if (spawnPending) localAdopted = true; spawnPending = false;
    return frame;
  }
  function sendInput(input: ArenaInput) {
    const self = snapshot?.actors.find(actor => actor.id === session.id);
    if (!self || !matchId) return;
    const sequence = ++inputSequence;
    if (!self.vehicle) reconciliation.record(sequence, input);
    session.send({ type: 'arena-input', input, sequence, matchId, deaths: self.deaths, vehicle: self.vehicle });
  }
  function vehicleAction(action: 'enter' | 'exit' | 'switch', kind?: VehicleKind) {
    if (disposed || !started || !localAdopted) return;
    if (simulation) {
      if (!simulation.vehicleAction(session.id, action, kind)) vehicleNotice = 'Seat unavailable. Approach a stopped vehicle; land and slow down to exit.';
      publish();
    } else session.send({ type: 'arena-vehicle', action, kind });
  }
  function facilityAction(site: string) {
    if (disposed || !started || !localAdopted || typeof site !== 'string' || site.length > 100) return;
    if (simulation) { simulation.facilityAction(session.id, site); publish(); }
    else session.send({ type: 'facility-action', site });
  }
  function selectDeployment(pointId: string) {
    if (disposed || started || session.role !== 'solo' || !simulation || !simulation.setPlayerDeployment(session.id, pointId)) return false;
    previousSelf = null; spawnPending = true; localAdopted = false; reconciliation.reset(); publish();
    return true;
  }
  function shoot(origin: ArenaPoint, direction: ArenaPoint, weapon: number, maxDistance = 125, prone = lastInput?.prone ?? false) {
    if (disposed || !started || !localAdopted) return;
    // A shot means the reload is over: say so first, or the host would still be
    // reloading this frame (an interrupted reload) and refuse the round.
    const freshInput = lastInput ? { ...lastInput, prone, weapon, reloading: false, x: origin.x, y: origin.y, z: origin.z } : null;
    if (simulation) {
      if (freshInput && validArenaInput(freshInput)) simulation.setInput(session.id, freshInput);
      const shot = simulation.shoot(session.id, origin, direction, weapon, maxDistance); if (shot.hitId) pendingHit = shot;
      refresh();
    } else {
      if (freshInput && validArenaInput(freshInput)) sendInput(freshInput);
      session.send({ type: 'arena-shot', origin, direction, weapon, maxDistance });
    }
  }
  function reload(weapon: number) {
    if (disposed || !localAdopted) return;
    const freshInput = lastInput ? { ...lastInput, weapon, reloading: true } : null;
    if (simulation) {
      if (freshInput && validArenaInput(freshInput)) simulation.setInput(session.id, freshInput);
      simulation.reloadPlayer(session.id, weapon);
    } else {
      if (freshInput && validArenaInput(freshInput)) sendInput(freshInput);
      session.send({ type: 'arena-reload', weapon });
    }
  }
  /** A callout from the wheel, by id; `at` is where a pinging one points. The host says it, so it arrives back in a frame's barks. */
  function callout(id: string, at?: ArenaPoint) {
    if (disposed || !started || !localAdopted || !getPlayerCallout(id) || (at !== undefined && !point(at))) return;
    if (simulation) { if (simulation.callout(session.id, id, at)) publish(); }
    else session.send({ type: 'arena-callout', callout: id, ...(at ? { at } : {}) });
  }
  function reset() { if (!simulation || disposed) return; simulation.reset(); matchId = newMatchId(); acknowledgements.clear(); reconciliation.reset(); broadcastTime = 0; started = false; localAdopted = false; previousSelf = null; seenFeed.clear(); seenBarks.clear(); publish(); }
  function updateLoadout(nextProfile: ArmoryProfile) {
    if (disposed || session.role !== 'solo' || !simulation) return false;
    profile = restoreProfile(JSON.stringify(nextProfile));
    const loadout = resolveLoadout(profile);
    simulation.setPlayerGrenades(session.id, profile.consumables);
    simulation.setPlayerLoadout(session.id, loadout.armor, loadout.absorption, loadout.weapons, loadout.carriedFamilies, loadout.insert); publish(); return true;
  }
  function setVitals(vitals: Partial<ArenaVitals>) {
    if (disposed || session.role !== 'solo' || !simulation) return false;
    simulation.setPlayerVitals(session.id, vitals); publish(); return true;
  }
  /**
   * Uses a supply at its commit point. The host applies it in every role, so
   * healing, inserts and a meal's effects follow its rules, and a guest's
   * supplies are spent from what they joined with.
   */
  function setGrenadeSupplies(held: Record<string, number>) { if (session.role === 'solo' && simulation) simulation.setPlayerGrenades(session.id, held); }
  function throwGrenade(grenade: ThrowGrenade, result?: (accepted: boolean) => void) {
    if (disposed || !started || !localAdopted || !validThrowGrenade(grenade) || grenadeRequests.size >= 24) { result?.(false); return false; }
    if (simulation) { const accepted = simulation.throwGrenade(session.id, grenade); if (accepted) publish(); result?.(accepted); return accepted; }
    const request = ++grenadeRequest; grenadeRequests.set(request, result);
    session.send({ type: 'throwGrenade', grenade, request }); return true;
  }
  function useSupply(itemId: string) {
    if (disposed || !started || !localAdopted) return;
    if (simulation) { if (simulation.useSupply(session.id, itemId)) publish(); }
    else session.send({ type: 'arena-supply', item: itemId });
  }
  function setHealthMultiplier(multiplier: 1 | 5 | 10) {
    if (disposed || session.role !== 'solo' || !simulation) return false;
    simulation.setPlayerHealthMultiplier(session.id, multiplier); publish(); return true;
  }
  /** Solo only: guests could not see an event a private host started for itself. */
  function triggerEvent(kind: string, target?: CombatPlane) {
    if (disposed || session.role !== 'solo' || !simulation) return null;
    const event = simulation.triggerEvent(kind, target); publish(); return event;
  }
  function setCombatEvents(enabled: boolean) {
    if (disposed || session.role !== 'solo' || !simulation) return false;
    simulation.setCombatEvents(enabled); return true;
  }
  function dispose() {
    for (const callback of grenadeRequests.values()) callback?.(false); grenadeRequests.clear();
    if (disposed) return; disposed = true; clearInterval(timer); unsubscribe(); unsubscribePeers();
    for (const avatar of avatars.values()) { scene.remove(avatar.root); avatar.resources.forEach(resource => resource.dispose()); }
    avatars.clear(); presentations.clear(); reconciliation.reset();
  }
  function presentVehicleRiders(states: readonly VehicleState[]) {
    for (const actor of snapshot?.actors ?? []) {
      if (!actor.vehicle || actor.seat === undefined) continue;
      const avatar = avatars.get(actor.id), vehicle = states.find(v => v.kind === actor.vehicle);
      if (!avatar || !vehicle) continue;
      const eye = seatPoint(vehicle, actor.seat);
      avatar.root.position.set(eye.x, eye.y - (actor.vehicle === 'car' && actor.seat === 1 ? 1.75 : 1.2), eye.z);
    }
  }
  return { selectDeployment, getWorldState: () => { const s = simulation?.snapshot() ?? snapshot; return s ? { facilities: s.facilities, vehicles: s.vehicles, reinforcementClocks: s.reinforcementClocks } : undefined; }, facilityAction, presentVehicleRiders, vehicleAction, update, shoot, reload, callout, reset, dispose, updateLoadout, setVitals, setGrenadeSupplies, throwGrenade, useSupply, setHealthMultiplier, triggerEvent, setCombatEvents };
}
export type ArenaRuntime = ReturnType<typeof createArenaRuntime>;
