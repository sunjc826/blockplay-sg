import {describe,it,expect} from 'vitest';
import {createMerlionController,MERLION,merlionMouth,type WaterActor} from './merlion-gameplay';
import {createMerlionPresentation} from './merlion-presentation';
const clear=(_o:unknown,_d:unknown,r:number)=>r;
const player=():WaterActor=>({id:'p',bot:false,alive:true,x:0,y:1.75,z:-8.5,yaw:-Math.PI/2,pitch:-.06});
const delta=(a:number,b:number)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
describe('Merlion steering',()=>{
  it('completes a player half-turn within .7s while keeping the bot mechanical limit',()=>{
    for(const bot of [false,true]){
      const c=createMerlionController(clear),p={...player(),bot};c.action(p,'operate');p.yaw+=Math.PI;
      for(let i=0;i<14;i++){c.input(p,false,true);c.step(.05,[p],()=>{});}
      if(bot)expect(delta(c.state.yaw,-Math.PI/2)).toBeCloseTo(MERLION.turnSpeed*.7);
      else expect(delta(c.state.yaw,p.yaw)).toBeCloseTo(0);
    }
  });
  it('renders continuous 60Hz turns from a 20Hz authority without mutating its state',()=>{
    const c=createMerlionController(clear),p=player(),view=createMerlionPresentation(clear);c.action(p,'operate');
    let state=c.snapshot(),lastHost=state.yaw,lastView=state.yaw,hostChanges=0,viewChanges=0;p.yaw+=2.8;
    for(let i=0;i<30;i++){
      if(i%3===0){c.input(p,false,true);c.step(.05,[p],()=>{});state=c.snapshot();}
      const before=structuredClone(state),shown=view.update(state,1/60,Math.floor(i/3),p)!;
      if(Math.abs(delta(state.yaw,lastHost))>1e-6)hostChanges++;
      if(Math.abs(delta(shown.yaw,lastView))>1e-6)viewChanges++;
      expect(state).toEqual(before);expect(Math.abs(delta(shown.yaw,state.yaw))).toBeLessThanOrEqual(MERLION.playerTurnSpeed*.2+1e-6);
      lastHost=state.yaw;lastView=shown.yaw;
    }
    expect(hostChanges).toBe(10);expect(viewChanges).toBeGreaterThanOrEqual(28);
  });
  it('clips predicted spray at scenery and freezes stale input instead of drifting',()=>{
    const c=createMerlionController(clear),p=player(),view=createMerlionPresentation((_o,_d,r)=>Math.min(5,r));c.action(p,'operate');
    const s=c.snapshot();p.yaw+=2;
    const shown=view.update(s,.05,1,p)!,mouth=merlionMouth(shown.yaw);
    expect(Math.hypot(shown.end.x-mouth.x,shown.end.y-mouth.y,shown.end.z-mouth.z)).toBeCloseTo(5);
    for(let i=0;i<10;i++)view.update(s,.05,1,p);
    expect(view.update(s,.05,1,p)).toEqual(s);
    expect(view.update({...s,operator:'other'},.05,2,p)?.yaw).toBe(s.yaw);
    expect(view.update(undefined,.05,3,p)).toBeUndefined();
  });
  it('uses the short path across wrapped yaw and resets on a new match',()=>{
    const c=createMerlionController(clear),p=player(),view=createMerlionPresentation(clear);c.action(p,'operate');
    const s={...c.snapshot(),yaw:Math.PI-.02};p.yaw=-Math.PI+.02;
    expect(delta(view.update(s,.02,50,p)!.yaw,p.yaw)).toBeCloseTo(0);
    p.yaw=0;expect(view.update({...s,yaw:0},.02,0,p)?.yaw).toBe(0);
  });
});
