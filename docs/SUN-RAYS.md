# Screen-space god rays

Graphics → God rays offers Off, Low and High. The High graphics preset uses
Low rays; Ultra uses High rays; Balanced, Low and Battery saver leave them off.
Explicit saved choices survive preset migration.

The shafts follow the sun and use the world depth buffer, so tree foliage,
palm fronds and buildings interrupt the light. The light source is a small hot
disc with a wide dim halo (`SOURCE` in `src/game/sun-rays.ts`). Each pixel's
brightness is the share of that source it can see along its line to the sun,
squared for contrast, times a fixed falloff with distance from the sun
(`exp(-1.9 × screen heights)`). Anything crossing the disc or halo cuts beams
and gaps that run the length of the screen.

How far the light reaches depends on cover. A one-pixel pass measures the share
of the on-screen source that is open sky. With the sun in clear sky there are
no beams to show, so the pass adds only a small tight glow (35% strength,
`exp(-6 × screen heights)`) and leaves the sun to the sky and the lens flare;
a long glow there only read as a second, larger flare. As scenery hides 4% to
30% of the source the long falloff takes over. Beams are also hollowed out
within about 0.08 screen heights of the sun, where the flare already is. A sun
fully behind a building gives almost nothing.

Sun elevation and eased weather sunlight control intensity. A sun up to about
0.4 screens outside the image still throws shafts, dimming as its source leaves
the view. Surfaces within 10 m receive reduced scattering (none under 0.5 m) so
close scenery does not wash out.

After dark the moon throws the same shafts at half the sun's strength, in the
night key colour. They fade in as the moon takes over the key light (sun 4° to
10° below the horizon); the twilight in between has none. There is no moon disc
in the sky yet, so in open sky this reads as a soft glow where the moon is.

The effect skips
reduced effects/motion, thermal vision, active NVG and the overview map. Weapons,
scope images and HUD elements are drawn separately and remain crisp.
Lens-flare visibility accounts for the composited ray glow when checking sky
pixels, preserving both effects together and retaining weapon/world obstruction.
This reuses the ray texture in the existing 1×1 visibility pass; no extra pass
or render target is allocated. Run `node scripts/sun-rays-lens-smoke.mjs` for
the pixel regression (including bright sky, partial cover and quality changes).

This is screen-space scattering: it only knows the visible depth buffer and
cannot simulate shafts from off-screen objects or a sun behind the camera.
Opaque enclosures block the source mask; nearby surfaces receive less scattering.
Transparent objects that do not write depth are not full ray blockers.

## Rendering cost

The implementation reuses the main scene depth and makes three fullscreen draws
(a conservative sky mask, radial integration and a bounded final composite) plus
a one-pixel draw that measures how much of the source is covered.
It does not render scene geometry a second time. Low uses quarter-resolution
buffers and 32 integration samples; High uses half-resolution buffers and 48.
Both add two RGBA8 targets, approximately **0.99 MiB / 3.96 MiB at 1080p**,
excluding driver overhead. Targets are lazy, resized with resolution/quality,
reused between frames, and disposed with the post-processing pipeline.

The composite runs after tone mapping to preserve the separately cleared sky,
but before the weapon and HUD. When AO and bloom are already active, rays share
their scene target. Enabling rays with every other post effect off also requires
that HDR/depth scene target and output pass. Off or an out-of-view sun adds no
ray draw calls. Software renderers use the existing direct-render fallback.

### Measured on 9 November 2026

Chrome 156, WebGL2/ANGLE Metal, **Apple Paravirtual device**. Marina Bay at
1920 × 1080, sunny morning, fixed camera/time, AO and bloom enabled:

| God rays | Median total GPU render time | Difference from Off | Scene draws | Total draws |
| --- | ---: | ---: | ---: | ---: |
| Off | 2.599 ms | — | 1 | 299 |
| Low | 2.842 ms | +0.243 ms | 1 | 302 |
| High | 3.013 ms | +0.415 ms | 1 | 302 |

GPU timer queries covering only the three ray passes measured Low at
0.230 ms median / 0.451 ms p95 and High at 0.255 ms / 0.608 ms. Whole-frame
A/B measurements include scheduling and render-target overhead, so they need
not equal the isolated pass time. These are measurements of this test environment,
not universal FPS promises; GPU, resolution and competing workloads matter.

The benchmark warms each quality, collects 45 GPU samples per mode across
alternating blocks, discards disjoint timer results, and separately collects
60 ray-pass samples per quality. Resizing also covers 720p and a 780 × 1688
portrait drawing buffer. Browser CPU submission timing is recorded separately
and must not be presented as GPU duration.

### Shaping pass, 21 November 2026

The mask, march and near-surface fade were reworked for visibility (previously
a 0.32-screen soft blob averaged along the march, which gave a round haze adding
about 4% brightness half a screen from the sun). Pass count, buffers and sample
counts are unchanged. Same machine and method: isolated ray passes measured
0.149 ms median / 0.361 ms p95 on Low and 0.127 ms / 0.744 ms on High; the
whole-frame Marina A/B was within its run-to-run noise (+0.59 ms Low, +0.29 ms
High, with other workloads on the machine). `sun-rays.html` accepts `?time=`
for the district view and exposes `window.towardsSun(dx, dz)` to walk scenery
in front of the sun.

With the cover pass added the same day, isolated ray passes measured 0.242 ms
median / 0.411 ms p95 on Low and 0.177 ms / 0.585 ms on High.

Evidence: `.cache/sun-rays/results.json`, `gameplay-results.json`, and Off/Low/High,
Marina and real FPS settings screenshots in that directory. Run Vite and an
isolated hardware Chrome, then `node scripts/sun-rays-smoke.mjs` and
`node scripts/sun-rays-gameplay-smoke.mjs`; origins are configurable with
`FPS_APP_ORIGIN` and `FPS_CHROME_ORIGIN` (defaults 5257 / 9457).

Checks cover visible shafts, exact restoration when disabled, fully occluded
light, night/reduced/behind-camera gates, resizing, one scene render, actual
settings controls, and NVG/thermal suppression. Unit tests cover projection,
camera translation invariance, screen-edge fading and saved preset migration.

Technique reference: [NVIDIA GPU Gems 3, chapter 13: Volumetric Light Scattering
as a Post-Process](https://developer.nvidia.com/gpugems/gpugems3/part-ii-light-and-shadows/chapter-13-volumetric-light-scattering-post-process).
