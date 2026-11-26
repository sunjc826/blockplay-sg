// Save one audition candidate per persona as a voice in the ElevenLabs account and print the ids.
// Usage: node --env-file=.env.local scripts/cast-voice-save.mjs coach=1 parent=1 ...
// A persona already saved from the same candidate is not sent again.
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../.cache/cast-voice-audition/', import.meta.url));
const key = process.env.ELEVENLABS_API_KEY?.trim();
if (!key) throw new Error('ELEVENLABS_API_KEY is not set. No requests sent.');
const headers = { 'xi-api-key': key, 'Content-Type': 'application/json' };
const picks = Object.fromEntries(process.argv.slice(2).map(a => a.split('=')));
const ids = {};
for (const dir of (await fs.readdir(root, { withFileTypes: true })).filter(d => d.isDirectory()).map(d => root + d.name + '/')) {
  let meta; try { meta = JSON.parse(await fs.readFile(dir + 'previews.json', 'utf8')); } catch { continue; }
  const pick = Number(picks[meta.id]); if (!pick) continue;
  const preview = meta.previews[pick - 1], savedFile = `${dir}saved-${pick}.json`;
  let saved; try { saved = JSON.parse(await fs.readFile(savedFile, 'utf8')); } catch { /* not saved yet */ }
  if (!saved) {
    const { request } = JSON.parse(await fs.readFile(dir + 'attempt.json', 'utf8'));
    await fs.writeFile(savedFile + '.attempt', new Date().toISOString(), { flag: 'wx' });
    const response = await fetch('https://api.elevenlabs.io/v1/text-to-voice', { method: 'POST', headers, signal: AbortSignal.timeout(60000),
      body: JSON.stringify({ voice_name: `Blockplay Cast — ${meta.label}`, voice_description: request.voice_description, generated_voice_id: preview.generatedVoiceId }) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || typeof data.voice_id !== 'string') { console.log(meta.id, 'save failed', response.status, String(data.detail?.status ?? ''), String(data.detail?.message ?? '').slice(0, 160)); continue; }
    saved = { voiceId: data.voice_id, name: data.name }; await fs.writeFile(savedFile, JSON.stringify(saved));
  }
  const speech = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${saved.voiceId}/stream?output_format=mp3_44100_64`, { method: 'POST', headers, signal: AbortSignal.timeout(40000),
    body: JSON.stringify({ text: meta.text.split('\n')[0], model_id: 'eleven_flash_v2_5' }) });
  if (speech.ok) await fs.writeFile(`${dir}flash-${pick}.mp3`, Buffer.from(await speech.arrayBuffer()));
  console.log(meta.id, saved.voiceId, 'flash', speech.status);
  ids[meta.id] = saved.voiceId;
}
console.log(JSON.stringify(ids));
