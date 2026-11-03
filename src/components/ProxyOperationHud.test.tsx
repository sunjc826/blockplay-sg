import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import ProxyOperationHud from './ProxyOperationHud';
import { initialFpsHud } from '../game/fps-engine';
import { createArena, type ArenaEnvironment } from '../game/arena-rules';
import { createProxyCampaign } from '../game/proxy-operations';

function hud() {
 const env:ArenaEnvironment={bounds:{minX:-200,maxX:200,minZ:-200,maxZ:200},spawns:[{x:0,z:0}],playerSpawn:{x:0,z:0},move:(p,dx,dz)=>({x:p.x+dx,z:p.z+dz}),endless:true,proxies:createProxyCampaign()};
 const sim=createArena([],0,'mixed',env);sim.addPlayer('p','Player',0,0,undefined,undefined,true);sim.triggerProxyOperation({x:60,z:0});for(let i=0;i<73;i++)sim.step(.25);
 const arena=sim.snapshot();return {...initialFpsHud,phase:'playing' as const,arena,arenaSelf:arena.actors.find(a=>a.id==='p')!,proxyReach:true,proxyMenu:true};
}
it('discloses all tradeoffs before the cargo decision, including tracker attribution and life-limited gear',()=>{
 const html=renderToStaticMarkup(<ProxyOperationHud hud={hud()} engine={null}/>);
 expect(html).toContain('Choose the prototype&#x27;s fate');expect(html).toContain('Return to Freedom Force');expect(html).toContain('Hand over to Collective Corps');
 expect(html).toMatch(/Soft Power|Hard Power|Smart Power|Peace Offering|M200 Intervention/); expect(html).not.toContain('SAR 21');
 expect(html).toContain('Keep the Mythic upgrade');expect(html).toContain('Carry to the Armed Forces');expect(html).toContain('for this life');expect(html).toContain('The tracker identifies');expect(html).toContain('battle continues');
 expect(html).toContain('Leave crate untouched');expect(html).toContain('without taking anything or changing favor');
});
it('cannot offer a dead cell as a handover recipient',()=>{
 const h=hud();for(const a of h.arena.actors)if(a.faction==='collective-cops')a.alive=false;
 const html=renderToStaticMarkup(<ProxyOperationHud hud={h} engine={null}/>);expect(html).toContain('disabled=""');expect(html).toContain('handover unavailable');
});
it('removes operation controls while dead or using the expanded map',()=>{
 const h=hud();expect(renderToStaticMarkup(<ProxyOperationHud hud={{...h,mapExpanded:true}} engine={null}/>)).toBe('');
 expect(renderToStaticMarkup(<ProxyOperationHud hud={{...h,arenaSelf:{...h.arenaSelf,alive:false}}} engine={null}/>)).toBe('');
});
