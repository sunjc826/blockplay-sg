import {expect,it} from 'vitest';
import {noteHudEvents,sessionNotes} from './streamer-notes';
import {streamerSession} from './streamer-session';
import {initialFpsHud,type FpsHud} from './fps-engine';
import {zoneSectors} from './zone-sectors';

it('ages and merges repeat visits and deaths from a recap, with a bounded recency order',() => {
  const notes = sessionNotes(), observe = noteHudEvents(notes,'botanic-gardens','expedition');
  const point = zoneSectors('botanic-gardens')[0].anchors[0];
  const h = {...initialFpsHud,...point,phase:'playing',pilotEnabled:true,pilotContacts:1,incoming:true} as FpsHud;
  const recap = {...h,deathRecap:{serial:1,cause:'Sniper',killer:{name:'Scout',weapon:'Precision rifle'}}} as FpsHud;
  observe(h,1000); observe(recap,2000); observe(recap,3000); observe(h,6000);
  observe({...recap,deathRecap:{...recap.deathRecap!,serial:2}},7000);
  expect(notes.read(10000)).toContainEqual(expect.stringMatching(/Died in Tanglin Gate court.*Scout · Precision rifle \(×2\) · 3s ago/));
  expect(notes.read(10000)).toContainEqual(expect.stringMatching(/Under fire in Tanglin Gate/));
  for (let i=0;i<25;i++) notes.add('Receipt '+i,10000);
  expect(notes.read(76000)).toHaveLength(20); expect(notes.read(76000)[0]).toBe('Receipt 5 · 1m ago');
});
it('keeps notes across game/menu handoffs and clears them on stop and persona start',() => {
  const session = streamerSession(), settings = {personaId:'pro',screenshots:false,clean:true};
  session.start(settings); session.notes.add('Bought a dressing',100);
  session.handoff('play'); session.pause(); session.resume(); session.handoff('menu');
  expect(session.notes.read(1100)).toEqual(['Bought a dressing · 1s ago']);
  session.start({...settings,personaId:'rager'}); expect(session.notes.read(1100)).toEqual([]);
  session.notes.add('Another life',1200); session.stop(); expect(session.notes.read(1500)).toEqual([]);
});

it('records supply receipts, ignores denied pickups and retains the public sector for an enemy marker',() => {
  const notes = sessionNotes(), bounds = {minX:-1000,minZ:-1000,maxX:1000,maxZ:1000};
  const observe = noteHudEvents(notes,'botanic-gardens','expedition',bounds);
  const [court,lawn] = zoneSectors('botanic-gardens');
  const h = {...initialFpsHud,...court.anchors[0],phase:'playing',pilotEnabled:true} as FpsHud;
  const crate = {...court.anchors[0],id:'crate',name:'Field dressing'};
  const full = {...h,fieldLoot:[crate]} as FpsHud;
  observe(full,1000);
  observe({...h,lootNotice:'Belt full'},2000);
  expect(notes.read(2000).some(line => line.startsWith('Used'))).toBe(false);
  observe(full,3000);
  const receipt = '+1 Field dressing';
  observe({...h,lootNotice:receipt,comms:[{source:'Supplies',text:receipt,id:1,at:4,channel:'system'}],pilotContacts:1,
    mapMarkers:[{id:'shown',kind:'enemy',...lawn.anchors[0],label:'Marked contact'}]} as FpsHud,4000);
  expect(notes.read(4000)).toContainEqual(expect.stringContaining('Used Field dressing in '+court.name));
  expect(notes.read(4000)).toContainEqual(expect.stringContaining('Enemy marked in '+lawn.name));
});

it('remembers the exact emptied stall after its receipt ages out, and scores only observed gameplay incidents',()=>{
  const notes=sessionNotes(), incidents:string[]=[];
  const observe=noteHudEvents(notes,'pulau-ubin','expedition',undefined,(_h,kind)=>incidents.push(kind));
  const village=zoneSectors('pulau-ubin').find(s=>s.id==='village')!;
  const p=village.foodAnchors![0], h={...initialFpsHud,...p,phase:'playing'} as FpsHud;
  const food={...p,id:'food',name:'Kaya toast',placement:'food-stall'};
  observe({...h,fieldLoot:[food]} as FpsHud,0);
  observe({...h,shots:1,pilotContacts:1,lootNotice:'Collected toast',comms:[{id:1,at:1,channel:'system',source:'Supplies',text:'Collected toast'}]} as FpsHud,1000);
  const dead={...h,deathRecap:{serial:1,cause:'Opponent'}} as FpsHud;
  observe(dead,2000); observe(dead,3000);
  expect(incidents).toEqual(['fight','supply','death']);
  for (let i=0;i<25;i++) notes.add('Visit '+i,i);
  expect(notes.read(4000,'pulau-ubin')).toHaveLength(20);
  expect(notes.read(4000,'pulau-ubin')).toContain('Emptied this session [food-village-1]');
  expect(notes.read(4000,'queenstown').join(' ')).not.toContain('Emptied');
  notes.clear(); expect(notes.read(5000,'pulau-ubin')).toEqual([]);
});
