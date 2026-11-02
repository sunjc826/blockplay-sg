# Authored rail services

Queenstown, Yishun, Sentosa, Punggol and Woodlands use finite game railways.
These compressed terminal arrangements are authored scenery, not surveyed MRT,
LRT, monorail or cross-border service layouts. No new reference captures or
fidelity claims accompany this change.

`src/game/rail-routes.ts` defines the track corridor, complete train envelope,
station stops, acceleration and dwell times. Track decks and train animations
consume the same definitions. Every service remains visible, brakes to rest at
each stop, waits, and reverses at its terminal without resetting its position.
Queenstown and Sentosa serve their central station in both directions.

`src/game/rail-stations.ts` adds terminal platforms, shelter, signs and buffers.
Existing central station architecture remains; platforms leave the train lane
open. Woodlands has a continuous railway shoulder through a gap in its far-shore
skyline, with land and a small terminal building at its remote stop. Sentosa's
three cars are centred on the moving group, so its leading car cannot overrun
the beam. The Woodlands rail stamp sits on the dry shoulder beside the track.
Terminal scenery does not add ground-level movement blockers or make
trains boardable.

`rail-routes.test.ts` checks complete timetable cycles, stop/braking behavior,
continuous reversals, buffer clearance for the entire actual mesh, rendered
support beneath nose/centre/tail, and an open corridor through stations.
`district-set-pieces.test.ts` also checks the existing synchronized sound cues.
For visual review, start Vite and an isolated Chrome remote-debugging session,
then run `node scripts/rail-routes-smoke.mjs` with `FPS_APP_ORIGIN` and
`FPS_CHROME_ORIGIN` pointing at them (defaults: ports 5219 and 9379). It captures
twelve station views across all five districts in `.cache/rail-routes/`.
