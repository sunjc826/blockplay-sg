// Shots-to-kill and time-to-kill for every purchasable weapon configuration.
//
// Formatting only: the analysis itself lives in src/game/armory-balance.ts, so
// this report and the balance guard test cannot disagree, and neither can drift
// from the catalog the game ships.
//
// Run: pnpm analyse:weapons          Machine-readable: pnpm analyse:weapons -- --json
import { register } from 'node:module';
register('./ts-extension-hook.mjs', import.meta.url);
const { analyseBreakpoints, deadBuys, unfeltInDrill, timeToKill, DRILL_OPPONENTS, namedOpponents, plateOpponent, ANALYSIS_RANGES } =
  await import('../src/game/armory-balance.ts');

const flag = name => {
  const at = process.argv.indexOf(`--${name}`);
  return at >= 0 ? process.argv[at + 1] : undefined;
};
if (process.argv.includes('--list-opponents')) {
  for (const foe of namedOpponents()) console.log(`${foe.id.padEnd(16)} ${String(foe.health).padStart(4)}hp ${String(foe.armor).padStart(4)}ap ${Math.round(foe.absorption * 100)}% absorption  ${foe.name}`);
  process.exit(0);
}

// A hypothetical opponent: either one of the named ones, or a plate and health
// pool of your choosing. Armor is stepped through the engine's own model, so
// absorption and the moment the plates break are accounted for.
let opponents = DRILL_OPPONENTS;
const chosen = flag('opponent'), plate = flag('plate'), health = Number(flag('health'));
if (chosen) {
  const found = namedOpponents().filter(foe => foe.id === chosen);
  if (!found.length) { console.error(`Unknown opponent "${chosen}". Try --list-opponents.`); process.exit(1); }
  opponents = found;
} else if (plate) {
  const built = plateOpponent(plate, Number.isFinite(health) && health > 0 ? health : 100);
  if (!built) { console.error(`Unknown plate "${plate}". Try --list-opponents.`); process.exit(1); }
  opponents = [built];
} else if (Number.isFinite(health) && health > 0) {
  opponents = [{ id: 'custom', name: `${health}hp unarmored`, health, armor: 0, absorption: 0 }];
}
const fine = process.argv.includes('--fine');
const ranges = fine ? Array.from({ length: 25 }, (_, i) => 5 + i * 5) : ANALYSIS_RANGES;
const rows = analyseBreakpoints(opponents, ranges);
if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ opponents, ranges, rows }, null, 2));
  process.exit(0);
}
console.log(`Against: ${opponents.map(foe => foe.name).join(', ')}`);
const FAMILIES = ['SAR 21', 'Ultimax'];
const pad = (text, width) => String(text).padEnd(width);
for (const family of [0, 1]) {
  console.log(`\n${FAMILIES[family]}`);
  console.log('─'.repeat(96));
  for (const row of rows.filter(r => r.family === family)) {
    const band = row.band ? `full to ${row.band.near}m, ${Math.round(row.band.floor * 100)}% floor at ${row.band.far}m` : 'no falloff';
    const gate = row.tokensToUnlock ? `LV${row.level} (+${row.tokensToUnlock}TK)` : `LV${row.level}`;
    console.log(`${pad(row.name, 22)} ${pad(row.tier, 7)} ${pad(gate, 14)} ${pad(row.price, 8)} ${pad(row.precision + 'x head', 10)} ${band}`);
    console.log(`  ${pad('range', 9)}${ranges.map(r => pad(r + 'm', 9)).join('')}`);
    console.log(`  ${pad('body dmg', 9)}${row.ranges.map(r => pad(r.body, 9)).join('')}`);
    for (const [p, foe] of opponents.entries())
      console.log(`  ${pad(foe.id.slice(0, 9), 9)}${row.ranges.map(r => pad(`${r.stk[p]}·${timeToKill(r.stk[p], row.interval).toFixed(2)}s`, 9)).join('')}`);
    console.log(`  ${pad('head STK', 9)}${row.ranges.map(r => pad(r.headStk.join('/'), 9)).join('')}`);
    if (row.gains === null) console.log('  baseline for this platform');
    else if (!row.gains.length) console.log(`  DEAD BUY: removes no shot at any range versus ${row.previous}`);
    else {
      console.log(`  felt vs ${row.previous}: ${row.gains.join(', ')}`);
      console.log(row.drillGains.length
        ? `  felt in the drill at ${row.drillGains.map(r => r + 'm').join(', ')}`
        : `  UNFELT IN THE DRILL: identical to ${row.previous} at 12-30m, where most play happens`);
    }
    console.log('');
  }
}
const dead = deadBuys(rows), unfelt = unfeltInDrill(rows);
console.log('─'.repeat(96));
console.log(dead.length ? `${dead.length} dead buy(s): ${dead.join(', ')}` : 'Every paid tier removes a shot at some range.');
console.log(unfelt.length ? `${unfelt.length} tier(s) unfelt inside the drill: ${unfelt.join(', ')}` : 'Every paid tier is felt inside the drill.');
console.log(`STK·TTK against ${opponents.map(f => f.name).join(', ')}. Drill targets sit 12.0-30.3 units out.`);
console.log('Flags: --opponent <id> | --plate <id> [--health N] | --health N | --fine | --json | --list-opponents');
