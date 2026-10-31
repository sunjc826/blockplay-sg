import { useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ArrowRight, Check, MousePointer2, X } from 'lucide-react';
import type { SHOP_CATEGORIES } from '../game/armory-state';
import { placeStoreTour, type TourRect } from './store-tour-layout';
import './tutorial.css';

type Category = typeof SHOP_CATEGORIES[number]['id'];
const STOPS = [
  { id: 'wallet', title: 'Know your buying power', text: 'Earn credits (CR) through eliminations and training. Tokens (TK) are a separate currency. Reaching an item’s level opens its purchase — you still pay its price.', hint: 'Your credits and tokens are always shown here.' },
  { id: 'categories', title: 'Find your equipment', text: 'Each tab opens a different shelf. Armor holds carrying rigs and protective inserts.', hint: 'Click or tap the Armor tab.', category: 'armor', tab: 'Armor' },
  { id: 'carry', title: 'Choose what comes with you', text: 'These slots decide which weapons deploy with you. Your sidearm comes along; an extra main slot needs a permanent unlock. Gear left in your locker adds no carried weight.', hint: 'Review your deployment loadout. No purchase needed.' },
  { id: 'compare', title: 'Inspect before you equip', text: 'Select an equipment card to see its model and dossier. Stat changes compare it with your equipped weapon. Each variant is a complete, fixed build.', hint: 'Click or tap the highlighted weapon card.', category: 'weapon', tab: 'Weapons' },
  { id: 'supplies', title: 'Pack for the field', text: 'Food and utilities are bought one at a time and spent when used. The held count shows your stock. In play, use belt buttons or keys 4–9; G repeats the selected slot.', hint: 'Click or tap the Utilities tab.', category: 'utility', tab: 'Utilities' },
  { id: 'deploy', title: 'Ready when you are', text: 'Training is a good place to try your loadout before exploring Open World. Finish the tour to choose your destination. You can replay it from the Store header.', hint: 'Your equipped loadout travels with you.' },
] as const;

