import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { changiFlight, craneState, macaqueState, nightOf, punggolTrain, queenstownTrain, trackRun, travel, woodlandsShuttle, CHANGI_FLIGHTS, FLYER_TURN, MACAQUE, PUNGGOL_LRT, QUEENSTOWN_MRT, SET_PIECE_DISTRICTS, WOODLANDS_SHUTTLE } from './district-set-pieces';
import { getRegion } from './regions';
import { CHANGI_BOUNDS } from './changi-scene';

describe('timetables', () => {
  it('brings a train in, holds it at the stop, and takes it out without a jump', () => {
    const o = { reach: 250, speed: 16, accel: 1.2, dwell: 28, through: true }, run = trackRun(0, o);
    expect(trackRun(0, o).s).toBeCloseTo(-250);
    expect(trackRun(run.arrive + 1, o).s).toBe(0);
    expect(trackRun(run.leave, o).s).toBeCloseTo(250);
    for (let u = 0; u < run.leave; u += .05) expect(Math.abs(trackRun(u + .05, o).s - trackRun(u, o).s)).toBeLessThan(16 * .05 + 1e-6);
    expect(trackRun(run.leave - 1, { ...o, through: false }).s).toBeLessThan(-200);
  });
  it('moves from rest to rest', () => {
    const { total } = travel(0, 246, 12, 1);
    expect(travel(0, 246, 12, 1).s).toBe(0); expect(travel(total, 246, 12, 1).s).toBeCloseTo(246); expect(travel(total + 5, 246, 12, 1).s).toBeCloseTo(246);
    expect(travel(travel(0, 10, 12, 1).total / 2, 10, 12, 1).s).toBeCloseTo(5);
  });
  it('stops Queenstown trains at EW19, alternating direction', () => {
    const run = trackRun(0, { ...QUEENSTOWN_MRT, through: true });
    expect(queenstownTrain(run.arrive + 5).x).toBe(0);
    expect(Math.sign(queenstownTrain(2).x)).toBe(-Math.sign(queenstownTrain(QUEENSTOWN_MRT.period + 2).x));
    expect(queenstownTrain(run.leave + 1).visible).toBe(false);
  });
  it('keeps the LRT on its viaduct between the station and the end', () => {
    const { period } = punggolTrain(0);
    for (let t = 0; t < period * 2; t += .5) { const z = punggolTrain(t).z; expect(z).toBeLessThanOrEqual(PUNGGOL_LRT.station + 1e-6); expect(z).toBeGreaterThanOrEqual(PUNGGOL_LRT.end - 1e-6); }
    expect(punggolTrain(1).z).toBe(PUNGGOL_LRT.station);
  });
  it('keeps the Woodlands shuttle on the Causeway rail, never past the end of the line', () => {
    for (let t = 0; t < WOODLANDS_SHUTTLE.period; t += .5) expect(woodlandsShuttle(t).z).toBeLessThanOrEqual(WOODLANDS_SHUTTLE.stop + 1e-6);
    const run = trackRun(0, { ...WOODLANDS_SHUTTLE, through: false });
    expect(woodlandsShuttle(run.arrive + 10).z).toBe(WOODLANDS_SHUTTLE.stop);
    // Four 18.5 m cars stopped there end at the rail's southern end (-130).
    expect(WOODLANDS_SHUTTLE.stop + 2 * 18.5).toBeLessThanOrEqual(-130 + .1);
  });
  it('flies Changi traffic off the coast, arrivals and departures in turn', () => {
    for (let t = 0; t < CHANGI_FLIGHTS.period * 2; t += 1) { const f = changiFlight(t); expect(f.x).toBeGreaterThan(CHANGI_BOUNDS.maxX + 100); if (f.visible) expect(f.y).toBeGreaterThan(0); }
    expect(changiFlight(5).arriving).toBe(true); expect(changiFlight(CHANGI_FLIGHTS.period + 5).arriving).toBe(false);
  });
  it('moves one container at a time and never drops it', () => {
    const o = { a: 6, b: 34, lift: 28, dropA: 3, dropB: 5 }, cycle = craneState(0, o).cycle;
    let last = craneState(0, o);
    for (let u = 0; u < cycle * 2; u += .1) {
      const s = craneState(u, o);
      expect(s.hook).toBeGreaterThanOrEqual(Math.min(o.dropA, o.dropB) - 1e-6); expect(s.hook).toBeLessThanOrEqual(o.lift + 1e-6);
      // Picked up and set down only with the spreader down at that spot.
      if (s.carrying !== last.carrying) expect(Math.min(Math.abs(s.hook - o.dropA), Math.abs(s.hook - o.dropB))).toBeLessThan(.01);
      expect(Math.abs(s.x - last.x)).toBeLessThan(5);
      last = s;
    }
  });
  it('moves macaques between perches it knows', () => {
    for (let n = 0; n < MACAQUE.troop; n++) for (let t = 0; t < 300; t += 3) {
      const s = macaqueState(n, t, 6); expect(s.from).toBeGreaterThanOrEqual(0); expect(s.to).toBeLessThan(6); expect(s.f).toBeLessThanOrEqual(1);
    }
  });
  it('lights the night shows after dark only', () => {
    expect(nightOf(13)).toBe(0); expect(nightOf(22.5)).toBe(1); expect(nightOf(3)).toBe(1); expect(nightOf(undefined)).toBe(0);
  });
});

describe('in the built districts', () => {
  it('drives the Queenstown train and chimes its doors twice a stop', () => {
    const world = getRegion('queenstown').build();
    try {
      const train = world.scene.getObjectByName('queenstown-train')!, run = trackRun(0, { ...QUEENSTOWN_MRT, through: true });
      world.animate(run.arrive + 4); expect(train.position.x).toBe(0); expect(train.visible).toBe(true);
      expect(world.cues!(0, QUEENSTOWN_MRT.period).filter(c => c.kind === 'chime')).toHaveLength(2);
    } finally { world.dispose(); }
  });
  it('turns the Flyer and keeps its capsules level', () => {
    const world = getRegion('marina-bay').build();
    try {
      world.animate(FLYER_TURN / 4);
      const wheel = world.scene.getObjectByName('marina-flyer-wheel')!;
      expect(wheel.rotation.z).toBeCloseTo(Math.PI / 2);
      world.scene.updateMatrixWorld(true);
      const pods = wheel.children.filter(c => c.name === 'marina-flyer-capsule');
      expect(pods).toHaveLength(16);
      const level = new THREE.Quaternion();
      for (const pod of pods) expect(pod.getWorldQuaternion(new THREE.Quaternion()).angleTo(level)).toBeLessThan(1e-6);
    } finally { world.dispose(); }
  });
  it('keeps every set piece out of the way of shots and colliders', () => {
    for (const id of SET_PIECE_DISTRICTS) {
      const world = getRegion(id).build();
      try {
        const before = world.obstacles.length, root = world.scene.getObjectByName('district-set-pieces')!;
        expect(root.userData.fpsEffect).toBe(true);
        world.animate(37);
        const ray = new THREE.Raycaster(new THREE.Vector3(0, 200, 0), new THREE.Vector3(0, -1, 0));
        expect(ray.intersectObject(root, true)).toHaveLength(0);
        root.traverse(node => { if (node instanceof THREE.Mesh) expect(node.raycast.toString(), id).not.toContain('intersect'); });
        expect(world.obstacles.length, id).toBe(before);
      } finally { world.dispose(); }
    }
  });
});
