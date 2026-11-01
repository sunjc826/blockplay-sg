import type { FpsEngine, FpsHud } from '../game/fps-engine';
import { proxyName, proxyRival, type ProxyAction } from '../game/proxy-operations';
import { facilityOperational } from '../game/facilities';
import './proxy-operations.css';

export default function ProxyOperationHud({ hud, engine }: { hud: FpsHud; engine: FpsEngine | null }) {
  const state=hud.arena?.proxies, op=state?.operation;
  if (!state || !op || hud.mapExpanded || !hud.arenaSelf?.alive || op.phase==='complete' && op.cargo!=='carried') return null;
  const owner=proxyName(op.owner), rival=proxyName(proxyRival(op.owner));
  const carrying=op.cargo==='carried' && op.carrier===hud.arenaSelf.id;
  const delivery=carrying && hud.facility && facilityOperational(hud.facility,'armed-forces') && Math.hypot(hud.facility.x-hud.x,hud.facility.z-hud.z)<=4;
  const distance=Math.round(Math.hypot(op.at.x-hud.x,op.at.z-hud.z));
  const hunted=op.targets[op.owner].includes(hud.arenaSelf.id) && op.phase!=='complete';
  const choices: {action:ProxyAction;title:string;detail:string;disabled?:boolean}[] = [
    {action:'return',title:`Return to ${owner}`,detail:`${owner} favor +15. Give up the upgrade.`,disabled:!hud.arena?.actors.some(a=>a.bot&&a.alive&&a.faction===op.owner)},
    {action:'rival',title:`Hand over to ${rival}`,detail:`${rival} +12; ${owner} −20. Owner pursues you.`,disabled:!hud.arena?.actors.some(a=>a.bot&&a.alive&&a.faction===proxyRival(op.owner))},
    {action:'keep',title:'Keep the Mythic upgrade',detail:`Fit a powerful SAR 21 for this life. ${owner} −20; owner pursues you.`},
    {action:'carry',title:'Carry to the Armed Forces',detail:`Deliver at a friendly facility: up to 60 supplies, repairs and ready deployment. ${owner} −20; owner pursues you.`},
  ];
  return <>
    <aside className="proxy-status" aria-label="Proxy operation" data-proxy-phase={op.phase}>
      <strong>{carrying?'TRACKED CARGO':hunted?'PROXY RECOVERY TEAM':'CONTESTED PROTOTYPE'}</strong>
      <span>{op.phase==='incoming'?`${owner} cargo descending · cells arrive in ${Math.ceil(op.remaining)}s`:carrying?'Deliver at an operational friendly facility in this district':op.phase==='contested'?`${owner} property · ${distance}m · ${Math.ceil(op.remaining)}s remaining`:op.phase==='complete'?'Recovery teams departed':`${op.phase==='withdrawing'?'Withdrawal':'Recovery'} · ${Math.ceil(op.remaining)}s`}</span>
      <small>Favor · Freedom {state.favor['freedom-force']} · Collective {state.favor['collective-cops']}</small>
      {hud.proxyReach && <button onClick={()=>engine?.openProxyMenu()}>{hud.inputMode==='mouse'?'E · ':''}Inspect cargo / choose</button>}
      {delivery && <button onClick={()=>engine?.chooseProxyAction('deliver')}>{hud.inputMode==='mouse'?'E · ':''}Deliver prototype</button>}
      {carrying && <small>Death or leaving this district forfeits the cargo.</small>}
      {op.phase==='contested' && <small>Cells secure unattended cargo. Interfering is optional.</small>}
    </aside>
    {hud.proxyMenu && <div className="proxy-choice-overlay" role="dialog" aria-modal="true" aria-label="Choose the prototype's fate" onPointerDown={e=>e.stopPropagation()}>
      <div className="proxy-choice-card">
        <div className="proxy-choice-heading"><div><small>EXPERIMENTAL FIRE-CONTROL ASSEMBLY</small><h2>Who gets the prototype?</h2></div><button aria-label="Close cargo choices" onClick={()=>engine?.closeProxyMenu()}>×</button></div>
        <p>The tracker identifies anyone taking this cargo. Favor is personal; nearby friendly soldiers may defend you. The battle continues while you choose.</p>
        <div className="proxy-choice-list">{choices.map((choice,i)=><button key={choice.action} disabled={choice.disabled} onClick={()=>engine?.chooseProxyAction(choice.action)}>
          <kbd>{i+1}</kbd><span><strong>{choice.title}</strong><small>{choice.disabled?'Recovery cell eliminated; handover unavailable.':choice.detail}</small></span>
        </button>)}</div>
        <small>{hud.locked?'Press 1–4 to choose · E to close':'Select an option, or close to leave it untouched'}</small>
      </div>
    </div>}
  </>;
}
