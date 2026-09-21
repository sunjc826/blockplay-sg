# Deploy to Cloudflare Workers

Live deployment: **https://blockplaysg.fun** — the public demo — served by this Worker in the Sunjc826 account through a custom domain, and also reachable at its `https://blockplay-sg.sunjc826.workers.dev` origin. `wrangler.jsonc` selects that account explicitly. Pushes to `main` deploy automatically through [GitHub Actions](#github-actions-this-repositorys-default); `pnpm deploy:cloudflare` from a local checkout does the same thing by hand, with no repository privileges needed. To deploy a separate copy in another account, change `account_id` and, if needed, `name` first.

This deployment serves the Vite game and companion API together on HTTPS. It includes all three maps, FPS, open world, solo bots, loadouts, vehicles and bundled Encik recordings. Text/voice companions and the optional LLM strategist use a private Worker secret. Without that secret, gameplay still works and companion requests return a clear unavailable response.

The Node LAN rendezvous server is not deployed: the cloud build offers Solo arena and disables Host/Join. Internet matchmaking would need shared room storage and STUN/TURN support; uploading the frontend does not provide either. `pnpm lan` continues to work locally.

## First deployment

Use Node 24 and **pnpm 11.22.0**. Wrangler is pinned in the lockfile; `pnpm-workspace.yaml` retains the strict two-week release cooldown. Its `workerd` platform-binary installation is explicitly allowed alongside esbuild.

```sh
pnpm install --frozen-lockfile
pnpm check:cloudflare
pnpm exec wrangler login --device
pnpm deploy:cloudflare
```

Device login works from a host browser even when the terminal is inside UTM: follow the displayed verification URL and code, without a VM-local callback. Wrangler prints the deployed `https://blockplay-sg.<account-subdomain>.workers.dev` URL. If the account already has a different project named `blockplay-sg`, change `name` in `wrangler.jsonc` before deploying.

Enable the companion by supplying its existing server API key at the private prompt:

```sh
pnpm exec wrangler secret put OPENAI_API_KEY
```

Do not upload `.env.local` wholesale. ElevenLabs credentials are not needed: all recordings are bundled. Cloudflare stores the OpenAI key as a Worker secret, not in JavaScript delivered to browsers. Keep `OPENAI_BASE_URL` and `PILOT_MODEL` in `wrangler.jsonc` aligned with the existing event backend; this does not change the companion's requested models or protocols.

The API accepts its own HTTPS origin automatically, including a custom domain. To restrict it to specific origins, set `ADVENTURE_ALLOWED_ORIGINS` in `vars`. `ADVENTURE_ENABLED=false` and `ADVENTURE_VOICE_ENABLED=false` remain available. Existing request quotas are per Worker isolate, not a global billing cap.

## Verify and preview

```sh
pnpm preview:cloudflare
# In another terminal:
pnpm test:cloudflare
```

Preview uses `http://127.0.0.1:8787`. Optional local secrets go in an ignored `.dev.vars` file copied from `.dev.vars.example`. The scripts disable Wrangler's automatic `.env` loading so a preview does not silently inherit all local service credentials. If a VPN proxies loopback requests, set `NO_PROXY=127.0.0.1,localhost` and `no_proxy=127.0.0.1,localhost`.

The smoke check covers production JS/CSS, a GLB weapon, a recorded MP3, SPA navigation, JSON API routing, denied cross-origin requests and a malformed same-origin request. It makes no paid API calls. Run it against the published site with:

```sh
CLOUDFLARE_APP_ORIGIN=https://blockplay-sg.YOUR-SUBDOMAIN.workers.dev pnpm test:cloudflare
```

`/api/health` returns deployment identity and whether the companion has a key and is enabled. It does not check upstream model access. Test one real text request and voice connection manually after configuring the secret to verify those services.

## Automatic deployments from GitHub

There are two ways to deploy on every push to `main`, and you want exactly one
of them: running both means two systems racing to publish the same commit.

### GitHub Actions (this repository's default)

