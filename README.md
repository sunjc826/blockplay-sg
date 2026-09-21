# blockplaySG — Singapore, playable.

> What if the places we pass every day became worlds we could play in?

Explore familiar Singapore neighborhoods as stylized 3D game worlds, created using **Google Maps Street View imagery as visual references** and **GPT-6 Astra to help build and refine the worlds and game code**.

**[Play the demo](https://blockplaysg.fun/)**

[![Blockplay SG: panoramic in-game view of Marina Bay, its waterfront, three landmark towers and lotus-shaped museum](docs/images/blockplay-sg-marina.png)](https://blockplaysg.fun/)

[How we built it: engineering and visual understanding](docs/BUILD-STORY.md) · [Reference-to-game comparisons](docs/visual-understanding.md)

## What you can play

- Walk or drive around **nineteen districts** — Marina Bay, Raffles Place, Queenstown, Chinatown, Kampong Glam, Jurong Lake, Changi, Upper Thomson, Punggol, HarbourFront, Sentosa, Geylang, Tuas, Woodlands, Tampines, Toa Payoh, Bukit Timah, Bishan and Orchard Road — collecting stamps.
- Explore the connected districts in **Open world**, finding equipment and facing bots.
- Play each district's **FPS range**, with a shared armory, vehicles and target ranges.
- Play **Solo arena** against configurable bots.
- Play on a **phone or tablet**: every 3D mode draws twin thumb sticks and on-screen actions over the scene.
- **Install it** to your home screen or desktop and keep playing offline.

The public demo runs on Cloudflare Workers and redeploys from `main` on every push. Multiplayer host/join and live Street View are unavailable there; the AI companions answer only while the deployment carries a private key, and return a clear unavailable response without one. All of it is supported in the local project with additional setup.

The worlds are authored, compressed interpretations—not surveyed maps or navigation tools. Marina Bay, Raffles Place and Queenstown were built against reviewed street-level references. The other sixteen districts were composed from general knowledge of those neighbourhoods, without reference capture; see [districts](docs/DISTRICTS.md).

## How we build locations

Our workflow starts with a place and its Google Maps Street View imagery. We select and cache reference views, retain their attribution and capture metadata, and review which details are clearly visible. Astra helps translate those references into Three.js scene code: landmark shapes, building facades, materials, roads and streetscape details.

We connect each scene to reusable walking and driving controls, collision rules, collectible objectives and minimaps. Comparing rendered views with the references, running automated checks and playtesting lets us refine both resemblance and playability. See the [build story](docs/BUILD-STORY.md) and [three reference-to-game comparisons](docs/visual-understanding.md).

The same agentic workflow could support many more neighbourhoods and cities. Reference review, layout decisions, scene implementation and validation are already part of the Astra-assisted development process: region agents build and refine worlds in parallel, while shared browser capture and visual QA are coordinated in sequence. New locations can follow this process and reuse the existing gameplay systems, with human direction and review. We have demonstrated it across three reference-informed Singapore regions, and added sixteen further districts as authored interpretations without new capture; reliable generation for arbitrary places has not yet been validated.

## Run locally

Requires **Node 22.12+** and **pnpm 11.22.0**.

```sh
pnpm install
pnpm dev
```

Open the URL printed in the terminal. No API key is needed for solo gameplay. Dependencies use a two-week minimum release age.

```sh
pnpm test
pnpm build
```

Built with React, TypeScript, Vite and Three.js.

## Documentation

- [Project guide](docs/PROJECT-GUIDE.md) — controls, optional services, testing and deployment.
- [Installable app](docs/PWA.md) — home-screen install, what is cached and offline play.
- [Cloudflare deployment](docs/CLOUDFLARE.md) — game hosting, companion API, secrets and GitHub builds.
- [Adventure companions](docs/ADVENTURE.md) — objective changes, educational guides and voice.
- [Districts](docs/DISTRICTS.md) — what each world is, how they differ in provenance, and how to add one.
- [Open world](docs/WORLD-ZONES.md), [LAN arena](docs/LAN-ARENA.md) and [Armory](docs/ARMORY.md) — mode-specific details.
- [Agent workspace notes](.agents/README.md) — planning, handoff, experiments and continuing development.
