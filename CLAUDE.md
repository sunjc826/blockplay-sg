# Blockplay SG: working agreements

This fork is the development home. Work happens here on `main`; don't open pull
requests against the upstream repo.

## Git workflow

Single maintainer (@sunjc826), so the branch-and-review dance is overhead:

- **Commit and push straight to `main`.** No feature branch, no PR needed. This
  is a standing instruction from the repo owner and overrides any per-session
  default that designates a `claude/...` development branch.
- **Pull requests are optional.** Raise one when it makes a change easier to
  read or discuss; you may merge it immediately yourself without waiting for a
  review or approval.
- Push with `git push -u origin main`. On network failure, retry up to four
  times with exponential backoff (2s, 4s, 8s, 16s).
- Never force-push or rewrite published history on `main`.

## Before pushing

`main` is what deploys, and nothing else gates it, so the checks are the safety
net. Run at minimum:

```sh
pnpm install   # only when the lockfile changed
pnpm test      # vitest, ~11s
pnpm typecheck # tsc --noEmit
```

`pnpm build` before any change touching the Vite config, entrypoints or
Cloudflare worker. Browser smokes (`pnpm test:browser`, `pnpm test:fps:districts`,
`pnpm test:pwa` — that one needs `pnpm build` first, and serves `dist` itself)
need Vite plus Chrome with remote debugging; on a software renderer pass
`REGION_SMOKE_PACE=6` / `EXPEDITION_SMOKE_PACE=6` or the fixed key-holds
register no movement. If a check can't run in the current environment, say so
in the summary rather than silently skipping it.

## Districts and provenance

Adding a district is a registry entry in `src/game/regions.ts` plus a scene file
built from `src/game/scene-kit.ts` — read `docs/DISTRICTS.md` first for the five
files it touches.

Two provenances, and they are not interchangeable:

- **Reference-informed** — Marina Bay, Raffles Place, Queenstown. Built against
  reviewed Street View references. Those image allowances are **exhausted**.
- **Authored from general knowledge** — every other district. No reference
  capture, no Google API requests, and an empty `referenceFeatures` list so that
  stays checkable. They have no source-linked learning cards, hence no companion
  panel; adding one needs researched sources, not generated facts.

Don't keep a second list of which is which — `referenceFeatures` is empty for
exactly the authored set, and `hasGuide` marks the three with learning cards.
Prose that names them (the README, `docs/DISTRICTS.md`, the in-app About
dialog in `src/App.tsx`) goes stale every time a district lands, so check those
three when you add one.

Never describe an authored district as reference-informed, and don't make new
reference-capture requests or Google API calls without asking first.

## Orientation

`.agents/HANDOFF.md` is the running log of what landed and what's in flight —
read it at the start of a session and append to it when you finish something
substantial. `docs/PROJECT-GUIDE.md` maps the codebase.
