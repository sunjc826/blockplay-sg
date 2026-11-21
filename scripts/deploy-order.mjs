// Keeps deploys in commit order (docs/CLOUDFLARE.md, "Deploy order").
//
//   node scripts/deploy-order.mjs stamp   writes dist/deploy.json for the commit being built
//   node scripts/deploy-order.mjs guard   exits 0 to go ahead, 78 to stand down because the live site is
//                                         already this commit or a later one
//
// DEPLOY_FORCE=1 deploys regardless. CLOUDFLARE_APP_ORIGIN is the site asked (default the public URL).
// In GitHub Actions `guard` also writes `skip=true|false` to the step's outputs and always exits 0.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { deployDecision, parseStamp } from './lib/deploy-order.mjs';

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
function mine() {
  if (git('rev-parse', '--is-shallow-repository') === 'true') throw new Error('This checkout is shallow, so its depth on main cannot be counted. Fetch the full history (blobs are not needed: `git fetch --unshallow --filter=blob:none`).');
  return { depth: Number(git('rev-list', '--count', 'HEAD')), sha: git('rev-parse', 'HEAD'), dirty: git('status', '--porcelain', '--untracked-files=no') !== '' };
}
async function live(origin) {
  try {
    const response = await fetch(`${origin}/deploy.json?at=${Date.now()}`, { headers: { accept: 'application/json', 'cache-control': 'no-cache' }, signal: AbortSignal.timeout(20000) });
    // A site from before stamps serves the app's HTML here; that is "no stamp", not an error.
    return response.ok ? parseStamp(await response.json().catch(() => null)) : null;
  } catch (error) { console.log(`Could not read ${origin}/deploy.json (${error.message}); treating the live site as unstamped.`); return null; }
}

const command = process.argv[2], origin = (process.env.CLOUDFLARE_APP_ORIGIN || 'https://blockplaysg.fun').replace(/\/$/, '');
if (command === 'stamp') {
  const stamp = { ...mine(), builtAt: new Date().toISOString() };
  fs.writeFileSync('dist/deploy.json', JSON.stringify(stamp) + '\n');
  console.log(`Stamped dist/deploy.json: depth ${stamp.depth}, ${stamp.sha.slice(0, 7)}${stamp.dirty ? ', uncommitted changes' : ''}`);
} else if (command === 'guard') {
  const decision = deployDecision(mine(), await live(origin), process.env.DEPLOY_FORCE === '1');
  console.log(`${decision.deploy ? 'Deploying' : 'Standing down'}: ${decision.reason}.`);
  if (process.env.GITHUB_OUTPUT) { fs.appendFileSync(process.env.GITHUB_OUTPUT, `skip=${!decision.deploy}\n`); if (!decision.deploy) console.log(`::notice::Not deploying: ${decision.reason}.`); }
  else if (!decision.deploy) { console.log('Set DEPLOY_FORCE=1 to deploy anyway.'); process.exit(78); }
} else { console.error('Usage: node scripts/deploy-order.mjs stamp|guard'); process.exit(2); }
