import { isStreamerRoute, routeFromPath, ROUTE_PATHS } from './routes';
import { actionKinds, type MenuAction, type MenuScreen } from '../game/streamer-contract';
import { waitFor } from '../game/streamer-menu';
import { reducedMotion } from './route-transition';

const compact = (s: string | null | undefined, max: number) => (s ?? '').replace(/\s+/g,' ').trim().slice(0,max);
function visible(el: Element) {
  if (el.closest('[hidden],[inert],[aria-hidden="true"]')) return false;
  for (let node: Element | null = el; node; node = node.parentElement) {
    if (node.matches('details:not([open])') && node !== el && !Array.from(node.children).find(child => child.tagName === 'SUMMARY')?.contains(el)) return false;
    const style = node.ownerDocument.defaultView?.getComputedStyle(node);
    if (style?.display === 'none' || style?.visibility === 'hidden') return false;
  }
  return true;
}

function declared(doc: Document) {
  const scope = doc.querySelector('[data-ai-solo]');
  if (!scope || scope.querySelector("[data-ai-loading]") || doc.documentElement.hasAttribute('data-route-shift')) return null;
  const modal = Array.from(doc.querySelectorAll('[aria-modal="true"],dialog[open]')).filter(visible).at(-1)
    ?? Array.from(doc.querySelectorAll('[role="dialog"]')).filter(visible).at(-1);
  if (modal && (!scope.contains(modal) || !modal.matches('[data-ai-screen]'))) throw new Error('A dialog needs player input.');
  const root = modal ?? Array.from(scope.querySelectorAll('[data-ai-screen]')).filter(visible).at(-1);
  if (!root) return null;
  const controls = new Map<string,HTMLElement>();
  const actions: MenuAction[] = [];
  for (const el of Array.from(root.querySelectorAll<HTMLElement>('button[data-ai-action],a[data-ai-action],summary[data-ai-action]'))) {
    if (el.closest('[data-ai-screen]') !== root || !visible(el)) continue;
    if (el.matches('a')) {
      const dest = new URL((el as HTMLAnchorElement).href,doc.location.href);
      const route = routeFromPath(dest.pathname);
      if (el.getAttribute('target') || dest.origin !== doc.location.origin || dest.search || dest.hash ||
        ROUTE_PATHS[route] !== dest.pathname || !isStreamerRoute(route)) continue;
    }
    const id = el.getAttribute('data-ai-action')!, kind = el.getAttribute('data-ai-kind') as MenuAction['kind'];
    if (!actionKinds.includes(kind)) continue;
    if (controls.has(id)) throw new Error('Ambiguous streamer control on this screen.');
    const labelledBy = el.getAttribute('aria-labelledby')?.split(/\s+/).map(ref => doc.getElementById(ref)?.textContent).join(' ');
    const label = compact(labelledBy || el.getAttribute('aria-label') || el.innerText || el.textContent || el.title,120);
    if (!label) continue;
    const state = el.matches(':disabled,[aria-disabled="true"]') ? 'disabled'
      : el.matches('[aria-pressed="true"],[aria-selected="true"],[aria-current="true"]') ? 'selected' : undefined;
    controls.set(id,el);
    actions.push({id,label,kind,state,detail:compact(el.getAttribute('data-ai-detail'),160) || undefined});

  }
  // Keep exits, deployment and purchase confirmations reachable on a full locker shelf.
  const bounded = actions.length > 40
    ? [...actions.filter(a => a.kind !== 'select'), ...actions.filter(a => a.kind === 'select')].slice(0,40)
    : actions;
  const screen: MenuScreen = {screenId:root.getAttribute('data-ai-screen')!, title:compact(root.getAttribute('data-ai-title') || root.getAttribute('aria-label'),120),actions:bounded};
  return {screen,controls,root};
}

export function readStreamerScreen(doc: Document) { return declared(doc)?.screen ?? null; }

export async function clickStreamerAction(doc: Document, screen: MenuScreen, id: string, signal: AbortSignal,
  point: (x:number,y:number) => void, onClick: () => void) {
  const resolve = () => {
    signal.throwIfAborted();
    const view = declared(doc), control = view?.controls.get(id);
    const choice = view?.screen.actions.find(a => a.id === id);
    if (!control || !choice || view?.screen.screenId !== screen.screenId || choice?.state === 'disabled' ||
      JSON.stringify(choice) !== JSON.stringify(screen.actions.find(a => a.id === id))) throw new Error('The chosen control changed before it could be pressed.');
    return control;
  };
  const control = resolve();
  control.scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'});
  const box = control.getBoundingClientRect(), x = box.left+box.width/2, y = box.top+box.height/2;
  point(x,y);
  if (!reducedMotion()) await waitFor(500,signal);
  if (resolve() !== control) throw new Error('The menu changed while the cursor was moving.');
  const hit = doc.elementFromPoint(x,y);
  if (!box.width || !box.height || !hit || !control.contains(hit)) throw new Error('The selected control is covered.');
  onClick();
  control.click();
}
