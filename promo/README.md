# Instagram promo assets

Self-contained tooling for the blockplaySG reel, carousel and captions. It has its own `package.json` so the game's dependencies stay untouched.

```sh
cd promo
pnpm install                # Playwright and a fallback ffmpeg binary
pnpm run browser            # downloads Playwright's Chromium once

node capture.mjs            # dev server boots itself; writes clips/*.webm and shots/*.png
node capture.mjs --stills   # stills only, quick way to tune the keyframes at the top of the file
node encik.mjs              # records range/arena takes and adds existing Encik audio
node assemble.mjs           # cuts render/blockplay-reel.mp4 from encik.mp4 plus the three clips
node carousel.mjs           # renders carousel/frame-*.html to 1080x1350 PNGs
```

- Camera keyframes live in the `CONFIG` object at the top of `capture.mjs`.
- Cut lengths, overlay copy and timings live in the `CONFIG` object at the top of `assemble.mjs`.
- Build `promo/encik.mp4` with `node encik.mjs`, or record it by hand with audio. Until it exists, `assemble.mjs` builds a silent version with a slate in the first slot so the cuts can be checked.
- ffmpeg is taken from `PATH`, then `FFMPEG=/path/to/ffmpeg`, then the `ffmpeg-static` binary installed here.
- Fonts in `fonts/` are the site's own faces (Manrope and DM Sans) fetched as static TTFs so ffmpeg's drawtext and the carousel render the same way.
- Copy for the post is in `captions.md`.

Generated clips, stills, carousel PNGs, MP4s and render archives stay local and are ignored by Git. Source scripts, carousel HTML, fonts and captions are versioned. The captions and voting overlays preserve the September hackathon campaign; review their dates before reusing them.
