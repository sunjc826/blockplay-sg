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
it('opens real numbered buttons, then locks the final shares and labels the viewer and verdict',() => {
  const card = {screenId:'world-districts',rows:[{id:'district-tuas',share:57},{id:'district-changi',share:43}]};
  const open = renderToStaticMarkup(<StreamerPoll card={{...card,voting:{seconds:4,vote:()=>true}}} target={null}/>);
  expect(open.match(/<button /g)).toHaveLength(2);
  expect(open).toContain('data-streamer-controls'); expect(open).toContain('4s');
  expect(open).not.toContain('disabled');
  for (const [chosen,result] of [['district-tuas','Went with your vote'],['district-changi','Overruled your vote'],['back','Overruled your vote']]) {
    const closed = renderToStaticMarkup(<StreamerPoll card={{...card,chosen,viewerVote:'district-tuas'}} target={null}/>);
    expect(closed.match(/disabled=""/g)).toHaveLength(2); expect(closed).toContain('Your vote');
    expect(closed).toContain(result); expect(closed).not.toContain('data-streamer-controls');
  }
});
it('keeps the card clear of the target and caption in desktop, fullscreen dock and landscape phone layouts',() => {
  for (const [w,h,chipY,cardWidth] of [[1440,900,5,216],[1920,1080,1040,216],[812,375,5,176],[667,320,5,176]]) {
    const chip = {left:w/2-88,right:w/2+88,top:chipY,bottom:chipY+38};
    const avoid = [{left:w*.12,right:w*.88,top:45,bottom:99},{left:w/2+90,right:w-8,top:0,bottom:65}];
    for (const cardHeight of [98,184]) {
      const pos = pollPosition(w,h,cardWidth,cardHeight,chip,avoid)!;
      expect(pos).toBeTruthy();
      expect(pos.x+cardWidth).toBeLessThanOrEqual(w); expect(pos.y+cardHeight).toBeLessThanOrEqual(h);
      for (const r of [chip,...avoid]) {
        expect(pos.x+cardWidth <= r.left || pos.x >= r.right || pos.y+cardHeight <= r.top || pos.y >= r.bottom).toBe(true);
      }
    }
  }
});
