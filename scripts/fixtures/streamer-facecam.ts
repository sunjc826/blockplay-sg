import { facecamState } from '../../src/game/facecam/scene';
import { cameraCanvas, schedule } from '../../src/game/facecam/playback';
import { actions, type Reaction } from '../../src/game/facecam/acting';
import type { Persona } from '../../src/game/facecam/controls';
import type { PilotAction } from '../../src/game/fps-pilot';
const query = new URLSearchParams(location.search);
const names = { pro: 'Pro gamer', rager: 'Try-hard rager', 'comic-streamer': 'Stand-up comedian' };
const selection = query.get('persona') ?? 'all',
  named = query.get('reaction') as Reaction;
const presets: Record<string, PilotAction> = {
  left: { lookX: -23 },
  right: { lookX: 23 },
  up: { lookY: -19 },
  down: { lookY: 19 },
  walk: { forward: true },
  back: { backward: true },
  strafe: { left: true },
  fire: { fire: true },
  aim: { aim: true },
  reload: { reload: true },
  jump: { jump: true },
  sprint: { sprint: true, forward: true },
  crouch: { crouch: true },
  weapon: { weapon: 1 },
  supply: { useSupply: 'bandage' },
};
const sequence =
  query.get('inputs') === 'all' || !query.get('inputs')
    ? Object.keys(presets)
    : query
        .get('inputs')!
        .split(',')
        .filter((k) => k in presets);
const select = document.querySelector<HTMLSelectElement>('#reaction')!;
for (const r of Object.keys(actions)) select.add(new Option(r, r));
select.value = named in actions ? named : 'nod';
const views = (Object.keys(names) as Persona[])
  .filter((id) => selection === 'all' || id === selection)
  .map((id) => {
    const figure = document.createElement('figure'),
      canvas = document.createElement('canvas'),
      label = document.createElement('figcaption'),
      event = document.createElement('output');
    label.textContent = names[id];
    figure.append(canvas, label, event);
    document.querySelector('#views')!.append(figure);
    const state = facecamState(id, Number(query.get('seed') ?? 27));
    state.acting.tilt = Math.min(1, Math.max(0, Number(query.get('tilt') ?? 0)));
    const cam = cameraCanvas(canvas, state, (text) => {
      event.textContent = text;
    });
    if (named in actions) state.acting.perform(named);
    if (query.has('slam') && id === 'rager') state.acting.perform('slam');
    return { state, cam, event };
  });
let ticks = 0,
  scriptStart = query.has('inputs') ? 0 : -1,
  paused = query.has('at'),
  last = 0,
  handle = 0;
const fixed = 1 / 30;
function step() {
  const index = ticks - scriptStart,
    input = scriptStart >= 0 && index >= 0 ? sequence[Math.floor(index / 30)] : undefined;
  for (const { state, cam, event } of views) {
    if (input && index % 3 === 0) {
      state.acting.input.pilot(presets[input], state.acting.handsBusy || cam.shot.handReturning);
      event.textContent = input;
    }
    cam.draw(fixed, query.has('reduced'), undefined, query.has('talk'));
  }
  ticks++;
}
const initial = Math.min(1800, Math.max(1, Math.round(Number(query.get('at') ?? 0) * 30)));
for (let i = 0; i < initial; i++) step();
function frame(now: number) {
  if (!paused && now - last >= 1000 / 30 - 0.5) {
    step();
    last = now;
  }
  handle = requestAnimationFrame(frame);
}
handle = requestAnimationFrame(frame);
const pause = document.querySelector<HTMLButtonElement>('#pause')!;
function setPaused(value: boolean) {
  paused = value;
  pause.textContent = value ? 'Resume' : 'Pause';
}
setPaused(paused);
pause.onclick = () => setPaused(!paused);
document.querySelector<HTMLButtonElement>('#step')!.onclick = () => {
  setPaused(true);
  for (let i = 0; i < 3; i++) step();
};
document.querySelector<HTMLFormElement>('#controls')!.onsubmit = (e) => {
  e.preventDefault();
  for (const v of views) v.state.acting.perform(select.value as Reaction);
  setPaused(false);
};
document.querySelector<HTMLButtonElement>('#slam')!.onclick = () => {
  for (const v of views) if (v.state.acting.persona === 'rager') v.state.acting.perform('slam');
  setPaused(false);
};
document.querySelector<HTMLButtonElement>('#inputs')!.onclick = () => {
  scriptStart = ticks;
  setPaused(false);
};
Object.assign(window, { ready: true, facecams: views, stepFacecam: step });
// Use the production pressure gate against real refresh opportunities in a single-camera fixture.
const measure = document.querySelector<HTMLButtonElement>('#measure')!;
measure.disabled = views.length !== 1;
let meter: ReturnType<typeof schedule> | undefined;
measure.onclick = () => {
  if (views.length !== 1) return;
  setPaused(true);
  cancelAnimationFrame(handle);
  meter?.dispose();
  measure.disabled = true;
  const { state, cam, event } = views[0];
  let elapsed = 0;
  const begin = performance.now();
  meter = schedule(
    (dt) => {
      elapsed += dt;
      state.acting.input.pilot({ lookX: Math.sin(elapsed * 2) * 6, forward: true }, state.acting.handsBusy);
      cam.draw(dt, false, undefined, false);
      if (performance.now() - begin > 5000) {
        queueMicrotask(() => {
          const { frames, opportunities, cpuMs, skipped } = meter!.stats;
          const result = {
            frames,
            opportunities,
            skipped,
            cpuMs,
            perCamera: cpuMs / Math.max(1, frames - 1),
            perRefresh: cpuMs / opportunities,
          };
          Object.assign(window, { facecamBenchmark: result });
          event.textContent =
            result.perCamera.toFixed(3) +
            ' ms per camera update · ' +
            result.perRefresh.toFixed(3) +
            ' ms per display frame · ' +
            frames +
            ' renders';
          meter?.dispose();
          measure.disabled = false;
          handle = requestAnimationFrame(frame);
        });
      }
    },
    () => document.hidden
  );
};
if (query.has('bench')) measure.click();
window.addEventListener(
  'pagehide',
  () => {
    cancelAnimationFrame(handle);
    meter?.dispose();
    views.forEach((v) => v.cam.dispose());
  },
  { once: true }
);
