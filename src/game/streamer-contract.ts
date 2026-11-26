import arenaCatalog from './arena-catalog.json' with {type:'json'};
import { validLevels, type SectorLevels } from './streamer-familiarity.ts';
import { zoneSectors } from './zone-sectors.ts';
import { DEFAULT_VARIANTS } from './weapon-family-ids.ts';
import { validHudReadout, type HudReadout } from './cast-hud-contract.ts';
import { castPersona } from './ai-cast-personas.ts';
import { jpeg, lines, modes, only, record, short, type CastMode } from './cast-contract.ts';
import { isRegionId, type RegionId } from './region-ids.ts';
import { parsePilotObservation } from './pilot-strategy-contract.ts';
import type { PilotObservation } from './fps-pilot.ts';

export const actionKinds = ['navigate', 'select', 'buy', 'equip', 'start'] as const;
export interface MenuAction {
  id: string; label: string; kind: typeof actionKinds[number]; state?: 'disabled' | 'selected'; detail?: string;
}
export interface MenuScreen { screenId: string; title: string; actions: MenuAction[] }
export interface Wallet { credits: number; tokens: number }
interface Turn { personaId: string; clean: boolean; memory: string[] }
export interface MenuTurn extends Turn { phase: 'menu'; screen: MenuScreen; wallet: Wallet; note: string }
export interface PlayTurn extends Turn {
  phase: 'play'; familiarity?:SectorLevels; destinationSector?:string; destinationPlace?:string; arenaArea?:string; hud: HudReadout; notes:string[]; regionId: RegionId; mode: CastMode; events: string[]; observation: PilotObservation; frame?: string;
}
const id = (v: unknown) => typeof v === 'string' && short(v,100) && !!v.trim();
export function parseStreamerTurn(v: unknown): PlayTurn | MenuTurn | null {
  const shared = ['phase', 'personaId', 'clean', 'memory'];
  if (!record(v) || castPersona(v.personaId)?.role !== 'streamer' || typeof v.clean !== 'boolean' || !lines(v.memory,30)) return null;
  if (v.phase === 'play') {
    if (!only(v,[...shared,'regionId','mode','events','observation','hud','notes','frame','familiarity','destinationSector','destinationPlace','arenaArea']) || !isRegionId(v.regionId) ||
      !modes.includes(v.mode as CastMode) || !lines(v.events,20) || !lines(v.notes,20) || !validHudReadout(v.hud) || v.hud.district !== v.regionId || ('frame' in v && !jpeg(v.frame))) return null;
    if ('familiarity' in v && !validLevels(v.regionId,v.familiarity) ||
      'destinationSector' in v && !zoneSectors(v.regionId).some(s => s.id === v.destinationSector) ||
      'destinationPlace' in v && (typeof v.destinationPlace !== 'string' || !/^p-[0-9a-z]{1,7}$/.test(v.destinationPlace) || !v.destinationSector) ||
      'arenaArea' in v && (v.mode !== 'arena' || typeof v.arenaArea !== 'string' || !Object.hasOwn(arenaCatalog,v.arenaArea) || arenaCatalog[v.arenaArea as keyof typeof arenaCatalog].region !== v.regionId)) return null;
    const observation = parsePilotObservation(v.observation,DEFAULT_VARIANTS.length);
    return observation && { ...(v as unknown as PlayTurn), observation };
  }
  const s = v.screen, w = v.wallet;
  if (v.phase !== 'menu' || !only(v,[...shared,'note','screen','wallet']) || !short(v.note,240) ||
    !record(w) || !only(w,['credits','tokens']) || ![w.credits,w.tokens].every(n => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= 1000000) ||
    !record(s) || !only(s,['screenId','title','actions']) || !id(s.screenId) || !short(s.title,120) ||
    !Array.isArray(s.actions) || !s.actions.length || s.actions.length > 40) return null;
  const ids = new Set<string>();
  for (const a of s.actions) {
    if (!record(a) || !only(a,['id','label','kind','state','detail']) || !id(a.id) || ids.has(String(a.id)) ||
      !short(a.label,120) || !actionKinds.includes(a.kind as MenuAction['kind']) ||
      ('state' in a && a.state !== 'disabled' && a.state !== 'selected') || ('detail' in a && !short(a.detail,160))) return null;
    ids.add(String(a.id));
  }
  return s.actions.some(a => a.state !== 'disabled') ? v as unknown as MenuTurn : null;
}
