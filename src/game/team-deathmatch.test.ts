import { describe, expect, it } from 'vitest';
import { createArena, type ArenaEnvironment, type ArenaSimulation } from './arena-rules';
import { ARENA_TEAMS, TDM_AREAS, TDM_RULES, type TeamDeathmatchArea } from './arena-match';
import { buildTeamDeathmatchWorld } from './team-deathmatch-world';
import { createRegionMovement } from './region-collision';
import { createVerticalMovement } from './vertical-movement';
import { createVerticalNavigator } from './vertical-navigation';
import { getPhysicalWalkSurfaces, getTraversalObstacles } from './vertical-routes';
import { createSceneCover } from './scene-cover';
import { accelerateInstancedRaycasts } from './instanced-raycast';
import { hostile } from './arena-factions';
import { validArenaSnapshot } from './arena-runtime';
import { shootAndLand } from './arena-test-shots';

const tick=(a:ArenaSimulation,n:number)=>{for(let t=0;t<n-1e-6;t+=.05)a.step(Math.min(.05,n-t));};
const actor=(a:ArenaSimulation,id:string)=>a.snapshot().actors.find(a=>a.id===id)!;
const bounds={minX:-200,maxX:200,minZ:-200,maxZ:200};
const area:TeamDeathmatchArea={...TDM_AREAS[0],bounds,spawns:{alpha:[-120,-80,-40,0,40,80].map(z=>({x:-100,z})),bravo:[-120,-80,-40,0,40,80].map(z=>({x:100,z}))},patrols:[{x:0,z:150}]};
function setup() {
  const environment:ArenaEnvironment={bounds,move:createRegionMovement(bounds).move,spawns:[...area.spawns.alpha,...area.spawns.bravo],teamDeathmatch:area};
  // Only the deliberately aimed human shot has clear cover; isolate scoring from bot combat.
  let firing=false;
  const cover=()=>firing?Infinity:0;
  const a=createArena([],0,'mixed',environment,undefined,undefined,cover);
  for(const id of ['one','two','three','four'])a.addPlayer(id,id,0,0,[{damage:200,interval:.06,capacity:100,reload:.4}]);
  const fire=(from:string,to:string)=>{
    firing=true;const shooter=actor(a,from);const target=actor(a,to),dx=target.x-shooter.x,dy=target.y-.6-shooter.y,dz=target.z-shooter.z,d=Math.hypot(dx,dy,dz);
    const result=shootAndLand(a,from,shooter,{x:dx/d,y:dy/d,z:dz/d},0);firing=false;return result;
  };
  return {a,environment,fire};
}

it('assigns humans alternately, fills four per team, and retains legacy hostility',()=>{
  const {a}=setup();
  expect(['one','two','three','four'].map(id=>actor(a,id).team)).toEqual(['alpha','bravo','alpha','bravo']);
  expect(hostile(actor(a,'one'),actor(a,'three'))).toBe(false);
  expect(hostile(actor(a,'one'),actor(a,'two'))).toBe(true);
  expect(hostile({bot:false},{bot:false})).toBe(true);
  expect(hostile({bot:false},{bot:true,faction:'armed-forces'})).toBe(false);
  a.addPlayer('fifth','No room');expect(a.snapshot().actors).toHaveLength(8);expect(actor(a,'fifth')).toBeUndefined();
  a.removePlayer('two');expect(a.snapshot().actors.filter(a=>a.team==='bravo')).toHaveLength(4);
  a.addPlayer('return','Return');expect(actor(a,'return').team).toBe('bravo');
});
it('blocks friendly fire, protects fresh enemies, and awards only enemy eliminations',()=>{
  const {a,fire}=setup();
  expect(fire('one','two').damage).toBe(0);
  expect(actor(a,'one').shield).toBeUndefined();
  tick(a,3.1);
  expect(fire('one','three').damage).toBe(0);expect(actor(a,'three').health).toBe(100);
  tick(a,.1);a.setPlayerVitals('two',{health:1});
  expect(fire('one','two').killed).toBe(true);
  expect(a.snapshot().teamDeathmatch?.scores).toEqual({alpha:1,bravo:0});
  a.removePlayer('one');expect(a.snapshot().teamDeathmatch?.scores.alpha).toBe(1);
  a.setPlayerVitals('three',{health:0});tick(a,3.1);
  expect(actor(a,'three')).toMatchObject({alive:true,health:100});
  expect(a.snapshot().teamDeathmatch?.scores).toEqual({alpha:1,bravo:0});
  a.reset();expect(a.snapshot().teamDeathmatch?.scores).toEqual({alpha:0,bravo:0});
  expect(a.snapshot().actors.every(a=>a.kills===0&&a.deaths===0&&a.alive)).toBe(true);
});
it('ends at thirty team eliminations without using individual kill limits',()=>{
  const {a,fire}=setup();
  for(let i=0;i<240;i++){const p=actor(a,'one');a.setInput('one',{...p,x:Math.min(0,p.x+.5),playing:true});a.step(.05);}
  for(let n=0;n<TDM_RULES.scoreLimit;n++) {
    tick(a,6.2);a.setPlayerVitals('two',{health:1});
    const hit=fire('one','two');expect(hit.killed,`elimination ${n} ${JSON.stringify({hit,one:actor(a,'one'),two:actor(a,'two')})}`).toBe(true);
    expect(a.snapshot().finished).toBe(n===TDM_RULES.scoreLimit-1);
  }
  expect(a.snapshot()).toMatchObject({finished:true,winner:'Alpha',teamDeathmatch:{scores:{alpha:30,bravo:0}}});
  const before=a.snapshot();tick(a,2);expect(a.snapshot()).toEqual(before);
});
it('waits when every spawn is obstructed, then retries without awarding a point',()=>{
  const obstruction={minX:-1,maxX:1,minZ:-1,maxZ:1,maxY:4};
  const environment:ArenaEnvironment={bounds,move:createRegionMovement(bounds).move,spawns:[...area.spawns.alpha,...area.spawns.bravo],teamDeathmatch:area};
  const a=createArena([obstruction],0,'mixed',environment,undefined,undefined,()=>0);a.addPlayer('one','One');
  Object.assign(obstruction,{minX:-200,maxX:200,minZ:-200,maxZ:200});
  a.setPlayerVitals('one',{health:0});tick(a,4);
  expect(actor(a,'one').alive).toBe(false);expect(actor(a,'one').respawnIn).toBeGreaterThan(0);
  expect(a.snapshot().teamDeathmatch?.scores).toEqual({alpha:0,bravo:0});
  Object.assign(obstruction,{minX:-1,maxX:1,minZ:-1,maxZ:1});tick(a,.6);
  expect(actor(a,'one')).toMatchObject({alive:true,health:100});expect(actor(a,'one').shield).toBeGreaterThan(0);
});
it('draws on equal team scores at five minutes and rejects mismatched snapshots',()=>{
  const {a,environment}=setup();tick(a,301);
  expect(a.snapshot()).toMatchObject({elapsed:300,finished:true,winner:'Draw'});
  expect(validArenaSnapshot(a.snapshot(),environment)).toBe(true);
  for(const mutate of [(s:ReturnType<typeof a.snapshot>)=>{s.teamDeathmatch!.area='smith-street';},(s:ReturnType<typeof a.snapshot>)=>{s.teamDeathmatch!.scores.alpha=NaN;},(s:ReturnType<typeof a.snapshot>)=>{delete s.actors[0].team;},(s:ReturnType<typeof a.snapshot>)=>{s.actors[0].team='bravo';}]) {
    const s=a.snapshot();mutate(s);expect(validArenaSnapshot(s,environment)).toBe(false);
  }
  expect(validArenaSnapshot(a.snapshot())).toBe(false);
});

