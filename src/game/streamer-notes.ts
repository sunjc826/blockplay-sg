import type { FpsHud } from './fps-engine';
import { REGION_NAMES, type RegionId } from './region-ids';
import { foodCounterId, sectorAt, zoneSectors } from './zone-sectors';
import { outsideMapBounds, type MapBounds } from './minimap';
import type { CastMode } from './cast-contract';

const clean = (s:string) => s.replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/gu,' ').replace(/\s+/g,' ').trim().slice(0,190);

/** Clock is supplied by the session. Only distinct HUD events touch this log. */
export function sessionNotes() {
  const emptied = new Map<RegionId,Set<string>>();
  const entries = new Map<string,{text:string;at:number;count:number}>();
  return {
    add(text:string,at:number,key=clean(text)) {
      const count = (entries.get(key)?.count ?? 0)+1;
      entries.delete(key); entries.set(key,{text:clean(text),at,count});
      if (entries.size > 20) entries.delete(entries.keys().next().value!);
    },
    empty(region:RegionId,id:string) {
      const ids = emptied.get(region) ?? new Set<string>();
      ids.add(id); emptied.set(region,ids);
    },
    read(now:number,region?:RegionId) {
      const facts = Array.from(region ? emptied.get(region) ?? [] : [],id => 'Emptied this session ['+id+']');
      const recent = Array.from(entries.values(),e => {
        const age = Math.max(0,Math.floor((now-e.at)/1000));
        return e.text+(e.count > 1 ? ' (×'+e.count+')' : '')+' · '+(age < 60 ? age+'s' : Math.floor(age/60)+'m')+' ago';
      });
      const room = Math.max(0,20-facts.length);
      return [...facts.slice(-20),...recent.slice(Math.max(0,recent.length-room))];
    },
    clear() { emptied.clear(); entries.clear(); },
  };
}

/** Attached to published HUD changes during a streamer game. A new binding starts
 * fresh comparisons on district/redeployment changes, keeping the session log. */
export function noteHudEvents(notes:ReturnType<typeof sessionNotes>, region:RegionId, mode:CastMode, bounds?:MapBounds, incident?:(hud:FpsHud,kind:'fight'|'death'|'supply')=>void) {
  let previous:FpsHud | undefined, lastSector:string | undefined;
  const alive = (hud:FpsHud) => !hud.deathRecap && hud.arenaSelf?.alive !== false && hud.health > 0;
  let lastFight = -Infinity;
  const location = (p:{x:number;z:number}) => {
    const sector = mode === 'tutorial' ? 'Field school' : sectorAt(region,p.x,p.z)?.name ?? 'Between named sectors';
    return sector+' ('+REGION_NAMES[region]+')';
  };
  return (h:FpsHud, now:number) => {
    const p = previous; previous = h;
    if (p?.phase === 'playing' && alive(p) && !alive(h) && (h.phase === 'playing' || h.phase === 'defeated' || h.deathRecap))
      incident?.(h,'death');
    if (h.phase !== 'playing' && !h.deathRecap) return;
    const here = location(h), entered = here !== lastSector;
    if (entered) { lastSector = here; notes.add('Visited '+here,now); }
    if (h.deathRecap && h.deathRecap.serial !== p?.deathRecap?.serial) {
      const {killer,cause} = h.deathRecap;
      notes.add('Died in '+here+' to '+(killer ? killer.name+' · '+killer.weapon : cause),now);
    }
    if (!alive(h)) return;
    if (p && (h.incoming || h.landed > p.landed || h.shots > p.shots && (h.pilotContacts > 0 || p.pilotContacts > 0))) {
      if (now-lastFight >= 5000) incident?.(h,'fight');
      lastFight = now;
    }
    if (h.incoming && (!p?.incoming || entered)) notes.add('Under fire in '+here,now);
    if ((mode === 'arena' || mode === 'expedition') && h.pilotEnabled && h.pilotContacts > 0 && (!p?.pilotContacts || entered)) {
      notes.add('Saw opposition from '+here,now);
      const marked = !h.mapJammed && bounds && h.mapMarkers.filter(m => m.kind === 'enemy' && !outsideMapBounds(m,bounds))
        .sort((a,b) => Math.hypot(a.x-h.x,a.z-h.z)-Math.hypot(b.x-h.x,b.z-h.z))[0];
      if (marked) notes.add('Enemy marked in '+location(marked),now);
    }
    if (h.merlion?.cacheNear && !h.mapExpanded && h.merlion.state.packs === 0 &&
      (!p?.merlion?.cacheNear || p.merlion.state.packs > 0)) { notes.empty(region,'merlion-cache'); notes.add('Found the Merlion supply cache empty in '+here,now); }
    if (!p || p.phase !== 'playing') return;
    const notice = h.lootNotice !== p.lootNotice && h.lootNotice;
    if (notice) {
      const removed = p.fieldLoot.find(item => Math.hypot(item.x-h.x,item.z-h.z) < 4 && !h.fieldLoot.some(l => l.id === item.id));
      if (removed && h.comms.some(line => line.source === 'Supplies' && line.text === notice) || /^Supply drop open:/i.test(notice)) {
        incident?.(h,'supply');
        if (removed?.placement === 'food-stall') {
          // The counter's authoring sector can overlap a smaller display sector.
          for (const sector of zoneSectors(region)) {
            const i = sector.foodAnchors?.findIndex(p => p.x === removed.x && p.z === removed.z) ?? -1;
            if (i >= 0) notes.empty(region,foodCounterId(sector.id,i));
          }
        }
        notes.add('Used '+(removed?.name ?? 'supply drop')+' in '+here,now);
      }
      else if (/\bempty\b|\bdepleted\b/i.test(notice) && /crate|cache|depot|supply point|drop/i.test(notice))
        notes.add('Found empty supplies in '+here+' · '+notice,now);
    }
    if (h.message !== p.message && h.message.startsWith('Range resupply ·')) { incident?.(h,'supply'); notes.add('Used range resupply in '+here,now); }
    if (h.message !== p.message && h.message.startsWith('Merlion cache · field dressing applied')) { incident?.(h,'supply'); notes.add('Used the Merlion supply cache in '+here,now); }
    if (mode === 'expedition' && !p.mapJammed && !h.mapJammed && p.arena?.facilities && h.arena?.facilities !== p.arena.facilities) {
      for (const site of h.arena?.facilities?.sites ?? []) {
        const old = p.arena.facilities.sites.find(s => s.id === site.id);
        if (!old) continue;
        const held = site.owner === 'armed-forces' && site.health > 0, wasHeld = old.owner === 'armed-forces' && old.health > 0;
        if (held !== wasHeld) notes.add('Our side '+(held ? 'took ' : 'lost ')+site.name+' in '+location(site),now);
      }
    }
    const hill = h.arena?.hardpoint, old = p.arena?.hardpoint, team = h.arenaSelf?.team;
    if (team && hill && old && hill.active === old.active && (hill.owner === team) !== (old.owner === team)) {
      const marker = !h.mapJammed && h.mapMarkers.find(m => m.kind === 'control' && m.active);
      notes.add('Our team '+(hill.owner === team ? 'took ' : 'lost ')+hill.active+' · '+(marker ? location(marker) : REGION_NAMES[region]),now);
    }
  };
}
