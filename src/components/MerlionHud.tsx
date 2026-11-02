import FpsVitals from './FpsVitals';
import type { FpsHud, FpsEngine } from '../game/fps-engine';
import { nearMerlion } from '../game/merlion-gameplay';
import './merlion-hud.css';

export default function MerlionHud({hud,engine}:{hud:FpsHud;engine:FpsEngine|null}) {
  const state=hud.arena?.merlion,self=hud.arenaSelf;
  if(hud.phase!=='playing'||!self?.alive||!state)return null;
  const operating=state.operator===self.id,consoleNear=nearMerlion(self,'console'),cacheNear=nearMerlion(self,'cache');
  const water=hud.conditions.find(c=>c.kind==='water-eyes');
  // Cannon exposure is almost opaque; nearby mist leaves silhouettes visible.
  const strength=self.conditions?.['water-eyes']?.strength??0;
  return <>
    {water&&<div className={`merlion-water-screen ${strength>.8?'cannon':'mist'}`} aria-hidden="true"><div className="merlion-water-sheets" />{Array.from({length:14},(_,i)=><i key={i} style={{left:`${(i*37)%100}%`,top:`${(i*23)%100}%`,animationDelay:`${-i*.17}s`}} />)}</div>}
    {operating&&<div className="merlion-reticle" aria-hidden="true"/>}
    {(operating||consoleNear||cacheNear)&&<aside className="merlion-hud" aria-label="Merlion controls">
      <strong>{operating?'MERLION WATER CANNON':'MERLION STATION'}</strong>
      {operating?<>
        <FpsVitals hud={hud}/>
        <span>Aim with mouse / look · hold fire for cannon</span>
        <meter aria-label="Water pressure" min={0} max={1} value={state.pressure}/>
        <span>{Math.round(state.pressure*100)}% pressure{state.recovering>0?' · pump cooling':''} · turn speed limited</span>
        <button onClick={()=>engine?.merlionAction('mist')} disabled={state.cooldown>0||state.pressure<.4}>Q · Mist burst {state.cooldown>0?`${Math.ceil(state.cooldown)}s`:''}</button>
        <button onClick={()=>engine?.merlionAction('leave')}>E · Leave controls</button>
      </>:<>
        {consoleNear&&<button onClick={()=>engine?.merlionAction('operate')} disabled={!!state.operator||self.swimming||self.prone}>E · {state.operator?'Controls occupied':'Operate Merlion'}</button>}
        {cacheNear&&<><span>{state.packs}/3 shared packs · +25 health &amp; one spare magazine if a pouch is free</span><button disabled={!state.packs||self.swimming} onClick={()=>engine?.merlionAction('supply')}>E · Take supplies{!state.packs?` · ${Math.ceil(state.refill)}s`:''}</button></>}
      </>}
    </aside>}
  </>;
}
