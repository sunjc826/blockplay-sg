// Vite + isolated Chrome. Real navigation and focus checks; no paid services.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin = process.env.FPS_APP_ORIGIN || 'http://127.0.0.1:5175';
const chrome = process.env.FPS_CHROME_ORIGIN || 'http://127.0.0.1:9224';
const output = new URL('../.cache/next-gen-menu/', import.meta.url); await fs.mkdir(output, { recursive: true });
const tab = await (await fetch(`${chrome}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(tab.webSocketDebuggerUrl); await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
let id = 0; const pending = new Map(), errors = [];
ws.onmessage = event => { const m = JSON.parse(event.data); if (m.id) { const p = pending.get(m.id); if (p) { pending.delete(m.id); clearTimeout(p.timer); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); } } if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text); };
function send(method, params = {}) { return new Promise((resolve, reject) => { const n = ++id; const timer = setTimeout(() => { pending.delete(n); reject(new Error(`CDP timeout: ${method}`)); }, 30000); pending.set(n, { resolve, reject, timer }); ws.send(JSON.stringify({ id: n, method, params })); }); }
async function evaluate(expression) { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; }
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function wait(expression, timeout = 30000) { const start = Date.now(); while (Date.now() - start < timeout) { if (await evaluate(expression)) return; await delay(100); } throw new Error(`Timed out: ${expression}`); }
async function click(selector, touch = false) { const p = await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing ${selector}');e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`); if (touch) { await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{...p,id:1}] }); await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); } else { await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...p, button: 'left', clickCount: 1 }); await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...p, button: 'left', clickCount: 1 }); } await delay(300); }
async function key(key, modifiers = 0) { await send('Input.dispatchKeyEvent', { type: 'keyDown', key, modifiers }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key, modifiers }); await delay(100); }
async function shot(name) { const r = await send('Page.captureScreenshot', { format: 'png' }); await fs.writeFile(new URL(`${name}.png`, output), Buffer.from(r.data, 'base64')); }
async function size(width, height, mobile = false) { await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile }); await send('Emulation.setTouchEmulationEnabled', { enabled: mobile, maxTouchPoints: 5 }); }
async function go(path, selector) { await send('Page.navigate', { url: origin + path }); await wait(`!!document.querySelector(${JSON.stringify(selector)})`); await delay(500); }
async function selectDesign(design) {
  await go('/settings', '.armory-settings');
  await click('#settings-tab-video');
  await click(`[data-menu-design="${design}"]`);
  assert.equal(await evaluate(`document.querySelector('[data-menu-design="${design}"]').getAttribute('aria-pressed')`), 'true');
}
async function home() {
  await go('/', '.game-menu');
  if (await evaluate(`!!document.querySelector('.game-title')`)) { await click('.game-title'); await delay(1100); }
}
async function fits() {
  assert(await evaluate(`document.documentElement.scrollWidth<=innerWidth+1`), 'No horizontal overflow');
  const overflow = await evaluate(`[...document.querySelectorAll('.activity-copy,.game-menu-copy')].map(e=>({text:e.textContent,scroll:e.scrollWidth,client:e.clientWidth})).filter(e=>e.scroll>e.client+1)`);
  assert.deepEqual(overflow, [], 'Card text fits (decorative art intentionally bleeds)');
}
async function overlaysFit() {
  assert(await evaluate(`(()=>{const r=document.querySelector('.next-gen-home-panels').getBoundingClientRect();return Math.abs(r.top)<1&&Math.abs(r.bottom-innerHeight)<1})()`), 'Panels reach both vertical viewport edges');
  assert(await evaluate(`!document.querySelector('.game-menu-hint')`), 'No keyboard hint on Next-gen home');
  const geometry = await evaluate(`(()=>{
    const controls=[...document.querySelectorAll('.next-gen-settings,.next-gen-install,.game-debug-link')];
    const visible=controls.every(e=>{const r=e.getBoundingClientRect();return r.width>=44&&r.height>=44&&r.left>=0&&r.top>=0&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1&&e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))});
    const footer=document.querySelector('.game-menu-foot').getBoundingClientRect();
    const level=document.querySelector('.game-rank-copy small').getBoundingClientRect();
    const labels=[...document.querySelectorAll('.game-menu-copy')].every(e=>{const r=e.getBoundingClientRect();return e.closest('a').contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))});
    return {visible,labels,level:level.width>0&&level.height>0&&level.top>=0&&level.bottom<90,bottomRight:footer.right>innerWidth-40&&footer.bottom>innerHeight-32};
  })()`);
  assert.deepEqual(geometry,{visible:true,labels:true,level:true,bottomRight:true});
  assert(await evaluate(`getComputedStyle(document.querySelector('.next-gen-home-panels')).display!=='grid' || (()=>{const labels=[...document.querySelectorAll('.next-gen-equipment strong')].map(e=>e.getBoundingClientRect());return Math.abs(labels[0].bottom-labels[1].bottom)<1})()`), 'Phone equipment labels align above the floating controls');
}
async function panoramaFits() {
  assert(await evaluate(`document.querySelectorAll('.next-gen-panorama').length===1 && !document.querySelector('.next-gen-main .next-gen-image')`), 'All home panes share one continuous artwork layer');
  assert(await evaluate(`[...document.querySelectorAll('.game-menu-item')].every(e=>getComputedStyle(e).backgroundColor==='rgba(0, 0, 0, 0)')`), 'All actions reveal the shared panorama');
  await evaluate(`(async()=>{const stacked=getComputedStyle(document.querySelector('.next-gen-home-panels')).display==='grid';const name=stacked?'operations-hub-portrait.jpg':'operations-hub.jpg';const background=getComputedStyle(document.querySelector('.next-gen-panorama')).backgroundImage;if(!background.includes(name))throw Error('Wrong panorama for layout');const image=new Image();image.src='/images/menu/'+name;await image.decode()})()`);
}
async function modeArtworkFits() {
  await modeLayoutFits();
  const expected = {
    '/play/single-player':'open-world', '/play/multiplayer':'find-room',
    '/play/training':'training', '/world':'open-world', '/multiplayer':'find-room',
    '/training':'training', '/tutorial':'tutorial',
    ...Object.fromEntries(['team-deathmatch','hardpoint','free-for-all'].flatMap(mode=>[
      [`/play/${mode}`,mode],[`/play/multiplayer/${mode}`,mode],
    ])),
  };
  const cards = await evaluate(`[...document.querySelectorAll('.activity-card')].map(e=>({route:e.getAttribute('href'),image:getComputedStyle(e.querySelector('.next-gen-image')).backgroundImage}))`);
  for (const card of cards) {
    assert(expected[card.route], `Known mode route: ${card.route}`);
    assert(card.image.includes(`/images/menu/mode-${expected[card.route]}.jpg`), `Mode-specific art: ${card.route}`);
  }
  assert.equal(new Set(cards.map(card=>card.image)).size,cards.length,'Every card on this selector has distinct artwork');
  await evaluate(`Promise.all([...document.querySelectorAll('.next-gen-image')].map(async e=>{const url=getComputedStyle(e).backgroundImage.match(/url\\(["']?(.*?)["']?\\)/)[1];const image=new Image();image.src=url;await image.decode();if(image.naturalWidth<768||image.naturalHeight<1024)throw Error('Mode artwork resolution too small')}))`);
}
async function modeLayoutFits() {
  const layout = await evaluate(`(()=>{
    const cards=[...document.querySelectorAll('.activity-card')].map(e=>e.getBoundingClientRect());
    const controls=[...document.querySelectorAll('.activity-navigation a')];
    return {
      fullHeight:cards.every(r=>Math.abs(r.top)<1&&Math.abs(r.bottom-innerHeight)<1),
      gaps:cards.slice(1).every((r,i)=>Math.abs(r.left-cards[i].right-(innerWidth<=900?8:12))<1),
      controls:controls.every(e=>{const r=e.getBoundingClientRect();return r.width>=44&&r.height>=44&&r.left>=0&&r.right<=innerWidth&&e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))}),
      noVerticalScroll:document.documentElement.scrollHeight<=innerHeight+1,
      noFooter:!document.querySelector('.next-gen-footer'),
    };
  })()`);
  assert.deepEqual(layout,{fullHeight:true,gaps:true,controls:true,noVerticalScroll:true,noFooter:true});
}
async function modeExpansionWorks() {
  await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:60,y:40});
  await evaluate('document.activeElement.blur()'); await delay(600);
  const before=await evaluate(`document.querySelector('.activity-card').getBoundingClientRect().width`);
  await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:before/2,y:200}); await delay(600);
  assert(await evaluate(`document.querySelector('.activity-card').getBoundingClientRect().width`)>before+20,'Mode hover expands the pane');
  await modeLayoutFits(); await shot('desktop-mode-hover');
  await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:60,y:40});
  await evaluate(`document.querySelector('.activity-card').focus()`); await key('End'); await delay(600);
  assert(await evaluate(`document.querySelector('.activity-card:last-child').getBoundingClientRect().width`)>before+20,'Keyboard focus expands mode panes');
  await evaluate('document.activeElement.blur()'); await delay(600);
}
async function equipmentRects() {
  return evaluate(`[...document.querySelectorAll('.next-gen-equipment > a')].map(e=>{const r=e.getBoundingClientRect();return {width:r.width,height:r.height,top:r.top,bottom:r.bottom}})`);
}
async function hoverEquipment(route) {
  const point = await evaluate(`(()=>{const r=document.querySelector('.game-menu-item[href="/${route}"]').getBoundingClientRect();return {x:r.right-60,y:r.top+r.height/2}})()`);
  await send('Input.dispatchMouseEvent', {type:'mouseMoved',...point}); await delay(900);
}
async function checkEquipmentExpansion() {
  await send('Input.dispatchMouseEvent', {type:'mouseMoved',x:20,y:20});
  await evaluate(`document.activeElement.blur()`); await delay(900);
  const before = await equipmentRects();
  for (const [index,route] of ['store','inventory'].entries()) {
    await hoverEquipment(route);
    const after = await equipmentRects();
    assert(after[index].width > before[index].width + 60, `${route} widens`);
    assert(after[index].height > before[index].height + 40, `${route} grows vertically`);
    assert(after[1-index].height < before[1-index].height - 40, 'Other equipment action yields height');
    assert(Math.abs(after[0].top) < 1 && Math.abs(after[1].bottom - await evaluate('innerHeight')) < 1, 'Equipment remains full height');
    assert(Math.abs(after[1].top-after[0].bottom-12)<1, 'Expansion keeps the gutter');
    await fits(); await overlaysFit(); await panoramaFits();
    await shot(`equipment-${route}-${await evaluate('innerWidth')}`);
  }
  await send('Input.dispatchMouseEvent', {type:'mouseMoved',x:20,y:20}); await delay(900);
  assert.deepEqual(await equipmentRects(),before,'Equipment returns to its resting split');
}
try {
  await send('Page.enable'); await send('Runtime.enable'); await size(1440,900);
  await send('Page.bringToFront'); await send('Emulation.setFocusEmulationEnabled', {enabled:true});
  await go('/settings', '.armory-settings');
  await evaluate(`localStorage.removeItem('blockplay-sg-menu-design-v1')`);
  await home();
  assert(await evaluate(`!!document.querySelector('.next-gen-main')`), 'Fresh preference defaults to Next-gen');
  await go('/settings', '.armory-settings');
  await click('#settings-tab-video');
  assert.equal(await evaluate(`document.querySelector('[data-menu-design="next-gen"]').getAttribute('aria-pressed')`), 'true');
  await selectDesign('classic'); await home();
  assert(await evaluate(`!document.querySelector('.next-gen-main')`));
  assert.deepEqual(await evaluate(`[...document.querySelectorAll('.game-menu-item')].map(a=>a.getAttribute('href'))`), ['/play','/inventory','/store','/settings']);
  await go('/play', '.activity-grid');
  assert(await evaluate(`!document.querySelector('.next-gen-panel')`));
  await selectDesign('next-gen'); await home();
  assert(await evaluate(`!!document.querySelector('.next-gen-main')`), 'Preference survives navigation/reload');
  assert.deepEqual(await evaluate(`[...document.querySelectorAll('.game-menu-item')].map(a=>a.getAttribute('href'))`), ['/play/single-player','/play/multiplayer','/store','/inventory']);
  assert(await evaluate(`!!document.querySelector('.game-menu-top a[aria-label="Settings"]') && !document.querySelector('.game-menu-item[href="/settings"]')`));
  await fits(); await overlaysFit(); await panoramaFits();
  const first = '.game-menu-item[href="/play/single-player"]';
  const gear = await evaluate(`(()=>{const r=document.querySelector('.next-gen-settings').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
  await send('Input.dispatchMouseEvent', {type:'mouseMoved',...gear}); await delay(800);
  await shot('desktop-home');
  const before = await evaluate(`document.querySelector('${first}').getBoundingClientRect().width`);
  const point = await evaluate(`(()=>{const r=document.querySelector('${first}').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
  await send('Input.dispatchMouseEvent', {type:'mouseMoved',...point}); await delay(800);
  const after = await evaluate(`document.querySelector('${first}').getBoundingClientRect().width`);
  assert(after > before + 20, `Hover expands a stripe: ${before} → ${after}`);
  await shot('desktop-home-hover');
  await checkEquipmentExpansion();
  await hoverEquipment('store');
  await panoramaFits();
  assert(await evaluate(`getComputedStyle(document.querySelector('.next-gen-panorama')).transform!=='none'`), 'Store hover animates the shared scene');
  await shot('desktop-store-hover');
  await evaluate(`document.querySelector('${first}').focus()`); await key('ArrowRight');
  assert.equal(await evaluate(`document.activeElement.getAttribute('href')`), '/play/multiplayer');
  await key('End'); assert.equal(await evaluate(`document.activeElement.getAttribute('href')`), '/inventory');
  await send('Input.dispatchMouseEvent', {type:'mouseMoved',...gear}); await delay(900);
  const focusedEquipment = await equipmentRects();
  assert(focusedEquipment[1].height > focusedEquipment[0].height + 100, 'Keyboard focus expands Inventory');
  await hoverEquipment('store');
  const hoveredEquipment = await equipmentRects();
  assert(hoveredEquipment[0].height > hoveredEquipment[1].height + 100, 'Store hover takes precedence over Inventory focus');
  await key('Home'); assert.equal(await evaluate(`document.activeElement.getAttribute('href')`), '/play/single-player');
  await key('Enter'); await wait(`location.pathname==='/play/single-player'`); await delay(600);
  await fits(); await modeArtworkFits(); await shot('desktop-single-player');
  await modeExpansionWorks();
  assert.equal(await evaluate(`document.querySelectorAll('.activity-card').length`), 5);
  assert.equal(await evaluate(`document.querySelector('.activity-navigation a').getAttribute('href')`), '/');
  await click('.activity-navigation a'); await wait(`location.pathname==='/' && !!document.querySelector('.next-gen-main')`);
  assert.equal(await evaluate(`document.activeElement.getAttribute('href')`), '/play/single-player');
  for (const [route,selector] of [['/store','.armory'],['/inventory','.armory'],['/settings','.armory-settings']]) {
    await click(route==='/settings' ? '.next-gen-settings' : `.game-menu-item[href="${route}"]`);
    await wait(`location.pathname===${JSON.stringify(route)} && !!document.querySelector(${JSON.stringify(selector)})`);
    await click('.game-back[href="/"]'); await wait(`location.pathname==='/' && !!document.querySelector('.next-gen-main')`);
    assert.equal(await evaluate(`document.activeElement.getAttribute('href')`), route);
  }
  await click('.game-menu-item[href="/play/multiplayer"]'); await wait(`location.pathname==='/play/multiplayer'`);
  assert.equal(await evaluate(`document.querySelector('.activity-navigation a').getAttribute('href')`), '/');
  await click('.activity-navigation a'); await wait(`location.pathname==='/'`);
  await click('.game-menu-item[href="/play/single-player"]'); await wait(`location.pathname==='/play/single-player'`);
  await click('.activity-card[href="/play/training"]'); await wait(`location.pathname==='/play/training'`);
  assert.deepEqual(await evaluate(`[...document.querySelectorAll('.activity-card')].map(a=>a.getAttribute('href'))`), ['/training','/tutorial']);
  await modeArtworkFits(); await shot('desktop-training');
  await click('.activity-navigation a'); await wait(`location.pathname==='/play/single-player'`);
  await click('.activity-card[href="/play/hardpoint"]'); await wait(`!!document.querySelector('.play-loading,.fps-game')`);
  await go('/play/multiplayer', '.next-gen-panels');
  assert.deepEqual(await evaluate(`[...document.querySelectorAll('.activity-card')].map(a=>a.getAttribute('href'))`), ['/multiplayer','/play/multiplayer/team-deathmatch','/play/multiplayer/hardpoint','/play/multiplayer/free-for-all']);
  await modeArtworkFits(); await shot('desktop-multiplayer');
  await click('.activity-card[href="/play/multiplayer/team-deathmatch"]'); await wait(`!!document.querySelector('.starting-picker')`);
  await send('Emulation.setEmulatedMedia', {features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  await home();
  await send('Input.dispatchMouseEvent', {type:'mouseMoved',x:20,y:20});
  await evaluate(`document.activeElement.blur()`);
  const reducedBefore = await equipmentRects();
  await evaluate(`document.querySelector('.game-menu-item[href="/inventory"]').focus()`);
  await hoverEquipment('store');
  assert.deepEqual(await equipmentRects(), reducedBefore, 'Reduced motion keeps equipment dimensions steady');
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('.next-gen-panorama')).transform`), 'none');
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('.next-gen-panorama')).transitionDuration`), '0s');
  await go('/play', '.next-gen-panel');
  await modeArtworkFits();
  const reducedModeWidth=await evaluate(`document.querySelector('.activity-card').getBoundingClientRect().width`);
  await evaluate(`document.querySelector('.activity-card').focus()`); await key('Home');
  assert.equal(await evaluate(`document.querySelector('.activity-card').getBoundingClientRect().width`),reducedModeWidth,'Reduced motion suppresses mode expansion');
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('.next-gen-image')).transitionDuration`), '0s');
  await send('Emulation.setEmulatedMedia', {features:[]});
  for (const [width,height,mobile] of [[320,568,true],[390,844,true],[768,1024,true],[844,390,true],[1024,768,false]]) {
    await size(width,height,mobile); await home(); await fits(); await overlaysFit(); await panoramaFits();
    assert(await evaluate(`[...document.querySelectorAll('.game-menu-item')].every(e=>{const r=e.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight+1})`), `${width}: home actions fit viewport`);
    await shot(`home-${width}`);
    if (!mobile) await checkEquipmentExpansion();
    assert(await evaluate(`(()=>{const r=document.querySelector('.next-gen-settings').getBoundingClientRect();return r.width>=44&&r.height>=44&&r.right<=innerWidth&&r.bottom<=innerHeight})()`), 'Settings remains a reachable touch target');
    await click('.game-menu-item[href="/play/single-player"]',mobile); await wait(`location.pathname==='/play/single-player'`);
    await fits(); await modeArtworkFits(); await shot(`solo-${width}`);
    if(width===390) {
      await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:280,y:250,id:1}]});
      for(const x of [240,200,160,120,80,40]) { await send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:250,id:1}]}); await delay(30); }
      await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]}); await delay(600);
      assert(await evaluate(`document.querySelector('.next-gen-panels').scrollLeft>100`),'Touch swipe reveals the next full-height mode');
      await evaluate(`document.querySelector('.activity-card').focus()`); await key('End'); await delay(600);
      assert(await evaluate(`(()=>{const e=document.activeElement,r=e.getBoundingClientRect();return e.matches('.activity-card:last-child')&&r.left>=-1&&r.right<=innerWidth+1})()`),'Keyboard navigation reveals offscreen mode cards');
    }
    await evaluate(`document.querySelector('.activity-card:last-child').scrollIntoView({block:'end'})`);
    await shot(`solo-last-${width}`);
    await click('.activity-card[href="/play/free-for-all"]',mobile); await wait(`!!document.querySelector('.play-loading,.fps-game')`);
    await go('/play/multiplayer', '.next-gen-panels'); await fits(); await modeArtworkFits(); await shot(`multiplayer-${width}`);
  }
  // Simulate Safari's manual install capability without invoking a native install prompt.
  const manual = await send('Page.addScriptToEvaluateOnNewDocument', {source:`Object.defineProperty(navigator,'standalone',{value:false,configurable:true});window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();e.stopImmediatePropagation()})`});
  for (const [width,height] of [[320,568],[844,390]]) {
    await size(width,height,true); await home();
    await click('.next-gen-install[aria-expanded]',true); await wait(`!!document.querySelector('.game-install-card')`);
    assert(await evaluate(`document.querySelector('.next-gen-home-panels').getBoundingClientRect().height===innerHeight`), 'Install help overlays rather than shrinking the panels');
    await click('.game-install-go',true);
    assert(await evaluate(`document.querySelector('.game-install-copy').textContent.includes('Add to Home Screen')`));
    await fits();
    assert(await evaluate(`[...document.querySelectorAll('.game-menu-item,.game-install-card')].every(e=>{const r=e.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight+1})`), 'Install help and all menu actions fit');
    await shot(`install-help-${width}`);
    await click('.game-install-hide',true); await wait(`!document.querySelector('.game-install-card')`);
    assert.equal(await evaluate(`document.activeElement.classList.contains('next-gen-install')`), true);
  }
  await send('Page.removeScriptToEvaluateOnNewDocument', {identifier:manual.identifier});
  await selectDesign('classic'); await home();
  assert(await evaluate(`!document.querySelector('.next-gen-main')`), 'Classic can be restored');
  await go('/play/single-player', '.activity-grid');
  assert(await evaluate(`!document.querySelector('.next-gen-panel') && document.querySelectorAll('.activity-card').length===5`));
  assert.equal(await evaluate(`document.querySelector('.activity-navigation a').getAttribute('href')`), '/play');
  assert.deepEqual(errors, []);
  console.log('PASS: both designs, persisted switch, hover expansion, keyboard navigation, solo/host routes, reduced motion and responsive touch layouts.');
} catch (error) { console.error(error); await shot('failure').catch(()=>{}); process.exitCode=1; }
finally { ws.close(); await fetch(`${chrome}/json/close/${tab.id}`); }
