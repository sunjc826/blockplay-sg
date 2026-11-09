# Optic glass surface references

The 10 November 2026 shape pass changes only the approved generic families.
Shapes describe the surface as seen from the player's eye, not the housing's
recess or the net optical power of a multi-element lens group. Curvature amounts
remain artistic approximations, not measured lens prescriptions.

| Family | Surface | Scope of the reference |
| --- | --- | --- |
| Conventional reflex combiners, including open and mini/offset dots | Concave towards the eye; existing geometry retained | [Aimpoint US4402605A](https://patents.google.com/patent/US4402605A/en) and [Analytik Jena US7916290B2](https://patents.google.com/patent/US7916290B2/en) describe a concave reflecting surface. This does not specify a separate protective window. |
| EOTech-style holographic windows | Flat | [EOTech's manufacturer explanation](https://www.eotechinc.com/pages/help-center-counterfeit-detection) explicitly distinguishes flat, anti-reflection-coated HWS optics from curved reflex imitations. |
| Generic prism eyepieces | Convex towards the eye | [Trijicon EP3270090A1](https://patents.google.com/patent/EP3270090A1/en) describes a prism system with a biconvex eyepiece. Our fictional prisms are not replicas of a particular Trijicon product. |
| Generic telescopic eyepieces | Convex towards the eye | [Asia Optical US20070188867A1](https://patents.google.com/patent/US20070188867A1/en) describes conventional biconvex outer eye-lens construction. This is an adopted reference, not a measured prescription for our depicted weapons. |

Convex choices apply to the fictional SAR match scope (`optic: precision`),
fitted prism and pistol scopes, XM8 Sharpshooter, Smart Power, Intervention,
SCAR-H and Consensus Builder. Open telescope backing glass follows the convex
eyepiece too. The existing 1.4 mm coating sag magnitude is retained.

The SAR integrated variants, G36 carry-handle telescope, XM8 ISM and OICW/QTS
modules retain their existing surfaces because their exposed surfaces have not
been verified. No protective windows are added to enclosed red dots. Unknown
future built-in telescope types retain the legacy geometry unless explicitly
included in the approved list.

Positive `createOpticGlass` curvature means concave, negative means convex, and
zero means flat. Both telescope shapes stay entirely on the eye side of their
mounting plane, preventing opaque model end caps from clipping the reflection.
Reflected directions still come from the surface normals; no texture-axis flip
is used. Reflection opacity, coating colors, reticles and aiming magnification
are unchanged by this pass.
