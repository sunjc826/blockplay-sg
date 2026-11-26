import { validHudReadout, type HudReadout } from './cast-hud-contract.ts';
import { castPersona } from './ai-cast-personas.ts';
import { isRegionId, type RegionId } from './region-ids.ts';
export const modes = ['range','arena','expedition','tutorial'] as const;
export type CastMode = typeof modes[number];
export interface Observation { personaId: string; clean: boolean; mode: CastMode; regionId: RegionId; events: string[]; memory: string[]; snapshot: HudReadout; frame?: string }
export const record = (v: unknown): v is Record<string,unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
export const only = (v: Record<string,unknown>, keys: string[]) => Object.keys(v).every(k => keys.includes(k));
export const short = (v: unknown, max: number) => typeof v === 'string' && v.length > 0 && v.length <= max && !/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u.test(v);
export const lines = (v: unknown,max: number) => Array.isArray(v) && v.length <= max && v.every(s => short(s,240));
// Check JPEG segment lengths and a real frame header before accepting scan data.
export function jpeg(value: unknown) {
  if (typeof value !== 'string' || value.length > 273068 || value.length % 4 || !value.startsWith('/9j/') || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return false;
  const bytes = atob(value), word = (i: number) => bytes.charCodeAt(i)*256 + bytes.charCodeAt(i+1);
  if (bytes.length > 204800 || word(bytes.length-2) !== 0xffd9) return false;
  let frame = false, offset = 2;
  while (offset + 4 < bytes.length && bytes.charCodeAt(offset++) === 0xff) {
    const marker = bytes.charCodeAt(offset++), length = word(offset);
    if (length < 2 || offset+length >= bytes.length-2) return false;
    if (marker >= 0xc0 && marker <= 0xc2) {
      const height = word(offset+3), width = word(offset+5);
      frame = length >= 11 && width > 0 && height > 0 && width*height <= 4000000;
    }
    if (marker === 0xda) return frame && length >= 6;
    offset += length;
  }
  return false;
}
export function observation(v: unknown): Observation | null {
  if (!record(v) || !only(v,['personaId','clean','mode','regionId','events','memory','snapshot','frame']) || castPersona(v.personaId)?.role !== 'commentator'
    || typeof v.clean !== 'boolean' || !isRegionId(v.regionId) || !modes.includes(v.mode as CastMode) || !lines(v.events,20) || !lines(v.memory,30)) return null;
  if (!validHudReadout(v.snapshot) || v.snapshot.district !== v.regionId) return null;
  if ('frame' in v && !jpeg(v.frame)) return null;
  return v as unknown as Observation;
}
