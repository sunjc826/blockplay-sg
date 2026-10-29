import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, X } from 'lucide-react';
import type { SHOP_CATEGORIES } from '../game/armory-state';
import './tutorial.css';

type Category = typeof SHOP_CATEGORIES[number]['id'];
const STOPS = [
  { id: 'wallet', title: 'Your wallet & progression', text: 'Credits (CR) come from eliminations and training. Tokens (TK) are the other currency. Level requirements and item prices are separate: reaching a level does not buy the item.' },
  { id: 'categories', title: 'Find your equipment', text: 'The tabs organise the shelves: weapons, skins, armor, night vision, food, utilities and vehicles. Open Armor to see rigs and protective inserts.', category: 'armor' },
  { id: 'carry', title: 'Choose what comes with you', text: 'Carry slots above the shelves decide which weapons you take into the field. Your sidearm travels with you; an extra main slot needs its unlock. Owned gear outside your slots adds no carried weight.' },
  { id: 'compare', title: 'Preview, compare, then equip', text: 'Open Weapons. Select a card to inspect its model and dossier. Stat changes compare it with your equipped weapon. Unlock buys it; Equip puts an owned item into your loadout. A weapon variant is a complete fixed build.', category: 'weapon' },
  { id: 'supplies', title: 'Pack supplies for the field', text: 'Open Utilities. Food and utilities are bought one at a time and spent when used. The held count tells you what you have. In play, use the belt buttons or keys 4–9; G repeats the selected slot.', category: 'utility' },
  { id: 'deploy', title: 'Pick your next stop', text: 'The buttons at the bottom send your equipped loadout to Training or Open World. Training is a good place to practise before exploring. You can return to this tour from the Store header.' },
] as const;
export default function StoreTutorial({ category, onComplete, onExit }: { category: Category; onComplete: () => void; onExit: () => void }) {
  const [step, setStep] = useState(0);
  const guide = useRef<HTMLElement>(null);
  const stop = STOPS[step], ready = !('category' in stop) || category === stop.category;
  useEffect(() => {
    const root = guide.current?.closest('.armory');
    const selectors = { wallet: '.armory-header', categories: '.armory-navigation', carry: '.armory-carry', compare: ready ? '.armory-details' : '.armory-navigation', supplies: '.armory-navigation', deploy: '.armory-deploy' };
    const target = root?.querySelector<HTMLElement>(selectors[stop.id]);
    if (!target || !guide.current) return;
    const top = target.getBoundingClientRect().top + window.scrollY - guide.current.offsetHeight - 16;
    window.scrollTo({ top: Math.max(0, top), behavior: 'instant' });
  }, [stop.id, ready]);
  return <section ref={guide} className="store-tour" data-step={stop.id} aria-label="Store tour">
    <div className="store-tour-copy" aria-live="polite"><span className="tutorial-eyebrow">STORE ORIENTATION · {step + 1} / {STOPS.length}</span><h2>{stop.title}</h2><p>{stop.text}</p></div>
    <div className="store-tour-actions"><button aria-label="Previous tour stop" disabled={step === 0} onClick={() => setStep(n => n - 1)}><ArrowLeft size={16} /></button><button disabled={!ready} onClick={() => step === STOPS.length - 1 ? onComplete() : setStep(n => n + 1)}>{step === STOPS.length - 1 ? <><Check size={15} /> Finish tour</> : ready ? <>Next <ArrowRight size={15} /></> : `Open ${stop.id === 'categories' ? 'Armor' : stop.id === 'compare' ? 'Weapons' : 'Utilities'} to continue`}</button><button aria-label="Close store tour" onClick={onExit}><X size={16} /></button></div>
  </section>;
}