`.github/workflows/deploy-cloudflare.yml` builds and deploys on every push to
`main`, and on demand from the Actions tab. It runs the checks that gate a local
push — `pnpm typecheck`, `pnpm test` — before it builds, deploys with the
Wrangler version pinned in the lockfile, and then runs `pnpm test:cloudflare`
against the live origin, so a deploy that breaks routing, the service worker or
the API fails the run rather than sitting there green.

That last check retries for about a minute. A new Worker version takes a few
seconds to propagate, and in between an edge can serve the new `index.html`
beside the previous version's asset manifest: the hashed bundle it names is not
there yet, so the request falls through to the SPA handler and the check sees
HTML where JavaScript should be. A site that is genuinely broken fails every
attempt.

One-time setup:

1. In Cloudflare, **My Profile → API Tokens → Create Token → Edit Cloudflare
   Workers**, scoped to the account in `wrangler.jsonc`. Copy the token once.
2. In GitHub, **Settings → Secrets and variables → Actions → New repository
   secret**, named `CLOUDFLARE_API_TOKEN`.

That is all it needs. The account comes from `account_id` in `wrangler.jsonc`,
and runtime secrets set with `wrangler secret put` — `OPENAI_API_KEY` — survive
every deploy, so the workflow never sees them.

Two optional settings:

| Name | Kind | Purpose |
| --- | --- | --- |
| `GOOGLE_MAPS_DEMO_API_KEY` | Secret | Enables live Street View in the deployed build. Unset means the build disables it, as it does today. |
| `CLOUDFLARE_APP_ORIGIN` | Variable | Where the post-deploy check looks. Defaults to `https://blockplaysg.fun`, the public URL. Set it to override — the `workers.dev` origin, or a different custom domain. |

Deploys run one at a time and a queued run waits rather than cancelling one
mid-upload. Pushes from forks are ignored. The browser smokes are not part of
this workflow: they need a running Vite server and a Chrome with remote
debugging, so they remain a local step.

### Cloudflare's own Git integration (alternative)

If you would rather Cloudflare build it, connect this repository to a **Worker**
in Workers & Pages instead, and delete or disable the workflow above. Build
settings:

| Setting | Value |
| --- | --- |
| Root directory | Repository root |
| Production branch | `main` |
| Build command | `pnpm build:cloudflare` |
| Deploy command | `pnpm exec wrangler deploy` |
| Preview deploy command | `pnpm exec wrangler versions upload` |
| Build variable `PNPM_VERSION` | `11.22.0` |
| Build variable `NODE_VERSION` | `24.21.0` |

The build output is `dist`, configured in `wrangler.jsonc`. Set runtime secrets
in the Worker's **Settings → Variables and Secrets**, independently from build
variables. The checked-in `vars` are the source of truth for non-secret runtime
settings; copy dashboard changes into the config so subsequent deployments
preserve them.

### Either way

Live Street View is optional. The cloud build only exposes
`GOOGLE_MAPS_DEMO_API_KEY`, never the fallback capture key
`VITE_GOOGLE_MAPS_API_KEY`. For Street View, provide the demo key and restrict
its Google HTTP referrers to the deployed hostname. Authored maps need no Google
key or live map requests.

`blockplaysg.fun` is attached this way, under the Worker's **Settings → Domains
& Routes**. For another hostname, add it there once the domain is in the
Cloudflare account. Same-origin companion routing needs no frontend URL changes,
and the `workers.dev` origin keeps working alongside it.

## Implementation and references

`cloudflare/worker.js` adapts the existing Node companion using Cloudflare's HTTP bridge. Assets are served directly; `/api/*` runs the Worker first so unknown API routes never become a misleading HTML success. The cloud build keeps AI features available independently of local multiplayer.

- [Workers static assets](https://developers.cloudflare.com/workers/static-assets/)
- [Node HTTP bridge](https://developers.cloudflare.com/workers/runtime-apis/nodejs/http/)
- [Worker secrets](https://developers.cloudflare.com/workers/configuration/secrets/)
- [Git build configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/) and [build versions](https://developers.cloudflare.com/workers/ci-cd/builds/build-image/)
