import { useLayoutEffect, useRef } from 'react';
import { destinationLabel, pollVerdict, type PollRow } from '../game/streamer-variety';

export interface PollCard {screenId:string; rows:PollRow[]; chosen?:string; until?:number}
interface Box {left:number;right:number;top:number;bottom:number}

/** Prefer the space beside the chip. On short screens also try below the caption or along the bottom edge. */
export function pollPosition(width:number,height:number,w:number,h:number,chip:Box,avoid:Box[]) {
  const gap = 6;
  const xs = [chip.right+gap,chip.left-w-gap,...avoid.flatMap(r => [r.right+gap,r.left-w-gap]),width-w-gap,gap];
  const ys = [chip.top,chip.bottom+gap,gap,...avoid.flatMap(r => [r.bottom+gap,r.top-h-gap]),height-h-gap];
  for (const top of ys) for (const left of xs) {
    const x = Math.max(gap,Math.min(left,width-w-gap)), y = Math.max(gap,Math.min(top,height-h-gap));
    if ([chip,...avoid].every(r => x+w <= r.left || x >= r.right || y+h <= r.top || y >= r.bottom)) return {x,y};
  }
  return null;
}

export function StreamerPoll({card,target}:{card:PollCard;target:HTMLElement|null}) {
  const ref = useRef<HTMLElement>(null);
  // Rebind when a parent commit replaces the caption, click target or fullscreen dock.
  useLayoutEffect(() => {
    const el = ref.current!;
    const chip = document.querySelector('.streamer-chip');
    if (!chip) return;
    const obstacles = [...document.querySelectorAll('.cast-caption,.streamer-usage>div')];
    if (target?.isConnected) obstacles.push(target);
    const position = () => {
      const avoid = obstacles.map(node => node.getBoundingClientRect()).filter(r => r.width && r.height);
      const box = el.getBoundingClientRect();
      const point = pollPosition(innerWidth,innerHeight,box.width,box.height,chip.getBoundingClientRect(),avoid);
      el.style.visibility = point ? 'visible' : 'hidden';
      if (point) { el.style.left = point.x+'px'; el.style.top = point.y+'px'; }
    };
    position();
    const observer = new ResizeObserver(position);
    for (const node of [el,chip,...obstacles]) observer.observe(node);
    window.addEventListener('scroll',position,true);
    window.addEventListener('resize',position);
    return () => {
      observer.disconnect();
      window.removeEventListener('scroll',position,true);
      window.removeEventListener('resize',position);
    };
  });
  return <aside ref={ref} className="streamer-poll" aria-label="Chat poll · simulated" aria-live="polite" aria-atomic="true">
    <strong>Chat poll <small>· simulated</small></strong>
    {card.rows.map(({id,share}) => <div key={id} className="streamer-poll-row" data-chosen={card.chosen === id || undefined}>
      <i aria-hidden="true" style={{width:share+'%'}}/><span>{destinationLabel(card.screenId,id)}</span><b>{share}%</b>
    </div>)}
    {card.chosen && <strong className="streamer-poll-result">{pollVerdict(card.rows,card.chosen)}</strong>}
  </aside>;
}