export default function StoreTutorial({ category, rootRef, onComplete, onExit }: { category: Category; rootRef: RefObject<HTMLElement | null>; onComplete: () => void; onExit: () => void }) {
  const [step, setStep] = useState(0);
  const [inspected, setInspected] = useState(false);
  const [layout, setLayout] = useState<ReturnType<typeof placeStoreTour> & { target: TourRect; width: number; height: number }>();
  const guide = useRef<HTMLElement>(null);
  const callbacks = useRef({ onExit });
  callbacks.current = { onExit };
  const stop = STOPS[step], ready = !('category' in stop) || category === stop.category;
  const canContinue = ready && (stop.id !== 'compare' || inspected);
  const hint = !ready && 'tab' in stop ? `Click or tap the ${stop.tab} tab.` : stop.id === 'categories' ? 'Armor shelf opened. Continue when ready.' : stop.id === 'supplies' ? 'Utilities shelf opened. No purchase needed.' : stop.id === 'compare' && inspected ? 'Unlock buys an item. Equip adds owned gear to your loadout. No purchase needed.' : stop.hint;

  useLayoutEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return () => { queueMicrotask(() => {
      const trigger = rootRef.current?.querySelector<HTMLElement>('.store-tour-trigger');
      (trigger ?? (previous?.isConnected ? previous : null))?.focus({ preventScroll: true });
    }); };
  }, [rootRef]);

  useLayoutEffect(() => {
    const root = rootRef.current, panel = guide.current;
    if (!root || !panel) return;
    const selectors = {
      wallet: '.armory-wallet',
      categories: '#shop-tab-armor',
      carry: '.armory-carry select[aria-label="Main weapon slot"]',
      compare: !ready ? '#shop-tab-weapon' : inspected ? '.armory-purchase' : '.armory-item',
      supplies: '#shop-tab-utility',
      deploy: '.armory-deploy',
    };
    const target = root.querySelector<HTMLElement>(selectors[stop.id]) ?? root.querySelector<HTMLElement>('.armory-header');
    if (!target) return;
    target.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
    const initial = target.getBoundingClientRect();
    // A centered target can leave two gaps that are both too short for the card.
    // Move it toward the top when a vertical stack fits in the viewport.
    if (initial.height + panel.offsetHeight + 54 <= window.innerHeight && initial.top < panel.offsetHeight + 30 && window.innerHeight - initial.bottom < panel.offsetHeight + 30) {
      window.scrollBy({ top: initial.top - 18, behavior: 'instant' });
    }
    const update = () => {
      const view = window.visualViewport;
      const width = view?.width ?? window.innerWidth, height = view?.height ?? window.innerHeight;
      const rect = target.getBoundingClientRect();
      const box = { left: Math.max(4, Math.min(width - 4, rect.left - 6)), top: Math.max(4, Math.min(height - 4, rect.top - 6)), right: Math.max(4, Math.min(width - 4, rect.right + 6)), bottom: Math.max(4, Math.min(height - 4, rect.bottom + 6)) };
      setLayout({ ...placeStoreTour(box, { width: panel.offsetWidth, height: panel.offsetHeight }, { width, height }), target: box, width, height });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(target); observer.observe(panel); observer.observe(root);
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    window.visualViewport?.addEventListener('resize', update);
    const inspect = () => setInspected(true);
    if (stop.id === 'compare' && ready && !inspected) target.addEventListener('click', inspect);
    const description = target.getAttribute('aria-describedby');
    target.setAttribute('aria-describedby', `${description ? `${description} ` : ''}store-tour-hint`);
    // Keep keyboard navigation within the same controls that the spotlight exposes.
    const focusables = () => [...target.querySelectorAll<HTMLElement>('button, a[href], select, input, [tabindex="0"]'), ...(target.matches('button, a[href], select, input, [tabindex="0"]') ? [target] : []), ...panel.querySelectorAll<HTMLElement>('button')].filter(el => !el.matches(':disabled') && el.getClientRects().length > 0);
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); callbacks.current.onExit(); }
      if (event.key !== 'Tab') return;
      const controls = focusables();
      if (!controls.length) return;
      event.preventDefault();
      const current = controls.indexOf(document.activeElement as HTMLElement);
      const next = current < 0 ? (event.shiftKey ? controls.length - 1 : 0) : (current + (event.shiftKey ? -1 : 1) + controls.length) % controls.length;
      controls[next].focus({ preventScroll: true });
    };
    document.addEventListener('keydown', keydown, true);
    panel.focus({ preventScroll: true });
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', update); window.removeEventListener('scroll', update, true);
      window.visualViewport?.removeEventListener('resize', update);
      target.removeEventListener('click', inspect);
      if (description === null) target.removeAttribute('aria-describedby'); else target.setAttribute('aria-describedby', description);
      document.removeEventListener('keydown', keydown, true);
    };
  }, [stop.id, ready, inspected, rootRef]);

  const move = (direction: number) => { setInspected(false); setStep(n => n + direction); };
  return createPortal(<div className="store-tour-overlay">
    <svg className="store-tour-scrim" width="100%" height="100%" aria-hidden="true">
      <path fillRule="evenodd" d={layout ? `M0 0H${layout.width}V${layout.height}H0Z M${layout.target.left} ${layout.target.top}H${layout.target.right}V${layout.target.bottom}H${layout.target.left}Z` : 'M0 0H100000V100000H0Z'} />
    </svg>
    {layout && <div className="store-tour-spotlight" aria-hidden="true" style={{ left: layout.target.left, top: layout.target.top, width: Math.max(0, layout.target.right - layout.target.left), height: Math.max(0, layout.target.bottom - layout.target.top) }}><span /><span /><span /><span /></div>}
    <section ref={guide} className="store-tour" data-step={stop.id} data-placement={layout?.side} role="dialog" aria-label="Store tour" aria-labelledby="store-tour-title" aria-describedby="store-tour-text store-tour-hint" tabIndex={-1} style={{ left: layout?.left ?? 16, top: layout?.top ?? 16, maxHeight: layout?.maxHeight, visibility: layout ? 'visible' : 'hidden' }}>
      {layout && <span className="store-tour-pointer" aria-hidden="true" style={{ left: layout.arrowLeft, top: layout.arrowTop }} />}
      <div className="store-tour-heading"><span className="tutorial-eyebrow">FIELD GUIDE / STORE</span><button className="store-tour-close" aria-label="Close store tour" onClick={onExit}><X size={17} /></button></div>
      <div className="store-tour-progress" aria-label={`Step ${step + 1} of ${STOPS.length}`}>{STOPS.map((s, i) => <span key={s.id} data-state={i < step ? 'done' : i === step ? 'current' : 'upcoming'} />)}<b>{String(step + 1).padStart(2, '0')} / {String(STOPS.length).padStart(2, '0')}</b></div>
      <div className="store-tour-copy" aria-live="polite"><h2 id="store-tour-title">{stop.title}</h2><p id="store-tour-text">{stop.text}</p><div className="store-tour-hint" id="store-tour-hint">{canContinue ? <Check size={17} /> : <MousePointer2 size={17} />}<strong>{hint}</strong></div></div>
      <div className="store-tour-actions"><button aria-label="Previous tour stop" disabled={step === 0} onClick={() => move(-1)}><ArrowLeft size={16} /> Back</button><button className="store-tour-next" disabled={!canContinue} onClick={() => step === STOPS.length - 1 ? onComplete() : move(1)}>{step === STOPS.length - 1 ? <>Finish tour <Check size={15} /></> : <>Next <ArrowRight size={15} /></>}</button></div>
      <small className="store-tour-key">{canContinue ? 'Continue at your own pace' : 'Use the highlighted control to continue'}<span>Esc to close</span></small>
    </section>
  </div>, document.body);
}
