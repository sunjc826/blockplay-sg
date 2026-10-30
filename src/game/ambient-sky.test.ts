import { describe, expect, it } from 'vitest';
import { AMBIENT_MARGIN, AMBIENT_PACE, createAmbientDirector, exitDistance, farPoint, flakPose, flakTimeline, flybyHeard, flybyPose, outside, rocketPose, rocketTimeline,
  searchlightSites, skylineTimeline, flarePose, missilePose, navalShellPose, navalTimeline, shipPose, shootdownHit, shootdownPose, COASTAL_SEA, FLARE, FLYBY, NAVAL, SHOOTDOWN,
  type AmbientEvent, type AmbientView } from './ambient-sky';
import { farGain } from './ambient-sky-audio';
import { combatRandom } from './combat-events';

const bounds = { minX: -200, maxX: 200, minZ: -150, maxZ: 150 };
const view = (now: number, extra: Partial<AmbientView> = {}): AmbientView => ({ now, listener: { x: 0, y: 1.7, z: 0 }, bounds, night: 0, ...extra });
/** Runs a director for `seconds`, stepping at 10 Hz, and returns everything it started. */
function run(seconds: number, extra: Partial<AmbientView> = {}, seed = 7, risk: 'low' | 'medium' | 'high' = 'medium') {
  const director = createAmbientDirector({ seed, risk }), started: AmbientEvent[] = [];
  for (let t = 0; t <= seconds; t += .1) started.push(...director.step(view(t, extra)));
  return started;
}

describe('ambient sky director', () => {
  it('is pure for a seed', () => {
    expect(run(400)).toEqual(run(400));
    expect(run(400, {}, 8)).not.toEqual(run(400));
  });
  it('fills a few minutes of sky with every daytime kind and no flak by day', () => {
    const kinds = new Set(run(400).map(e => e.kind));
    expect(kinds).toEqual(new Set(['skyline', 'flyby', 'rockets', 'shootdown']));
    expect(run(400, { night: 1 }).some(e => e.kind === 'flak')).toBe(true);
  });
  it('holds aircraft and rockets back during a real air raid', () => {
    const started = run(400, { quiet: true });
    expect(started.some(e => e.kind === 'flyby' || e.kind === 'rockets' || e.kind === 'shootdown')).toBe(false);
    expect(started.some(e => e.kind === 'skyline')).toBe(true);
  });
  it('runs a riskier district busier', () => {
    const count = (risk: 'low' | 'high') => [1, 2, 3, 4, 5].reduce((sum, seed) => sum + run(900, {}, seed, risk).length, 0);
    expect(count('high')).toBeGreaterThan(count('low') * 1.5);
    expect(AMBIENT_PACE.high.skyline[1]).toBeLessThan(AMBIENT_PACE.low.skyline[0]);
  });
  it('puts every fight, flak site and launcher outside the district', () => {
    for (let seed = 1; seed <= 20; seed++) for (const event of run(600, { night: 1 }, seed)) {
      if (event.kind === 'flyby') continue;
      expect(outside(event.at, bounds, AMBIENT_MARGIN - 1)).toBe(true);
    }
  });
  it('calls one in ahead when asked: the fight in front, the jets and rockets crossing the view', () => {
    const director = createAmbientDirector({ seed: 5, risk: 'low' }), facing = .6, ahead = { x: -Math.sin(facing), z: -Math.cos(facing) };
    const inFront = (p: { x: number; z: number }) => (p.x * ahead.x + p.z * ahead.z) / Math.hypot(p.x, p.z);
    for (let i = 0; i < 10; i++) {
      expect(inFront(director.force('skyline', view(0), facing).at)).toBeGreaterThan(.9);
      const pass = director.force('flyby', view(0), facing);
      expect(inFront(pass.at)).toBeGreaterThan(.99);
      expect(Math.abs(Math.cos(pass.heading - facing))).toBeLessThan(1e-9);
      const salvo = director.force('rockets', view(0), facing), top = rocketPose(salvo, { launch: 0, side: 0, apex: 300 }, 1600 / 230 / 2);
      expect(outside(salvo.at, bounds, AMBIENT_MARGIN - 1)).toBe(true);
      // Mid-flight it has come round in front, not behind.
      expect(top.x * ahead.x + top.z * ahead.z).toBeGreaterThan(200);
    }
  });
  it('lands searchlights outside the district', () => {
    for (const site of searchlightSites(bounds, 3, 6)) expect(outside(site, bounds, 80)).toBe(true);
  });
});

