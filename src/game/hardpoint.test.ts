import { expect, it } from 'vitest';
import { createHardpoint, controlAt, controlGoal, controlOccupancy, inControlSite, HARDPOINT_AREA, HARDPOINT_LAYOUT, HARDPOINT_RULES, SMITH_CONTROL_SITES, type ControlActor } from './hardpoint';
import { createArena } from './arena-rules';
import { validArenaSnapshot } from './arena-runtime';
import { buildHardpointWorld } from './hardpoint-world';
import { createVerticalMovement } from './vertical-movement';
import { createVerticalNavigator } from './vertical-navigation';
import { getPhysicalWalkSurfaces, getTraversalObstacles } from './vertical-routes';
import { createSceneCover } from './scene-cover';
import { accelerateInstancedRaycasts } from './instanced-raycast';
import { validArenaMatch } from './arena-match';
const [market,east,south]=SMITH_CONTROL_SITES;
const player=(team:'alpha'|'bravo',site=market):ControlActor=>({...site,y:1.75,alive:true,team});
it('scores occupation time, independent of head count, with empty and contested zones frozen',()=>{
 const h=createHardpoint(),a=player('alpha'),b=player('bravo');
 h.step(0,.4,[a,a]);h.step(.4,1,[a]);expect(h.scores()).toEqual({alpha:1,bravo:0});
 h.step(1,5,[]);h.step(5,9,[a,b]);expect(h.scores()).toEqual({alpha:1,bravo:0});
 expect(h.snapshot(9,[a,b])).toMatchObject({owner:null,contested:true,occupants:{alpha:1,bravo:1}});
 h.step(9,10,[b]);expect(h.scores()).toEqual({alpha:1,bravo:1});
 h.reset();expect(h.snapshot(0,[])).toMatchObject({active:'market',next:null,scores:{alpha:0,bravo:0}});
});
it('counts living infantry including crouch and prone, excluding roofs, corpses and vehicles',()=>{
 const a=player('alpha');
 for(const y of [.45,1.15,1.75])expect(inControlSite({...a,y},market)).toBe(true);
 for(const patch of [{y:3},{y:-1},{alive:false},{vehicle:'truck'},{transport:'ride'},{x:market.x+4.01}])expect(inControlSite({...a,...patch},market)).toBe(false);
 expect(controlOccupancy(market,[{...a,team:undefined}]).owner).toBeNull();
});
it('rotates deterministically, previews ten seconds early, and divides a boundary tick between sites',()=>{
 const h=createHardpoint();expect(h.snapshot(49.99,[]).next).toBeNull();expect(h.snapshot(50,[]).next).toBe('east');
 expect(controlAt(60).site.id).toBe('east');expect(controlAt(119.999999999).site.id).toBe('south');expect(controlAt(180).site.id).toBe('market');
 h.step(59.5,60.5,[player('alpha'),player('bravo',east)]);h.step(60.5,61,[player('bravo',east)]);
 expect(h.scores()).toEqual({alpha:0,bravo:1});
 expect(h.snapshot(360,[])).toMatchObject({active:'south',remaining:0,next:null});
});
it('caps scoring at 200 and never scores outside the match duration',()=>{
 const h=createHardpoint();h.step(-5,500,SMITH_CONTROL_SITES.map(s=>player('alpha',s)));expect(h.scores()).toEqual({alpha:200,bravo:0});
 h.step(10,20,[player('bravo')]);expect(h.scores().bravo).toBe(0);
 h.reset();h.step(359.5,400,[player('bravo',south)]);h.step(400,450,[player('bravo')]);expect(h.scores().bravo).toBe(0);
 expect(validArenaMatch({mode:'hardpoint',area:'smith-street'})).toBe(true);expect(validArenaMatch({mode:'hardpoint',area:'dragon-courtyard'})).toBe(false);
});
it('installs clear capture zones with two approaches, connected team spawns and real physical cover',()=>{
 const w=buildHardpointWorld();try{
  w.stamps.forEach(s=>s.visible=false);accelerateInstancedRaycasts(w.scene);
  const terrain={bounds:w.bounds,obstacles:w.obstacles,surfaces:getPhysicalWalkSurfaces(w.scene),traversalObstacles:getTraversalObstacles(w.scene)};
  const m=createVerticalMovement(terrain),nav=createVerticalNavigator(terrain,w.environment.navigationAnchors),cover=createSceneCover(w.scene);
  for(const site of SMITH_CONTROL_SITES){
   for(const r of [0,2,4])for(let i=0;i<16;i++){const x=site.x+Math.cos(i*Math.PI/8)*r,z=site.z+Math.sin(i*Math.PI/8)*r;expect(m.canOccupy(x,0,z,.5,1.8),`${site.id} circle ${x},${z}`).toBe(true);}
   for(const p of [...HARDPOINT_AREA.spawns.alpha,...HARDPOINT_AREA.spawns.bravo]){
    if(SMITH_CONTROL_SITES.some(s=>Math.hypot(p.x-s.x,p.z-s.z)<s.radius+HARDPOINT_RULES.spawnClearance))continue;
    expect(m.canOccupy(p.x,0,p.z,.5,1.8)).toBe(true);
    for(let slot=0;slot<4;slot++)expect(nav.route({...p,y:0},{...controlGoal(site,slot),y:0}).length,`${site.id} from ${p.x},${p.z}`).toBeGreaterThan(0);
   }
   const approaches=site.id==='east'?[{x:site.x,z:site.z-7},{x:site.x,z:site.z+8}]:[{x:site.x-8,z:site.z},{x:site.x+8,z:site.z}];
   for(const p of approaches)expect(nav.route({...p,y:0},{...site,y:0}).length,`${site.id} approach`).toBeGreaterThan(0);
  }
  for(const station of HARDPOINT_LAYOUT.structures){const p=station.props![0];expect(m.canOccupy(p.x,0,p.z,.5,1.8)).toBe(false);expect(cover.distance({x:p.x,y:.7,z:p.z-3},{x:0,y:0,z:1},6)).toBeLessThan(3);}
 }finally{w.dispose();}
});
it('plays a full real-district match: all objectives, combat, early rotations, safe respawns and reset',()=>{
 const w=buildHardpointWorld();try{
  w.stamps.forEach(s=>s.visible=false);accelerateInstancedRaycasts(w.scene);
  const terrain={bounds:w.bounds,obstacles:w.obstacles,surfaces:getPhysicalWalkSurfaces(w.scene),traversalObstacles:getTraversalObstacles(w.scene)},cover=createSceneCover(w.scene);
  const a=createArena(w.obstacles,0,'mixed',w.environment,undefined,terrain,cover.distance,undefined,cover.sightDistance);
  const scored=new Set<string>(),teams=new Set<string>(),rotated=new Set<string>();let respawns=0;let before=a.snapshot();
  for(let i=0;i<7201&&!before.finished;i++){
   a.step(.05);const s=a.snapshot(),hp=s.hardpoint!;
   if(hp.owner){scored.add(hp.active);teams.add(hp.owner);}
   if(hp.next&&s.actors.some(b=>b.bot&&b.objective===hp.next))rotated.add(hp.next);
   for(const actor of s.actors){
    expect(actor.x>=w.bounds.minX&&actor.x<=w.bounds.maxX&&actor.z>=w.bounds.minZ&&actor.z<=w.bounds.maxZ).toBe(true);
    if(actor.alive&&!before.actors.find(p=>p.id===actor.id)!.alive){respawns++;for(const site of SMITH_CONTROL_SITES)expect(Math.hypot(actor.x-site.x,actor.z-site.z)).toBeGreaterThanOrEqual(site.radius+HARDPOINT_RULES.spawnClearance-.5);}
    if(inControlSite(actor,controlAt(s.elapsed).site))expect(actor.shield??0).toBe(0);
   }
   if(i%100===0)expect(validArenaSnapshot(s,w.environment)).toBe(true);
   before=s;
  }
  expect([...scored].sort()).toEqual(['east','market','south']);expect(teams.size).toBe(2);expect(rotated.size).toBe(3);expect(respawns).toBeGreaterThan(8);
  expect(before.finished).toBe(true);expect(before.actors.every(b=>b.shots>0)).toBe(true);
  expect(before.winner).toBe(before.hardpoint!.scores.alpha===before.hardpoint!.scores.bravo?'Draw':before.hardpoint!.scores.alpha>before.hardpoint!.scores.bravo?'Alpha':'Bravo');
  expect(a.triggerEvent('mortar')).toBeNull();expect(a.facilityAction('bot-1','control-market')).toBe(false);
  for(const key of ['teamDeathmatch','facilities','vehicles','events','transports','heat','reinforcementClocks','proxies'])expect(before).not.toHaveProperty(key);
  for(const mutate of [(s:typeof before)=>{s.hardpoint!.scores.alpha=NaN;},(s:typeof before)=>{s.hardpoint!.active='east';},(s:typeof before)=>{s.hardpoint!.contested=!s.hardpoint!.contested;},(s:typeof before)=>{s.hardpoint!.occupants.alpha++;},(s:typeof before)=>{delete s.actors[0].team;}]){const s=a.snapshot();mutate(s);expect(validArenaSnapshot(s,w.environment)).toBe(false);}
  expect(validArenaSnapshot(before)).toBe(false);a.reset();expect(a.snapshot()).toMatchObject({elapsed:0,finished:false,hardpoint:{active:'market',scores:{alpha:0,bravo:0}}});expect(a.snapshot().actors.every(b=>b.alive)).toBe(true);
 }finally{w.dispose();}
});

