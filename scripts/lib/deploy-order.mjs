// Which of two builds of `main` is the later one, so deploys cannot go backwards.
// A build is stamped with its depth: the number of commits on `main` up to and including the one it was
// built from. `main` is never rewritten (CLAUDE.md), so a greater depth is a later commit.

/** `{ depth, sha, dirty }` from whatever a site served at /deploy.json, or null when that is not a stamp. */
export function parseStamp(value) {
  if (!value || typeof value !== 'object' || !Number.isInteger(value.depth) || value.depth < 1 || typeof value.sha !== 'string' || !/^[0-9a-f]{7,40}$/.test(value.sha)) return null;
  return { depth: value.depth, sha: value.sha, dirty: value.dirty === true, ...(typeof value.builtAt === 'string' ? { builtAt: value.builtAt } : {}) };
}

/**
 * Whether to deploy `mine` over what is `live`. Stand down when the live build is from a later commit, or
 * is this very commit built from a clean tree: someone (a later run, a deploy by hand) already published
 * it. A site with no stamp, or a dirty build of this same commit, is deployed over. `force` always deploys.
 */
export function deployDecision(mine, live, force = false) {
  if (force) return { deploy: true, reason: 'forced' };
  if (!live) return { deploy: true, reason: 'the live site carries no deploy stamp' };
  if (live.depth > mine.depth) return { deploy: false, reason: `the live site is ahead: depth ${live.depth} (${live.sha.slice(0, 7)}) against this build's ${mine.depth} (${mine.sha.slice(0, 7)})` };
  if (live.depth === mine.depth && live.sha === mine.sha && !live.dirty && !mine.dirty) return { deploy: false, reason: `the live site is already this commit: depth ${mine.depth} (${mine.sha.slice(0, 7)})` };
  return { deploy: true, reason: live.depth === mine.depth ? `the live site is a different build at the same depth ${live.depth}` : `the live site is behind: depth ${live.depth} against this build's ${mine.depth}` };
}
