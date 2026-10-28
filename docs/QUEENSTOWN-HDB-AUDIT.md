# Queenstown HDB audit and revision — 28 October 2026

The audit covers Queenstown's six older slab blocks and the ground collision of
its four modern podium/towers. Other districts are unchanged. The estate remains
a compressed, authored composite rather than a surveyed building model.

## Findings in the previous scene

1. The two northern blocks had their lower housing mass removed up to 11.4 m.
   Full-width community floor plates at 3.4 and 7.4 m, partitions and bridges
   across the courtyard made them read as an open institutional complex. Those
   heights also disagreed with the 2.8 m residential storey rhythm above.
2. Four straight, exposed stair flights ran 15 m beside the northern blocks.
   Their oversized landings and cross-court galleries supplied access without
   expressing a residential stair core.
3. The other four slabs had ground columns and a lift box, but lacked a complete
   registered void-deck ceiling and upper housing collision. Their recessed
   access galleries were mostly dark panels on a solid facade.
4. Ground column/lift obstacles omitted their heights, making them infinitely
   tall in the walking kernel. This could obstruct a gallery above an otherwise
   visually clear ground column. Several upper structural pieces had the inverse
   problem: a visible mesh without matching collision metadata.
5. Modern tower collision used the entire 32 × 29 m elevated podium footprint
   down to ground. The actual tower body is 25 × 22 m; the resulting invisible
   margins blocked passage beside it even under a clear overhang.

## Revised housing

All six slabs now share a Queenstown-specific structural definition in
`src/game/queenstown-housing.ts`. The same floor, wall, pier, shaft, beam,
parapet and stair definitions produce the meshes and collision metadata.

- Ground is an open void deck with a continuous soffit at 3.14 m, lower transverse
  beams, two rows of piers, a lift lobby/mailboxes, lighting and concrete seating.
  Passage crosses the block and runs along it around the lift shaft.
- Apartments begin above the deck. Access corridors occupy a real recess beside
  the apartment fronts, with individual doors/windows, structural posts and solid
  parapets. The first two corridors are playable at 3.4 and 6.2 m. Private flats
  remain solid; higher facade galleries are not implicitly walkable surfaces.
- Both ends of every slab have sheltered return stairs. Each 4.5 m flight reaches
  a turning landing before returning to the corridor. The lower cores have actual
  overhead slabs, side walls and ventilated openings; the stair-tower silhouette
  continues to the roof. The courtyard between the northern blocks is open again.
- Ground projections have finite heights. They agree with the piers, lift shafts
  and stair walls rather than extending through clear corridors above them.
- Modern towers retain their different podium form. Their ground body/piers and
  elevated podium slab now have separate, matching collision volumes.

Lifts and apartment doors are architectural details, not new interactive systems.
Street layout, district extent, stamp objectives and reference capture plans are
unchanged.

## Reference and visual review

Reused cached references, especially:

- `reconstruction/queenstown/references/estate-south.png`: void-deck column rhythm,
  recessed access galleries and pale/coral facade treatment.
- `reconstruction/queenstown/references/static-quality-cyan-gallery.jpg`: depth
  between the front parapet and the apartment doors/windows behind it.
- `reconstruction/queenstown/references/static-quality-modern-podium.jpg`: modern
  podium/tower form, distinct from an older open slab-block void deck.

These sources inform architectural vocabulary; the new stair positions, dimensions
and accessible corridor layouts are authored gameplay adaptations. No new source
images, external map requests or reference acceptance claims were added.

Before views are retained in `.cache/queenstown-hdb-before/`. Reproduce the new
player-height deck, lift, stair, corridor, courtyard and podium views with:

```sh
node scripts/review-verticality.mjs queenstown --details
```

The review uses the configured local Vite/Chrome origins and writes the gallery to
`.cache/verticality-review/index.html`. Only Queenstown is rebuilt for this review.

## Verification

`queenstown-housing.test.ts` exercises both infantry radii through all six decks,
both stair cores, both corridor levels and the full return route. It checks
ceiling/headroom, actual stair meshes, parapets, private flats, the former column
collision positions, modern-podium clearance and a walked bot route.

`scripts/queenstown-housing-smoke.mjs` drives ordinary WASD input through the real
FPS engine and the wider RegionGame walker. It crosses a void deck, ascends both
return-stair levels, walks a residential corridor and descends the same route;
the FPS check also compares the host actor's elevation. Run with HMR disabled
and keep browser capture/review runs separate so changing browser focus does not
pause the game.

Final local validation: all **1,605 tests across 165 files** pass, including all
19 districts' standing/stair/spawn diagnostics. Typecheck and production build
pass with the existing bundle-size advisory. Queenstown's 50 new review captures
report zero JavaScript errors and zero Google requests. The FPS/exploration
walkthrough passes, including the host actor's 6.2 m feet elevation upstairs.
The two initially timed-out checks passed separately and then in the full suite.

The concise local before/after gallery is
`.cache/queenstown-hdb-review/index.html`; the full capture list remains in
`.cache/verticality-review/report.json`. No other district was revised in this
follow-up, which is committed separately from unrelated work.
