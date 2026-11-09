import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MatchStreakHud, MatchStreakLoadout } from './MatchStreaks';
it('offers only legal rewards and explains objective charge and locked selection',()=>{
 const ffa=renderToStaticMarkup(<MatchStreakLoadout mode="free-for-all" disabled={false} onChange={()=>{}}/>);
 expect(ffa).toContain('Streak slot 1');expect(ffa).not.toContain('Sentry Turret');expect(ffa).not.toContain('Guardian Interceptor');
 const hp=renderToStaticMarkup(<MatchStreakLoadout mode="hardpoint" disabled onChange={()=>{}}/>);
 expect(hp).toContain('+10 per uncontested second');expect(hp).toContain('lock when the match starts');expect(hp).toContain('Guardian Interceptor');
});
it('keeps ready, active, used and placement states accessible without relying on color',()=>{
 const html=renderToStaticMarkup(<MatchStreakHud progress={{loadout:['recon','jammer','strike'],charge:600,heldCharge:0,ready:['recon'],earned:['recon','jammer','strike']}} effects={[]} now={0} hardpoint={false} alive touch placement="strike" onUse={()=>{}} onConfirm={()=>{}} onCancel={()=>{}}/>);
 expect(html).toContain('Kestrel Recon: READY');expect(html).toContain('Signal Jammer: USED');expect(html).toContain('Deploy here');expect(html).toContain('Cancel');expect(html).toContain('250m range · 8m blast radius');expect(html).not.toContain('<kbd>');
});

it('shows placement refusal beside the deploy control while retaining the ready charge',()=>{
 const notice='Placement blocked. Move away from spawn areas and obstacles, then retry. Charge retained.';
 const html=renderToStaticMarkup(<MatchStreakHud progress={{loadout:['recon','interceptor','strike'],charge:400,heldCharge:0,ready:['interceptor'],earned:['interceptor']}} effects={[]} now={0} hardpoint alive touch placement="interceptor" notice={notice} onUse={()=>{}} onConfirm={()=>{}} onCancel={()=>{}}/>);
 expect(html).toContain(notice);expect(html).toContain('Guardian Interceptor: READY');expect(html).toContain('Deploy here');
});
