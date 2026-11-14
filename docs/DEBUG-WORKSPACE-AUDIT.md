# Debug workspace UX audit — 11 November 2026

Scope: `/debug`, map and model discussions, district/tool navigation, equipment,
playtest entry points, cloud controls, keyboard/touch interaction and responsive
layout. This is an implementation audit with browser measurements, not a user
study. No paid map, voice or model requests were needed for the checks.

## Findings and changes

| Priority | Finding | Implemented response |
| --- | --- | --- |
| High | The default page was 2,860 px tall on a 900 px desktop viewport. Mode buttons began at y=2,227, beneath 23 district cards and the island map. | Replace the promotional layout with a viewport workspace. Tools appear first in a persistent rail; district selection sits above the working area. The full district search and island overview are optional disclosures. |
| High | On a 390×844 screen, the review map began at y=1,127 and the model at y=1,207. Both required scrolling before work could begin. | Compact header/actions; closed cloud setup; remove repeated workspace navigation from inside the review. The canvas is visible on entry. |
| High | Below 1,200 px, discussions dropped beneath the entire canvas, controls and instructions. Users lost spatial context moving between comments and content. | Keep a two-pane layout above 900 px. Smaller widths use explicit Map/Model and Discussion panels; placing/selecting a pin opens the relevant discussion. Panel switching retains the draft and camera. |
| High | Switching tools, districts, assets or threads could silently discard a draft. | Reuse the app's accessible confirmation dialog for unsent comments/replies. Stay preserves the draft; discard permits the requested navigation. Browser reload/leave gets the native unsaved-work guard. Posted threads keep the existing local/cloud guarantees. |
| Medium | Several independent mode booleans could represent contradictory selections; equipment was awkward to find. | One validated tool state controls the shell. Equipment is a first-class destination; gallery links are grouped under resources. |
| Medium | The selected district/model/tool could differ from the URL after a UI switch. | Update the URL on selection, clear obsolete thread/invite targets, preserve verification-board isolation, and retain explicit legacy review/model/room links. Optional browser preferences restore the last design workspace; game or Street View sessions do not auto-resume. |
| Medium | Long thread histories and game panels pushed navigation out of reach. | Scroll the discussion and playtest content locally while keeping shell navigation visible. Desktop reply controls stay at the bottom of their pane; mobile uses normal pane flow to accommodate the keyboard. Fit playtest viewport height to the available screen and retain existing fullscreen controls. |
| Medium | Export/import/brief and cloud onboarding had the same prominence as the primary commenting task. | Keep pin placement primary. Put transfer tools under Share & files. Sync status remains visible and opens the private connection controls; problems remain visible outside the disclosure. |
| Medium | A frequent user could not reclaim navigation space. | Focus workspace hides the rail on desktop and remembers the preference. Show tools stays available. Mobile has a compact Tools disclosure that closes after selection. |
| Medium | Touch placement could leave keyboard focus on the canvas after opening its editor. | Move focus after the discussion panel becomes visible and suppress the model canvas's competing compatibility click. Selected discussions receive focus without scrolling the page. |
| Medium | Narrow/short screens and keyboard users needed predictable escape paths. | Add a skip link, visible focus rings, labeled selectors, pressed/expanded states, Escape handling for Tools and Share & files, and focus containment/restoration for information dialogs. Keep typography and text inputs usable on touch devices. |
| Low | Help, legal links and design galleries competed with daily work. | Move them into a compact resources disclosure; preserve all content and destinations. |

## Measured result

Fresh browser contexts, same local build environment. Numbers are CSS pixels;
minor font/rendering differences may change them. Desktop: 1440×900. Mobile:
390×844. Measurements use the visible canvas bounds and document scroll height.

| View | Previous page height | New page height | Previous canvas top | New canvas top |
| --- | ---: | ---: | ---: | ---: |
| Desktop map review | 1,602 | 900 | 635 | 257 |
| Desktop model review | 1,497 | 900 | 708 | 296 |
| Mobile map review | 2,175 | 844 | 1,127 | 272 |
| Mobile model review | 2,243 | 844 | 1,207 | 315 |

