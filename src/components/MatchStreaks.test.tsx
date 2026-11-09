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
 expect(html).toContain('Kestrel Recon: READY');expect(html).toContain('Signal Jammer: USED');expect(html).toContain('Deploy here');expect(html).toContain('Cancel');expect(html).toContain('5m blast');expect(html).not.toContain('<kbd>');
});
