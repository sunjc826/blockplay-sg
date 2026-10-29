// Start pnpm preview:cloudflare first. Runs real browser WebSockets through the
// local public-room relay, without WebGL/shader compilation or paid API calls.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'vite';

const output = new URL('../.cache/multiplayer-network-browser/', import.meta.url);
await mkdir(output, { recursive: true });
const fixture = new URL('fixture.html', output);
await writeFile(fixture, `<!doctype html><title>Multiplayer latency regression</title><pre>Loading</pre><script type="module">
import * as THREE from '/node_modules/.vite/deps/three.js';
import { createArenaRuntime } from '/src/game/arena-runtime.ts';
import { createPublicRoom, joinPublicRoom } from '/src/game/room-peer.ts';
import { createProfile, resolveLoadout } from '/src/game/armory-state.ts';
import { equipmentMovement } from '/src/game/fps-encumbrance.ts';
import { createMovementMotion, advanceGroundMotion } from '/src/game/fps-movement.ts';
import { moveInMarina } from '/src/game/marina-collision.ts';
window.audit = async () => {
  const original = WebSocket.prototype.send; let acknowledgedSnapshots = 0, fullStates = 0;
  WebSocket.prototype.send = function(data) {
    let packet; try { packet = JSON.parse(data); } catch {}
    if (packet?.kind === 'data') {
      if (packet.payload?.type === 'arena-state') {
        fullStates++;
        if (Object.keys(packet.payload.acknowledgedInputs || {}).length) acknowledgedSnapshots++;
      }
      const socket = this;
      setTimeout(() => { if (socket.readyState === WebSocket.OPEN) original.call(socket, data); }, 200);
      return;
    }
    return original.call(this, data);
  };
  let host, guest, hostSession, guestSession, timer;
  try {
    const room = await createPublicRoom('Latency host', 'Local latency regression'); hostSession = room.session;
    guestSession = await joinPublicRoom('Latency guest', room.roomCode);
    const environment = { bounds: { minX:-400, maxX:400, minZ:-400, maxZ:400 }, move:moveInMarina, spawns:[{x:0,z:0},{x:0,z:50}], endless:true };
    host = createArenaRuntime({scene:new THREE.Scene(), obstacles:[], botCount:0, session:hostSession, environment});
    guest = createArenaRuntime({scene:new THREE.Scene(), obstacles:[], botCount:0, session:guestSession, environment});
    const input = (x,z) => ({x,y:1.75,z,yaw:0,pitch:0,weapon:0,playing:true});
    const body = createMovementMotion(), mobility = equipmentMovement(resolveLoadout(createProfile()),0).movement;
    let x=0,z=50,initialZ=null,corrections=0,joined=false,frames=0,movingSince=0,nextShot=0;
    let previous=performance.now(); const begin=previous;
    const result = await new Promise((resolve,reject) => {
      timer=setInterval(() => {
        try {
          const now=performance.now(),dt=Math.min(.05,(now-previous)/1000); previous=now;
          host.update(dt,input(0,0)); const frame=guest.update(dt,input(x,z)); frames++;
          if(frame.spawn && frame.self){x=frame.self.x;z=frame.self.z;joined=true;}
          if(frame.correction){corrections++;x=frame.correction.x;z=frame.correction.z;}
          if(joined && now-begin>=2000){
            if(initialZ===null){initialZ=z;movingSince=now;nextShot=now;}
            if(now>=nextShot){guest.shoot(input(x,z),{x:0,y:1,z:0},0);nextShot=now+150;}
            z+=advanceGroundMotion(body,0,-7*mobility,true,mobility,'stand',false,dt).z;
            if(now-movingSince>=10000)resolve({addedRttMs:400,corrections,distance:initialZ-z,frames,fullStates,acknowledgedSnapshots});
          }
          if(now-begin>20000)reject(Error('Guest did not join and complete the sprint'));
        } catch(error){reject(error);}
      },10);
    });
    document.querySelector('pre').textContent=JSON.stringify(result,null,2); return result;
  } finally {
    clearInterval(timer); host?.dispose(); guest?.dispose(); guestSession?.close(); hostSession?.close(); WebSocket.prototype.send=original;
  }
};
document.querySelector('pre').textContent='Ready';
</script>`);

const profile = await mkdtemp(join(tmpdir(), 'blockplay-latency-browser-'));
const server = await createServer({ logLevel: 'error', server: { host: '127.0.0.1', port: 0 } });
let browser, socket;
try {
  await server.listen();
  browser = spawn(process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
    '--headless=new', '--no-first-run', '--no-default-browser-check', '--no-proxy-server',
    '--disable-background-networking', '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows', '--remote-debugging-port=0', '--user-data-dir='+profile, 'about:blank',
  ], { stdio: 'ignore' });
  let port;
  for (let i=0;i<200;i++) {
    try { port=Number((await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]); break; }
    catch { await new Promise(resolve=>setTimeout(resolve,100)); }
  }
  assert(port,'Chrome debugging port available');
  const url='http://127.0.0.1:'+server.httpServer.address().port+'/@fs'+decodeURIComponent(fixture.pathname);
  const tab=await(await fetch('http://127.0.0.1:'+port+'/json/new?'+encodeURIComponent(url),{method:'PUT'})).json();
  socket=new WebSocket(tab.webSocketDebuggerUrl); await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
  let id=0; const pending=new Map();
  socket.onmessage=event=>{const m=JSON.parse(event.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);if(p){clearTimeout(p.timer);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}}};
  const evaluate=expression=>new Promise((resolve,reject)=>{
    const n=++id,timer=setTimeout(()=>{pending.delete(n);reject(Error('Browser evaluation timed out'));},30000);
    pending.set(n,{timer,resolve:result=>result.exceptionDetails?reject(Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text)):resolve(result.result.value),reject});
    socket.send(JSON.stringify({id:n,method:'Runtime.evaluate',params:{expression,awaitPromise:true,returnByValue:true}}));
  });
  for(let i=0;;i++){if(await evaluate('typeof window.audit === "function"'))break;assert(i<100,'Fixture loaded');await new Promise(resolve=>setTimeout(resolve,100));}
  const result=await evaluate('window.audit()');
  await writeFile(new URL('result.json',output),JSON.stringify(result,null,2)+'\n');
  assert.equal(result.corrections,0,'Delayed acknowledgements never rewind valid movement');
  assert(result.distance>55,'Guest preserves sustained sprint progress');
  assert(result.acknowledgedSnapshots>30,'Real relay delivered sequenced-input acknowledgements');
  console.log('PASS real browser public-room relay, 400 ms added gameplay RTT, guest sprint while firing:',JSON.stringify(result));
} finally {
  socket?.close();
  if(browser){browser.kill('SIGTERM');await new Promise(resolve=>{const timer=setTimeout(()=>{browser.kill('SIGKILL');resolve();},5000);browser.once('exit',()=>{clearTimeout(timer);resolve();});});}
  await server.close(); await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});
}
