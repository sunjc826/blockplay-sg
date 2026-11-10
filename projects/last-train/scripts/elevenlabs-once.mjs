// Standalone copy of Astra's once-only generation helper. No paid request is automatically retried.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
const hash = value => createHash('sha256').update(value).digest('hex');
const readJson = async file => { try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch (e) { if (e.code === 'ENOENT') return null; throw e; } };
const writeJson = (file, data, options) => fs.writeFile(file, JSON.stringify(data, null, 2) + '\n', options);

export async function once({ directory, id, request, endpoint, key, fetcher = fetch, binary = false }) {
  await fs.mkdir(directory, { recursive: true });
  const marker = path.join(directory, id + '.json');
  const fingerprint = hash(JSON.stringify({ endpoint, request }));
  const previous = await readJson(marker);
  if (previous) {
    if (previous.fingerprint !== fingerprint) throw Error(`${id}: request changed; inspect its existing attempt.`);
    if (previous.status !== 'complete') throw Error(`${id}: previous ${previous.status} attempt needs review. No automatic retry.`);
    if (binary && hash(await fs.readFile(path.join(directory, id + '.mp3'))) !== previous.sha256) throw Error(`${id}: cached audio checksum mismatch.`);
    return previous;
  }
  const attempt = { fingerprint, status: 'submitted', startedAt: new Date().toISOString(), request };
  await writeJson(marker, attempt, { flag: 'wx' });
  let response;
  try {
    response = await fetcher(endpoint, { method: 'POST', headers: { 'xi-api-key': key.trim(), 'Content-Type': 'application/json' }, body: JSON.stringify(request), signal: AbortSignal.timeout(300000) });
  } catch { throw Error(`${id}: connection failed; may have consumed credits. Inspect recorded attempt before retrying.`); }
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    const message = String(detail.detail?.message ?? `HTTP ${response.status}`).replaceAll(key.trim(), '[redacted]');
    await writeJson(marker, { ...attempt, status: 'failed', httpStatus: response.status, message });
    throw Error(`${id}: ${message} No automatic retry.`);
  }
  let result;
  if (binary) {
    const data = Buffer.from(await response.arrayBuffer());
    // Preserve even an unexpected response for diagnosis instead of spending on a retry.
    await fs.writeFile(path.join(directory, id + '.mp3'), data, { flag: 'wx' });
    if (!/^audio\//i.test(response.headers.get('content-type') ?? '') || data.length < 1000) throw Error(`${id}: unexpected audio response saved for inspection.`);
    result = { bytes: data.length, sha256: hash(data), requestId: response.headers.get('request-id'), characterCost: response.headers.get('character-cost') };
  } else {
    const data = await response.json();
    await writeJson(path.join(directory, id + '-response.json'), data, { flag: 'wx' });
    if (!data.voice_id) throw Error('Voice creation returned no voice ID; inspect the saved response.');
    result = { voiceId: data.voice_id, name: data.name };
  }
  const complete = { ...attempt, ...result, status: 'complete', completedAt: new Date().toISOString() };
  await writeJson(marker, complete);
  return complete;
}

export async function usage(key) {
  const response = await fetch('https://api.elevenlabs.io/v1/user/subscription', { headers: { 'xi-api-key': key.trim() }, signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw Error(`Subscription check failed (HTTP ${response.status}).`);
  const s = await response.json();
  if (!s.tier || s.tier === 'free' || !Number.isFinite(s.character_count) || !Number.isFinite(s.character_limit)) throw Error('Could not verify paid-plan included credits.');
  return { checkedAt: new Date().toISOString(), tier: s.tier, used: s.character_count, limit: s.character_limit };
}
