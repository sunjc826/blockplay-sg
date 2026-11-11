// Private development client. Never logs or places the access key in command arguments.
// node --experimental-strip-types scripts/level-review-cloud.mjs init|pull|push|reply|link
import fs from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { register } from 'node:module';
register('./ts-extension-hook.mjs', import.meta.url);
const { parseReview, mergeReviews, emptyReview } = await import('../src/game/level-review.ts');
const root = new URL('../', import.meta.url);
const credentials = new URL('.env.level-review', root);
const [command] = process.argv.slice(2);
const flag = name => { const i = process.argv.indexOf(`--${name}`); return i < 0 ? undefined : process.argv[i + 1]; };
const origin = process.env.LEVEL_REVIEW_ORIGIN || 'https://blockplaysg.fun';
const endpoint = new URL((process.argv.includes('--assets') ? '/api/asset-review' : '/api/level-review') + (process.argv.includes('--verification') ? '/verification' : ''), origin);
async function token() {
  const value = process.env.LEVEL_REVIEW_TOKEN || (await fs.readFile(credentials, 'utf8')).match(/^LEVEL_REVIEW_TOKEN=([a-f0-9]{64})$/m)?.[1];
  if (!/^[a-f0-9]{64}$/.test(value || '')) throw new Error('Missing private access. Run init once, or provide LEVEL_REVIEW_TOKEN privately.');
  return value;
}
async function call(document) {
  const response = await fetch(endpoint, { method: document ? 'POST' : 'GET', signal: AbortSignal.timeout(20000), headers: { Authorization: `Bearer ${await token()}`, ...(document ? { 'Content-Type': 'application/json' } : {}) }, ...(document ? { body: JSON.stringify(document) } : {}) });
  const result = await response.json();
  if (!response.ok) throw new Error(`Cloud review ${response.status}: ${result.error || 'Request failed'}`);
  return { ...result, document: parseReview(JSON.stringify(result.document)) };
}
async function write(path, text) { await fs.mkdir(new URL('.cache/', root), { recursive: true }); await fs.writeFile(path, text, { mode: 0o600 }); }
try {
  if (command === 'init') {
    try { await fs.writeFile(credentials, `LEVEL_REVIEW_TOKEN=${randomBytes(32).toString('hex')}\n`, { flag: 'wx', mode: 0o600 }); console.log('Created private .env.level-review (ignored by Git).'); }
    catch (error) { if (error.code !== 'EEXIST') throw error; console.log('Reusing existing private access; no key rotation.'); }
  } else if (command === 'pull') {
    const result = await call(); const path = flag('out') || new URL('.cache/level-review-cloud.json', root);
    await write(path, JSON.stringify(result.document, null, 2)); console.log(`Fetched ${result.document.threads.length} threads at revision ${result.revision}.`);
  } else if (command === 'push') {
    if (!flag('file')) throw new Error('Use push --file review.json');
    const result = await call(parseReview(await fs.readFile(flag('file'), 'utf8'))); console.log(`Merged review at revision ${result.revision}.`);
  } else if (command === 'reply') {
    if (!flag('thread') || !flag('body-file')) throw new Error('Use reply --thread ID --body-file text.txt [--id unique-receipt-id]');
    const result = await call(), thread = result.document.threads.find(t => t.id === flag('thread'));
    if (!thread) throw new Error('Thread not found. Pull the current review first.');
    const body = (await fs.readFile(flag('body-file'), 'utf8')).trim();
    // Persist the exact request before sending. On an ambiguous network result, use
    // push --file with this receipt; generating a new reply would duplicate it.
    const eventId = flag('id') || crypto.randomUUID();
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(eventId)) throw new Error('Invalid reply receipt ID.');
    const receipt = new URL(`.cache/level-review-reply-${eventId}.json`, root);
    let document;
    try { document = parseReview(await fs.readFile(receipt, 'utf8')); const previous = document.threads.find(t => t.id === thread.id)?.events.find(e => e.id === eventId); if (!previous || previous.body !== body || previous.author !== 'ai') throw new Error('Receipt ID already belongs to a different reply. Use a new ID.'); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      document = mergeReviews(emptyReview(process.argv.includes('--assets') ? 'asset' : 'level'), { ...emptyReview(process.argv.includes('--assets') ? 'asset' : 'level'), threads: [{ ...thread, events: [...thread.events, { id: eventId, at: new Date().toISOString(), author: 'ai', body }] }] });
      await write(receipt, JSON.stringify(document, null, 2));
    }
    const next = await call(document); console.log(`AI reply saved at revision ${next.revision}. Receipt: .cache/level-review-reply-${eventId}.json`);
  } else if (command === 'link') {
    const link = `${origin}/debug?${process.argv.includes('--assets') ? 'asset=prop/vending' : 'review=marina-bay'}${process.argv.includes('--verification') ? '&reviewCloudTest=1' : ''}#review-key=${await token()}`;
    await write(new URL('.cache/level-review-private-link.txt', root), link + '\n');
    console.log('Private collaboration link saved to .cache/level-review-private-link.txt. Anyone with it can read and edit.');
  } else throw new Error('Use init, pull [--out file], push --file file, reply --thread ID --body-file file, or link. Add --assets for model discussions; --verification selects the isolated test board.');
} catch (error) { console.error(error.message); process.exitCode = 1; }
