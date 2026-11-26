import { compassBearing } from './compass';
import { streakFriendly } from './match-streak-visuals';
import { bearings, type HudReadout } from './cast-hud-contract';
import type { FpsHud } from './fps-engine';
import type { CastMode } from './cast-contract';
import { sectorAt, zoneSectors } from './zone-sectors';
import { getWorldZone, type WorldZoneId } from './world-zones';
import { REGION_STAMPS } from '../data/region-stamps';
import { minimapHeading, outsideMapBounds, markerAtMapEdge, type MapBounds, type MinimapMarker } from './minimap';
import { sectorFacilityControl } from './expedition-objectives';
import { scoreboardActors } from './scoreboard-standing';
import { SCORE_EVENTS, SCORE_RULES } from './match-score';
import { STREAKS } from './match-streaks';
import { hudActionPrompt } from './hud-action-prompt';

export interface HudPresentation {
  objective:string; activeSite?:string; nextSite?:string; clock?:string; markers?:readonly MinimapMarker[]; bounds?:MapBounds; canFight:boolean; recon?:boolean; route?:string;
}
interface Context extends HudPresentation {
  region:WorldZoneId; mode:CastMode; seconds:number; weapons:readonly {name:string;fireMode?:string}[];
}
export const hudText = (s:string, max=160) => s.replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/gu,' ').replace(/\s+/g,' ').trim().slice(0,max);
const name = (s:string) => hudText(s,80);
const lines = (values:(string | null | undefined | false)[], cap:number) => {
  const result = values.filter((s):s is string => !!s).map(s => hudText(s)).filter(Boolean).slice(0,cap);
  return result.length ? result : undefined;
};
const n = (v:number) => Math.max(0,Math.min(1000000,Math.round(v)));
const compass = (degrees:number) => bearings[((Math.round(degrees/45)%8)+8)%8];
const distance = (a:{x:number;z:number},b:{x:number;z:number}) => Math.hypot(b.x-a.x,b.z-a.z);
function relative(h:FpsHud,p:{x:number;z:number}) {
  const d = distance(h,p), band = d < 15 ? 5 : d < 100 ? 10 : 25;
  return { bearing:compass(Math.atan2(p.x-h.x,h.z-p.z)*180/Math.PI), metres:Math.min(10000,Math.round(d/band)*band) };
}
function mapReadout(h:FpsHud,c:Context):HudReadout['map'] {
  if (!c.bounds || c.mode === 'tutorial' || h.phase !== 'playing' || c.mode === 'expedition' && h.arenaSelf?.alive === false) return;
  const bounds = c.bounds;
  const visible = (h.mapJammed ? [] : c.markers ?? h.mapMarkers).filter(m => !outsideMapBounds(m,bounds) || markerAtMapEdge(m));
  const landmarks = REGION_STAMPS[c.region].filter(p => !outsideMapBounds(p,bounds)).map(p => ({...p,kind:'landmark' as const,label:p.name,id:p.name}));
  const nearest = (a:{x:number;z:number},b:{x:number;z:number}) => distance(h,a)-distance(h,b);
  const ordered:MinimapMarker[] = [...visible,...landmarks].sort(nearest);
  const dangers = h.mapJammed ? [] : h.mapDangers.filter(d => d.x+d.radius >= bounds.minX && d.x-d.radius <= bounds.maxX && d.z+d.radius >= bounds.minZ && d.z-d.radius <= bounds.maxZ);
  return { jammed:h.mapJammed,sight:c.mode === 'range' ? undefined : n(h.mapContactRange),recon:!h.mapJammed && c.recon || undefined,
    markers:ordered.slice(0,6).map(m => ({kind:m.kind,...relative(h,m),
      label:name(m.label || m.kind),side:m.side,active:m.active || undefined,inactive:m.inactive || undefined,loot:m.lootType,site:m.facilityType})),
    dangers:dangers.length ? dangers.sort(nearest).slice(0,3).map(d => ({...relative(h,d),kind:d.kind,radius:n(d.radius)})) : undefined,
    control:!h.mapJammed && c.mode === 'expedition' ? zoneSectors(c.region).slice(0,16).map(s => ({sector:s.id,owner:sectorFacilityControl(s,h.arena?.facilities?.sites ?? [])})) : undefined,
  };
}
function matchReadout(h:FpsHud,c:Context):HudReadout['match'] {
  const a = h.arena, self = h.arenaSelf;
  if (!a || !self) return;
  const hill = a.hardpoint, teams = hill ?? a.teamDeathmatch;
  const ranked = scoreboardActors(a).filter(actor => !teams || actor.team === self.team);
  const streaks = a.streaks?.players[self.id];
  const awards = !h.mapExpanded && !h.scoreboardHeld && h.phase === 'playing'
    ? a.score?.events.filter(e => e.actor === self.id && a.elapsed-e.at <= SCORE_RULES.popupSeconds).slice(-3)
      .map(e => e.parts.map(([kind,points]) => SCORE_EVENTS[kind].label+' +'+points).join(' · ')) : undefined;
  return {awards:lines(awards ?? [],3),placement:h.streakPlacement ? STREAKS[h.streakPlacement].name : undefined,mode:hill ? 'hardpoint' : teams ? 'team-deathmatch' : 'free-for-all',rank:ranked.findIndex(p => p.id === self.id)+1,
    hold:hill ? n(self.controlSeconds ?? 0) : undefined,kills:self.kills,deaths:self.deaths,assists:a.score?.players[self.id]?.assists ?? 0,team:self.team,
    alpha:teams?.scores.alpha,bravo:teams?.scores.bravo,winner:a.finished && a.winner ? name(a.winner) : undefined,
    hill:hill ? hudText([c.activeSite ?? hill.active,hill.contested ? 'contested' : hill.owner ?? 'unclaimed',Math.ceil(hill.remaining)+'s',hill.next && 'next '+(c.nextSite ?? hill.next)].filter(Boolean).join(' · ')) : undefined,
    rewards:streaks?.loadout.slice(0,3).map(id => {
      const active = a.streaks?.effects.find(e => e.kind === id && streakFriendly(a.actors.find(actor => actor.id === e.owner),self));
      const status = active ? Math.max(0,Math.ceil(active.until-a.elapsed))+'s active' : streaks.ready.includes(id) ? 'ready' : streaks.earned.includes(id) ? 'used' : Math.floor(streaks.charge)+'/'+STREAKS[id].cost;
      return name(STREAKS[id].name+' '+status);
    }) };
}

