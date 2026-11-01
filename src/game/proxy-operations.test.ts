import { recoverProxyWeapon } from './proxy-equipment';
import { describe, expect, it } from 'vitest';
import { createProxyCampaign, createProxyOperations, PROXY_RULES, PROXY_REWARDS, validProxySnapshot, type ProxyParticipant } from './proxy-operations';
import { hostile } from './arena-factions';
import { createProfile, resolveLoadout, restoreFieldProfile, restoreProfile } from './armory-state';
import { itemById } from './armory-catalog';

const at={x:0,y:0,z:0}, entries={'freedom-force':{x:28,y:0,z:0},'collective-cops':{x:-28,y:0,z:0}};
const actor=(id:string,faction:string,bot=true,x=0):ProxyParticipant=>({id,faction,bot,x,y:1.75,z:0,feet:0,alive:true,playing:true});
const player=actor('p','armed-forces',false), ff=actor('ff','freedom-force',true,20), cc=actor('cc','collective-cops',true,-20);
const actors=[player,ff,cc];
function fixture(){const campaign=createProxyCampaign(), ops=createProxyOperations(campaign); ops.start(at,entries); ops.step(PROXY_RULES.warning,actors); return {campaign,ops};}

describe('personal proxy tradeoffs',()=>{
  it.each([
    ['return',15,0,'resolved'],['rival',-20,12,'resolved'],['keep',-20,0,'resolved'],['carry',-20,0,'carried'],
  ] as const)('%s has an independent, one-time favor consequence',(choice,freedom,collective,cargo)=>{
    const {campaign,ops}=fixture(); expect(ops.action('p',choice,actors)).toBe(true);
    expect(campaign.favor).toEqual({'freedom-force':freedom,'collective-cops':collective});
    expect(ops.current()?.cargo).toBe(cargo); expect(ops.action('p',choice,actors)).toBe(false);
    expect(ops.current()?.targets['freedom-force'].includes('p')).toBe(choice!=='return');
    expect(ops.current()?.targets['collective-cops']).not.toContain('p');
  });
  it('does not imply faction hostility or favor merely for attacking a rival',()=>{
    const {campaign,ops}=fixture(); ops.provoke('freedom-force',player); ops.provoke('freedom-force',player);
    expect(campaign.favor).toEqual({'freedom-force':-10,'collective-cops':0});
    const proxy={...ff,proxyTargets:ops.current()!.targets['freedom-force']};
    expect(hostile(player,proxy)).toBe(true); expect(hostile(proxy,player)).toBe(true);
    expect(hostile(actor('other-player','armed-forces',false),proxy)).toBe(false);
    expect(hostile(actor('guard','armed-forces'),proxy)).toBe(false);
    expect(hostile(actor('black-kite','mercenaries'),proxy)).toBe(false);
    ops.target('freedom-force','guard'); expect(hostile(actor('guard','armed-forces'),proxy)).toBe(true);
  });
  it('requires a live, present, dismounted player and an available recipient',()=>{
    const {ops}=fixture();
    expect(ops.action('missing','keep',actors)).toBe(false);
    expect(ops.action('p','keep',[{...player,x:10},ff,cc])).toBe(false);
    expect(ops.action('p','keep',[{...player,feet:5},ff,cc])).toBe(false);
    expect(ops.action('p','keep',[{...player,alive:false},ff,cc])).toBe(false);
    expect(ops.action('p','keep',[{...player,playing:false},ff,cc])).toBe(false);
    expect(ops.action('p','keep',[{...player,vehicle:'car'},ff,cc])).toBe(false);
    expect(ops.action('ff','keep',actors)).toBe(false);
    expect(ops.action('p','return',[player,{...ff,alive:false},cc])).toBe(false);
    expect(ops.action('p','rival',[player,ff,{...cc,alive:false}])).toBe(false);
    expect(ops.current()?.decision).toBeUndefined();
  });
  it('requires physical delivery, cannot pay twice, and never rewards the other proxy',()=>{
    const {ops,campaign}=fixture(); expect(ops.action('p','deliver',actors,at)).toBe(false);
    ops.action('p','carry',actors); expect(ops.action('p','deliver',actors,{...at,x:20})).toBe(false);
    expect(ops.action('p','deliver',actors,at)).toBe(true);
    expect(ops.action('p','deliver',actors,at)).toBe(false); expect(ops.current()?.decision).toBe('deliver');
    expect(campaign.favor['collective-cops']).toBe(0);
  });
  it('bounds recovery, retains unpaid cargo, then forfeits it on a later death',()=>{
    const {ops}=fixture(); ops.action('p','carry',actors);
    ops.step(PROXY_RULES.pursuit,actors); ops.step(PROXY_RULES.withdrawal,actors);
    expect(ops.current()?.phase).toBe('complete'); expect(ops.current()?.targets['freedom-force']).toEqual([]);
    expect(ops.start(at,entries)).toBe(false);
    ops.step(1,[{...player,alive:false},ff,cc]); expect(ops.current()?.cargo).toBe('resolved');
    expect(ops.action('p','deliver',actors,at)).toBe(false);
  });
  it('lets a proxy retrieve ignored cargo with a clear uncontested hold',()=>{
    const {ops,campaign}=fixture();
    ops.step(7,[player,{...ff,x:0},cc]); expect(ops.current()?.cargo).toBe('sealed');
    ops.step(1,[player,{...ff,x:0},{...cc,x:-4}]); expect(ops.current()?.claim['freedom-force']).toBe(0);
    ops.step(9,[player,{...ff,x:0},cc],()=>false); expect(ops.current()?.cargo).toBe('sealed');
    ops.step(8,[player,{...ff,x:0},cc]); expect(ops.current()?.outcome).toContain('Freedom Force secured');
    expect(campaign.favor).toEqual({'freedom-force':0,'collective-cops':0});
  });
  it('expires an unresolved standoff and retains campaign favor across district controllers',()=>{
    const {ops,campaign}=fixture(); ops.provoke('freedom-force',player); ops.step(PROXY_RULES.duration,actors); ops.step(PROXY_RULES.withdrawal,actors);
    expect(ops.current()?.phase).toBe('complete'); expect(ops.current()?.cargo).toBe('resolved');
    const next=createProxyOperations(campaign); next.start(at,entries);
    expect(next.current()?.owner).toBe('collective-cops'); expect(next.snapshot().favor['freedom-force']).toBe(-10);
  });
  it('validates bounded snapshots and isolates returned objects',()=>{
    const {ops}=fixture(), snapshot=ops.snapshot(); expect(validProxySnapshot(snapshot)).toBe(true);
    snapshot.operation!.targets['freedom-force'].push('forged'); snapshot.favor['freedom-force']=100;
    expect(ops.snapshot().operation!.targets['freedom-force']).not.toContain('forged'); expect(ops.snapshot().favor['freedom-force']).toBe(0);
    for(const mutation of [(s:typeof snapshot)=>{s.favor['freedom-force']=Infinity},(s:typeof snapshot)=>{s.operation!.remaining=-1},(s:typeof snapshot)=>{s.operation!.targets['freedom-force']=Array(65).fill('p')}]){
      const bad=ops.snapshot();mutation(bad);expect(validProxySnapshot(bad)).toBe(false);
    }
  });
  it.each(PROXY_REWARDS['freedom-force'])('keeps %s usable in the field but out of persistent ownership', id=>{
    const item=itemById(id)!, profile=recoverProxyWeapon(createProfile(), id, 0);
    const field=restoreFieldProfile(profile), spec=resolveLoadout(field).weapons[item.family!];
    expect(spec.id).toBe(id); expect(spec.name).toBe(item.name);
    expect(resolveLoadout(field).carriedFamilies).toContain(item.family);
    expect(restoreProfile(JSON.stringify(field)).owned).not.toContain(id);
    expect(createProfile().owned).not.toContain(id);
  });
  it.each([0, .34, .99])('selects a Freedom Force weapon once at spawn (roll %s)', roll=>{
    let calls=0;
    const ops=createProxyOperations(createProxyCampaign(),()=>{calls++; return roll;});
    ops.start(at,entries); const id=ops.current()!.weaponId;
    expect(id).toBe(PROXY_REWARDS['freedom-force'][Math.floor(roll*3)]);
    expect(itemById(id)!.family).toBeGreaterThan(7);
    ops.step(PROXY_RULES.warning, actors);
    expect(ops.snapshot().operation!.weaponId).toBe(id);
    expect(validProxySnapshot(ops.snapshot())).toBe(true);
    expect(ops.action('p','keep',actors)).toBe(true);
    expect(ops.current()!.weaponId).toBe(id); expect(calls).toBe(1);
    expect(ops.current()!.outcome).toContain(itemById(id)!.name);
    expect(ops.current()!.outcome).not.toContain('SAR 21');
    const forged=ops.snapshot(); forged.operation!.weaponId='sar-issued';
    expect(validProxySnapshot(forged)).toBe(false);
    forged.operation!.weaponId='sar-proxy-prototype'; expect(validProxySnapshot(forged)).toBe(false);
  });
  it('keeps the selected reward independent of the receiving faction and other carry slots',()=>{
    const profile=createProfile(); profile.owned.push('slot-extra'); profile.carry={main:1,extra:0};
    const next=recoverProxyWeapon(profile,'ff-scar-h',0);
    expect(next.carry).toEqual({main:1,extra:9}); expect(profile.carry).toEqual({main:1,extra:0});
    expect(next.guns[0].variant).toBe('sar-issued');
    expect(recoverProxyWeapon(profile,'sar-twoeyes',0)).toBe(profile);
    const {ops}=fixture(); ops.action('p','rival',actors);
    expect(ops.current()!.weaponId).toMatch(/^ff-/);
  });
});
