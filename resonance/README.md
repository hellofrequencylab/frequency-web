# Resonance

> Working codename — swappable. A gamified, embeddable hangout world where
> friends gather in themed venues to DJ for each other, watch things together,
> and build the space itself. Starts as a feature inside Frequency; grows into a
> platform other apps plug into.

**This is a social-presence app that uses freely-available media, not a music
app.** Media plays through YouTube's iframe player, so we never host or
redistribute audio. Everything that compounds in value (presence, identity,
reputation, owned spaces) scales independently of any music license. That single
decision is never violated. See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Status: scaffold

Framework and structure only. No features yet. Build proceeds one section at a
time, on explicit go-ahead, per [`docs/BUILD-PLAN.md`](docs/BUILD-PLAN.md).

## Where this lives

A self-contained project inside the Frequency repo, on its own branch. It shares
**nothing** with Frequency's code and holds **no** database foreign keys into
Frequency's data. It is built to be lifted into its own repo + Supabase project
with one `pg_dump` and an env swap. See [`docs/ISOLATION.md`](docs/ISOLATION.md).

```
resonance/
├─ app/                 Next.js app (minimal placeholder for now)
├─ lib/
│  ├─ config.ts         app identity (name + schema) — single source of truth
│  ├─ supabase/         server (service-role) + browser (realtime-only) clients
│  ├─ realtime/         transport interface — the swappable realtime seam
│  ├─ sync/             server-authoritative playback contract
│  └─ integration/      embed/host bridge contract (JWT + postMessage + webhooks)
├─ supabase/
│  ├─ config.toml       standalone Supabase config
│  └─ migrations/       schema-isolated migrations (0001 = the container)
└─ docs/                architecture, build plan, decisions, integration, isolation
```

## Docs

| Doc | What it answers |
|---|---|
| [`ARCHITECTURE.md`](docs/ARCHITECTURE.md) | How it's built and why; the seams; what web makes possible next |
| [`BUILD-PLAN.md`](docs/BUILD-PLAN.md) | The sectioned build list we walk one piece at a time |
| [`DECISIONS.md`](docs/DECISIONS.md) | ADRs — the locked decisions and their rationale |
| [`INTEGRATION.md`](docs/INTEGRATION.md) | Plugging into Frequency; the embed SDK |
| [`ISOLATION.md`](docs/ISOLATION.md) | The no-crossover contract and the breakout procedure |

## Develop

```bash
cd resonance
pnpm install            # separate from Frequency; no shared workspace
cp .env.example .env.local   # fill in values
pnpm dev
```

This is Next 16, which differs from older Next. Read `node_modules/next/dist/docs/`
before writing Next code.

### Try the sync engine (build plan §1)

Fill `.env.local` with the Supabase URL + keys, then open
[`/dev/sync`](app/dev/sync/page.tsx) in two or three windows. Load a YouTube
video in one and play/pause/seek; the others follow within a heartbeat, and a
late joiner syncs from current state. This is the server-authoritative clock
proven in isolation, with no DJ UI yet. Clock math is unit-tested (`pnpm test`).
