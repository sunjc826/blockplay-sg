# Cached-reference refinement: Marina Bay, Raffles Place, Queenstown

These changes reuse existing Google reference files; no source selection, image request, API call or ledger change was made. Scenes remain compressed interpretations, not measured maps.

| District | Reviewed cached images | Implemented change |
| --- | --- | --- |
| Marina Bay | `marina-static-quality-esplanade-shell.jpg`, `marina-static-quality-esplanade-distant.jpg` | Folded triangular sunshade plates replace cone-shaped spikes. Glazed lower drums, pale cornices and mullions give the twin shells a grounded facade. Existing collision footprints retained. |
| Raffles Place | `static-quality-market-stalls.jpg`, `static-quality-market-gable.jpg`, `lau-pa-sat-expansion-0.png` | Market roof surfaces now meet their existing tile courses and fascia; previously those details floated about four model units above the roof. Raised ventilated ridge, metal supports and cap seams reproduce the roof hierarchy visible in the cached market views. Hall plan stays compressed and rectangular. |
| Queenstown | `station-east.png`, `static-quality-station-link.jpg` | Blue entrance/link sides gain recessed windows and sills, dark service doors, screened bays and hanging planting under the projecting louvers. These sit on the existing station blocks. |

The library-screen image was also inspected, but its metadata says the civic building identity is unverified. It was deliberately not used to redesign or relabel the library.

## Sector implications

Existing sector boundaries and anchors remain suitable because the changes preserve all building footprints. Marina Bay's `esplanade` cover label must change from `open` to `broken`: the new solid lower drums change measured cover to a 12.0 m median and 22.8 m p90. This is a geometry measurement, not a guessed label. Raffles Place and Queenstown retain their measured cover labels.

## Verification

All 13 dedicated Marina Bay, Raffles Place and Queenstown scene tests passed, checking road clearance, spawn/collectible reachability and batching limits. All 15 sector cases for these three districts passed, including anchors and measured cover. An earlier all-district run exceeded the default 5 s timeout by 77 ms on the Marina flood fill during concurrent work; the focused rerun used a 20 s timeout and that case completed in 2.76 s. TypeScript validation passed. Browser overview and landmark street screenshots were captured from the actual integrated scene registry and inspected for all three districts. The rendered Esplanade plates, market roof hierarchy and station detailing were visible. The review harness reported zero JavaScript exceptions and zero Google requests across all 19 districts. A distant-overview near-plane precision artifact was corrected in the review camera; street views use the game near/far planes and exposure. These checks do not establish survey accuracy or actual-device performance.
