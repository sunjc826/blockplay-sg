// Shots-to-kill and time-to-kill for every purchasable weapon configuration.
//
// Formatting only: the analysis itself lives in src/game/armory-balance.ts, so
// this report and the balance guard test cannot disagree, and neither can drift
// from the catalog the game ships.
//
// Run: pnpm analyse:weapons          Machine-readable: pnpm analyse:weapons -- --json
import { register } from 'node:module';
register('./ts-extension-hook.mjs', import.meta.url);
const { analyseBreakpoints, deadBuys, unfeltInDrill, timeToKill, DRILL_POOLS, ANALYSIS_RANGES } =
  await import('../src/game/armory-balance.ts');

const rows = analyseBreakpoints();
if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ pools: DRILL_POOLS, ranges: ANALYSIS_RANGES, rows }, null, 2));
  process.exit(0);
}
const FAMILIES = ['SAR 21', 'Ultimax'];
const pad = (text, width) => String(text).padEnd(width);
for (const family of [0, 1]) {
  console.log(`\n${FAMILIES[family]}`);
  console.log('─'.repeat(96));
  for (const row of rows.filter(r => r.family === family)) {
    const band = row.band ? `full to ${row.band.near}m, ${Math.round(row.band.floor * 100)}% floor at ${row.band.far}m` : 'no falloff';
    console.log(`${pad(row.name, 22)} ${pad(row.tier, 7)} LV${pad(row.level, 3)} ${pad(row.price, 8)} ${pad(row.precision + 'x head', 10)} ${band}`);
    console.log(`  ${pad('range', 9)}${ANALYSIS_RANGES.map(r => pad(r + 'm', 9)).join('')}`);
    console.log(`  ${pad('body dmg', 9)}${row.ranges.map(r => pad(r.body, 9)).join('')}`);
    for (const [p, pool] of DRILL_POOLS.entries())
      console.log(`  ${pad(`${pool}hp`, 9)}${row.ranges.map(r => pad(`${r.stk[p]}·${timeToKill(r.stk[p], row.interval).toFixed(2)}s`, 9)).join('')}`);
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
console.log(`STK·TTK against ${DRILL_POOLS.join(' and ')} health. Drill targets sit 12.0-30.3 units out.`);