describe('placement', () => {
  it('measures the way out of the bounds', () => {
    expect(exitDistance({ x: 0, z: 0 }, 0, bounds)).toBeCloseTo(150);           // heading 0 is -z
    expect(exitDistance({ x: 0, z: 0 }, -Math.PI / 2, bounds)).toBeCloseTo(200); // heading -90° is +x
    expect(exitDistance({ x: 300, z: 0 }, 0, bounds)).toBe(0);
  });
  it('finds far points clear of the district within range', () => {
    const random = combatRandom(11);
    for (let i = 0; i < 50; i++) {
      const p = farPoint(random, { x: 150, z: 100 }, bounds, [280, 520]);
      expect(outside(p, bounds, AMBIENT_MARGIN - 1)).toBe(true);
      expect(Math.hypot(p.x - 150, p.z - 100)).toBeLessThanOrEqual(520 + 1e-6);
    }
  });
});

describe('set pieces', () => {
  const event = (kind: AmbientEvent['kind'], extra: Partial<AmbientEvent> = {}): AmbientEvent => ({ id: 1, kind, start: 0, duration: 40, seed: 99, at: { x: 400, y: 0, z: 0 }, heading: 0, ...extra });
  it('keeps a skyline fight around its centre and inside its time', () => {
    const { flashes, bursts } = skylineTimeline(event('skyline'));
    expect(flashes.length).toBeGreaterThan(15);
    expect(bursts.length).toBeGreaterThan(8);
    for (const f of flashes) { expect(Math.hypot(f.x - 400, f.z)).toBeLessThan(80); expect(f.time).toBeLessThan(40); }
  });
  it('puts some of a skyline fight above a downtown roofline', () => {
    const { bursts, flares } = skylineTimeline(event('skyline'));
    expect(bursts.some(b => b.arc > 40)).toBe(true);
    expect(flares.length).toBeGreaterThanOrEqual(2);
    for (const flare of flares) {
      expect(flarePose(flare, FLARE.rise).y).toBeCloseTo(flare.peak);
      expect(flarePose(flare, FLARE.rise).bright).toBe(1);
      expect(flarePose(flare, FLARE.life + .1).bright).toBe(0);
      expect(flarePose(flare, FLARE.life - .5).y).toBeGreaterThan(60);
    }
  });
  it('flies the pair across and hears the lead from where it was', () => {
    const pass = event('flyby', { at: { x: 0, y: 180, z: 50 }, duration: FLYBY.reach * 2 / FLYBY.speed + 2 });
    const middle = FLYBY.reach / FLYBY.speed, lead = flybyPose(pass, middle), wing = flybyPose(pass, middle, 1);
    expect(lead).toMatchObject({ x: expect.closeTo(0, 5), y: 180, z: expect.closeTo(50, 5), visible: true });
    expect(Math.hypot(wing.x - lead.x, wing.z - lead.z)).toBeGreaterThan(30);
    expect(flybyPose(pass, -1).visible).toBe(false);
    // Overhead, the roar still comes from back along the track.
    const listener = { x: 0, y: 0, z: 50 }, heard = flybyHeard(pass, middle, listener);
    expect(heard).toBeGreaterThan(180);
    expect(flybyHeard(pass, .1, listener)).toBe(Infinity);
  });
  it('arcs rockets up and away, burning only on the way up and over', () => {
    const salvo = event('rockets'), rockets = rocketTimeline(salvo);
    expect(rockets.length).toBeGreaterThanOrEqual(6);
    const top = rocketPose(salvo, rockets[0], rockets[0].launch + 1600 / 230 / 2);
    expect(top.y).toBeGreaterThan(180);
    expect(Math.abs(top.direction.y)).toBeLessThan(.05);
    expect(rocketPose(salvo, rockets[0], rockets[0].launch - .1).flying).toBe(false);
  });
  it('throws flak up into the sky from its guns', () => {
    const { rounds, aim } = flakTimeline(event('flak'));
    expect(rounds.length).toBeGreaterThan(60);
    expect(aim.y).toBeGreaterThan(200);
    for (const round of rounds.slice(0, 40)) {
      expect(round.direction.y).toBeGreaterThan(.6);
      expect(flakPose(round, round.flight).y).toBeGreaterThan(180);
    }
    expect(rounds.filter(r => r.lead).length).toBeGreaterThan(5);
  });
});

