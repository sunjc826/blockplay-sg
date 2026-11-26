// Voice Design auditions for the AI cast: one request per persona, three candidates each.
// Dry run by default (prints the briefs). `--generate` spends credits; a persona that was
// already attempted is never sent again, including after a timeout.
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const base = 'Speaks everyday colloquial Singapore English with a natural Singaporean accent: Singlish rhythm, clipped final consonants, flat syllable-timed stress and local vowels. Not British, not American, not Hong Kong, not Malaysian-Malay. Close, dry studio recording, no music, no reverb.';
export const auditions = {
  coach: {
    label: 'Pro coach',
    voice_description: `Singaporean Chinese man in his early forties, a former army physical training instructor who now coaches an esports team. Firm mid-low voice, clipped and precise, unhurried, dry. Gives corrections the way a discipline master does: short, level, slightly disappointed, never shouting. A hint of warmth when something is done right. ${base}`,
    text: 'You reload in the open again. Why? Cover is two steps to your left, lah.\nOkay. That one was clean. Don\'t let it go to your head.',
  },
  parent: {
    label: 'Disappointed parent',
    voice_description: `Singaporean Chinese mother in her mid fifties, a heartland auntie. Bright, slightly nasal voice that rises and gets sharper when she is exasperated, then softens. Nagging, quick, sing-song scolding with long drawn-out particles. Fond underneath the complaining. ${base}`,
    text: 'Aiyo, so late already still playing game! Your cousin already doctor, you know or not?\nEat already or not? Come, come, I cook your favourite.',
  },
  duo: {
    label: 'Gamer girlfriend',
    voice_description: `Singaporean Chinese woman in her mid twenties, bright, quick and playful. Light, clear voice, teasing and affectionate, laughs easily, speaks fast like someone chatting with her boyfriend on the sofa. Casual young-Singaporean speech with light Singlish particles. Confident, not cutesy. ${base}`,
    text: 'Eh, I told you he was on the roof, right? You never listen one!\nOkay lah, that was quite good. After this we go eat prata, can?',
  },
  comic: {
    label: 'Stand-up comedian (commentator)',
    voice_description: `Singaporean man in his late thirties, a stand-up comedian. Relaxed baritone, wry and deadpan, lets a line hang before finishing it. Sounds like he is leaning on a kopitiam table telling a story to friends. Dry amusement, never shouting, a slight smile in the voice. ${base}`,
    text: 'So this fellow brings a rifle to Orchard Road. Everybody else, shopping bag only.\nSomewhere, one security guard is writing this down very slowly.',
  },
  pro: {
    label: 'Pro gamer (streamer)',
    voice_description: `Singaporean Chinese man in his early twenties, a professional esports player streaming late at night. Calm, low-key, even voice, slightly sleepy, thinks out loud in short matter-of-fact phrases. Understated and confident, light Singlish, never excited. ${base}`,
    text: 'Okay chat, health is low, so I back off and bandage first. No point trading here.\nThat was my mistake. Next round I take the left side, can already.',
  },
  rager: {
    label: 'Try-hard rager (streamer)',
    voice_description: `Singaporean Chinese man in his early twenties, an ah beng from the heartlands, loud and hot-tempered. Rough, slightly hoarse voice that cracks upward when he is angry. Speaks very fast in heavy Hokkien-inflected Singlish, indignant, blaming everything but himself, then suddenly triumphant. Energetic and close to the microphone. ${base}`,
    text: 'Walao eh! Confirm lag one lah, I shoot him first! This game cheat me, I tell you!\nEh eh eh, see that? Clip it, chat! Pure skill, okay!',
  },
  'comic-streamer': {
    label: 'Stand-up comedian (streamer)',
    voice_description: `Singaporean man around thirty, an ordinary office worker and reservist who has started streaming games for fun. Expressive, slightly high tenor that wobbles when he is nervous. Cowardly, self-deprecating, animated, talks to his audience like friends. Comic timing with sudden worried pauses. ${base}`,
    text: 'Chat, I am not scared, okay. I am just walking very carefully in the other direction.\nWah, I actually hit him? Steady lah! Reservist never waste.',
  },
};
const settings = { model_id: 'eleven_ttv_v3', auto_generate_text: false, should_enhance: false, stream_previews: false, guidance_scale: 25, seed: 21 };
const root = fileURLToPath(new URL('../.cache/cast-voice-audition/', import.meta.url));
const dirOf = (id, request) => `${root}${id}-${createHash('sha256').update(JSON.stringify(request)).digest('hex').slice(0, 10)}/`;

if (!process.argv.includes('--generate')) {
  for (const [id, a] of Object.entries(auditions)) console.log(`${id}: ${a.text.length} characters\n  ${a.voice_description.slice(0, 110)}...`);
  console.log('\nDry run. Pass --generate to spend credits (about three times each script length).');
} else {
  const key = process.env.ELEVENLABS_API_KEY?.trim();
  if (!key) throw new Error('ELEVENLABS_API_KEY is not set. No requests sent.');
  const headers = { 'xi-api-key': key, 'Content-Type': 'application/json' };
  const used = async () => { const r = await fetch('https://api.elevenlabs.io/v1/user/subscription', { headers, signal: AbortSignal.timeout(30000) }); const d = await r.json(); return { used: d.character_count, limit: d.character_limit }; };
  const before = await used();
  console.log('credits before', before.used, 'of', before.limit);
  const only = process.argv.slice(2).filter(a => !a.startsWith('--'));
  for (const [id, a] of Object.entries(auditions)) {
    if (only.length && !only.includes(id)) continue;
    const request = { ...settings, voice_description: a.voice_description, text: a.text }, dir = dirOf(id, request);
    await fs.mkdir(dir, { recursive: true });
    try { await fs.writeFile(dir + 'attempt.json', JSON.stringify({ startedAt: new Date().toISOString(), request }, null, 2), { flag: 'wx' }); }
    catch { console.log(id, 'already attempted; skipped'); continue; }
    let response;
    try { response = await fetch('https://api.elevenlabs.io/v1/text-to-voice/design?output_format=mp3_44100_128', { method: 'POST', headers, body: JSON.stringify(request), signal: AbortSignal.timeout(180000) }); }
    catch (error) { console.log(id, 'connection failed or timed out; may have been billed; not retried', error.name); continue; }
    if (!response.ok) { const detail = await response.json().catch(() => ({})); console.log(id, 'failed', response.status, String(detail.detail?.status ?? ''), String(detail.detail?.message ?? '').replaceAll(key, '[redacted]').slice(0, 200)); continue; }
    const data = await response.json();
    await fs.writeFile(dir + 'response.json', JSON.stringify(data));
    const previews = [];
    for (const [i, p] of (data.previews ?? []).entries()) {
      const file = `candidate-${i + 1}.mp3`;
      await fs.writeFile(dir + file, Buffer.from(p.audio_base_64, 'base64'));
      previews.push({ file, generatedVoiceId: p.generated_voice_id, seconds: p.duration_secs });
    }
    await fs.writeFile(dir + 'previews.json', JSON.stringify({ id, label: a.label, text: a.text, previews }, null, 2));
    console.log(id, 'ok', previews.map(p => p.seconds?.toFixed?.(1)).join('s, ') + 's');
  }
  const after = await used();
  console.log('credits after', after.used, '(reported use can lag by a few minutes)');
}
