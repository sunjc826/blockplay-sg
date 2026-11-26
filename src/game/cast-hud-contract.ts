import { isRegionId } from './region-ids.ts';
// The wire type and its recursive allowlist come from the same field definitions.
type Check<T> = (v: unknown) => v is T;
type Value<C> = C extends Check<infer T> ? T : never;
type Shape = Record<string,Check<unknown>>;
type Fields<S extends Shape> =
  { [K in keyof S as undefined extends Value<S[K]> ? never : K]: Value<S[K]> } &
  { [K in keyof S as undefined extends Value<S[K]> ? K : never]?: Value<S[K]> };
function object<S extends Shape>(fields:S): Check<Fields<S>> {
  const entries = Object.entries(fields);
  return (v): v is Fields<S> => {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
    const data = v as Record<string,unknown>;
    return Object.keys(data).every(k => Object.hasOwn(fields,k)) && entries.every(([k,check]) => check(data[k]));
  };
}
const optional = <T>(check:Check<T>):Check<T | undefined> => (v):v is T | undefined => v === undefined || check(v);
const list = <T>(max:number,check:Check<T>):Check<T[]> => (v):v is T[] => Array.isArray(v) && v.length <= max && v.every(check);
const choice = <const T extends readonly string[]>(...values:T):Check<T[number]> => (v):v is T[number] => typeof v === 'string' && values.includes(v);
const integer = (max:number):Check<number> => (v):v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= max;
const words = (max:number):Check<string> => (v):v is string => typeof v === 'string' && v.length > 0 && v.length <= max && !/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u.test(v);
const flag:Check<boolean> = (v):v is boolean => typeof v === 'boolean';
const count = integer(1000000), name = words(80), line = words(160);
export const bearings = ['N','NE','E','SE','S','SW','W','NW'] as const;
const bearing = choice(...bearings);
const relative = { bearing, metres:integer(10000) };
const mapKind = choice('control','landmark','parachute','boat','facility','target','car','helicopter','hunter','loot','npc','checkpoint','scent','ally','enemy');
const team = choice('alpha','bravo'), side = choice('ally','enemy','neutral');
const beltKind = choice('food','bandage','first-aid','plates','ammo','grenade');
export const validHudReadout = object({
  district:isRegionId, sector:name, heading:bearing, degrees:integer(359), objective:line, phase:choice('loading','ready','deploying','playing','paused','complete','defeated','error'),
  recap:optional(list(8,line)), deployment:optional(list(6,name)), earnings:optional(object({credits:count,xp:count})),
  health:count, maxHealth:count, armor:count, maxArmor:count, stance:choice('standing','crouched','prone','swimming'),
  weapon:name, carried:list(5,name), magazine:count, reserve:count, spareMagazines:optional(count), capacity:optional(count),
  fireMode:optional(choice('auto','semi')), weaponState:optional(line), accessories:optional(line), carrier:optional(line),
  belt:list(6,object({kind:beltKind,count,name:optional(name)})), selected:beltKind, using:optional(line),
  quick:optional(list(2,name)), picker:optional(list(6,name)), shieldSeconds:optional(count),
  effects:optional(list(8,name)), throwable:optional(line), vision:optional(object({name,kind:choice('nvg','thermal','iff'),state:line})),
  vehicle:choice('on-foot','car','helicopter','dragon-boat-red','dragon-boat-gold'), crew:optional(line), instruments:optional(line),
  seconds:count, score:count, streak:count, contacts:optional(count), clock:optional(name),
  match:optional(object({mode:choice('free-for-all','team-deathmatch','hardpoint'),rank:count,hold:optional(count),awards:optional(list(3,line)),placement:optional(name),kills:count,deaths:count,assists:count,team:optional(team),alpha:optional(count),bravo:optional(count),hill:optional(line),rewards:optional(list(3,name)),winner:optional(name)})),
  map:optional(object({jammed:flag,sight:optional(integer(1000)),recon:optional(flag),markers:list(6,object({...relative,kind:mapKind,label:name,side:optional(side),active:optional(flag),inactive:optional(flag),loot:optional(choice('weapon','ammo','medical','armor','food','resupply')),site:optional(choice('command','garage','helipad','supply'))})),
    dangers:optional(list(3,object({...relative,kind:choice('crate','ring','raider'),radius:integer(1000)}))),
    control:optional(list(16,object({sector:name,owner:choice('ally','enemy','neutral','contested')})))})),
  objectives:optional(list(4,object({name,...relative}))), prompts:optional(list(4,line)), warnings:optional(list(6,line)),
  facility:optional(line), threat:optional(choice('low','medium','high')), heat:optional(object({allied:integer(100),enemy:integer(100)})),
  wallet:optional(object({credits:count,tokens:count})), chatter:optional(list(2,line)), comms:optional(list(2,line)),
  feed:optional(list(3,line)), station:optional(line), operation:optional(line), route:optional(line), briefing:optional(line), loot:optional(line), pilot:optional(line), feedback:optional(list(6,line)), equipment:optional(line), orders:optional(line), range:optional(line),
});
export type HudReadout = Value<typeof validHudReadout>;
