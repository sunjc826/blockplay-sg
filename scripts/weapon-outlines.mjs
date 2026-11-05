// Start Vite and isolated Chrome first. Example:
// FPS_APP_ORIGIN=http://127.0.0.1:5193 FPS_CHROME_ORIGIN=http://127.0.0.1:9343 node scripts/weapon-outlines.mjs
// Traces the side profile of each gun's game model for the touch weapon switcher; no paid requests.
import fs from 'node:fs/promises';
const origin = process.env.FPS_APP_ORIGIN || 'http://127.0.0.1:5175';
const chrome = process.env.FPS_CHROME_ORIGIN || 'http://127.0.0.1:9224';
const output = new URL('../public/images/weapon-outlines/', import.meta.url);
await fs.mkdir(output, { recursive: true });
const tab = await (await fetch(`${chrome}/json/new?${encodeURIComponent(`${origin}/connection-check.html`)}`, { method: 'PUT' })).json();
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
  await send('Page.enable');
  await new Promise(resolve => setTimeout(resolve, 1000));
  const families = await evaluate(`(async()=>{window.studioModule=await import('/scripts/weapon-outline-studio.ts');window.studio=studioModule.createStudio();return studioModule.families})()`);
  for (const { family, id: weapon } of families) {
    const data = await evaluate(`studio.render(${family})`);
    await fs.writeFile(new URL(`${weapon}.webp`, output), Buffer.from(data, 'base64'));
    console.log(`${weapon}.webp`);
  }
  console.log(`Saved ${families.length} outlines.`);
} finally {
  await evaluate('window.studio?.dispose()').catch(() => {});
  ws.close(); await fetch(`${chrome}/json/close/${tab.id}`);
}
