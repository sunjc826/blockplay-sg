# Streamer desk cameras

**Cam on / Cam off** on the streamer chip controls the picture in both menus and games. A saved choice follows the viewer between sessions. The first-use default is on at 760 × 520 CSS pixels and larger. The panel belongs to the current fullscreen element. It measures the actual HUD, caption, poll and pending click target and tries corners and edges, reducing its size if needed. It yields when there is no clear rectangle. All pointer input passes through it.

## The cast

The pro has a teal team jersey with a chevron, tidy fringe, narrow headset and an unusually square workspace. His angled keyboard leaves the black mat free for forearm sweeps. Behind him are a split-unit air-conditioner, trophies, a medal, foam tiles and the illuminated windows of another HDB block.

The rager leans forward in a singlet and gold chain under a crooked headset. Pink and blue strips light the grilles, laundry, bed, bolster and peeling poster in his bedroom. His other audience is a wall fan. His RGB desk has instant noodles and a fork, a bagged drink and straw, tissues, a can and a face-down phone.

The comic has come straight from work, shirt and lanyard still on. He sits back from the screen. His study corner has laundry, a calendar, a standing fan and a reservist duffel and cap. His laptop stand shares the desk with a monitor, kopitiam mug, tart tin, sticky notes and plant. The faces use the same faceted loft primitive as the game's characters. The seated rigs have separate brows, eyes, pupils, mouths and articulated fingers.

## What drives each performance

| Signal | Pro gamer | Try-hard rager | Stand-up comedian |
| --- | --- | --- | --- |
| Elimination | Nod | Push back, arms up, point for a clip, or point at the monitor | Oversized celebration or appeal for a clip |
| Streak | Small smile | Triumph or clip | Clip or triumph |
| Sharp health loss | Lean closer | Point or shake head. Above 0.62 tilt, thump or protest | Flinch and duck |
| Incoming fire | Focus | Shake head | Flinch, including when interrupted mid-sip |
| New contact | Focus | Lean in | Peek at the monitor |
| Cross 35% health | Lean in, retain a slight forward posture while low | Both hands up or head shake | Cover eyes |
| Death | Look down and exhale | Shake head or point. At 0.48 tilt, thump or protest. At 0.78, slam, throw the headset or thump | Slide below the desk and climb back, alternating with an exhale |
| Respawn | Refocus | Lean in | Peek |
| Round won / lost | Roll shoulder | Clip or celebrate / throw up hands or shake head | Celebrate or shrug / shrug |
| District arrival | Glance up | Nod | Glance up |
| Vehicle entry | Focus | Lean in | Peek |
| Completed purchase | Nod | Smile | Shrug |
| Poll result appears | Glance at chat | Point | Shrug |
| Viewer votes | Nod | Smile | Nod |
| Pause / resume | Exhale / refocus | Exhale / lean in | Exhale / peek |
| Chat address | Brief glance, nine-second cooldown | Point, eight-second cooldown | Shrug or glance, four-second cooldown |
| Quiet play | Stay at the controls | Stay at the controls | Reach for the mug after 18 quiet seconds, with a 25-second sip cooldown |

The threshold for sharp damage comes from the cast's existing two-second HUD history. The camera also reads elimination counters, streaks, health, incoming fire, vehicles and match results. The visible voting window holds the gaze on chat. A spoken or captioned line that mentions chat can prompt a glance. The comic treats each line as an address to his audience.

The rules live in `src/game/facecam/acting.ts`. Add a row with a signal, ordered reaction choices, cooldown in seconds and optional minimum tilt. Put higher thresholds first. The first matching row wins. Choices rotate, and consecutive large reactions must differ. Death and round results take precedence over smaller events. A thrown headset stays off. Existing gestures can be reassigned entirely in this table. A new gesture also needs a duration and a pose in `scene.ts`.

Rager tilt ranges from zero to one. An isolated death adds 0.30. Another death within 22 seconds adds 0.40. Sharp damage adds 0.16, an elimination subtracts 0.27 and each elapsed second subtracts 0.009. The live director uses a monotonic clock, so a slow frame does not postpone cooldowns. Only a visible thump, slam, headset throw or chair slide queues a physical event. The next play turn receives it in its existing events list. A menu turn can receive the latest moment in its bounded note. The only image capture remains the game canvas.

## Hands and voice

The observer receives the normalized pilot action beside the engine's call to `look`. It accumulates each delta once, in the player's coordinate system. Turning right moves the mouse towards the player's right, which appears on the viewer's left. Looking up pushes it away from the chair. The pro travels 0.0017 scene units per delta, the rager 0.0010 and the comic 0.00125. The pro smooths his forearm sweep, the rager catches up sharply and the comic trails behind. Running out of mat produces a short lift, a return to the middle and a set-down.

The other hand rests over WASD. Forward reaches out, backing up brings the middle finger back to S and strafes press separate fingers. Shift, C, space, R, the carried weapon's number and F have separate reaches. Fire and aim depress the two mouse buttons independently. In a menu the camera samples the position of the visible, easing cursor. The actual click callback depresses the button. A gesture can take the hands off the controls. Mouse travel waits for their return.