it('keeps kills out of objective scores and ends a scoreless match in a draw',async()=>{
 const {createRegionMovement}=await import('./region-collision'),{shootAndLand}=await import('./arena-test-shots');
 const bounds={minX:-200,maxX:200,minZ:-200,maxZ:200},area={...HARDPOINT_AREA,bounds,spawns:{alpha:[-80,-40,0,40,80].map(z=>({x:-100,z})),bravo:[-80,-40,0,40,80].map(z=>({x:100,z}))}};
 // Deliberately unreachable objective isolates combat from occupancy in this rules test.
 const sites=[{...market,x:1000}],env={bounds,move:createRegionMovement(bounds).move,spawns:[...area.spawns.alpha,...area.spawns.bravo],hardpoint:{area,sites}};
 let firing=false;const a=createArena([],0,'mixed',env,undefined,undefined,()=>firing?Infinity:0);
 for(const id of ['one','two','three','four'])a.addPlayer(id,id,0,0,[{damage:200,interval:.06,capacity:100,reload:.4}]);
 for(let i=0;i<65;i++)a.step(.05);
 a.setPlayerVitals('two',{health:1});const from=a.snapshot().actors.find(a=>a.id==='one')!,to=a.snapshot().actors.find(a=>a.id==='two')!;
 const dx=to.x-from.x,dy=to.y-.6-from.y,dz=to.z-from.z,d=Math.hypot(dx,dy,dz);firing=true;
 expect(shootAndLand(a,'one',from,{x:dx/d,y:dy/d,z:dz/d},0).killed).toBe(true);firing=false;
 expect(a.snapshot().hardpoint?.scores).toEqual({alpha:0,bravo:0});a.removePlayer('one');
 for(let i=0;i<1441;i++)a.step(.25);
 expect(a.snapshot()).toMatchObject({elapsed:360,finished:true,winner:'Draw',hardpoint:{scores:{alpha:0,bravo:0}}});
 expect(a.snapshot().actors.filter(a=>a.team==='alpha')).toHaveLength(4);
});

it('finishes at 200 occupation points, retains earned points on departure and resets the objective',()=>{
 const area=HARDPOINT_AREA,site={...market},environment={bounds:area.bounds,move:(p:{x:number;z:number})=>({x:p.x,z:p.z}),spawns:[...area.spawns.alpha,...area.spawns.bravo],hardpoint:{area,sites:[site]}};
 const a=createArena([],0,'mixed',environment,undefined,undefined,()=>0);a.addPlayer('one','One');
 // Move the test objective under the stationary human; freeze movement to isolate the win condition.
 const human=a.snapshot().actors.find(a=>a.id==='one')!;site.x=human.x;site.z=human.z;
 for(let i=0;i<800&&!a.snapshot().finished;i++)a.step(.25);
 expect(a.snapshot()).toMatchObject({elapsed:200,finished:true,winner:'Alpha',hardpoint:{scores:{alpha:200,bravo:0}}});
 a.removePlayer('one');expect(a.snapshot().hardpoint?.scores.alpha).toBe(200);
 a.reset();expect(a.snapshot()).toMatchObject({finished:false,hardpoint:{active:'market',scores:{alpha:0,bravo:0}}});
});
