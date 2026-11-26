import { describe, expect, it, vi } from 'vitest';
import { Acting, actions, rules, type Signal, type Reaction } from './acting';
import { DeskInput, keyFingers, keyboardKeys, mouthOpening, pad, type Persona } from './controls';
import type { PilotAction } from '../fps-pilot';
import { BODY_LIMIT, Desk, deskTop } from './desk';
import { buildFacecam, facecamState } from './scene';
import { schedule } from './playback';
import { panelPosition } from './layout';
import { streamerSession } from '../streamer-session';
import { observeHud } from './signals';
import type { FpsHud } from '../fps-engine';
// @ts-expect-error The service worker manifest is a Node build helper.
import { shellPaths } from '../../../scripts/service-worker-manifest.mjs';

const ids: Persona[] = ['pro', 'rager', 'comic-streamer'];
const ignore = () => {};
describe('the pilot at the desk', () => {
  it.each(ids)('%s maps signed deltas proportionally in both axes', (id) => {
    const sample = (x: number, y: number) => {
      const a = new DeskInput(id);
      a.pilot({ lookX: x, lookY: y }, false);
      a.tick(0.05, false);
      return [a.x, a.z];
    };
    const [x, z] = sample(10, -10);
    expect(x).toBeGreaterThan(0);
    expect(z).toBeGreaterThan(0);
    expect(sample(-20, 20)).toEqual([-2 * x, -2 * z]);
  });
  it('reaches the pad edge, lifts, comes home and sets down', () => {
    const a = new DeskInput('pro');
    a.pilot({ lookX: 100, lookY: -100 }, false);
    a.pilot({ lookX: 100 }, false);
    let height = 0;
    for (let i = 0; i < 100; i++) {
      a.tick(0.01, false);
      height = Math.max(height, a.lift);
      expect(Math.abs(a.x)).toBeLessThanOrEqual(pad.x);
      expect(Math.abs(a.z)).toBeLessThanOrEqual(pad.z);
    }
    expect(height).toBeGreaterThan(0.09);
    expect(a.lift).toBeCloseTo(0);
    expect(Math.abs(a.x)).toBeLessThan(0.001);
    a.pilot({ lookX: -20 }, false);
    a.tick(0.1, false);
    expect(a.x).toBeLessThan(0);
  });
  it('follows menu cursor, timed clicks and held buttons independently', () => {
    const a = new DeskInput('comic-streamer');
    a.menu(1, 0);
    a.tick(0.1, false);
    expect(a.targetX).toBe(pad.x);
    expect(a.targetZ).toBe(pad.z);
    a.click();
    expect(a.fire).toBe(true);
    a.tick(0.2, false);
    expect(a.fire).toBe(false);
    a.pilot({ aim: true }, false);
    expect(a.held.aim).toBe(true);
    expect(a.fire).toBe(false);
    a.pilot({ fire: true }, false);
    expect(a.fire).toBe(true);
    a.tick(0.3, false);
    expect(a.fire).toBe(false);
  });
  it.each([
    ['forward', 'w', 2],
    ['backward', 's', 2],
    ['left', 'a', 1],
    ['right', 'd', 3],
    ['sprint', 'shift', 0],
    ['crouch', 'c', 3],
    ['reload', 'r', 3],
    ['jump', 'space', 4],
    ['weapon', 'one', 3],
    ['useSupply', 'f', 3],
  ] as const)('sends %s to its own key', (name, key, index) => {
    const fingers = keyFingers({ [name]: name === 'weapon' ? 0 : name === 'useSupply' ? 'bandage' : true } as PilotAction);
    expect(fingers[index]).toEqual({ at: keyboardKeys[key], down: true });
    expect(fingers.filter((f) => f.down)).toHaveLength(1);
  });
  it('presses a chord and distinguishes weapon slots', () => {
    expect(keyFingers({ forward: true, left: true, sprint: true }).map((f) => f.down)).toEqual([
      true,
      true,
      true,
      false,
      false,
    ]);
    expect(keyFingers({ weapon: 1 })[3].at).toBe(keyboardKeys.two);
  });
});
const signals: Signal[] = [
  'elimination',
  'streak',
  'damage',
  'incoming',
  'contact',
  'low',
  'death',
  'respawn',
  'won',
  'lost',
  'district',
  'vehicle',
  'purchase',
  'poll',
  'vote',
  'pause',
  'resume',
  'chat',
];
const expected: Record<Persona, Reaction[]> = {
  pro: [
    'nod',
    'smile',
    'lean',
    'focus',
    'focus',
    'lean',
    'exhale',
    'focus',
    'shoulder',
    'shoulder',
    'glance',
    'focus',
    'nod',
    'glance',
    'nod',
    'exhale',
    'focus',
    'glance',
  ],
  rager: [
    'clip',
    'triumph',
    'point',
    'shake',
    'lean',
    'protest',
    'shake',
    'lean',
    'clip',
    'protest',
    'nod',
    'lean',
    'smile',
    'point',
    'smile',
    'exhale',
    'lean',
    'point',
  ],
  'comic-streamer': [
    'triumph',
    'clip',
    'flinch',
    'flinch',
    'peek',
    'cover',
    'slide',
    'peek',
    'triumph',
    'shrug',
    'glance',
    'peek',
    'shrug',
    'shrug',
    'nod',
    'exhale',
    'peek',
    'shrug',
  ],
};
describe('character direction', () => {
  it.each(ids)('%s reacts to every public signal', (id) => {
    signals.forEach((signal, i) => {
      const a = new Acting(id);
      a.signal(signal);
      expect(a.reaction, signal).toBe(expected[id][i]);
    });
    expect(rules[id].every((r) => r.cooldown > 0)).toBe(true);
  });
  it('escalates clustered deaths, cools over time and with a kill', () => {
    const a = new Acting('rager');
    a.signal('death');
    expect(a.tilt).toBe(0.3);
    a.tick(3, ignore);
    a.signal('death');
    expect(a.reaction).toBe('thump');
    a.tick(3, ignore);
    a.signal('death');
    expect(a.reaction).toBe('slam');
    const t = a.tilt;
    a.signal('elimination');
    expect(a.tilt).toBeCloseTo(t - 0.27);
    a.signal('damage');
    expect(a.tilt).toBeCloseTo(t - 0.11);
    a.tick(120, ignore);
    expect(a.tilt).toBe(0);
    a.signal('death');
    expect(a.reaction).toBe('point');
  });
  it('applies cooldowns across interruptions and alternates big beats', () => {
    const a = new Acting('comic-streamer');
    a.signal('death');
    a.tick(1, ignore);
    a.signal('respawn');
    expect(a.reaction).toBe('slide');
    a.perform('nod');
    a.signal('death');
    expect(a.reaction).toBe('nod');
    a.tick(3, ignore);
    a.signal('death');
    expect(a.reaction).toBe('exhale');
    const r = new Acting('rager');
    r.tilt = 1;
    const sequence = Array.from({ length: 6 }, () => {
      r.signal('death');
      const chosen = r.reaction;
      r.tick(5, ignore);
      return chosen;
    });
    expect(new Set(sequence).size).toBeGreaterThan(1);
    sequence.slice(1).forEach((s, i) => expect(s).not.toBe(sequence[i]));
  });
  it('leaves quiet play alone until a genuine lull and interrupts a sip on contact', () => {
    const a = new Acting('comic-streamer');
    a.playing = true;
    a.tick(17, ignore);
    expect(a.reaction).toBeNull();
    a.tick(2, ignore);
    expect(a.reaction).toBe('sip');
    a.signal('contact');
    expect(a.reaction).toBe('peek');
  });
  it('expires missed reactions and cools tilt on the real clock when rendering is skipped', () => {
    let now = 100;
    const a = new Acting('rager', () => now),
      impact = vi.fn();
    a.tilt = 1;
    a.signal('death');
    now += 65;
    a.tick(0.05, impact);
    expect(a.reaction).toBeNull();
    expect(a.tilt).toBeCloseTo(0.415);
    expect(impact).not.toHaveBeenCalled();
  });
  it('keeps the mouse parked until the animated hand comes home', () => {
    const state = facecamState('rager'),
      cam = buildFacecam(state, ignore),
      a = state.acting;
    cam.frame(0.05);
    a.perform('clip');
    for (let i = 0; i < 38; i++) {
      a.input.pilot({ lookX: 20 }, a.handsBusy || cam.handReturning);
      cam.frame(0.05);
    }
    expect(a.input.targetX).toBe(0);
    expect(cam.handReturning).toBe(true);
    for (let i = 0; i < 6; i++) cam.frame(0.05);
    expect(cam.handReturning).toBe(false);
    a.input.pilot({ lookX: 20 }, a.handsBusy);
    cam.frame(0.05);
    expect(a.input.x).toBeGreaterThan(0);
    cam.dispose();
  });
  it('uses audible level or caption timing and closes on silence', () => {
    expect(mouthOpening(0.1, true, 3)).toBeGreaterThan(mouthOpening(0.025, true, 3));
    expect(mouthOpening(0, true, 3)).toBe(0);
    expect(mouthOpening(undefined, false, 3)).toBe(0);
    expect(mouthOpening(undefined, true, 2)).not.toBe(mouthOpening(undefined, true, 2.1));
  });
});
describe('desktop rigid bodies', () => {
  it('leaves an untouched desk exactly at rest', () => {
    const d = new Desk('comic-streamer'),
      before = structuredClone(d.bodies);
    d.step(0.2);
    expect(d.bodies).toEqual(before);
  });
  it('throws three specific caps, tips the cup and settles deterministically across display rates', () => {
    function slam(fps: number) {
      const d = new Desk('rager', 27);
      expect(d.impact(true)).toBe(3);
      for (let i = 0; i < fps * 10; i++) d.step(1 / fps);
      return d;
    }
    const a = slam(20),
      b = slam(60);
    expect(a.bodies).toEqual(b.bodies);
    expect(a.bodies.every((p) => p.sleep)).toBe(true);
    expect(a.get('key-0')!.y).toBeGreaterThan(0);
    expect(a.get('key-1')!.y).toBeGreaterThan(0);
    expect(a.get('key-2')!.y).toBeLessThan(0);
    expect(Math.abs(Math.sin(a.get('noodles')!.angle))).toBeCloseTo(1);
  });
  it('stops a fast descending body at the desktop or floor', () => {
    const d = new Desk('pro');
    for (const x of [0, 4]) {
      const b = d.add('drop' + x, 'box', x, 0.64, 0.1, 0.1, 0.1, 0.5)!;
      b.y = 0.4;
      b.vy = -200;
      b.sleep = false;
      d.step(1 / 120);
      expect(b.y).toBeGreaterThanOrEqual((x ? deskTop.floor : 0) + 0.05);
    }
  });
  it('resolves a stack upwards when the bottom body is on the desktop', () => {
    const d = new Desk('pro');
    const lower = d.add('lower', 'box', 0, 0.8, 0.32, 0.1, 0.32, 0.1)!;
    const upper = d.add('upper', 'box', 0, 0.8, 0.32, 0.1, 0.32, 0.7)!;
    upper.y = 0.1;
    lower.sleep = upper.sleep = false;
    for (let i = 0; i < 30; i++) {
      d.step(1 / 120);
      expect(lower.y).toBeGreaterThanOrEqual(0.05);
      expect(upper.y).toBeGreaterThan(0.14);
    }
  });
  it('transfers momentum between props and bounds accumulated debris', () => {
    const d = new Desk('rager'),
      a = d.add('a', 'box', 0, 0.1, 0.1, 0.1, 0.1, 1)!,
      b = d.add('b', 'box', 0.12, 0.1, 0.1, 0.1, 0.1, 1)!;
    a.sleep = false;
    a.vx = 3;
    d.step(0.03);
    expect(b.vx).toBeGreaterThan(0);
    for (let i = 0; i < 80; i++) {
      d.impact(true);
      d.add('extra' + i, 'box', 2, 0.5, 0.1, 0.1, 0.1, 0.1);
    }
    expect(d.bodies).toHaveLength(BODY_LIMIT);
    expect(d.detached).toBeLessThanOrEqual(18);
  });
});
describe('stream lifecycle', () => {
  it('queues only visible impacts, exactly once, for the next menu or play turn', () => {
    const s = streamerSession(),
      m = facecamState('rager'),
      cam = buildFacecam(m, s.physicalMoment);
    m.acting.perform('slam');
    cam.frame(0.1);
    expect(s.takeEvents()).toEqual([]);
    for (let i = 0; i < 70; i++) cam.frame(0.05);
    expect(s.menuNote('Choose')).toBe('Choose · You slammed the keyboard and knocked 3 keycaps loose.');
    expect(s.takeEvents()).toEqual([]);
    m.acting.perform('nod');
    cam.frame(1);
    expect(s.takeEvents()).toEqual([]);
    s.physicalMoment('You slid off your chair.');
    expect(s.takeEvents()).toEqual(['You slid off your chair.']);
    s.physicalMoment('Old mess');
    s.stop();
    expect(s.takeEvents()).toEqual([]);
    cam.dispose();
  });
  it('renders four draws and releases merged geometry, instances and materials for each persona', () => {
    for (const id of ids) {
      const cam = buildFacecam(facecamState(id), ignore);
      cam.frame(0.05);
      const draws = cam.scene.children.filter((o) => 'geometry' in o) as import('three').Mesh[];
      expect(draws.length).toBe(4);
      const release = vi.fn();
      draws.forEach((o) => o.geometry.addEventListener('dispose', release));
      cam.dispose();
      expect(release).toHaveBeenCalledTimes(4);
      expect(cam.scene.children).toHaveLength(0);
    }
  });
  it('only caches the desk camera on demand', () => {
    expect(shellPaths(['index.html', 'assets/StreamerFacecam-ab12.js', 'assets/StreamerFacecam-ab12.css'])).toEqual(['/']);
  });
  it('skips busy/hidden frames and removes the callback on disposal', () => {
    let t = 0,
      hidden = true;
    const draw = vi.fn(),
      request = vi.fn(() => 3),
      cancel = vi.fn();
    const loop = schedule(draw, () => hidden, { request, cancel, now: () => t });
    loop.gameClock(true);
    loop.tick(1);
    expect(draw).not.toHaveBeenCalled();
    hidden = false;
    t = 17;
    loop.tick(t);
    expect(draw).toHaveBeenCalledTimes(1);
    t = 128;
    loop.tick(119);
    expect(draw).toHaveBeenCalledTimes(1);
    loop.dispose();
    loop.tick(140);
    expect(draw).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalledWith(3);
  });
  it('maps HUD edges once and gives death priority', () => {
    const a = new Acting('comic-streamer'),
      watch = vi.spyOn(a, 'signal');
    const prev = { health: 100, maxHealth: 100, phase: 'playing', hits: 1, chain: 1, vehicle: 'on-foot' } as FpsHud;
    const h = { ...prev, health: 22, incoming: true, chain: 2, hits: 2, vehicle: 'car' } as FpsHud;
    observeHud(a, h, prev);
    expect(watch.mock.calls.flat()).toEqual(['elimination', 'streak', 'incoming', 'low', 'vehicle']);
    watch.mockClear();
    observeHud(a, h, h);
    expect(watch).not.toHaveBeenCalled();
    observeHud(a, { ...h, health: 0 }, h);
    expect(a.reaction).toBe('slide');
  });
  it.each([
    [1280, 720],
    [1920, 1080],
    [844, 390],
  ])('clears menu target, poll, HUD and reticle at %ix%i', (w, h) => {
    const avoid = [
      { left: w / 2 - 20, top: h / 2 - 20, right: w / 2 + 20, bottom: h / 2 + 20 },
      { left: w - 230, top: 0, right: w, bottom: 200 },
      { left: 0, top: 0, right: 180, bottom: 160 },
      { left: w - 270, top: h - 130, right: w, bottom: h },
      { left: 0, top: h - 100, right: 370, bottom: h },
    ];
    const p = panelPosition(w, h, avoid)!;
    expect(p).toBeTruthy();
    expect(
      avoid.every((r) => p.x + p.width <= r.left || p.x >= r.right || p.y + p.width * 0.75 <= r.top || p.y >= r.bottom)
    ).toBe(true);
  });
  it('keeps every named fixture reaction finite', () => {
    for (const id of ids) {
      const state = facecamState(id),
        cam = buildFacecam(state, ignore);
      for (const r of Object.keys(actions) as Reaction[]) {
        state.acting.perform(r);
        for (let k = 0; k < 12; k++) cam.frame(actions[r] / 12);
      }
      expect(state.desk.bodies.every((b) => Number.isFinite(b.x + b.y + b.z + b.angle))).toBe(true);
      cam.dispose();
    }
  });
});
