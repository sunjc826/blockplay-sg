import { scenes, opening, endingCount } from './story.js';
/** @template {HTMLElement} T @param {string} id @returns {T} */
function el(id) { const node = document.getElementById(id); if (!node) throw new Error(`Missing ${id}`); return /** @type {T} */(node); }
const landing = el('landing'), experience = el('experience');
const narration = /** @type {HTMLAudioElement} */ (el('narration'));
const atmosphere = /** @type {HTMLAudioElement} */ (el('atmosphere'));
const seek = /** @type {HTMLInputElement} */ (el('seek'));
const about = /** @type {HTMLDialogElement} */ (el('about'));
let current = opening;
/** @type {string[]} */ let path = [];
/** @type {Set<string>} */ let found = new Set();
try { const saved = JSON.parse(localStorage.getItem('last-train-endings') || '[]'); if (Array.isArray(saved)) found = new Set(saved.filter(id => typeof id === 'string' && scenes[id]?.ending)); } catch { /* Storage may be unavailable in private browsers. */ }
let ambientOn = false;
atmosphere.volume = 0.14;
const formatTime = (/** @type {number} */ value) => Number.isFinite(value) ? `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, '0')}` : '0:00';
function updatePlayer() {
  const playing = !narration.paused && !narration.ended;
  el('play').textContent = playing ? 'Ⅱ' : '▶';
  el('play').setAttribute('aria-label', playing ? 'Pause narration' : 'Play narration');
  el('duration').textContent = `${formatTime(narration.currentTime)} / ${formatTime(narration.duration)}`;
  seek.value = String(Number.isFinite(narration.duration) && narration.duration > 0 ? narration.currentTime / narration.duration * 100 : 0);
}
async function playNarration() {
  const src = narration.src;
  el('audio-status').textContent = 'Loading your scene…';
  try { await narration.play(); if (src === narration.src) el('audio-status').textContent = 'Listen closely'; }
  catch (error) { if (src === narration.src && !(error instanceof DOMException && error.name === 'AbortError')) el('audio-status').textContent = 'Tap play to listen, or read below'; }
  updatePlayer();
}
function renderRoute() {
  const route = el('route'); route.replaceChildren();
  for (const id of path) { const item = document.createElement('li'); item.textContent = scenes[id].title; route.append(item); }
  el('found-count').textContent = String(found.size);
}
/** @param {string} id @param {boolean} [autoplay] */
function enter(id, autoplay = true) {
  if (!scenes[id]) return;
  current = id; path.push(id);
  const scene = scenes[id];
  narration.pause(); narration.src = `audio/${id}.mp3`; narration.load();
  el('scene-title').textContent = scene.title; el('place').textContent = scene.place;
  el('scene-time').textContent = scene.time; el('scene-text').textContent = scene.text;
  el('journey-label').textContent = `YOUR JOURNEY / ${String(path.length).padStart(2, '0')}`;
  el('audio-status').textContent = 'Ready to listen';
  const choices = el('choices'); choices.replaceChildren();
  scene.choices.forEach((choice, index) => {
    const button = document.createElement('button'); button.className = 'choice';
    const number = document.createElement('span'); number.className = 'choice-number'; number.textContent = `0${index + 1}`;
    const copy = document.createElement('span'); copy.className = 'choice-copy';
    const title = document.createElement('strong'); title.textContent = choice.label;
    const hint = document.createElement('small'); hint.textContent = choice.hint;
    const arrow = document.createElement('span'); arrow.className = 'choice-arrow'; arrow.textContent = '↗'; arrow.setAttribute('aria-hidden','true');
    copy.append(title, hint); button.append(number, copy, arrow);
    button.addEventListener('click', () => enter(choice.next)); choices.append(button);
  });
  el('ending').hidden = !scene.ending; el('ending-actions').hidden = !scene.ending; el('choice-heading').hidden = !!scene.ending;
  el('share-status').textContent = '';
  if (scene.ending) {
    found.add(id); try { localStorage.setItem('last-train-endings', JSON.stringify([...found])); } catch { /* Still playable without storage. */ }
    const card = el('ending'); card.replaceChildren();
    const label = document.createElement('p'); label.className = 'eyebrow'; label.textContent = 'YOUR ENDING';
    const title = document.createElement('h3'); title.textContent = scene.ending;
    const detail = document.createElement('p'); detail.textContent = `${found.size} of ${endingCount} endings discovered. ${found.size < endingCount ? 'Another choice. Another way home.' : 'You have heard every echo. Thank you for riding.'}`;
    card.append(label,title,detail);
  }
  renderRoute(); updatePlayer();
  el('scene-title').focus({preventScroll:true}); window.scrollTo({top:0,behavior:'instant'});
  if (autoplay) void playNarration();
}
function start() { path = []; landing.hidden = true; experience.hidden = false; enter(opening); }
el('start').addEventListener('click',start); el('again').addEventListener('click',start);
el('restart').addEventListener('click', () => { narration.pause(); atmosphere.pause(); ambientOn=false; el('ambient').textContent='Atmosphere off'; el('ambient').setAttribute('aria-pressed','false'); experience.hidden=true; landing.hidden=false; el('start').focus(); });
el('play').addEventListener('click', () => { if(narration.paused) void playNarration(); else { narration.pause(); el('audio-status').textContent='Paused · take your time'; } });
for (const event of ['timeupdate','loadedmetadata','pause','play','ended']) narration.addEventListener(event,updatePlayer);
narration.addEventListener('ended', () => { el('audio-status').textContent = scenes[current].ending ? 'Your journey is complete' : 'Your move'; });
narration.addEventListener('error', () => { el('audio-status').textContent = 'Audio unavailable · read the scene below'; /** @type {HTMLDetailsElement} */ (el('transcript')).open = true; });
seek.addEventListener('input', () => { if(Number.isFinite(narration.duration)) narration.currentTime=Number(seek.value)/100*narration.duration; });
el('ambient').addEventListener('click', async () => {
  if(ambientOn) { atmosphere.pause(); ambientOn=false; }
  else { try { await atmosphere.play(); ambientOn=true; } catch { el('ambient').textContent='Atmosphere unavailable'; return; } }
  el('ambient').textContent=ambientOn ? 'Atmosphere on' : 'Atmosphere off'; el('ambient').setAttribute('aria-pressed',String(ambientOn));
});
for(const id of ['about-button','credits-button']) el(id).addEventListener('click',()=>about.showModal());
el('close-about').addEventListener('click',()=>about.close());
about.addEventListener('click',event=> { if(event.target === about) { const r=about.getBoundingClientRect(); if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom) about.close(); } });
el('share').addEventListener('click',async()=> {
  const url = new URL('./',location.href).href;
  const text = `I found “${scenes[current].ending}” in Last Train. Where will your choices take you?`;
  try { if(navigator.share) await navigator.share({title:'Last Train',text,url}); else { await navigator.clipboard.writeText(`${text} ${url}`); el('share-status').textContent='Link copied. Send it to a fellow passenger.'; } }
  catch(error) { if(!(error instanceof DOMException && error.name==='AbortError')) el('share-status').textContent=`Share this link: ${url}`; }
});
document.addEventListener('visibilitychange',()=>{ if(document.hidden) { narration.pause(); atmosphere.pause(); if(ambientOn){ambientOn=false;el('ambient').textContent='Atmosphere off';el('ambient').setAttribute('aria-pressed','false');} } });
