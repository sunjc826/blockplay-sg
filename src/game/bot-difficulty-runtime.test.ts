import * as THREE from 'three';
import { afterEach, expect, it, vi } from 'vitest';
import { createArenaRuntime } from './arena-runtime';
import { createSoloSession } from './lan-peer';
import { setBotDifficulty } from './bot-difficulty-setting';
import type { BotDifficulty } from './bot-difficulty';

afterEach(() => { vi.useRealTimers(); setBotDifficulty('normal'); });

function trial(role: 'solo' | 'host', difficulty: BotDifficulty, switchTo?: BotDifficulty) {
  vi.useFakeTimers(); setBotDifficulty(difficulty);
  const session = { ...createSoloSession('Target'), role };
  const runtime = createArenaRuntime({ scene: new THREE.Scene(), obstacles: [], session, botCount: 1, composition: 'assault',
    environment: { bounds: { minX: -300, maxX: 300, minZ: -300, maxZ: 300 }, spawns: [{ x: 0, z: 100 }],
      playerSpawn: { x: 0, z: 0 }, move: p => p, endless: true } });
  const input = { x: 0, y: 1.75, z: 0, yaw: 0, pitch: 0, weapon: 0, playing: true };
  const seen = new Set<number>(), shots: { time: number; x: number }[] = [];
  try {
    runtime.update(.025, input);
    if (role === 'solo') runtime.setHealthMultiplier(10);
    for (let tick = 0; tick < 480; tick++) {
      if (switchTo && tick === 280) setBotDifficulty(switchTo);
      vi.advanceTimersByTime(25);
      const frame = runtime.update(.025, input);
      for (const round of frame.snapshot?.rounds ?? []) {
        if (round.shooter !== 'bot-1' || seen.has(round.id)) continue;
        seen.add(round.id);
        const target = frame.self!;
        const aim = (target.x - round.origin.x) / (target.z - round.origin.z);
        shots.push({ time: frame.snapshot!.elapsed, x: round.direction.x / round.direction.z - aim });
      }
    }
    expect(shots.length).toBeGreaterThan(3);
    return shots;
  } finally { runtime.dispose(); session.close(); }
}

it('reads a changed solo difficulty without restarting the running match', () => {
  const easy = trial('solo', 'easy'), switched = trial('solo', 'easy', 'hard');
  expect(switched.filter(s => s.time < 7)).toEqual(easy.filter(s => s.time < 7));
  const mean = (shots: typeof easy) => {
    const settled = shots.filter(s => s.time > 10);
    expect(settled.length).toBeGreaterThan(2);
    return settled.reduce((n, s) => n + Math.abs(s.x), 0) / settled.length;
  };
  expect(mean(switched)).toBeLessThan(mean(easy) * .4);
});

it('keeps shared-match bot shots identical regardless of the host device preference', () => {
  expect(trial('host', 'easy')).toEqual(trial('host', 'hard'));
});
