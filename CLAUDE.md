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

`main` is what deploys: a push runs `.github/workflows/deploy-cloudflare.yml`,
which typechecks, tests, builds and publishes the Cloudflare Worker, then checks
the live site. A red run leaves the previous deploy serving, so a broken push is
recoverable — but run the checks here first rather than using CI to find out:

```sh
pnpm install   # only when the lockfile changed
pnpm test      # vitest, ~11s
pnpm typecheck # tsc --noEmit
```

`pnpm build` before any change touching the Vite config, entrypoints or
Cloudflare worker. Browser smokes (`pnpm test:browser`, `pnpm test:fps:districts`,
`pnpm test:pwa` — that one needs `pnpm build` first, and serves `dist` itself —
and `pnpm test:touch`) need Vite plus Chrome with remote debugging; on a software
renderer pass `REGION_SMOKE_PACE=6` / `EXPEDITION_SMOKE_PACE=6` /
`TOUCH_SMOKE_PACE=4` or the fixed key-holds register no movement. Chrome needs
`--enable-unsafe-swiftshader --use-angle=swiftshader` for WebGL without a GPU.
If a check can't run in the current environment, say so
in the summary rather than silently skipping it.

## Districts and provenance

Adding a district is a registry entry in `src/game/regions.ts` plus a scene file
built from `src/game/scene-kit.ts` — read `docs/DISTRICTS.md` first for the five
files it touches.

## Reference provenance and capture

All nineteen districts have a September 2026 correction pass; read
`docs/ALL-DISTRICTS-REVIEW.md` for feature-level evidence and limitations.
`scene.userData.referenceFeatures` lists only features implemented from accepted
references, not a whole-map fidelity certificate. Empty lists remain valid when
no reviewed image informed geometry. Learning catalogs (`hasGuide`) are separate.
Keep README, docs/DISTRICTS.md and the in-app About copy consistent with that scope.

The original three districts' Static image allowances remain exhausted. Never
reset budgets or invent acceptance records. New captures need user authorization;
the September 2026 all-district pass was explicitly authorized, including
parallel modelling and bounded replacement previews. Future unrelated captures
are not blanket-authorized by this record. Use the per-district cache-first
workflow in docs/REFERENCE-CAPTURE.md. Preserve rejected images and ledger events.

## Orientation

`.agents/HANDOFF.md` is the running log of what landed and what's in flight —
read it at the start of a session and append to it when you finish something
substantial. `docs/PROJECT-GUIDE.md` maps the codebase.
