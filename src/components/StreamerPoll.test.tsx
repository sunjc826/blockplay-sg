import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { StreamerPoll, pollPosition } from './StreamerPoll';

it('labels the simulated poll, shows shares in rank order and marks each possible decision',() => {
  const rows = [{id:'district-tuas',share:61},{id:'district-changi',share:39}];
  for (const [chosen,verdict] of [['district-tuas','Went with chat'],['district-changi','Overruled chat'],['district-punggol','Ignored the poll']]) {
    const html = renderToStaticMarkup(<StreamerPoll card={{screenId:'world-districts',rows,chosen}} target={null}/>);
    expect(html).toContain('aria-live="polite"'); expect(html).toContain('simulated'); expect(html).toContain(verdict);
    expect(html.indexOf('Tuas')).toBeLessThan(html.indexOf('Changi'));
    expect(html).toContain('61%'); expect(html.includes('data-chosen="true"')).toBe(chosen !== 'district-punggol');
  }
});
it('keeps the card clear of the target and caption in desktop, fullscreen dock and landscape phone layouts',() => {
  for (const [w,h,chipY] of [[1440,900,5],[1920,1080,0],[812,375,5]]) {
    const chip = {left:w/2-88,right:w/2+88,top:chipY,bottom:chipY+38};
    const avoid = [{left:w*.12,right:w*.88,top:45,bottom:99},{left:w/2+90,right:w-8,top:0,bottom:65}];
    const pos = pollPosition(w,h,192,113,chip,avoid)!;
    expect(pos).toBeTruthy();
    expect(pos.x+192).toBeLessThanOrEqual(w); expect(pos.y+113).toBeLessThanOrEqual(h);
    for (const r of [chip,...avoid]) expect(pos.x+192 <= r.left || pos.x >= r.right || pos.y+113 <= r.top || pos.y >= r.bottom).toBe(true);
  }
});
