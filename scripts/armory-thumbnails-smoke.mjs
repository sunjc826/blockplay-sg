// Start Vite and isolated Chrome first. Example:
// FPS_APP_ORIGIN=http://127.0.0.1:5193 FPS_CHROME_ORIGIN=http://127.0.0.1:9343 node scripts/armory-thumbnails.mjs
// Photographs existing game models locally; no generated art or paid requests.
import fs from 'node:fs/promises';
const origin = process.env.FPS_APP_ORIGIN || 'http://127.0.0.1:5175';
const chrome = process.env.FPS_CHROME_ORIGIN || 'http://127.0.0.1:9224';
const output = new URL('../.cache/store-previews/', import.meta.url);
await fs.mkdir(output, { recursive: true });
const tab = await (await fetch(`${chrome}/json/new?${encodeURIComponent(origin)}`, { method: 'PUT' })).json();
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
let id = 0;
const pending = new Map();
ws.onmessage = event => {
  const message = JSON.parse(event.data), request = pending.get(message.id);
  if (!request) return;
  pending.delete(message.id); clearTimeout(request.timer);
  message.error ? request.reject(new Error(message.error.message)) : request.resolve(message.result);
};
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const n = ++id, timer = setTimeout(() => { pending.delete(n); reject(new Error(`Timeout: ${method}`)); }, 60000);
    pending.set(n, { resolve, reject, timer }); ws.send(JSON.stringify({ id: n, method, params }));
  });
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result.value;
}
try {
  const errors = [];
  ws.addEventListener('message', event => { const m=JSON.parse(event.data); if(m.method==='Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.text); });
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', {width:1440,height:1100,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate', {url:`${origin}/store`});
  async function wait(expression) {
    for(let i=0;i<150;i++) { if(await evaluate(expression)) return; await new Promise(r=>setTimeout(r,200)); }
    throw new Error(`Timeout waiting for ${expression}`);
  }
  async function checkCards(label) {
    await evaluate(`Promise.all([...document.querySelectorAll('.armory-item-preview')].map(i=>{i.loading='eager';return i.decode()}))`);
    const result = await evaluate(`({cards:document.querySelectorAll('.armory-item').length,images:[...document.querySelectorAll('.armory-item-preview')].filter(i=>i.complete&&i.naturalWidth===480).length,canvases:document.querySelectorAll('canvas').length,overflow:document.documentElement.scrollWidth>innerWidth+1})`);
    if(!result.cards || result.cards!==result.images || result.canvases!==1 || result.overflow) throw new Error(label+JSON.stringify(result));
    console.log(label, result);
  }
  await wait(`!!document.querySelector('.armory-item-preview')`);
  await wait(`!!document.querySelector('.armory-preview canvas')`);
  for(const category of ['weapon','skin','armor','vision','food','utility','vehicleSkin']) {
    await evaluate(`document.querySelector('#shop-tab-${category}').click()`);
    await checkCards(category);
    if(category==='weapon'||category==='skin'||category==='vehicleSkin') {
      const count=await evaluate(`document.querySelectorAll('.armory-family button').length`);
      for(let i=0;i<count;i++) {
        await evaluate(`document.querySelectorAll('.armory-family button')[${i}].click()`);
        await checkCards(category+' platform '+i);
      }
    }
    await evaluate(`document.querySelector('.armory-grid').scrollIntoView({block:'center'})`);
    const shot=await send('Page.captureScreenshot',{format:'png'});
    await fs.writeFile(new URL(category+'.png',output),Buffer.from(shot.data,'base64'));
  }
  await evaluate(`document.querySelector('#shop-tab-weapon').click();document.querySelectorAll('.armory-family button')[0].click()`);
  const wallet=await evaluate(`localStorage.getItem('blockplay.armory.v1')`);
  const selected=await evaluate(`(()=>{const card=document.querySelectorAll('.armory-item')[1];card.click();return card.dataset.item})()`);
  await wait(`document.querySelector('.armory-item.selected').dataset.item===${JSON.stringify(selected)}`);
  if(await evaluate(`localStorage.getItem('blockplay.armory.v1')`)!==wallet) throw new Error('Selecting a preview changed the wallet');
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await checkCards('mobile');
  await evaluate(`document.querySelector('.armory-grid').scrollIntoView({block:'start'})`);
  const shot=await send('Page.captureScreenshot',{format:'png'});
  await fs.writeFile(new URL('mobile.png',output),Buffer.from(shot.data,'base64'));
  if(errors.length) throw new Error(JSON.stringify(errors));
  console.log('PASS: all store categories and platforms load actual shots, one interactive canvas, selection, wallet unchanged, desktop/mobile layout, no runtime errors.');
} finally { ws.close(); await fetch(`${chrome}/json/close/${tab.id}`); }
