import type { FpsHud, FpsEngine } from '../game/fps-engine';
import { MERLION } from '../game/merlion-gameplay';
import { tapProps } from './touch-tap';
import './merlion-hud.css';

export default function MerlionHud({hud,engine}:{hud:FpsHud;engine:FpsEngine|null}) {
  if(hud.phase!=='playing'||!hud.merlion)return null;
  const { state, operating, consoleNear, cacheNear, blocked, guide, waterStrength } = hud.merlion;
  const touch=hud.inputMode==='touch';
  const affected=hud.arena?.actors.filter(a=>a.alive&&a.bot&&(a.conditions?.['water-eyes']?.remaining??0)>0)??[];
  const blinded=affected.filter(a=>(a.conditions?.['water-eyes']?.strength??0)>.8).length;
  const misted=affected.length-blinded;
  return <>
    {waterStrength>0&&<div className={`merlion-water-screen ${waterStrength>.8?'cannon':'mist'}`} aria-hidden="true"><div className="merlion-water-sheets" />{Array.from({length:14},(_,i)=><i key={i} style={{left:`${(i*37)%100}%`,top:`${(i*23)%100}%`,animationDelay:`${-i*.17}s`}} />)}</div>}
    {operating&&<div className="merlion-reticle" aria-hidden="true"/>}
    {!hud.mapExpanded && (operating||consoleNear||cacheNear||guide)&&<aside className={`merlion-hud ${operating?'is-operating':'is-nearby'}${touch?' is-touch':''}`} aria-label="Merlion controls">
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
        <span className="merlion-mist-status">{touch ? 'Hold FIRE for water cannon' : 'Mouse to aim · Hold left click for water cannon'}</span>
        <span className="merlion-mist-status">Mist: {MERLION.mistRange} m cone ahead · affects anyone inside</span>
        <output className="merlion-hit-status" data-active={affected.length>0||undefined}>{blinded&&misted?`${blinded} blinded · ${misted} in mist`:blinded?`${blinded} bot${blinded===1?'':'s'} blinded · fire interrupted`:misted?`${misted} bot${misted===1?'':'s'} in mist · sight obscured`:state.firing||state.mist>0?'No bots affected':'Water disrupts vision · no damage'}</output>
        {touch&&<span className="merlion-mist-status">Mist · {state.cooldown>0?`${Math.ceil(state.cooldown)}s`:state.pressure<MERLION.mistCost?'low pressure':'ready'}</span>}
        {!touch&&<div className="merlion-actions">
          <button onClick={()=>engine?.merlionAction('mist')} disabled={state.cooldown>0||state.pressure<MERLION.mistCost} title="Q · Release a forward mist cone"><kbd>Q</kbd> Mist{state.cooldown>0?` · ${Math.ceil(state.cooldown)}s`:''}</button>
          <button onClick={()=>engine?.merlionAction('leave')} title="E · Leave the Merlion controls"><kbd>E</kbd> Exit</button>
        </div>}
      </>:<>
        <strong>MERLION STATION</strong>
        {blocked ? <span>{blocked}</span> : !consoleNear && <span>Find the brass wheel on the south side to board.</span>}
        {consoleNear&&<button {...tapProps(()=>engine?.merlionAction('operate'))} disabled={!!state.operator||!!blocked||hud.pilotEnabled}>{!touch&&'E · '}{state.operator?'Controls occupied':'Board Merlion'}</button>}
        {cacheNear&&<><span>{state.packs}/{MERLION.packs} packs · +25 health &amp; one spare if a pouch is free</span><button disabled={!state.packs||!!blocked||hud.pilotEnabled} {...tapProps(()=>engine?.merlionAction('supply'))}>{!touch&&'E · '}Take supplies{!state.packs?` · ${Math.ceil(state.refill)}s`:''}</button></>}
      </>}
    </aside>}
  </>;
}
