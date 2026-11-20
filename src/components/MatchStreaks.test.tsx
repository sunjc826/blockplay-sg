import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MatchStreakHud, StreakLoadoutSection } from './MatchStreaks';
it('offers only legal rewards and explains objective charge and locked selection',()=>{
 const ffa=renderToStaticMarkup(<StreakLoadoutSection mode="free-for-all" draft={['recon','hunter','strike']} locked={false} onDraft={()=>{}}/>);
 expect(ffa.match(/data-streak-card=/g)).toHaveLength(4);expect(ffa).not.toContain('Sentry Turret');expect(ffa).not.toContain('Guardian Interceptor');expect(ffa).toContain('3 of 3 chosen');
 const hp=renderToStaticMarkup(<StreakLoadoutSection mode="hardpoint" draft={['recon','interceptor','strike']} locked onDraft={()=>{}}/>);
 expect(hp).toContain('+10 per uncontested second');expect(hp).toContain('Locked once the match starts');expect(hp).toContain('Guardian Interceptor');expect(hp).toContain('Not carried');expect(hp).not.toContain('Tap to carry');
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

it('lays out every legal reward as a card, marks the carried three and lists what each bot drew',()=>{
 const html=renderToStaticMarkup(<StreakLoadoutSection mode="team-deathmatch" draft={['recon','hunter','strike']} locked={false} field={[{id:'bot-1',name:'Viper',loadout:['jammer','interceptor','sentry'],side:'enemy'}]} onDraft={()=>{}}/>);
 expect(html.match(/data-streak-card=/g)).toHaveLength(6);expect(html.match(/aria-pressed="true"/g)).toHaveLength(3);
 expect(html).toContain('Slot 2 · key 5');expect(html).toContain('Remove one to swap');expect(html).toContain('500 pts · Lethal');
 expect(html).toContain('Viper');expect(html).toContain('aria-label="Sentry Turret"');
 expect(renderToStaticMarkup(<StreakLoadoutSection mode="team-deathmatch" draft={['recon']} locked={false} onDraft={()=>{}}/>)).toContain('1 of 3 chosen');
});
