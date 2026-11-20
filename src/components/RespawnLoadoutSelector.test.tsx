import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import RespawnLoadoutSelector from './RespawnLoadoutSelector';
import { createProfile, purchase } from '../game/armory-state';

it('offers the locker on a dedicated screen and distinguishes next life from current gear', () => {
  const p = createProfile();
  const html = renderToStaticMarkup(<RespawnLoadoutSelector inventory={p} selected={p} onSave={async () => true} onClose={() => {}} />);
  expect(html).toContain('Choose your next loadout'); expect(html).toContain('Your current life keeps its gear');
  expect(html).toContain('Main weapon platform'); expect(html).toContain('Sidearm variant');
  expect(html).toContain('Rent the extra main slot'); expect(html).not.toContain('data-loadout-variant="sar-vanguard"');
  expect(html).toContain('Use on next respawn'); expect(html).toContain('aria-modal="true"');
});

it('shows active rentals and a purchased extra slot while keeping unavailable weapons out', () => {
  let p = { ...createProfile(), xp: 100000, tokens: 10000 };
  p = purchase(p, 'slot-extra').profile; p = purchase(p, 'sar-vanguard', '1h').profile;
  const html = renderToStaticMarkup(<RespawnLoadoutSelector inventory={p} selected={p} onSave={async () => true} onClose={() => {}} />);
  expect(html).toContain('Extra main platform'); expect(html).toContain('data-loadout-variant="sar-vanguard"');
  expect(html).toContain('left'); expect(html).not.toContain('data-loadout-variant="sar-marksman"');
});

it('explains first-spawn equipment when opened from match setup',()=>{
 const p=createProfile(),html=renderToStaticMarkup(<RespawnLoadoutSelector deployment inventory={p} selected={p} onSave={async()=>true} onClose={()=>{}}/>);
 expect(html).toContain('Choose your starting loadout');expect(html).toContain('Use for this match');expect(html).not.toContain('Your current life keeps its gear');
 expect(html).not.toContain('Your room stays connected');
});
it('puts the streak rewards in the locker with the weapons, and only when the match has them',()=>{
 const p=createProfile(),base={inventory:p,selected:p,onSave:async()=>true,onClose:()=>{}};
 expect(renderToStaticMarkup(<RespawnLoadoutSelector {...base}/>)).not.toContain('data-streak-card');
 const open=renderToStaticMarkup(<RespawnLoadoutSelector deployment {...base} streaks={{mode:'team-deathmatch',loadout:['strike','recon','hunter'],locked:false,onSave:()=>{}}}/>);
 expect(open.match(/data-streak-card=/g)).toHaveLength(10);expect(open).toContain('weapons and scorestreaks');expect(open).toContain('Scorestreaks are remembered for this mode');
 expect(open.indexOf('data-streak-card="recon"')).toBeGreaterThan(open.indexOf('Sidearm'));expect(open).toMatch(/data-testid="queue-loadout">/);
 const locked=renderToStaticMarkup(<RespawnLoadoutSelector {...base} streaks={{mode:'hardpoint',loadout:['recon','interceptor','strike'],locked:true,onSave:()=>{}}}/>);
 expect(locked).toContain('Objective streaks');expect(locked).toContain('Locked once the match starts');
});