An analyser taps the playing line's compressor on demand. Both the streaming worklet and buffered playback use this output. Its time-domain RMS controls mouth opening and drops to zero in silence. With voice off, two speech rhythms run for the current caption. Hiding the panel disconnects the analyser.

## The desk

`desk.ts` advances a seeded simulation at 120 fixed steps per second. Props have mass, linear velocity, one tipping/rolling axis, restitution and friction. The vertical support distance changes with rotation. Descending props meet the desktop or floor, and props exchange normal impulses on contact. Broad box extents approximate contact, with a radial rejection for upright cylinders. Keycap bodies are allocated on impact, three per slam until the 18 detachable keys are gone. The total cap is 32 bodies.

A fist gives a local impulse. A keyboard slam gives a stronger one and twists the noodle cup. The monitor can rock, a drink can roll off, and a key can stay on the floor. After a slam the rager looks down, lifts and squares the keyboard and nudges a reachable loose cap aside. The desk survives menu changes, hiding and fullscreen transitions. A new session gets a fresh desk. Reduced motion softens the gesture and impulse, stops the fan animation and removes camera shake. Bodies still settle. Liquids, cloth, articulated debris and room-wall collisions are outside this simulation.

## Rendering and measurement

The facecam uses its own 320 × 240 WebGL canvas. Menus can display it before an FPS renderer exists. During play it draws after the game's finished frame and screenshot capture, with no readback, game render-target switch or post-processing changes. The persistent game renderer and shader warm-up retain their existing lifetimes. Each room has one merged static draw and three instanced draws for the actor and props, with two lights and no shadow pass.

The cap is 24 Hz and the update budget is 2 ms of main-thread time. An expensive update delays the next one. The scheduler skips a game frame when its interval exceeds 1.45 times the frame budget or when the game has already spent 68% of that budget. Menus use a cancellable animation-frame callback. Hiding or stopping releases the GPU context, geometry, materials, listeners and playback tap. The service worker loads the optional JS and CSS on first use.

The fixture's **Measure cost** button measures five seconds of a single desk after its initial render. It reports mean main-thread update and render-submission time and the same cost spread over all display opportunities. The active streamer's canvas also exposes `facecamTimings` in DevTools. For a gameplay sample, subtract the counters at the start from those at the end. Divide the change in `cpuMs` by the change in `frames` for cost per facecam update, or by the change in `opportunities` for the contribution per actual game frame. The first update is recorded separately in `firstMs`. These counters exclude asynchronous GPU execution and browser compositing.

On the development VM, headless Chromium with SwiftShader gave the following five-second samples after the initial draw. Each sample displayed one desk.

| Persona | Updates / display frames | Mean CPU time per update | Mean CPU time per display frame |
| --- | ---: | ---: | ---: |
| Pro | 99 / 297 | 0.240 ms | 0.079 ms |
| Rager | 98 / 295 | 0.253 ms | 0.083 ms |
| Comic | 99 / 297 | 0.232 ms | 0.076 ms |

In an eight-second tutorial with the local pilot, a 30 fps cap, reduced effects and a 360 × 210 game canvas at half resolution, the rager rendered 115 times across 233 game frames. Six frames were skipped for pressure. Facecam updates took 11.4 ms in total, averaging **0.099 ms per update and 0.049 ms per game frame**. In a full production Marina Bay training run at 1280 × 720, software rendering was slow enough that the camera held its last picture across all 19 game frames in a six-second sample. The cold first draw in that run took 5.5 ms. SwiftShader did not expose a GPU timer, so these figures describe CPU work on this VM.

## Fixture

With the repository's Vite dev server running, open `/scripts/fixtures/streamer-facecam.html?persona=all`. The fixture runs locally and makes no cast or voice requests.

| Parameter | Effect |
| --- | --- |
| `persona=all`, `pro`, `rager`, `comic-streamer` | Compare the desks or enlarge one view |
| `reaction=slam`, `slide`, `sip`, `clip`, etc. | Play any gesture in the reaction selector |
| `tilt=0.9` | Set initial tilt from 0 to 1 |
| `inputs=all` or `inputs=right,left,up,walk,strafe,fire,reload` | One second per named input at 10 Hz. Also accepts `down`, `back`, `aim`, `sprint`, `crouch`, `jump`, `weapon` and `supply` |
| `slam=1` | Start a rager slam. **Slam again** keeps the same desk and seed stream |
| `seed=27` | Repeat the same sequence of impulses |
| `at=1.38` | Advance to a deterministic frame and pause. **Step 100 ms** advances three simulation frames |
| `talk=1`, `reduced=1` | Preview caption speech or reduced motion |
| `bench=1` | Run the timing sample for a single selected persona |

Try `?persona=rager&reaction=slam&tilt=1&at=1.38` for the airborne desk, `?persona=comic-streamer&reaction=slide&at=1.2` for the empty chair, and `?persona=pro&inputs=right,left,up,walk,strafe,fire,reload` for control direction.
