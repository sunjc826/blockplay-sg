import { expect,it } from 'vitest';
import { initialFpsHud, type FpsHud } from './fps-engine';
import { hudReadout } from './cast-hud';
import { validHudReadout } from './cast-hud-contract';
import { observation } from './cast-contract';

const context = {region:'botanic-gardens',mode:'expedition',objective:'Secure the post',canFight:true,seconds:34,weapons:[{name:'SAR 21',fireMode:'auto'}],
  bounds:{minX:-60,maxX:60,minZ:-60,maxZ:60}} as const;
const hud:FpsHud = {...initialFpsHud,x:0,z:0,yaw:-Math.PI/2,phase:'playing',health:87,armor:32,credits:1600,tokens:300,carriedWeapons:[0],
  incoming:true,combatBanner:{tone:'hazard',text:'Area marked'},mapDangers:[{id:'ring-id',x:30,z:-30,radius:8,kind:'ring'}],
  objectiveHints:true,objectiveMarkers:[{id:'way',name:'Court post',distance:35,bearing:0,x:40,y:20,edge:false}],
  mapMarkers:[{id:'seen',x:30,z:-30,kind:'enemy',label:'Marked contact'},{id:'edge',x:99,z:0,kind:'checkpoint',label:'Exit'},
    {id:'off-map',x:99,z:0,kind:'enemy',label:'Out of frame'}],
  arena:{actors:[{name:'Hidden actor',x:1,z:0,health:5}]} as never};
it('projects only permitted M-map symbols, HUD labels, rounded bearings and distances',() => {
  const readout = hudReadout(hud,context), wire = JSON.stringify(readout);
  expect(validHudReadout(JSON.parse(wire))).toBe(true);
  expect(readout).toMatchObject({heading:'E',objective:'Secure the post',objectives:[{name:'Court post',metres:35}],wallet:{credits:1600,tokens:300},
    health:87,armor:32,weapon:'SAR 21',fireMode:'auto',warnings:['Area marked','Incoming fire'],map:{dangers:[{kind:'ring',radius:8,bearing:'NE',metres:40}]}});
  expect(readout.map?.markers).toEqual(expect.arrayContaining([expect.objectContaining({label:'Marked contact',kind:'enemy',bearing:'NE',metres:40}),expect.objectContaining({label:'Exit',bearing:'E'})]));
  expect(wire).not.toMatch(/Hidden actor|Out of frame|off-map|ring-id|"[xyz]":/);
  const jammed = hudReadout({...hud,mapJammed:true},context);
  expect(jammed.map?.markers.every(m => m.kind === 'landmark')).toBe(true);
  expect(jammed.map?.dangers).toBeUndefined(); expect(jammed.map?.control).toBeUndefined();
  expect(jammed.objectives).toEqual(readout.objectives);
});
it('caps lists and strings, validates the envelope, and rejects unrecognised nested fields and values',() => {
  const marker = {...hud.mapMarkers[0],x:0,z:0,label:'Z'.repeat(200)};
  const snapshot = hudReadout({...hud,mapMarkers:Array(30).fill(marker),chatter:Array(9).fill({source:'Encik',text:'x'.repeat(900)})},context);
  expect(snapshot.map?.markers).toHaveLength(6); expect(snapshot.map?.markers[0].label.length).toBeLessThanOrEqual(80);
  expect(snapshot.chatter).toHaveLength(2); expect(snapshot.chatter![0]).toHaveLength(160);
  const input = {mode:'expedition',regionId:context.region,personaId:'coach',events:[],memory:[],clean:true,snapshot};
  expect(observation(input)).toBeTruthy();
  const symbol = snapshot.map!.markers[0];
  for (const patch of [{x:0},{kind:'actor'},{bearing:'overhead'},{metres:-1},{metres:Infinity},{label:'a\nb'}]) {
    expect(observation({...input,snapshot:{...snapshot,map:{...snapshot.map,markers:[{...symbol,...patch}]}}})).toBeNull();
  }
  for (const patch of [{carried:Array(10).fill('rifle')},{wallet:{credits:2,tokens:1,password:'extra'}},{health:Infinity}])
    expect(observation({...input,snapshot:{...snapshot,...patch}})).toBeNull();
});

it('uses scoreboard order and the player’s visible streak and weapon displays',() => {
  const a = {id:'self',name:'Player',kills:2,deaths:1,team:'alpha',alive:true}, b = {...a,id:'ally',name:'Ally',kills:3};
  const arena = {actors:[a,b],elapsed:20,feed:[],teamDeathmatch:{scores:{alpha:5,bravo:3}},score:{players:{self:{score:200,assists:1},ally:{score:300}},events:[]},
    streaks:{players:{self:{charge:200,earned:['recon'],ready:['recon'],loadout:['recon','jammer']}},effects:[]}};
  const h = {...hud,magazine:21,chambered:true,magazineCapacity:30,arena,arenaSelf:a,
    vision:{name:'Field NVG',kind:'nvg',on:true,iff:false,iffOnly:false,warm:1,generation:2},
    supplyUse:{verb:'Applying',name:'Dressing',progress:.5},mapExpanded:false} as unknown as FpsHud;
  const wire = hudReadout(h,{...context,mode:'arena'});
  expect(validHudReadout(JSON.parse(JSON.stringify(wire)))).toBe(true);
  expect(wire).toMatchObject({magazine:20,weaponState:'chambered',capacity:30,using:'Applying Dressing 50%',
    match:{mode:'team-deathmatch',rank:2,team:'alpha',alpha:5,bravo:3,kills:2,deaths:1,assists:1},vision:{name:'Field NVG',state:'on · gen 2'}});
  expect(wire.match?.rewards?.[0]).toContain('ready');
  expect(wire.match?.rewards?.[1]).toContain('200/');
  expect(wire.wallet).toBeUndefined();
});
