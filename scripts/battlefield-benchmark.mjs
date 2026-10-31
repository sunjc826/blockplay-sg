import { createServer } from 'vite';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const output=process.env.BATTLEFIELD_OUTPUT || '.cache/battlefield-benchmark';
await fs.mkdir(output,{recursive:true});
const server=await createServer({server:{middlewareMode:true,hmr:false,watch:null},appType:'custom'});
try {
  const {createBattlefieldScenario}=await server.ssrLoadModule('/scripts/lib/battlefield-scenario.ts');
  const {REGION_IDS}=await server.ssrLoadModule('/src/game/region-ids.ts');
  const {validArenaSnapshot}=await server.ssrLoadModule('/src/game/arena-runtime.ts');
  const ids=process.env.BATTLEFIELD_DISTRICTS?.split(',') || ['queenstown','marina-bay','raffles-place'];
  const sizes=(process.env.BATTLEFIELD_SIZES || '32,48,64').split(',').map(Number);
  const seconds=Number(process.env.BATTLEFIELD_SECONDS || 90),results=[];
  assert(seconds>0 && seconds<=600);
  for(const id of ids) for(const size of sizes) {
    assert(REGION_IDS.includes(id) && [32,48,64].includes(size));
    const scenario=createBattlefieldScenario(id,size),{arena,environment}=scenario;
    try {
      const start=arena.snapshot(),initial=start.actors.filter(a=>a.bot&&a.squad),samples=[],timings=[];
      assert.equal(initial.length,size);assert.equal(scenario.sites.length,7);
      const sample=()=>{
        const snapshot=arena.snapshot(),regular=snapshot.actors.filter(a=>a.bot&&a.squad);
        assert(validArenaSnapshot(snapshot,environment),`${id}/${size}: valid snapshot`);
        assert(regular.length<=size,`${id}/${size}: bounded regular roster`);
        samples.push({seconds:Math.round(snapshot.elapsed),alive:regular.filter(a=>a.alive).length,
          factions:Object.fromEntries(['mercenaries','armed-forces'].map(f=>[f,{alive:regular.filter(a=>a.alive&&a.faction===f).length,objectives:[...new Set(regular.filter(a=>a.alive&&a.faction===f).map(a=>a.objective).filter(Boolean))]}])),
          moved10m:regular.filter(a=>{const p=initial.find(p=>p.id===a.id);return p&&Math.hypot(a.x-p.x,a.z-p.z)>10;}).length,
          sites:snapshot.facilities.sites.map(s=>({id:s.id,owner:s.owner,health:s.health}))});
      };
      sample();
      for(let i=1;i<=seconds*20;i++) {
        const before=performance.now();arena.step(.05);timings.push(performance.now()-before);
        if(i%200===0)sample();
      }
      if(seconds%10)sample();
      const sorted=timings.slice(40).sort((a,b)=>a-b),p=n=>sorted[Math.min(sorted.length-1,Math.floor(sorted.length*n))];
      const result={id,size,seconds,stepMs:{p50:p(.5),p95:p(.95),p99:p(.99),max:Math.max(...timings)},samples,navigation:arena.navigationStatus()};
      results.push(result);await fs.writeFile(`${output}/results.json`,JSON.stringify({method:'Headless 20 Hz full scene collision/sight, accelerated instances, idle observer, unseeded combat; not browser FPS.',results},null,2));
      console.log(JSON.stringify({id,size,stepMs:result.stepMs,last:samples.at(-1)}));
    } finally {scenario.dispose();}
  }
} finally {await server.close();}
