# Map surface ownership and z-fighting audit

The November 2026 audit covers all 23 registered districts. The shared ground
normalization pass had put roads, kerbs, plazas and other caps at the same
heights without removing their overlapping triangles. Stair treads also extended
6 mm into landings. Coincident wall trim, roof ends and cylinder courses added
smaller conflicts. Sentosa's landing plaza and Changi's apron visibly reproduced
the ground flicker in the before renders.

## Surface ownership

`withGroundCover` retains the existing ground datum, then partitions rectangular
ground caps. Higher caps own their footprint; normalized ties retain authored
layering and prioritize smaller details. Lower tops are cut away, including tops
under thin paint. This prevents distant depth precision from revealing a second
surface underneath a cap. Existing grass/rain masks and movement heights remain
the source of gameplay support.

`withSurfaceOwnership` follows ground cover in the region registry. It partitions
coincident static polygons facing the principal axes, including actual triangles
from graded paving, cylinder caps and rotated roof ends. Smaller details own the
overlap with larger surfaces. UVs, normals and vertex colors are interpolated
from the original triangle. Unaffected triangles remain intact. Geometry variants
share instance draws while preserving their local transforms and material tags,
including per-building night windows. Empty instance batches leave the scene;
the original builders still own their disposal. Dense replacement meshes rebuild
their exact triangle raycast broadphase, so holes remain holes for shots.

Street-grid kerbs stop at cross streets. Stair treads retain their small internal
overlap to prevent cracks but stop exactly at the connection endpoints. Sentosa's
first pavilion dome course sits on its drum, and Changi's airliner stripe stays
inside its tail fin. These are geometry changes; no camera changes, polygon
offsets, material depth biases or floating floors were introduced.

## Reproduce the audit

```sh
pnpm audit:map-surfaces
pnpm audit:map-surfaces -- sentosa yishun changi --json
```

The offline audit builds the actual registered scenes, expands instances and
intersects coplanar projected triangle polygons. It tests only positive-area
overlaps between different materials. Short outward normal probes exclude
covered joins. Hidden groups, independently animated props, transparent/bias
materials and downward/below-ground joins are excluded. The detector checks
principal-axis planes, not arbitrary sloping surfaces. Its zero result is a
repeatable geometry check, not a claim that every possible visual artifact on
every renderer has been eliminated.

All 23 maps report zero exposed conflicts after the fix. Compact per-map counts
are in [the audit evidence](evidence/map-surface-audit.json). Counts are triangle
pair relationships, not independent bug locations. The baseline was the committed
source before this change, inspected with the same detector.

Local review evidence is under `.cache/map-surface-audit/`: full before/after
JSON, twelve baseline renders, fifty final renders (overview/street for every
district plus glancing views in Sentosa, Yishun, Changi and Queenstown), browser
reports and validation logs. Both render runs had no JavaScript errors or Google
requests. Night-window, ground/rain/vehicle support, actual mesh ownership and
batching regressions are covered by the relevant test suites.
