# Holographic reticle appearance

The fitted holographic sights use an EOTECH-style single-dot pattern. This is
a visual approximation for a monitor, not a complete optical simulation.

| Physical property | Rendering |
| --- | --- |
| A 68 MOA ring, 1 MOA center dot and four quadrant ticks | Preserved angular dimensions; soft antialiased strokes and a tiny, saturated red dot. |
| A distant virtual image rather than markings painted on the window | Eye translation moves the aperture around the reticle. Removed the hologram's artificial edge pinning and off-axis fade. The window can reveal only part of the ring. |
| Fine granular appearance from the illuminated hologram | Stable, smoothly interpolated angular texture. Unresolved grain fades to its average brightness to reduce shimmer. |
| Illumination can appear fuzzy when too bright or viewed with the wrong focus | Restrained scatter follows the ring, ticks and dot. Removed broad center haze and the orange hot center. This represents a target-focused view at a moderate brightness. |
| Apparent angular size stays steady as eye relief changes | Ring size comes from the eye ray, independently of window UVs and eye distance. Camera zoom increases its pixel size. |

At 800 pixels high and a 65° world field of view, 68 MOA spans approximately
12.4 pixels. A 1 MOA dot is only about 0.18 pixels, so the renderer deliberately
uses a small pixel-sized footprint for readability. Laser grain is mostly
unresolved at this scale; it becomes visible in a zoomed inspection. The
existing conversion compensates for the 54° weapon-camera field of view.

Real HWS optics minimize parallax at a finite focus distance. The game uses
infinite collimation and does not model residual near-range parallax, pupil
diffraction, accommodation, individual eyesight or a brightness dial. The glow
and pixel floor are display choices rather than measured photometry. LED reflex
dots retain their existing appearance and raise behavior.

Sources: [EOTECH reticle index](https://www.eotechinc.com/pages/hws-reticle-index),
[HWS technology](https://www.eotechinc.com/pages/eotech-holographic-sights-learn),
[558 operator's manual, reticle troubleshooting](https://www.eotechinc.com/media/documents/operator_manuals/EOTECH_HWS_Manual_558_N1981_RevC.pdf),
[parallax guidance](https://www.eotechinc.com/pages/help-center).

Verification: `node scripts/fps-holo-reticle-smoke.mjs` with Vite on port 5175
and an isolated Chrome debugging endpoint on port 9228 (override with
`FPS_APP_ORIGIN` / `FPS_CHROME_ORIGIN`). It measures actual WebGL pixels for
angular size, center visibility, lateral and vertical eye translation, eye
relief, aperture clipping, repeat-frame stability, camera zoom and high DPI,
and checks browser/shader errors. Captures go to `.cache/holo-reticle/`.
The existing `weapon-optics` and `weapon-accessories` tests cover fitting,
geometry, disposal and the unchanged LED reflex path.