/** Project only the public HUD and the district map that M would draw. Called on request admission. */
export function hudReadout(h:FpsHud,c:Context):HudReadout {
  const mounted = h.vehicle !== 'on-foot', gun = mounted && !h.vehiclePersonalWeapon, held = c.weapons[h.weapon];
  const prompt = hudActionPrompt(h,c.canFight), v = h.vision, g = h.grenadeHeld, carrier = h.reserveCarrier;
  const sector = c.mode === 'tutorial' ? 'Field school' : sectorAt(c.region,h.x,h.z)?.name ?? 'Between named sectors';
  const self = h.arenaSelf, recap = h.deathRecap;
  const seat = h.vehicleSeats[h.vehicleSeat ?? 0];
  const weaponState = [h.aiming && 'ADS',h.chambered && 'chambered',h.magazineOut && 'magazine out',!h.roundReady && 'chamber empty',
    h.reloading > 0 && (h.reloadEmpty ? 'empty' : 'tactical')+' reload '+n((1-h.reloading)*100)+'%',h.reloadSaved > 0 && 'reload saved '+n(h.reloadSaved*100)+'%',
    h.inspecting && 'inspecting',h.braced && 'braced'].filter(Boolean).join(', ');
  const accessories = [h.scopeZoom && h.scopeZoom.value+'×',h.offsetDot && (h.canted ? 'offset dot' : 'primary sight'),
    h.rail && h.rail.kind !== 'light' && 'laser '+((h.rail.laserOn ?? h.rail.on) ? 'on' : 'off'),
    h.rail && h.rail.kind !== 'laser' && 'light '+((h.rail.lightOn ?? h.rail.on) ? 'on' : 'off')].filter(Boolean).join(', ');
  const facility = h.phase === 'playing' && !h.lootCard ? h.facility : null;
  const quick = [h.recoveryItem,h.combatItem].flatMap((item,i) => item ? [name((i ? 'G ' : 'F ')+item.name+' ×'+item.count)] : []);
  const picker = h.recoveryPicker ?? h.grenadePicker;
  const station = h.merlion, proxies = h.arena?.proxies, op = proxies?.operation;
  const showOperation = c.mode === 'expedition' && op && proxies && !h.mapExpanded && self?.alive && (op.phase !== 'complete' || op.cargo === 'carried');
  const flight = h.vehicle === 'helicopter' && h.vehicleView === 'first-person' && h.vehicleSeat === 0;
  const shield = self?.alive && self.shield;
  return {district:c.region,sector,degrees:compassBearing(h.yaw),heading:compass(minimapHeading(h.yaw)),objective:hudText(c.objective),phase:h.phase,
    deployment:h.respawn && !h.deathRecap ? h.respawn.zones.slice(0,6).map(z => name(z.name+' · '+(z.available ? z.id === h.respawn?.selected ? 'selected' : 'available' : z.reason))) :
      h.deployment?.canChoose ? h.deployment.points.slice(0,6).map(p => name(p.name+' · '+(p.available === false ? p.reason ?? 'unavailable' : p.id === h.deployment?.choice ? 'selected' : 'available'))) : undefined,
    recap:recap ? lines([
      recap.killer ? [recap.killer.friendly && 'Friendly fire',recap.killer.name,recap.killer.rank,recap.killer.faction,recap.killer.weapon,
        recap.killer.range != null && n(recap.killer.range)+' m',recap.killer.alive ? n(Math.ceil(recap.killer.health+recap.killer.armor))+' HP left' : 'also down',
        n(recap.dealtToKiller.damage)+' damage dealt in '+recap.dealtToKiller.hits+' hits'].filter(Boolean).join(' · ') : recap.cause,
      'This life: '+n(recap.life.seconds)+'s, '+recap.life.kills+' kills, '+recap.life.damageDealt+' damage, '+(recap.life.accuracy ?? '–')+'% accuracy, '+recap.life.distance+' m, longest '+recap.life.longestKill+' m',
      'Session '+recap.session.kills+' K / '+recap.session.deaths+' D · +'+recap.life.credits+' CR',
      ...recap.attackers.slice(0,3).map(a => a.name+' dealt '+n(a.damage)),...recap.notes,
    ],8) : undefined,
    earnings:h.phase === 'complete' && c.mode === 'range' ? {credits:n(h.earned),xp:n(h.earnedXp)} : undefined,
    health:n(Math.ceil(h.health)),maxHealth:n(h.maxHealth),armor:n(Math.ceil(h.armor)),maxArmor:n(h.maxArmor),
    stance:h.swimming ? 'swimming' : h.prone ? 'prone' : h.crouchLatched ? 'crouched' : 'standing',
    seconds:n(c.seconds),score:n((self && h.arena?.score?.players[self.id]?.score) ?? self?.kills ?? h.hits),streak:n(h.chain),
    contacts:h.pilotEnabled ? n(h.pilotContacts) : undefined,clock:c.clock && name(c.clock),
    weapon:name(gun ? h.vehicleWeapon || h.vehicle : held?.name ?? 'Unarmed'),carried:h.carriedWeapons.slice(0,5).map(i => name(c.weapons[i]?.name ?? 'Unarmed')),
    magazine:n(gun ? h.vehicleAmmo : h.magazine - (h.chambered ? 1 : 0)),reserve:gun ? 0 : n(h.reserve),spareMagazines:gun ? undefined : h.spareMagazines,capacity:gun ? h.vehicleAmmoMax : h.magazineCapacity,
    fireMode:!gun && held ? held.fireMode === 'semi' ? 'semi' : 'auto' : undefined,weaponState:!gun && weaponState || undefined,accessories:accessories || undefined,
    equipment:h.carriedKg ? h.carriedKg.toFixed(1)+' kg · '+n(h.movementScale*100)+'% movement' : undefined,
    carrier:carrier && hudText(carrier.name+' '+carrier.used+'/'+carrier.capacity+' slots, '+carrier.compatible+' compatible'+(carrier.kind === 'maid' && !carrier.arriving ? ' · '+n(carrier.distance)+' m away' : '')+' · '+carrier.status),
    belt:h.belt.filter(b => b.count > 0).slice(0,6).map(b => ({kind:b.kind,count:n(b.count),name:b.next ? name(b.next.name) : undefined})),selected:h.beltSelected,
    using:h.supplyUse ? hudText(h.supplyUse.verb+' '+h.supplyUse.name+' '+n(h.supplyUse.progress*100)+'%') : undefined,
    throwable:g ? hudText(g.name+' · '+(g.under ? 'lob' : 'throw')+' · '+(g.pinned ? Math.max(0,g.fuse-g.cooked).toFixed(1)+'s' : 'ready')) : undefined,
    effects:[...h.conditions,...h.foodEffects].length ? [...h.conditions,...h.foodEffects].slice(0,8).map(e => name(e.label+' '+Math.ceil(e.remaining)+'s')) : undefined,
    quick:quick.length ? quick : undefined,picker:picker?.options.slice(0,6).map(i => name(i.name+' ×'+i.count)),shieldSeconds:shield ? Math.ceil(shield) : undefined,
    vision:v ? {name:name(v.name),kind:v.kind,state:[v.on ? 'on' : 'off','gen '+v.generation,v.iff && (v.iffOnly ? 'IFF only' : 'IFF'),v.on && v.warm < 1 && 'warming '+n(v.warm*100)+'%',v.on && v.palette,v.on && v.calibrating && 'calibrating'].filter(Boolean).join(' · ')} : undefined,
    vehicle:h.vehicle,crew:mounted ? hudText(['You: '+(seat?.label ?? 'aboard'),...h.vehicleSeats.map(s => s.label+' '+s.name)].join(', ')) : undefined,
    instruments:mounted ? hudText([Math.round(h.vehicleSpeed)+' km/h',n(h.vehicleHealth)+'/'+n(h.vehicleMaxHealth)+' hull',h.vehicleDamage,
      h.vehicle === 'helicopter' && n(h.altitude)+' m altitude',flight && 'heading '+compassBearing(h.vehicleHeading)+'°, climb '+h.vehicleClimb.toFixed(1)+' m/s, pitch '+Math.round(h.vehiclePitch*180/Math.PI)+'°',h.vehicleView].filter(Boolean).join(' · ')) : undefined,
    map:mapReadout(h,c),match:c.mode === 'arena' ? matchReadout(h,c) : undefined,
    objectives:h.objectiveHints && !h.mapExpanded ? [...h.objectiveMarkers].sort((a,b) => a.distance-b.distance).slice(0,4).map(m => ({name:name(m.name),bearing:compass(minimapHeading(h.yaw)+m.bearing),metres:n(m.distance)})) : undefined,
    prompts:lines([prompt && (prompt.kind === 'heal' ? 'Use ' : '')+prompt.text,h.facilityPrompt,h.rangeSupplyPrompt,h.lootCard && [h.lootCard.action,h.lootCard.name,h.lootCard.blocked].filter(Boolean).join(' '),h.lootPrompt,h.npcPrompt,h.travelPrompt,h.interact],4),
    warnings:lines([h.combatBanner?.text,h.incoming && 'Incoming fire',h.hurt && 'Taking damage',h.cloudCover?.kind,
      ...h.grenadeWarnings.slice(0,2).map(w => 'Grenade '+compass(minimapHeading(h.yaw)+w.angle*180/Math.PI))],6),
    facility:facility ? hudText([facility.name,facility.owner ?? 'neutral',facility.contested && 'contested',facility.suppressed && 'suppressed',Math.ceil(facility.health)+'/'+facility.maxHealth+' HP',facility.action && facility.action.kind+' '+n(facility.action.progress*100)+'%',Math.floor(h.arena?.facilities?.supplies['armed-forces'] ?? 0)+' supply'].filter(Boolean).join(' · ')) : undefined,
    threat:c.mode === 'expedition' ? getWorldZone(c.region).risk : undefined,heat:h.sectorHeat ? {allied:n(h.sectorHeat['armed-forces']*100),enemy:n(h.sectorHeat.mercenaries*100)} : undefined,
    wallet:c.mode === 'expedition' ? {credits:n(h.credits),tokens:n(h.tokens)} : undefined,
    chatter:lines(h.chatter.slice(-2).map(l => l.source+' · '+l.text),2),comms:lines(h.comms.slice(-2).map(l => l.channel+' · '+l.source+' · '+l.text),2),
    feed:c.mode === 'arena' ? lines(h.arena?.feed.slice(-3).map(e => e.text) ?? [],3) : undefined,
    station:station && !h.mapExpanded && (station.operating || station.cacheNear || station.consoleNear || station.guide) ? hudText([
      'Merlion',station.operating && 'pressure '+n(station.state.pressure*100)+'%',station.consoleNear && (station.state.operator ? 'controls occupied' : 'board controls'),
      station.cacheNear && station.state.packs+' packs, refill '+Math.ceil(station.state.refill)+'s',station.blocked].filter(Boolean).join(' · ')) : undefined,
    operation:showOperation ? hudText([op.owner,op.phase,Math.ceil(op.remaining)+'s',op.phase === 'contested' && n(distance(h,op.at))+'m',
      op.cargo === 'carried' && op.carrier === self.id && 'Deliver to friendly facility',h.proxyReach && 'Inspect cargo',
      'favor '+proxies.favor['freedom-force']+' Freedom / '+proxies.favor['collective-cops']+' Collective'].filter(Boolean).join(' · ')) : undefined,
    route:c.route && hudText(c.route),briefing:h.deploymentBriefing ? hudText(h.deploymentBriefing.time+' · '+h.deploymentBriefing.weather) : undefined,
    pilot:h.pilotEnabled ? hudText([h.pilotStatus,h.pilotGoal].filter(Boolean).join(' · ')) : undefined,
    loot:h.lootCard ? hudText([h.lootCard.tier,h.lootCard.name,h.lootCard.type,h.lootCard.detail,h.lootCard.blocked].filter(Boolean).join(' · ')) : undefined,
    feedback:lines([h.message,h.hit && (h.headshot && c.mode === 'range' ? 'headshot' : h.hitKind)+' '+h.lastDamage,h.callout,h.streakNotice,h.lootNotice,h.vehicleNotice,h.encikCallout?.text,recap && 'Died: '+(recap.killer?.name ?? recap.cause)],6),
    orders:h.calloutWheel && h.orderStatus ? hudText(h.orderStatus.allies+' allies in range · reinforcement '+h.orderStatus.reinforce) : undefined,
    range:c.mode === 'range' ? hudText([h.rangeDrill?.mode,h.hits+' cleared',h.shots+' shots',h.landed+' hits',n(h.carDistance)+' m to car',n(h.helicopterDistance)+' m to heli'].filter(Boolean).join(' · ')) : undefined,
  };
}
