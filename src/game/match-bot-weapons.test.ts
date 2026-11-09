import { expect, it } from 'vitest';
import { createArena, type ArenaEnvironment } from './arena-rules';
import { TDM_AREAS } from './arena-match';
import { SMITH_CONTROL_SITES } from './hardpoint';
import { FPS_WEAPONS } from './fps-rules';
import { itemById, isEnemyIssue } from './armory-catalog';
import { validArenaSnapshot } from './arena-runtime';
import { shootAndLand } from './arena-test-shots';

function setup(mode: 'tdm' | 'hardpoint') {
  const bounds = { minX: -150, maxX: 150, minZ: -150, maxZ: 150 };
  const area = { ...TDM_AREAS[0], bounds, spawns: {
    alpha: [-80,-40,0,40,80].map(z => ({ x: -35, z })),
    bravo: [-80,-40,0,40,80].map(z => ({ x: 35, z })),
  } };
  let playerMoving = false;
  const environment: ArenaEnvironment = { bounds, spawns: [...area.spawns.alpha,...area.spawns.bravo],
    // Freeze patrol movement so aimed test shots have deterministic targets.
    move: (p, dx, dz) => playerMoving ? { x: p.x+dx, z: p.z+dz } : p,
    ...(mode === 'tdm' ? { teamDeathmatch: area } : { hardpoint: { area, sites: SMITH_CONTROL_SITES } }) };
  let clear = false;
  const arena = createArena([], 0, 'mixed', environment, undefined, undefined, () => clear ? Infinity : 0);
  const actor = (id: string) => arena.snapshot().actors.find(a => a.id === id)!;
  const step = (seconds: number) => { for(let t=0;t<seconds;t+=.05)arena.step(.05); };
  const kill = (from: string, to: string) => {
    const a=actor(from), b=actor(to), dx=b.x-a.x, dy=b.y-.6-a.y, dz=b.z-a.z, d=Math.hypot(dx,dy,dz);
    for(let i=0;i<8;i++) {
      clear=true;const hit=shootAndLand(arena,from,a,{x:dx/d,y:dy/d,z:dz/d},0);clear=false;
      expect(hit.hitId).toBe(to);
      if(hit.killed)return hit;
      step(.2);
    }
    throw new Error(`Target ${to} survived test fire`);
  };
  const pickup = (id: string, dropId: string) => { clear=true;const ok=arena.pickupWeapon(id,dropId);clear=false;return ok; };
  const walk = (id: string, x: number, z: number) => {
    playerMoving=true;arena.setInput(id,{...actor(id),x,z,playing:true});playerMoving=false;arena.step(.05);
  };
  return {arena,actor,step,kill,pickup,walk,environment};
}

it.each(['tdm','hardpoint'] as const)('%s assigns faction weapons on first spawn, rematch and bot replacement',mode=>{
  const {arena,environment}=setup(mode);
  const check=()=>{
    const bots=arena.snapshot().actors.filter(a=>a.bot);
    expect(bots.filter(a=>a.team==='alpha').length).toBeGreaterThan(0);
    expect(bots.filter(a=>a.team==='bravo').length).toBeGreaterThan(0);
    for(const bot of bots) {
      if(bot.team==='alpha') { expect(bot).toMatchObject({faction:'armed-forces',weapon:bot.role==='heavy'?3:bot.role==='tank'?1:0});expect(bot.variant).toBeUndefined(); }
      else {
        const pool=bot.role==='heavy'?['mg4-standard','mg4-sustained']:bot.role==='tank'?['mg4-standard','mg4ke','mg36','xm8-automatic','mg4-sustained']:['xm8-carbine','g36-rifle','xm8-compact','g36k','g36c'];
        expect(pool).toContain(bot.variant);
        expect(bot.faction).toBe('mercenaries');expect(isEnemyIssue(itemById(bot.variant!))).toBe(true);expect(itemById(bot.variant!)!.family).toBe(bot.weapon); }
    }
    expect(validArenaSnapshot(arena.snapshot(),environment)).toBe(true);
  };
  const roles=(team:string)=>arena.snapshot().actors.filter(a=>a.bot&&a.team===team).map(a=>a.role).sort();
  const fullRoster=()=>{for(const team of ['alpha','bravo'])expect(roles(team)).toEqual(['assault','assault','heavy','tank']);};
  check();fullRoster();for(let i=0;i<8;i++){arena.reset();check();fullRoster();}
  for(let i=0;i<6;i++) {
    arena.addPlayer('one','One');arena.addPlayer('two','Two');check();
    for(const team of ['alpha','bravo'])expect(roles(team)).toEqual(['assault','heavy','tank']);
    arena.addPlayer('three','Three');arena.addPlayer('four','Four');check();
    for(const team of ['alpha','bravo'])expect(roles(team)).toEqual(['heavy','tank']);
    for(const id of ['one','two','three','four'])arena.removePlayer(id);
    check();fullRoster();
  }
});
it.each((['tdm','hardpoint'] as const).flatMap(mode=>(['assault','tank','heavy'] as const).map(role=>({mode,role}))))('$mode $role drops each faction’s actual weapon and preserves it through pickup and bot respawn',({mode,role})=>{
  const {arena,actor,step,kill,pickup,walk,environment}=setup(mode);
  const weapons=FPS_WEAPONS.map(w=>({...w,damage:200}));
  arena.addPlayer('alpha-player','Alpha',0,0,weapons,undefined,false,[0,2]);
  arena.addPlayer('bravo-player','Bravo',0,0,weapons,undefined,false,[0,2]);
  step(3.1);
  const alpha=arena.snapshot().actors.find(a=>a.bot&&a.team==='alpha'&&a.role===role)!;
  const bravo=arena.snapshot().actors.find(a=>a.bot&&a.team==='bravo'&&a.role===role)!;
  const bravoVariant=bravo.variant;
  const issued=role==='heavy'?'mag-issued':role==='tank'?'ult-issued':'sar-issued';
  expect(kill('bravo-player',alpha.id).killed).toBe(true);
  expect(kill('alpha-player',bravo.id).killed).toBe(true);
  const drops=arena.snapshot().weaponDrops!;
  expect(drops.map(d=>d.catalogId)).toEqual([issued,bravoVariant]);
  // A player on either side can collect the actual issued Alpha weapon.
  const drop=drops[0];
  for(let i=0;i<350 && Math.hypot(actor('bravo-player').x-drop.x,actor('bravo-player').z-drop.z)>1;i++) {
    walk('bravo-player',drop.x,drop.z);
  }
  expect(pickup('bravo-player',drop.id)).toBe(true);
  expect(actor('bravo-player').weaponPickup?.catalogId).toBe(issued);
  step(6);
  expect(actor(alpha.id)).toMatchObject({alive:true,role,weapon:alpha.weapon});expect(actor(alpha.id).variant).toBeUndefined();
  expect(actor(bravo.id).alive).toBe(true);
  expect(isEnemyIssue(itemById(actor(bravo.id).variant!))).toBe(true);
  expect(validArenaSnapshot(arena.snapshot(),environment)).toBe(true);
});
