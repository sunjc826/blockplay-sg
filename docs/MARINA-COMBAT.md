# Marina Bay garden combat pilot

Marina's southern promenade, garden court and civic approach form a concentrated
infantry battle inside the larger explorable landmark district. The pilot keeps
the bay, SkyPark, ArtScience Museum, Flyer, gardens, three road circuits, border
connections and fourteen collectibles in place.

The combat area is 290 × 132 game metres (`x=-115…175`, `z=54…186`). Two staging
posts face three nearby forward objectives: Garden court, Civic approach and
Bayfront supply court. The deployment shortlist, regular reinforcement anchors,
patrol area and reinforcement heat sector use this pocket. Loot and landmark
exploration retain the district's geographical sectors; the rest of the map is
still accessible. The default population remains 32, with 48 and 64 available.

Broad southern lawns become paved garden courts with four open pavilions, two
service kiosks, tall planted masonry screens and low firing cover. Screens block
rendered sight and bullets; low walls protect a crouching soldier while allowing
standing fire. Pavilion passages, five north/south approaches and vehicle roads
remain open. The additions are authored gameplay landscaping, with no claim of
new photographic reference provenance.

`marina-combat.ts` holds the layout and battle anchors. `district-world.ts`,
`facility-sites.ts` and `expedition-deployment.ts` consume them. Facilities opt
into `combatFocus: primary | secondary`; unmarked districts retain their existing
allocation. Marked courts allow multiple squads to converge, with at most one
patrol/guard squad and a 20% living-force budget while fronts remain. Once one
side holds the courts, its attack squads hold those forward positions rather
than switching to the opposing staging camp. This preserves a place for the
other side to regroup. Camps remain ordinary damageable/capturable facilities;
this is AI assignment policy, not an invulnerability rule.

## Exploratory simulation

The task-local experiment is in `.cache/marina-combat/`. It is deliberately not
a permanent telemetry API or a shipped analytics dependency. `simulate.mjs`
uses a Vite server-side module transform to observe accepted AI shots and bullet
hits without adding hooks to production code. `scripts/lib/battlefield-scenario.ts`
supplies the actual scene, rendered sight/shot cover, movement, facilities and AI.

The final comparison freezes committed main plus the Marina changes, so both
layouts share the same weapons and runtime even while unrelated workspace work
continues. Seven saved original layout/allocation modules restore the baseline.
`experiment-source.json` records source hashes. Three seeds (92371, 18041, 75013)
run for 180 simulated seconds each at 32 and 64 bots, using 0.05-second steps and
one-second population samples.

Measurements distinguish:

- Average living dismounted regular infantry in each 25 × 25 m cell and named
  region, separately for both factions. Cell area includes any water/buildings.
- Actual firing positions and intended target positions, separately. A target
  position is not a confirmed hit.
- Shot-weighted engagement distance, bullet-hit distance from the original
  firing position, and actor-pair episode-weighted distances.
- First contact, local contact within 75 m of entry, quiet intervals, infantry
  survival and sampled positions over time.
- An actor-pair episode split after five seconds without targeted fire; reciprocal
  episodes require both sides to shoot. Many such pairs can belong to one battle.

These are idle-observer simulations, not active-player playtests. Vehicle
weapons, hazards and temporary event crews are excluded from infantry-fire
statistics. The live six-millisecond navigation budget is retained, so the
seeds do not guarantee identical runs under different CPU load. Three-minute
samples can reveal pacing problems but cannot certify sustained match balance.

`report.py` produces density/firing maps, distance/survival plots, comparison
CSV/JSON and a local timeline explorer (`report.html`). Experimental iterations
are retained separately, including the version that exposed late lulls after
one side overwhelmed the opposing command post.

## Validation

The focused tests verify actual solid sight/shot blockers, firing over low
cover, pavilion passages, north/south routes, deployment locality, converging
squad assignments and staging-camp preservation. Existing suites cover road
circuits, all collectible reachability, sector anchors, objective camp placement,
render batching, range sightlines and checkpoints. Browser checks exercise the
real FPS engine at 32 and 64 troops and inspect the garden at ground level and
from above. No new paid reference or audio requests are required by this pass.