describe('far sound', () => {
  it('carries further than combat sound, quieter and fading', () => {
    expect(farGain(400)).toBeLessThan(farGain(200));
    expect(farGain(400)).toBeLessThan(farGain(200) / 2);
    expect(farGain(700)).toBeGreaterThan(0);
    expect(farGain(1600)).toBe(0);
  });
});

describe('shot down and warships', () => {
  const sea = COASTAL_SEA.sentosa!;
  it('sends warships only where there is sea', () => {
    expect(run(900, {}).some(e => e.kind === 'naval')).toBe(false);
    const naval = run(900, { sea }).filter(e => e.kind === 'naval');
    expect(naval.length).toBeGreaterThan(0);
    // The lane lies out past the edge on the sea side, and runs along the coast.
    for (const e of naval) {
      expect(e.at.z).toBeGreaterThan(bounds.maxZ + AMBIENT_MARGIN);
      expect(Math.abs(Math.sin(e.heading))).toBeCloseTo(1);
    }
    for (const [id, direction] of Object.entries(COASTAL_SEA)) expect(Math.hypot(direction!.x, direction!.z), id).toBeCloseTo(1, 1);
  });
  it('steams ships down the lane and fires only near its middle', () => {
    const director = createAmbientDirector({ seed: 4, risk: 'high' }), e = director.force('naval', view(0, { sea }));
    expect(shipPose(e, 0).visible).toBe(true);
    expect(Math.hypot(shipPose(e, NAVAL.lane / NAVAL.speed).x - e.at.x, shipPose(e, NAVAL.lane / NAVAL.speed).z - e.at.z)).toBeLessThan(1);
    expect(shipPose(e, e.duration + 1).visible).toBe(false);
    const shells = navalTimeline(e);
    expect(shells.length).toBeGreaterThan(5);
    for (const shell of shells) {
      const ship = shipPose(e, shell.time, shell.ship);
      expect(Math.hypot(ship.x - e.at.x, ship.z - e.at.z)).toBeLessThan(NAVAL.firing + NAVAL.consort.back + 80);
      // Fired down the coast, not over the district.
      expect(navalShellPose(e, shell, 2).z).toBeGreaterThan(bounds.maxZ);
    }
  });
  it('flies the jet in level, brings it down after the hit and crashes it outside the district', () => {
    for (let seed = 1; seed <= 15; seed++) {
      const director = createAmbientDirector({ seed, risk: 'medium' }), e = director.force('shootdown', view(0), seed % 2 ? .4 : undefined);
      const hit = shootdownHit();
      expect(outside(e.at, bounds, AMBIENT_MARGIN - 1)).toBe(true);
      expect(outside(e.from!, bounds, AMBIENT_MARGIN - 1)).toBe(true);
      expect(shootdownPose(e, hit - 1).phase).toBe('flying');
      expect(shootdownPose(e, hit - 1).y).toBeCloseTo(shootdownPose(e, hit - 3).y);
      const falling = shootdownPose(e, hit + SHOOTDOWN.fallTime / 2);
      expect(falling.phase).toBe('falling'); expect(falling.pitch).toBeLessThan(0);
      const down = shootdownPose(e, hit + SHOOTDOWN.fallTime);
      expect(Math.hypot(down.x - e.at.x, down.z - e.at.z)).toBeLessThan(1); expect(down.y).toBeCloseTo(0);
      // The missile meets it at the hit.
      const missile = missilePose(e, hit - 1e-6);
      expect(Math.hypot(missile.x - falling.x, missile.z - falling.z)).toBeLessThan(SHOOTDOWN.fall);
      expect(Math.hypot(missile.x - shootdownPose(e, hit).x, missile.y - shootdownPose(e, hit).y, missile.z - shootdownPose(e, hit).z)).toBeLessThan(1);
      // Falling away from whoever watches: the crash is further off than the hit.
      const at = shootdownPose(e, hit);
      expect(Math.hypot(e.at.x, e.at.z)).toBeGreaterThan(Math.hypot(at.x, at.z) - 1);
    }
  });
});
