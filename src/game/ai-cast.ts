import type { CastAudio } from '../lib/cast-stream';
import { CAST_STALE_MS } from './cast-wire';
import type { FpsHud } from './fps-engine';
import type { Observation } from './cast-contract';

type Scene = Pick<Observation,'mode'|'regionId'|'snapshot'>;
export interface CastReply { line: string | null; audio?: CastAudio }
export class CastFailure extends Error {
  until: number;
  status?: number;
  /** A refusal that clears by itself within a minute (too many calls at once): wait, do not alarm the player. */
  transient: boolean;
  constructor(reason: string, until: number, status?:number, transient = false) { super(reason); this.until = until; this.status = status; this.transient = transient; }
}
export function castMemory() {
  let memory: string[] = [];
  return {
    read: () => [...memory],
    remember(line: string) { memory = [...memory.slice(-29), line]; },
    clear() { memory = []; },
  };
}
export function castDirector(now: () => number, request: (scene: Scene, events: string[], memory: string[], signal: AbortSignal) => Promise<CastReply>,
  speak: (line: string, audio?: CastAudio) => unknown, report: (reason: string) => void) {
  const memory = castMemory();
  let events: {text:string;major:boolean}[] = [], due = Infinity, last = now(), next = 0, blocked = 0;
  let pending: AbortController | null = null;
  return {
    event(line: string, major = false) {
      events.push({text:line.replace(/\s+/g,' ').slice(0,240),major});
      if (events.length > 20) {
        const minor = events.findIndex(e => !e.major);
        events.splice(Math.max(0,minor),1);
      }
      due = Math.min(due,now()+(major ? 0 : 1500));
    },
    reset(keepMemory = false) {
      pending?.abort(); events = []; due = Infinity; last = now();
      if (!keepMemory) memory.clear();
    },
    resume() { blocked = 0; },
    async tick(scene: () => Scene, ended = false) {
      const at = now();
      if (pending || at < Math.max(next,blocked) || (at < due && (ended || at-last < 15000))) return;
      const controller = new AbortController(); pending = controller;
      const batch = events.map(e => e.text); events = []; due = Infinity; last = at; next = at+4000;
      try {
        const {line,audio} = await request(scene(),batch,memory.read(),controller.signal);
        if (controller.signal.aborted || now()-at > CAST_STALE_MS) { audio?.cancel(); return; }
        report('');
        if (line) { memory.remember(line); next = now()+4000; await speak(line,audio); }
      } catch (err) {
        if (!controller.signal.aborted) {
          blocked = err instanceof CastFailure ? err.until : now()+30000;
          if (!(err instanceof CastFailure && err.transient)) report(err instanceof CastFailure ? err.message : 'Cast connection interrupted');
        }
      } finally { if (ended && !controller.signal.aborted) memory.clear(); pending = null; }
    },
  };
}

export function hudEvents(event: (text:string,major?:boolean)=>void, sharpDamage?:()=>void) {
  let prev: FpsHud | undefined, health: {time:number;hp:number}[] = [];
  return (h: FpsHud, now: number) => {
    const p = prev; prev = h;
    if (!p) { health.push({time:now,hp:h.health}); return; }
    const dead = (v: FpsHud) => !!v.deathRecap || v.health <= 0 || v.arenaSelf?.alive === false;
    if (dead(h) !== dead(p)) event(dead(h) ? 'Player died'+(h.deathRecap ? ' · '+h.deathRecap.cause : '') : 'Player respawned',true);
    if ((h.phase === 'complete' || h.phase === 'defeated') && h.phase !== p.phase) event('Round ended · '+h.phase+(h.arena?.winner ? ' · '+h.arena.winner : ''),true);
    if (h.chain >= 2 && h.chain > p.chain) event(h.chain+' elimination streak',true);
    const self = h.arenaSelf?.id, score = h.arena?.score;
    if (self && score && score !== p.arena?.score) {
      const previous = p.arena?.score?.events.at(-1)?.id ?? 0;
      for (const award of score.events) if (award.id > previous && award.actor === self) {
        event('Score: '+award.parts.map(([kind,points]) => kind+' +'+points).join(', '));
      }
    }
    if (h.streakNotice && h.streakNotice !== p.streakNotice) event(h.streakNotice,true);
    health = health.filter(s => now-s.time <= 2000);
    if (health.some(s => s.hp-h.health >= h.maxHealth/3)) { event('Health fell sharply to '+Math.round(h.health),true); sharpDamage?.(); health = []; }
    health.push({time:now,hp:h.health});
    if (!h.magazine && !h.reserve && (p.magazine > 0 || p.reserve > 0)) event('Weapon empty with no reserve',true);
    if (h.reloading && h.reloadEmpty && !p.reloading) event('Reloading an empty magazine');
    if (h.vehicle !== 'on-foot' && p.vehicle !== h.vehicle) event('Entered '+h.vehicle);
    const last = p.comms.at(-1)?.id ?? 0;
    if (h.comms !== p.comms) for (const e of h.comms) if (e.id > last && ['system','kills','radio'].includes(e.channel)) event(e.source+' · '+e.text);
  };
}
