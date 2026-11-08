import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import ArenaScoreboard from './ArenaScoreboard';
import { createArena } from '../game/arena-rules';
import { HARDPOINT_AREA, SMITH_CONTROL_SITES } from '../game/hardpoint';
import { createRegionMovement } from '../game/region-collision';
it('keeps team headings visible and ranks Hardpoint contribution before kills',()=>{
 const area=HARDPOINT_AREA,a=createArena([],0,'mixed',{bounds:area.bounds,move:createRegionMovement(area.bounds).move,spawns:[...area.spawns.alpha,...area.spawns.bravo],hardpoint:{area,sites:SMITH_CONTROL_SITES}});
 const s=a.snapshot(),[one,two]=s.actors.filter(a=>a.team==='alpha');one.controlSeconds=65;one.kills=0;two.controlSeconds=4;two.kills=10;
 const html=renderToStaticMarkup(<ArenaScoreboard snapshot={s} selfId={one.id}/>);
 expect(html).toContain('Alpha · YOUR TEAM');expect(html).toContain('Bravo');expect(html).toContain('1:05');expect(html).toContain('HOLD');expect(html.indexOf(`data-actor-id="${one.id}"`)).toBeLessThan(html.indexOf(`data-actor-id="${two.id}"`));expect(html.match(/data-actor-id=/g)).toHaveLength(8);
});
it('retains individual FFA standings without objective statistics',()=>{
 const a=createArena([],2),s=a.snapshot(),html=renderToStaticMarkup(<ArenaScoreboard snapshot={s} selfId="none"/>);expect(html).toContain('MATCH STANDINGS');expect(html).toContain('ROLE');expect(html).not.toContain('HOLD');expect(html).not.toContain('YOUR TEAM');
});
