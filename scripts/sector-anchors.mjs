// Fill proposed sectors with anchors that are provably clear and reachable.
//
// Hand-picking five hundred anchors across nineteen districts is not reliable:
// every one has to sit on ground clear at car width and connected to the spawn,
// and the scenes move. This takes the creative part — where a sector is and
// what it is called — as input, and does the mechanical part: it seeds anchors
// from the district's own stamps and encounter spawns where they fall inside a
// sector, then fills the rest by farthest-point sampling over the reachable
// set, so they spread instead of clustering. It also measures the cover band so
// the declared label is never a guess.
//
// Run: pnpm sector:anchors -- --proposals <file.json>
import { readFileSync } from 'node:fs';
import { register } from 'node:module';
register('./ts-extension-hook.mjs', import.meta.url);
const { getRegion } = await import('../src/game/regions.ts');
const { getWorldZone } = await import('../src/game/world-zones.ts');
const { coverMasses, measureCover, coverFor } = await import('../src/game/cover-metrics.ts');

const CAR = 1.35, LOOT = 0.65, STEP = 2;
const flag = name => { const at = process.argv.indexOf(`--${name}`); return at >= 0 ? process.argv[at + 1] : undefined; };
const proposals = JSON.parse(readFileSync(flag('proposals'), 'utf8'));
const inside = (p, b) => p.x >= b.minX && p.x <= b.maxX && p.z >= b.minZ && p.z <= b.maxZ;

const out = [];
for (const [id, sectors] of Object.entries(proposals)) {
  const region = getRegion(id), zone = getWorldZone(id), world = region.build();
  try {
    // Reachable set on the same lattice the region test flood-fills with.
    const queue = [{ x: region.spawn.x, z: region.spawn.z }], seen = new Set([`${region.spawn.x},${region.spawn.z}`]);
    for (let i = 0; i < queue.length; i++) {
      const p = queue[i];
      for (const [dx, dz] of [[STEP, 0], [-STEP, 0], [0, STEP], [0, -STEP]]) {
        const x = p.x + dx, z = p.z + dz, key = `${x},${z}`;
        if (seen.has(key) || !region.canOccupy(x, z, CAR, world.obstacles)) continue;
        const end = region.move(p, dx, dz, CAR, world.obstacles);
        if (Math.hypot(end.x - x, end.z - z) > 0.01) continue;
        seen.add(key); queue.push({ x, z });
      }
    }
    const usable = queue.filter(p => region.canOccupy(p.x, p.z, LOOT, world.obstacles));
    const masses = coverMasses(world.scene);
    const standable = (x, z) => region.canOccupy(x, z, 0.4, world.obstacles);
    const named = [...region.stamps.map(s => ({ x: s.x, z: s.z })), ...zone.encounterSpawns];

    const lines = [];
    for (const sector of sectors) {
      const b = sector.bounds;
      // Farthest-point sampling walks to the corners of a rectangle, which
      // across nineteen districts would put every crate on a sector's edge.
      // Fill anchors come from an inset pool; landmarks are exempt.
      const inset = { minX: b.minX + 8, maxX: b.maxX - 8, minZ: b.minZ + 8, maxZ: b.maxZ - 8 };
      const wide = usable.filter(p => inside(p, b));
      const pool = usable.filter(p => inside(p, inset)).length >= 4 ? usable.filter(p => inside(p, inset)) : wide;
      const want = sector.count ?? 5;
      // Landmarks first: a stamp or an encounter spawn is somewhere the district
      // already considers a place, and both are validated elsewhere.
      // A stamp and an encounter spawn can sit on the same coordinate, which
      // would emit the same anchor twice.
      const landmarks = [];
      for (const p of named) {
        if (!inside(p, b) || !wide.some(q => Math.hypot(q.x - p.x, q.z - p.z) < 3)) continue;
        if (landmarks.some(q => Math.hypot(q.x - p.x, q.z - p.z) < 6)) continue;
        landmarks.push(p);
      }
      const picked = landmarks.slice(0, 2);
      while (picked.length < want && pool.length) {
        // Farthest-point sampling: each new anchor is the one most distant from
        // those already chosen, which spreads them over the whole sector.
        let best = null, bestScore = -1;
        for (const p of pool) {
          const score = picked.length ? Math.min(...picked.map(q => Math.hypot(q.x - p.x, q.z - p.z))) : Math.hypot(p.x - b.minX, p.z - b.minZ);
          if (score > bestScore) { bestScore = score; best = p; }
        }
        if (!best || (picked.length && bestScore < 6)) break;
        picked.push(best);
      }
      const band = wide.length ? coverFor(b, masses.crouch, standable) : 'open';
      const m = measureCover(b, masses.crouch, standable);
      const anchors = picked.map(p => `{ x: ${p.x}, z: ${p.z} }`).join(', ');
      lines.push(`  { id: '${sector.id}', name: '${sector.name.replace(/'/g, "\\'")}', cover: '${band}', lootWeight: ${sector.lootWeight}` +
        `${sector.tierBias ? `, tierBias: ${sector.tierBias}` : ''}${sector.botWeight !== undefined ? `, botWeight: ${sector.botWeight}` : ''},\n` +
        `    bounds: { minX: ${b.minX}, maxX: ${b.maxX}, minZ: ${b.minZ}, maxZ: ${b.maxZ} },\n` +
        `    anchors: [${anchors}] },` +
        `${picked.length < 3 ? `   // WARNING only ${picked.length} anchors` : ''}` +
        `   // median ${m.median === Infinity ? 'none' : m.median.toFixed(1) + 'm'}`);
    }
    out.push(`// ${id}\n${lines.join('\n')}`);
  } finally { world.dispose(); }
}
console.log(out.join('\n\n'));
