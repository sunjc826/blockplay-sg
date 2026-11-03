// Vite :5282, isolated Chrome remote debugging :9442. No remote asset/API calls.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin=process.env.DEPTH_APP_ORIGIN||'http://127.0.0.1:5282';
const chrome=process.env.DEPTH_CHROME_ORIGIN||'http://127.0.0.1:9442';
const output=new URL('../.cache/aerial-depth/',import.meta.url);await fs.mkdir(output,{recursive:true});
const tab=await(await fetch(`${chrome}/json/new?about:blank`,{method:'PUT'})).json();
const ws=new WebSocket(tab.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
let id=0;const pending=new Map(),errors=[];
ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);if(p){pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);};
function send(method,params={}){return new Promise((resolve,reject)=>{const n=++id,timer=setTimeout(()=>reject(Error('CDP timeout: '+method)),60000);pending.set(n,{resolve,reject,timer});ws.send(JSON.stringify({id:n,method,params}));});}
async function evaluate(expression){const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;}
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function wait(expression){for(let n=0;n<1200;n++){if(await evaluate(expression))return;await delay(100);}throw Error('Timed out: '+expression);}
async function screenshot(name){const s=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await fs.writeFile(new URL(name+'.png',output),Buffer.from(s.data,'base64'));}
const receipt={errors,views:[]};
try {
  await send('Runtime.enable');await send('Page.enable');await send('Network.enable');
  await send('Network.setBlockedURLs',{urls:['*api.openai.com/*','*api.elevenlabs.io/*','*/api/adventure/*','*maps.googleapis.com/*']});
  await send('Page.navigate',{url:origin+'/scripts/fixtures/aerial-depth.html'});await wait('window.ready===true');
  receipt.before=await evaluate('review.calibration(.08)');receipt.after=await evaluate('review.calibration()');
  assert(receipt.before.wrong>receipt.before.total*.5,'Baseline must reproduce lost surface ordering');
  assert.equal(receipt.after.wrong,0,'Aerial near plane must resolve the 5 mm layer');
  for(const [width,height] of [[1280,800],[390,844],[844,390]]) {
    await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<500});
    await send('Page.reload');await wait('window.ready===true');
    for(const region of ['queenstown','sentosa','changi','marina-bay']) {
      receipt.views.push({width,height,region,before:await evaluate(`review.render(${JSON.stringify(region)},.08)`)});
      await screenshot(`${region}-${width}-before`);
      receipt.views.at(-1).after=await evaluate(`review.render(${JSON.stringify(region)})`);
      assert(receipt.views.at(-1).after.near>10);
      await screenshot(`${region}-${width}-after`);
      receipt.views.at(-1).zoomed=await evaluate(`review.render(${JSON.stringify(region)},undefined,4)`);
      await screenshot(`${region}-${width}-zoomed`);
    }
  }
  assert.deepEqual(errors,[]);
  console.log(`PASS: 5 mm aerial layer: ${receipt.before.wrong}/${receipt.before.total} wrong pixels before; ${receipt.after.wrong} after. Four districts, three viewport shapes and 4x zoom; no browser exceptions.`);
} finally {
  await fs.writeFile(new URL('depth-verification.json',output),JSON.stringify(receipt,null,2));
  ws.close();await fetch(`${chrome}/json/close/${tab.id}`).catch(()=>{});
}
