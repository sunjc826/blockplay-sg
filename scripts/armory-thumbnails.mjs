// Start Vite and isolated Chrome first. Example:
// FPS_APP_ORIGIN=http://127.0.0.1:5193 FPS_CHROME_ORIGIN=http://127.0.0.1:9343 node scripts/armory-thumbnails.mjs
// Photographs existing game models locally; no generated art or paid requests.
import fs from 'node:fs/promises';
const origin = process.env.FPS_APP_ORIGIN || 'http://127.0.0.1:5175';
const chrome = process.env.FPS_CHROME_ORIGIN || 'http://127.0.0.1:9224';
const output = new URL('../public/images/armory/', import.meta.url);
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
  const files = await evaluate(`(async()=>{window.studioModule=await import('/scripts/armory-thumbnail-studio.ts');window.studio=studioModule.createStudio();return studioModule.shots.map(s=>s.file)})()`);
  for (const [index, file] of files.entries()) {
    const data = await evaluate(`studio.render(${index})`);
    await fs.writeFile(new URL(file, output), Buffer.from(data, 'base64'));
    console.log(`${index + 1}/${files.length} ${file}`);
  }
  console.log(`Saved ${files.length} model previews.`);
} finally {
  await evaluate('window.studio?.dispose()').catch(() => {});
  ws.close(); await fetch(`${chrome}/json/close/${tab.id}`);
}
