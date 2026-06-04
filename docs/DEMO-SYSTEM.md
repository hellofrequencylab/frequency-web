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

- A small **yellow ⚡ bolt** badge (`components/ui/demo-badge.tsx`) on every demo
  member, circle, post, event, and practice — the at-a-glance tell for Beta testers.
- A right-sidebar **DemoNotice** card (`components/sidebar/demo-notice.tsx`) explains
  the ⚡ and shows the *honest* headcount ("250 demo members + N real ones — Help us
  make this real!"); it self-hides when `demo_mode` is off or the demo is purged.
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


## Demo content is wizard-generated (ADR-092)

The hand-built 250-cast was **retired**. Demo content is now generated on demand
by the **Seed Studio** and cleaned by the purge controls + the nightly decay cron —
both live on the one **`/admin/demo`** ("Demo Studio") page (`lib/demo/engine.ts`).
Every row is still `is_demo`, badged with the yellow bolt, and counted honestly.
See ADR-091/092.

### What a seed generates (the full connection web — ADR-093)

A seed is not just circles + posts. For each area the engine writes the web that
makes a community read *lived-in*, all batched and all `is_demo`:

| Layer | What's seeded |
| :-- | :-- |
| Circles & people | Circles with a host + roster; ranks/tenure drive what each person posts |
| Conversation | Stage-appropriate posts + replies, with ⚡ **reactions** from circle-mates |
| Events | A **cadence** — two past + one upcoming — each with going **RSVPs** |
| Practice loop | A circle practice, member **adoptions**, recent **`practice_logs`**, attendance **streaks** |
| Journeys | Open **`journey_plans`** (+ items + adoptions) authored by hosts, adopted by a slice of members |
| Gamification | Zero-reward **achievements** (trophy case) — see the unobtrusive contract below |

### Demographic-aware generation (palette + templates)

The wizard's **Voice** step has a *Demographic-aware (AI)* toggle (default on). When
on, ONE cheap Haiku call per area (`lib/demo/ai-palette.ts`) returns a **palette** —
locale-fitting names, the activities that actually happen there, a one-line vibe, and
journey titles — which the deterministic `buildPlan()` expands into every row. So an
Encinitas seed reads surf/wellness; a Midwest town reads different. It **fails soft**
to the built-in template pools whenever AI is off, budgeted out, or errors — seeding
never depends on it.

### Unobtrusive: zero real-world side effects

Seeding never touches real members or fires automations. Writes go **direct** via the
admin client (never the app's award/notify helpers); **RSVP reminders are pre-stamped**
(`reminder_*_sent_at`) so the reminder cron never emails; seeded achievements are
**zero-reward** so the award trigger is a no-op and the economy can't drift.

> **Journeys cleanup wrinkle:** `journey_plans` carries no `is_demo` flag and its
> `author_id` is `ON DELETE SET NULL`, so demo plans can't cascade with their author.
> A shared `deletePlansByAuthors()` (`lib/journey-plans.ts`) removes them by demo
> author **before** the profiles in every teardown path — per-area purge, global
> purge, and the nightly decay pass.


## Claim this Circle (ADR-091, Phase 2)

A signed-in real member viewing a demo circle sees a ⚡ banner ("This is a sample
circle — make it real?") and a short wizard (`components/circles/claim-circle.tsx`):
*what would it be about? · which practice to start with? · what to call it?*

`claimCircle` (`app/(main)/circles/[slug]/claim-actions.ts`) converts the circle
**in place**: `is_demo -> false`, `host_id -> the claimer`, applies their answers,
sets the active practice, awards the circle start/activate zaps, and logs a
`circle.claimed` engagement event. The demo neighbours stay (a furnished circle,
not an empty one) and recede as real members join. Next: the decay cron (P3).


## Decay — natural disappearance (ADR-091, Phase 3)

`lib/demo/decay.ts` (`runDecay`) recedes + purges demo content as an area goes
real, keyed off `is_demo` + geo (no schema). Nightly via
`app/api/cron/demo-decay` (registered in `vercel.json`, `?dry=1` to report only),
and on demand from the Seed Studio's **Decay pass** panel.

- **Area decay** — per demo circle, count real active circles within ~12 mi:
  `>= 3` purges the demo circle (+ orphaned demo members); `>= 1` prunes its demo
  posts older than 30 days.
- **Neighbour decay** — a claimed/real circle sheds demo "neighbours" toward a
  floor that hits 0 once it has 5+ real members (so the furnished circle becomes
  fully real over time).

Deletes only, idempotent, converges. The honest "N demo + M real" count slides
toward all-real on its own.
