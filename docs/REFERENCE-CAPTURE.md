# District reference capture

The **Capture district references** Actions workflow supports all 19 registered
districts. Its legacy filename is `.github/workflows/capture-orchard.yml`.
It uses the existing `GOOGLE_MAPS_DEMO_API_KEY` repository secret and the existing
browser selection/capture scripts. No Static image allowance is increased.

## Inputs and triggers

- Manual **Run workflow** on `main`: select one `district`. There is no “all”.
- Push to `main`: only changed canonical `reconstruction/<district>-browser-plan.json`
  files are selected. Marina Bay retains `reconstruction/marina-browser-plan.json`.
- Other code, shared scripts, workflow edits, reference images, review manifests,
  and ledger edits do not trigger capture. Historical noncanonical batch-plan
  names are ignored by the selector even if GitHub starts a no-op workflow.
- A push changing two district plans processes only those two, sequentially.
- Each selected file must exist and its `region` must match its district filename.
  Supporting a district does not invent a capture plan or automatically photograph it.

Before calling Google, the job validates all selected plans, source coordinates,
cache fingerprints and checksums, review gates and per-plan screenshot limits.
A fully cached run does not start Chrome, load the Maps library, select panoramas,
install capture dependencies or require the Google secret.

## Efficient preview and review

Plans retain the existing schema: `name`, `region`, `width`, `height`,
`maxNewImages`, `sources` and `views`. Optional `captureMode` is `preview`
(default) or `full`.

1. Choose street relationships to study and write a bounded plan. For each source,
   place the most useful heading first in `views`.
2. Preview mode selects only the first view per source. Cached previews are reused;
   adding another source captures only its missing preview.
3. New source selection requires the intersection of Google-owned and outdoor collections,
   within 100 m. Older cached selections may still be indoors; nothing is silently
   reselected. Inspect every preview for the intended landmark and heading. On an accepted
   **source metadata file**, record `visualReview: { "status": "accepted", "notes": "..." }`.
   Keep rejected captures with explicit notes; do not approve them for exterior use.
4. Set `captureMode` to `full` in that district's plan when ready for remaining
   headings. Every source with a missing full-batch view must have an accepted
   source review; new/unreviewed sources fail before any API call.
5. Changing camera settings under an existing image ID is rejected. Use a new view
   ID. Changing requested coordinates needs a new source ID, preserving provenance.

`maxNewImages` limits missing screenshots in the selected mode, not the number
of existing files. It is checked before panorama selection. Preview and full modes
use the same original image IDs, so an accepted preview is not downloaded again.
Reports still mark newly captured images pending review; source approval does not
substitute for inspecting additional views.

## Outputs, persistence and failure recovery

Only selected districts' `reconstruction/<district>/references/` directories and
`reconstruction/api-usage.json` are staged for automatic commits to `main`.
Screenshots retain attribution. JSON manifests, galleries and reports accompany
them. A 30-day Actions artifact also preserves these outputs after partial failure.
No environment files, browser profiles or raw browser logs are uploaded.

The shared concurrency group serializes capture runs; each starts from current
`main` to reuse the latest committed cache and ledger. If unrelated work advances
`main` during capture, the push fails safely without force/rebase: recover the
artifact and reconcile the ledger before another capture. GitHub may replace an
older pending run when several pushes queue; manually select that district if needed.

**Re-run jobs** cannot make new capture requests. Start a new manual run after
previous results are committed/recovered. The guard remains conservative because
an interrupted attempt may have incurred calls before its output was persisted.

A one-time Orchard recovery step imports the successful run `36118178047` only
when Orchard is selected and its replacement cache is absent. It merges ledger
events by ID without resetting budgets. Once those references are committed the
step is skipped. Other districts never download the Orchard artifact.

The workflow builds reference evidence, not game geometry. A district remains
“authored” until its scene has actually been remodeled from reviewed references.
Sector boundaries, spawns, paths, minimaps and loot anchors require a separate
validated modelling pass; district loot distributions and prices remain intact.

The source filter follows the [Street View service documentation](https://developers.google.com/maps/documentation/javascript/reference/street-view-service). An outdoor match can still miss the target or show old conditions; record narrow acceptance scope and reject unsuitable images.