describe.each(TDM_AREAS)('$name real district',area=>{
  it('has clear, connected spawns and bot combat with no expedition services',()=>{
    const world=buildTeamDeathmatchWorld(area.id);
    try {
      world.stamps.forEach(s=>s.visible=false);accelerateInstancedRaycasts(world.scene);
      const terrain={bounds:world.bounds,obstacles:world.obstacles,surfaces:getPhysicalWalkSurfaces(world.scene),traversalObstacles:getTraversalObstacles(world.scene)};
      const movement=createVerticalMovement(terrain),nav=createVerticalNavigator(terrain,world.environment.navigationAnchors),cover=createSceneCover(world.scene);
      for(const p of [...world.environment.spawns,...area.patrols])expect(movement.canOccupy(p.x,0,p.z,.5,1.8),JSON.stringify(p)).toBe(true);
      for(let i=0;i<area.spawns.alpha.length;i++)expect(nav.route({...area.spawns.alpha[i],y:0},{...area.spawns.bravo[i],y:0}).length).toBeGreaterThan(0);
      const a=createArena(world.obstacles,0,'mixed',world.environment,undefined,terrain,cover.distance,undefined,cover.sightDistance);
      expect(a.snapshot().actors.every(a=>a.alive)).toBe(true);
      const initial=a.snapshot();tick(a,120);const s=a.snapshot();
      for(const team of ARENA_TEAMS)expect(s.teamDeathmatch!.scores[team]).toBeGreaterThan(0);
      expect(s.actors.every(a=>a.shots>0)).toBe(true);
      expect(s.actors.some(a=>Math.hypot(a.x-initial.actors.find(p=>p.id===a.id)!.x,a.z-initial.actors.find(p=>p.id===a.id)!.z)>20)).toBe(true);
      for(const key of ['facilities','vehicles','transports','heat','reinforcementClocks','proxies'])expect(s).not.toHaveProperty(key);
      // Match Hunter streaks use drone events; expedition's event director stays absent.
      for(const event of s.events ?? []) {
        expect(event.kind).toBe('drone');
        expect(s.streaks?.effects.some(effect => effect.kind === 'hunter' && effect.event === event.id)).toBe(true);
      }
      expect(a.facilityAction('bot-1','anything')).toBe(false);expect(a.triggerEvent('mortar')).toBeNull();
      expect(validArenaSnapshot(s,world.environment)).toBe(true);
      for(const bot of s.actors)expect(bot.x>=area.bounds.minX&&bot.x<=area.bounds.maxX&&bot.z>=area.bounds.minZ&&bot.z<=area.bounds.maxZ).toBe(true);
      a.reset();expect(a.snapshot().actors.every(a=>a.alive)).toBe(true);
    }finally{world.dispose();}
  });
});
