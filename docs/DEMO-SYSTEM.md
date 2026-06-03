# Demo content system

**What it is:** a self-contained, self-cleaning layer of seeded "Beta demo" content
(members, circles, posts, events, practices) that makes the community look alive
during the Beta — clearly marked, visually receded behind real content, and
removable in one step. Decisions: [ADR-064 + ADR-065](DECISIONS.md). This doc is
the operational reference; the migrations + code are the source of truth.

## The one contract: `is_demo`

Every demo-able table carries `is_demo boolean NOT NULL DEFAULT false` with a
partial index `WHERE is_demo`:

| Table | Demo rows surface in |
| :-- | :-- |
| `profiles` | Directory, member lists, leaderboard, authorship |
| `circles` | Circles browse, maps |
| `events` | Events list |
| `posts` | Feeds (home + circle/profile) |
| `practices` | Practice surfaces |

- **Demo members are auth-less** (`auth_user_id IS NULL`) and use playful "Demo"
  surname variants (Demo, Demø, Demonski, …) as the human tell.
- **Programs are intentionally not seeded** — they're file-based under
  `content/programs/`, not a table.
- Seeds are **idempotent**: deterministic UUIDs + `ON CONFLICT DO NOTHING`, so
  re-running is safe. Geography: fixed-UUID city regions (`1100000a-…a1`…`a5`)
  referenced by the national seed.

Migrations: `supabase/migrations/20260603000001_demo_0_infrastructure.sql` →
`…000004_demo_3_national.sql` (San Diego + five national metros).

## The switch: `platform_flags.demo_mode`

`platform_flags` is a global key→boolean table (public read, service-role write).
`demo_mode` is the **soft kill switch** for all demo content site-wide.

- ✅ **on** (default, current Beta state): demo content shows everywhere.
- 🔴 **off**: demo content disappears from the directory, circles, events, and
  feeds — in one flip, no row deletes.

Read it in code via `demoModeEnabled()` (`lib/platform-flags.ts`, per-request
cached, **defaults to on** if the read fails so a DB hiccup never blanks the
community). Surfaces gate on it:

- Directory / circles / events list queries add `.eq('is_demo', false)` when off.
- Feed RPCs (`feed_for_viewer`, `scoped_feed_for_viewer`) gate in SQL:
  `not is_demo OR demo_mode` (migration `…000007_feed_rpcs_demo_mode.sql`).

## How demo content reads in the UI

- A small, muted **Beta Demo** pill (`components/ui/demo-badge.tsx`) on every demo
  member, circle, post, and event.
- Demo **profiles & circles recede** — reduced opacity + desaturated avatar/image —
  so real member content always reads as primary (`EntityCard` `dimmed`/`badge`
  slots; `PersonCard`/`CircleCard` `isDemo`).

## Location search excludes demo (always)

The directory's geolocation search (`circles_near` PostGIS RPC, `lib/geocode.ts`
+ `components/circles/circle-location-search.tsx`) **hard-excludes `is_demo`
circles regardless of `demo_mode`** — location discovery only ever surfaces real
groups. See [ADR-065](DECISIONS.md).

## Teardown

Two levers, in order of severity:

1. **Hide** (reversible): set `platform_flags.demo_mode = false`.
2. **Purge** (permanent): `DELETE FROM <table> WHERE is_demo;` across the five
   tables — uniform, no UUID lists, no special-casing. Badges/greying vanish with
   the rows.
