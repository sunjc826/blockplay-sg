import type { FpsHud, FpsEngine } from '../game/fps-engine';
import { nearMerlion } from '../game/merlion-gameplay';
import './merlion-hud.css';

export default function MerlionHud({hud,engine}:{hud:FpsHud;engine:FpsEngine|null}) {
  const state=hud.arena?.merlion,self=hud.arenaSelf;
  if(hud.phase!=='playing'||!self?.alive||!state)return null;
  const operating=state.operator===self.id,consoleNear=nearMerlion(self,'console'),cacheNear=nearMerlion(self,'cache');
  const touch=hud.inputMode==='touch';
  const water=hud.conditions.find(c=>c.kind==='water-eyes');
  // Cannon exposure is almost opaque; nearby mist leaves silhouettes visible.
  const strength=self.conditions?.['water-eyes']?.strength??0;
  return <>
    {water&&<div className={`merlion-water-screen ${strength>.8?'cannon':'mist'}`} aria-hidden="true"><div className="merlion-water-sheets" />{Array.from({length:14},(_,i)=><i key={i} style={{left:`${(i*37)%100}%`,top:`${(i*23)%100}%`,animationDelay:`${-i*.17}s`}} />)}</div>}
    {operating&&<div className="merlion-reticle" aria-hidden="true"/>}
    {(operating||consoleNear||cacheNear)&&<aside className={`merlion-hud ${operating?'is-operating':'is-nearby'}${touch?' is-touch':''}`} aria-label="Merlion controls">
      {operating?<>
        <div className="merlion-status-row">
          <strong>MERLION</strong>
          <span className="merlion-vitals" data-low={hud.health<=hud.maxHealth*.35||undefined} aria-label={`Health ${Math.ceil(hud.health)}, armor ${Math.ceil(hud.armor)}`}>
            <b>{Math.ceil(hud.health)}</b> HP <span>{Math.ceil(hud.armor)} AR</span>
          </span>
        </div>
        <div className="merlion-pressure-row">
          <span>{state.recovering>0?'Cooling':'Pressure'}</span>
          <meter aria-label="Water pressure" min={0} max={1} value={state.pressure}/>
          <output>{state.recovering>0?`${Math.ceil(state.recovering)}s`:`${Math.round(state.pressure*100)}%`}</output>
        </div>
        {touch&&<span className="merlion-mist-status">Mist · {state.cooldown>0?`${Math.ceil(state.cooldown)}s`:state.pressure<.4?'low pressure':'ready'}</span>}
        {!touch&&<div className="merlion-actions">
          <button onClick={()=>engine?.merlionAction('mist')} disabled={state.cooldown>0||state.pressure<.4} title="Q · Release mist burst"><kbd>Q</kbd> Mist{state.cooldown>0?` · ${Math.ceil(state.cooldown)}s`:''}</button>
          <button onClick={()=>engine?.merlionAction('leave')} title="E · Leave the Merlion controls"><kbd>E</kbd> Exit</button>
        </div>}
      </>:<>
        <strong>MERLION STATION</strong>
        {consoleNear&&<button onClick={()=>engine?.merlionAction('operate')} disabled={!!state.operator||self.swimming||self.prone}>{!touch&&'E · '}{state.operator?'Controls occupied':'Operate Merlion'}</button>}
        {cacheNear&&<><span>{state.packs}/3 packs · +25 health &amp; one spare if a pouch is free</span><button disabled={!state.packs||self.swimming} onClick={()=>engine?.merlionAction('supply')}>{!touch&&'E · '}Take supplies{!state.packs?` · ${Math.ceil(state.refill)}s`:''}</button></>}
      </>}
    </aside>}
  </>;
}