There is no document-level scrolling in these views. The complete map/model and
its camera controls fit in the initial screen; long discussions scroll within
their own pane. Extra-long help, cloud forms and short landscape screens retain
local overflow, so content is reachable rather than clipped.

## Verification

- `scripts/debug-workspace-smoke.mjs`: default lightweight entry, visible canvas,
  page overflow, desktop focus mode, district search, URL/reload/model preference,
  mobile touch → composer focus, draft guard stay/discard, widths from 320 to
  1440 px, short landscape, walk/FPS/equipment/arena entry points.
- Existing map review and 37-model review browser smokes retain pin accuracy,
  saved camera, reload, replies, status transitions, import/export and stale-pin
  coverage. Cloud smoke covers two-browser replies and offline recovery in
  isolated verification boards. Tests interact through rendered controls/CDP.
- Automated workspace-state tests cover malformed preferences, explicit deep
  links, legacy room precedence, safe defaults and collection/test-board URLs.
- Evidence: ignored `.cache/debug-ux/` before/after screenshots and JSON metrics;
  final run logs archived under `.cache/debug-ux-final/`.

## Boundaries and follow-ups

- This is a shell/review redesign. Game HUDs, detailed equipment screens and
  gameplay logic retain their existing layouts and behavior; their extra controls
  scroll inside the work area. Real Street View network content and live LAN
  multiplayer were not exercised as part of this visual audit.
- Tool selection replaces the current debug URL, rather than adding a browser
  history entry per asset/district click. Browser Back retains the application's
  existing return-to-menu hierarchy. Copy thread links for precise review context.
- Unposted drafts are protected, not autosaved or synced. Closing/discarding a
  draft deliberately loses it. A future draft inbox could be added separately.
- No global single-letter shortcuts were added because those keys are gameplay
  controls. Standard keyboard navigation, native select typeahead and district
  search remain available. A command palette is a possible follow-up if the tool
  catalog grows.
- Headless Chrome touch/viewport checks do not replace testing a physical mobile
  keyboard or assistive technology. Verify those with daily use before claiming
  full accessibility conformance.

## Level review audit — 14 November 2026

Scope: the map side of the review workspace, read end to end and exercised in
headless Chrome on a software renderer. Not exercised: cloud sync against a
Worker, a physical phone, assistive technology.

| Priority | Finding | Response |
| --- | --- | --- |
| High | Comments could only be placed on the schematic, which draws roads, a few map rectangles and landmark dots. No building, deck, wall or floor is on it, and every pin defaulted to "Ground / unspecified". The seeded SkyPark note had to say in prose that the schematic cannot show vertical occlusion. | **3D layout** view of the built district with surface pins that store world X/Y/Z and the view they were placed from. See `docs/LEVEL-REVIEW.md`. |
| High | Nothing tied a pin to geometry. `mapRevision` fingerprints the schematic only, so a moved building never flagged a thread. | 3D pins are checked against the current build when the scene opens; a pin with no surface within 0.6 m is flagged in its thread. Schematic pins are unchanged. |
| Medium | The schematic had no mouse navigation: zoom and pan were buttons, arrow keys or two fingers only. | Wheel zooms about the cursor; dragging the background slides the map. |
| Medium | The AI brief carried X/Z and a typed floor label, so a reply could not tell which storey or face was meant. | The brief and CLI export include the height, the picked surface label and the saved view for 3D pins. |
| Low | In the model viewer the wheel does nothing while **Position pin** is active, because the pointer overlay covers the canvas. | Not changed. The 3D layout listens on the stage, so it zooms in both modes. |
| Low | Entering pin mode adds the **Position pin / Move view** bar, which shortens the canvas and shifts the picture about its centre (about 33 px at 1440×900). Pins stay correct; the jump is visual. | Not changed (shared with the model viewer). |
| Low | Pin numbers are positions in the district's thread list, so two browsers that have not synced can show different numbers for the same thread. Thread IDs, not numbers, are the reference. | Not changed. |

Verified: 17 unit tests for the camera, picking and file contract;
`scripts/district-review-smoke.mjs`; the existing level, model, gesture and
workspace smokes. Evidence in ignored `.cache/district-review/`.
