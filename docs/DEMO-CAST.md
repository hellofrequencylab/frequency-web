# Demo cast — the casting bible

**Status:** ✅ Built + Postgres-validated (migration series `20260605…`). This is the backbone every
demo-seed migration in the `20260605…` series references, so the social graph
stays coherent. Operational reference for the demo system itself:
[`DEMO-SYSTEM.md`](DEMO-SYSTEM.md). Decision record: [`DECISIONS.md`](DECISIONS.md).

---

## 1. The premise

A community **centered in Encinitas** that is **one year old and went viral** —
but stayed **local**. The map's gravity well is Encinitas; it spreads up and down
the coast and a little inland, never past the border the brief set: **Oceanside,
Valley Center, Poway, La Mesa, and San Diego proper**.

We do **not** fake the headcount. The honest readout is the whole point — the
right-sidebar `DemoNotice` says *"250 demo members + N real ones — Help us make
this real!"* So the "year-old, went viral" feeling is carried by **maturity
signals**, not inflated numbers:

| Signal | How it reads as "established" |
| :-- | :-- |
| 🔥 Deep streaks | Founders at 30–52 week streaks; lots of double-digit streaks |
| 🏅 Full trophy cases | Top members carry 20+ achievements, completed season challenges |
| 📅 A history | 10 *past* events with recaps + attendance, not just upcoming |
| 💬 Dense threads | Real reply chains + heavy reactions on the posts that caught fire |
| ⚡ A believable leaderboard | A proper rank pyramid, not everyone at the top |

> **Scope decision to confirm:** the existing demo also seeds five **national**
> metros (Austin, Boulder, Asheville, Brooklyn, Bend). Those are out of the
> Encinitas border. **Recommendation: retire them** in teardown so the map reads
> as one tight local community. (Flagged again in §7.)

---

## 2. Conventions (idempotency + namespace)

Same contract as the existing demo system: every row `is_demo = true`,
deterministic UUIDs + `ON CONFLICT DO NOTHING`, re-runnable. Fresh prefixes so we
never collide with the old SD (`c…`), national (`d…`), or practice (`e1…`) seeds:

| Entity | UUID prefix | Range |
| :-- | :-- | :-- |
| Profiles (250) | `f1000000-…-0000000000NN` | `01`–`fa` |
| Circles (12) | `f2000000-…-00000000000N` | `01`–`0c` |
| Posts — top-level (~300) | `f4000000-…-0000000NNNN` | `0001`–`03ff` |
| Posts — replies (~450) | `f4000000-…-0000001NNNN` | `1000`–`13ff` |
| Events (16) | `f5000000-…-00000000000N` | `01`–`10` |
| Join rows (memberships, RSVPs, reactions, logs, achievements, gems, streaks) | — | natural-key `ON CONFLICT`, default `gen_random_uuid()` |

**Hand-written vs set-generated.** "Fully hand-crafted" applies to *prose* — the
part a human reads. Row-only data with no words is generated set-based in SQL
(deterministic, seeded), because hand-typing 6,000 reaction rows adds nothing:

| ✍️ Hand-written (bespoke) | ⚙️ Set-generated (deterministic SQL) |
| :-- | :-- |
| 250 profile bios | memberships |
| ~300 posts | ~3,500 reactions |
| ~450 replies | ~1,500 event RSVPs |
| 16 event descriptions | ~6,000 practice logs (back the streaks) |
| 18 new practice bodies (16 done) | ~2,000 achievement unlocks |
| 4 program enrichments | ~1,500 challenge-progress rows |
| | ~3,000 gem transactions + 250 streak rows |

---

## 3. The rank pyramid (250 people)

`season_rank_enum`: ghost → runner → operative → agent → conduit → luminary.
Thresholds: runner 100z · operative 300z · agent 750z · conduit 1500z · luminary
**manual** (`season_challenges_complete = true`). A healthy year-old community is
bottom-heavy — most people are casual, a few carry it:

| Rank | People | Season zaps | Lifetime zaps | Gems | Streak (wk) | Achiev. | Who they are |
| :-- | --: | :-- | :-- | :-- | :-- | --: | :-- |
| 🌟 Luminary | 3 | 2,200–3,200 | 8k–12k | 1.5k–2.5k | 30–52 | 22–28 | Founders / the faces of the community |
| ⚡ Conduit | 12 | 1,500–2,100 | 4k–7k | 800–1.4k | 16–30 | 16–22 | Circle hosts, the pillars |
| 🛰️ Agent | 30 | 750–1,450 | 2k–4k | 400–800 | 10–20 | 11–16 | Crew leads, frequent hosts |
| 🔹 Operative | 55 | 300–740 | 800–2k | 150–400 | 5–14 | 7–11 | Reliable regulars |
| 🏃 Runner | 80 | 100–290 | 300–800 | 50–150 | 2–8 | 4–7 | Found their groove |
| 👻 Ghost | 70 | 5–95 | 20–300 | 5–60 | 0–3 | 1–4 | New this month / lurkers warming up |
| | **250** | | | | | | |

`current_season_zaps` always sits inside the band that maps to the rank, so the
leaderboard and the rank label agree. Luminaries are set manually with zaps above
the Conduit line + `season_challenges_complete = true`.

---

## 4. The 12 circles

Encinitas-dense, branching out, all 7 topical channels covered. ~21 primary
members each (≈252) plus ~60 cross-memberships, so circles read full and some
people belong to two. `hub_id` left NULL (topic+location circles, like the
current SD seed). Header images keep the `picsum.photos/seed/{slug}` convention.

| # | Circle | Channel | Place (lat,lng) | Host (rank) | Roster | Signature |
| :-- | :-- | :-- | :-- | :-- | --: | :-- |
| 1 | **Swami's Dawn Patrol** | movement | Encinitas · Swami's (33.0369, -117.2920) | Luminary | 22 | Sunrise surf + coffee on the bluff |
| 2 | **Moonlight Beach Sound Bath** | holistic-health | Encinitas · Moonlight (33.0470, -117.2950) | Conduit | 21 | New/full-moon sound baths on the sand |
| 3 | **Leucadia Makers** | creative | Encinitas · Leucadia (33.0608, -117.3000) | Conduit | 20 | Maker nights, open studios, show-and-tell |
| 4 | **101 Founders Collective** | business-support | Encinitas · downtown 101 (33.0450, -117.2930) | Luminary | 20 | Founder accountability + demo nights |
| 5 | **Cottonwood Creek Mindfulness** | spirituality | Encinitas (33.0530, -117.2930) | Conduit | 20 | Silent sits + journaling |
| 6 | **Encinitas Newcomers & Neighbors** | human-relating | Encinitas (33.0400, -117.2870) | Conduit | 22 | Welcome dinners, the "front door" circle |
| 7 | **Cardiff Cold Plunge** | holistic-health | Cardiff-by-the-Sea (33.0150, -117.2800) | Conduit | 20 | Dawn reef plunges |
| 8 | **Carlsbad Village Run Club** | movement | Carlsbad Village (33.1581, -117.3506) | Conduit | 21 | No-drop runs + burritos |
| 9 | **Cedros Creatives** | creative | Solana Beach · Cedros (32.9912, -117.2713) | Conduit | 20 | Portfolio nights, design-district collabs |
| 10 | **Oside Sunrise Surf** | movement | Oceanside Pier (33.1933, -117.3831) | Luminary | 21 | Dawn patrol off the pier + tacos |
| 11 | **Coast Keepers** | activism | Encinitas · coastal (33.0440, -117.2960) | Conduit | 22 | Beach cleanups + tide-pool stewardship |
| 12 | **Vista Hops & Hikes** | movement | Vista / San Marcos (33.2000, -117.2425) | Conduit | 21 | Trail hikes ending at a taproom |

**The far border (Poway, La Mesa, San Diego proper, Valley Center, Del Mar)** is
represented honestly through **where members live**, not thin far-flung circles —
several members' home city sits on the edge and they commute to a coastal circle
(realistic for a community that "spread out"). A couple of events also land
inland/south. This keeps the gravity in Encinitas while showing the reach.

**Member home-city spread:** Encinitas (densest), Cardiff, Leucadia, Solana
Beach, Del Mar, Carlsbad, Oceanside, Vista, San Marcos, Poway, Rancho Bernardo,
La Mesa, San Diego, Valley Center.

---

## 5. Content volume — "an appropriate amount"

Honoring "posts by each person" while keeping it believable. Default: **every
member authors ≥1 post**; creators/hosts post more; the newest ghosts post short
newcomer intros. (Alternative if you prefer realism over completeness: let ~25%
of ghosts stay silent and engage only via reactions/RSVPs — say the word.)

| Per rank | Posts each | Subtotal |
| :-- | --: | --: |
| Luminary ×3 | 4 | 12 |
| Conduit ×12 | 3 | 36 |
| Agent ×30 | 2 | 60 |
| Operative ×55 | ~1.3 | ~72 |
| Runner ×80 | 1 | 80 |
| Ghost ×70 | ~0.5–1 | ~40 |
| **Total** | | **~300 top-level posts** |

Plus **~450 replies** (threads on ~40% of posts), **~3,500 reactions**, **~1,500
RSVPs**, **~6,000 practice logs**, **~2,000 achievement unlocks**, **~1,500
challenge-progress rows**, **~3,000 gem transactions**. Posts are voiced to the
author's role + circle and many tie to a specific event (a recap) or practice.

---

## 6. The 16-event calendar

10 **past** (with a recap post + `going` RSVPs = attendance history) and 6
**upcoming** (with RSVPs = anticipation). Spread across the circles; dates
relative to `now()` so the seed never goes stale.

| # | Event | Circle | When | Type |
| :-- | :-- | :-- | :-- | :-- |
| 1 | New Year's Day Paddle-Out | Swami's Dawn Patrol | ~5 mo ago | past |
| 2 | Leucadia Spring Maker Market | Leucadia Makers | ~3 mo ago | past |
| 3 | 101 Founders — Q1 Demo Night | 101 Founders | ~10 wk ago | past |
| 4 | Earth Day Beach Cleanup | Coast Keepers | ~6 wk ago | past |
| 5 | Carlsbad Spring Half Relay | Carlsbad Run Club | ~5 wk ago | past |
| 6 | 100-Day Plunge Celebration | Cardiff Cold Plunge | ~4 wk ago | past |
| 7 | Cedros First-Friday Art Walk | Cedros Creatives | ~3 wk ago | past |
| 8 | Full-Moon Sound Bath (May) | Moonlight Sound Bath | ~2 wk ago | past |
| 9 | Grom Surf Comp | Oside Sunrise Surf | ~10 days ago | past |
| 10 | Silent Half-Day Sit | Cottonwood Mindfulness | ~1 wk ago | past |
| 11 | Saturday Dawn Session | Swami's Dawn Patrol | +3 days | upcoming |
| 12 | New-Moon Sound Bath | Moonlight Sound Bath | +6 days | upcoming |
| 13 | Summer Demo Night | 101 Founders | +9 days | upcoming |
| 14 | Newcomers Welcome BBQ | Newcomers & Neighbors | +11 days | upcoming |
| 15 | Trail + Taproom Saturday | Vista Hops & Hikes | +13 days | upcoming |
| 16 | Sunrise Reef Plunge | Cardiff Cold Plunge | +2 days | upcoming |

---

## 7. Teardown / replace plan

We're **replacing** the current demo cast (your earlier call). Stage 0 of the
migration series:

1. Delete the **old North County SD demo** rows (`c1…/c2…/c4…/c5…` namespace) —
   profiles, circles, posts, events, and their cascades.
2. **Recommended:** delete the **national demo** (`d…`) too — out of the Encinitas
   border. *Confirm before I write this in.*
3. Leave shared, non-demo geography (hubs, nexus regions, topical channels)
   untouched — the new cast reattaches to it.

The standing kill switch (`platform_flags.demo_mode`) and the one-line purge
(`DELETE … WHERE is_demo`) at `/admin/demo` continue to govern everything new.

---

## 8. Canonical pattern — Circle 1 fully cast (Swami's Dawn Patrol)

This is the template every other circle's roster follows: 1 host (Luminary/
Conduit), 1–2 crew (Agent), an occasional guide/mentor, the rest a spread of
operative/runner/ghost. Bios are one honest line. Stats sit in the rank's band.

| UUID tail | Name | Handle | Role | Rank | Zaps | Gems | Streak | Bio |
| :-- | :-- | :-- | :-- | :-- | --: | --: | --: | :-- |
| 01 | Marcus Reyes | marcus.r | host | 🌟 Luminary | 2,840 | 2,100 | 47 | Up before the sun, in the water by six. Swami's is my church. |
| 02 | Sofia Brandt | sofia.b | crew | 🛰️ Agent | 1,180 | 640 | 17 | Logging dawn sessions and stoke. Wax in, worries out. |
| 03 | Owen Maddox | owen.m | guide | ⚡ Conduit | 1,620 | 980 | 22 | Twenty years on this reef. Happy to share a peak and a pointer. |
| 04 | Priya Nair | priya.n | crew | 🛰️ Agent | 890 | 470 | 12 | Longboard cruiser, sunrise chaser, dawn-patrol text-thread admin. |
| 05 | Diego Salas | diego.s | member | 🔹 Operative | 540 | 260 | 9 | Weekends only but never missing a glassy morning. |
| 06 | Hana Okafor | hana.o | member | 🔹 Operative | 420 | 190 | 7 | Bodysurfing convert. Fins, foam, and good company. |
| 07 | Caleb Wren | caleb.w | member | 🔹 Operative | 360 | 170 | 6 | Grom dad. If the kids paddle out, so do I. |
| 08 | Lucia Marín | lucia.m | member | 🏃 Runner | 240 | 110 | 5 | Traded the trading desk for tide charts. Best decision yet. |
| 09 | Theo Alvarez | theo.a | member | 🏃 Runner | 190 | 90 | 4 | Learning the etiquette one wave at a time. |
| 10 | Naomi Frost | naomi.f | member | 🏃 Runner | 160 | 75 | 3 | Cold water, warm crew. Here for both. |
| 11 | Sam Devlin | sam.d | member | 🏃 Runner | 130 | 60 | 3 | Surf-report screenshotter and group-chat hype man. |
| 12 | Imani Cole | imani.c | member | 🏃 Runner | 110 | 55 | 2 | New to the lineup, slowly earning my spot on the peak. |
| 13 | Felix Brunner | felix.b | member | 👻 Ghost | 85 | 40 | 2 | Just moved from Tahoe. Snow to surf, figuring it out. |
| 14 | Greta Holm | greta.h | member | 👻 Ghost | 70 | 30 | 1 | Beginner foamie rider, big on the after-coffee part. |
| 15 | Malik Reed | malik.r | member | 👻 Ghost | 55 | 22 | 1 | Shortboard, high tide, low expectations, big smiles. |
| 16 | Tess Okada | tess.o | member | 👻 Ghost | 40 | 18 | 1 | Grom mom turned surfer. The pier crew adopted us. |
| 17 | Ravi Banerjee | ravi.b | member | 👻 Ghost | 30 | 12 | 0 | Lurked for a month, finally paddled out. No regrets. |
| 18 | Saoirse Quinn | saoirse.q | member | 👻 Ghost | 22 | 10 | 0 | Midwest kid. The ocean still feels unreal. |
| 19 | Bruno Costa | bruno.c | member | 🔹 Operative | 480 | 220 | 8 | North-side logger, every morning I can. |
| 20 | Esme Lindqvist | esme.l | member | 🏃 Runner | 150 | 70 | 3 | Free-diver using dawn patrol to start slow. |
| 21 | Jonah Pike | jonah.p | member | 👻 Ghost | 48 | 20 | 1 | Bought the wetsuit, committed to the bit. |

(Cross-memberships, e.g. Bruno also at Oside Sunrise Surf, are listed in §4's
~60 cross-links — assigned during build.)

---

## 9. What I need from you

1. ✅/✏️ **Approve the world, the 12 circles, the pyramid, and the volume** above?
2. **National demo** (Austin/Boulder/etc.) — retire it (recommended) or keep it?
3. **Posts-by-everyone vs realistic lurker tail** — everyone ≥1 post (current
   plan) or let ~25% of ghosts stay silent?
4. Once approved: I cast the remaining 11 circles the same way, then the bot fleet
   writes the migration series. Want the **full 250-row cast dropped in this doc
   first**, or go **straight to migrations** after you OK the framework?

---

# Part B — Build spec (for the seed migrations)

This is the contract the per-circle seed migrations follow so 12 independently
written files stay globally consistent (no duplicate UUIDs, no dangling FKs, and
a rank pyramid whose column totals match §3). **Template to mirror exactly:**
`supabase/migrations/20260603000003_demo_2_sandiego.sql`.

## B.1 Migration series

| File | Stage |
| :-- | :-- |
| `20260605000000_practices_rich_content.sql` | ✅ practices schema + backfill (done) |
| `20260605000001_demo_v2_teardown.sql` | ✅ remove old/out-of-area demo (done) |
| `20260605000101_demo_v2_c01_swamis.sql` … `…000112_demo_v2_c12_vista.sql` | one per circle (bots) |
| `20260605000200_demo_v2_cross_memberships.sql` | cross-circle memberships weave |
| `20260605000210_demo_v2_engagement.sql` | set-generated reactions/RSVPs/logs/achievements/challenges/gems/streaks |
| `20260605000300_demo_v2_practices_library.sql` | +18 practices, circle_practices, member_practices |

## B.2 Per-circle allocation (rank quotas + UUID blocks)

`Roster` = primary members. Column totals = the §3 pyramid exactly. Profile/post
UUIDs use the listed **hex** tail inside the fixed prefix.

| C | Circle (file) | Chan | Roster | Lum/Con/Agt/Op/Run/Ghost | Profile tails `f1…NN` | Post block `f4…0NNN` | Reply block `f4…1NNN` | Events `f5…NN` | Active practice `e1…` |
| :-- | :-- | :-- | --: | :-- | :-- | :-- | :-- | :-- | :-- |
| 1 | Swami's Dawn Patrol (c01_swamis) | movement | 22 | 1/1/3/5/7/5 | 01–16 | 0001–0040 | 1001–1040 | 01,0b | 0001 |
| 2 | Moonlight Sound Bath (c02_moonlight) | holistic-health | 21 | 0/1/2/5/7/6 | 17–2b | 0041–0080 | 1041–1080 | 08,0c | 0006 |
| 3 | Leucadia Makers (c03_leucadia) | creative | 20 | 0/1/2/4/7/6 | 2c–3f | 0081–00c0 | 1081–10c0 | 02 | 0009 |
| 4 | 101 Founders Collective (c04_founders) | business-support | 20 | 1/1/3/4/6/5 | 40–53 | 00c1–0100 | 10c1–1100 | 03,0d | 000b |
| 5 | Cottonwood Creek Mindfulness (c05_cottonwood) | spirituality | 20 | 0/1/2/4/7/6 | 54–67 | 0101–0140 | 1101–1140 | 0a | 0007 |
| 6 | Encinitas Newcomers & Neighbors (c06_newcomers) | human-relating | 22 | 0/1/3/5/7/6 | 68–7d | 0141–0180 | 1141–1180 | 0e | 0008 |
| 7 | Cardiff Cold Plunge (c07_cardiff) | holistic-health | 20 | 0/1/2/4/7/6 | 7e–91 | 0181–01c0 | 1181–11c0 | 06,10 | 0004 |
| 8 | Carlsbad Village Run Club (c08_carlsbad) | movement | 21 | 0/1/3/5/6/6 | 92–a6 | 01c1–0200 | 11c1–1200 | 05 | 0002 |
| 9 | Cedros Creatives (c09_cedros) | creative | 20 | 0/1/2/4/7/6 | a7–ba | 0201–0240 | 1201–1240 | 07 | 000a |
| 10 | Oside Sunrise Surf (c10_oside) | movement | 21 | 1/1/3/5/6/5 | bb–cf | 0241–0280 | 1241–1280 | 09 | 0001 |
| 11 | Coast Keepers (c11_coastkeepers) | activism | 22 | 0/1/3/5/7/6 | d0–e5 | 0281–02c0 | 1281–12c0 | 04 | 0008 |
| 12 | Vista Hops & Hikes (c12_vista) | movement | 21 | 0/1/2/5/6/7 | e6–fa | 02c1–0300 | 12c1–1300 | 0f | 0003 |

Prefixes: profiles `f1000000-0000-0000-0000-0000000000NN`, circles
`f2000000-0000-0000-0000-00000000000C` (C = circle #, hex), posts/replies
`f4000000-0000-0000-0000-0000000NNNNN`, events
`f5000000-0000-0000-0000-0000000000NN`.

## B.3 Circle rows (id, slug, place, host rank)

| C | id `f2…0C` | name | slug | city · neighborhood | lat,lng | host rank |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| 1 | 01 | Swami's Dawn Patrol | swamis-dawn-patrol | Encinitas · Swami's Beach | 33.0369,-117.2920 | 🌟 Luminary |
| 2 | 02 | Moonlight Beach Sound Bath | moonlight-sound-bath | Encinitas · Moonlight Beach | 33.0470,-117.2950 | ⚡ Conduit |
| 3 | 03 | Leucadia Makers | leucadia-makers | Encinitas · Leucadia | 33.0608,-117.3000 | ⚡ Conduit |
| 4 | 04 | 101 Founders Collective | 101-founders-collective | Encinitas · Downtown 101 | 33.0450,-117.2930 | 🌟 Luminary |
| 5 | 05 | Cottonwood Creek Mindfulness | cottonwood-mindfulness | Encinitas | 33.0530,-117.2930 | ⚡ Conduit |
| 6 | 06 | Encinitas Newcomers & Neighbors | encinitas-newcomers | Encinitas | 33.0400,-117.2870 | ⚡ Conduit |
| 7 | 07 | Cardiff Cold Plunge | cardiff-cold-plunge | Cardiff-by-the-Sea | 33.0150,-117.2800 | ⚡ Conduit |
| 8 | 08 | Carlsbad Village Run Club | carlsbad-village-run | Carlsbad · Village | 33.1581,-117.3506 | ⚡ Conduit |
| 9 | 09 | Cedros Creatives | cedros-creatives | Solana Beach · Cedros | 32.9912,-117.2713 | ⚡ Conduit |
| 10 | 0a | Oside Sunrise Surf | oside-sunrise-surf | Oceanside · Pier | 33.1933,-117.3831 | 🌟 Luminary |
| 11 | 0b | Coast Keepers | coast-keepers | Encinitas · coastal | 33.0440,-117.2960 | ⚡ Conduit |
| 12 | 0c | Vista Hops & Hikes | vista-hops-hikes | Vista | 33.2000,-117.2425 | ⚡ Conduit |

## B.4 The 16 events (id, circle, title, slug, when, location)

`when` is relative to `now()`. Past events anchor history (members RSVP `going` =
attendance). Build `starts_at`/`ends_at` like the SD template
(`(now() ± interval 'N days')::date + time '…'`).

| id `f5…NN` | C | title | slug | starts | location |
| :-- | :-- | :-- | :-- | :-- | :-- |
| 01 | 1 | New Year's Day Paddle-Out | swamis-nye-paddle-out | -155d 07:00 | Swami's Beach stairs, Encinitas |
| 02 | 3 | Leucadia Spring Maker Market | leucadia-spring-maker-market | -92d 10:00 | 101 corridor studio, Leucadia |
| 03 | 4 | Founders Q1 Demo Night | founders-q1-demo-night | -70d 18:00 | Downtown 101 workspace, Encinitas |
| 04 | 11 | Earth Day Beach Cleanup | coast-keepers-earth-day | -44d 08:00 | Moonlight Beach, Encinitas |
| 05 | 8 | Carlsbad Spring Half Relay | carlsbad-spring-half-relay | -36d 07:00 | Carlsbad Village train station |
| 06 | 7 | 100-Day Plunge Celebration | cardiff-100-day-plunge | -28d 06:30 | Cardiff reef beach access |
| 07 | 9 | Cedros First-Friday Art Walk | cedros-first-friday | -21d 17:00 | Cedros Design District, Solana Beach |
| 08 | 2 | Full-Moon Sound Bath (May) | moonlight-may-full-moon | -14d 19:00 | Moonlight Beach fire pits, Encinitas |
| 09 | 10 | Grom Surf Comp | oside-grom-comp | -10d 07:30 | Oceanside Pier, north side |
| 10 | 5 | Silent Half-Day Sit | cottonwood-silent-sit | -7d 08:00 | Cottonwood Creek Park, Encinitas |
| 0b | 1 | Saturday Dawn Session | swamis-saturday-dawn | +3d 06:00 | Swami's Beach stairs, Encinitas |
| 0c | 2 | New-Moon Sound Bath | moonlight-new-moon | +6d 19:30 | Moonlight Beach fire pits, Encinitas |
| 0d | 4 | Summer Demo Night | founders-summer-demo-night | +9d 18:00 | Downtown 101 workspace, Encinitas |
| 0e | 6 | Newcomers Welcome BBQ | newcomers-welcome-bbq | +11d 16:00 | Orpheus Park, Encinitas |
| 0f | 12 | Trail + Taproom Saturday | vista-trail-taproom | +13d 08:30 | Vista trailhead → local taproom |
| 10 | 7 | Sunrise Reef Plunge | cardiff-sunrise-reef-plunge | +2d 06:30 | Cardiff reef beach access |

## B.5 Schema rules (copy the column lists; do NOT deviate)

**Wrap the file in `BEGIN; … COMMIT;`.** Resolve the North County region once via
a temp ctx table cross-joined into the profile insert (mirror the SD template):

```sql
CREATE TEMP TABLE _ctx ON COMMIT DROP AS
SELECT COALESCE(
  (SELECT id FROM nexus_regions WHERE name='North County' ORDER BY depth LIMIT 1),
  (SELECT id FROM nexus_regions WHERE name='San Diego'    ORDER BY depth LIMIT 1),
  (SELECT id FROM nexus_regions WHERE depth=0 ORDER BY name LIMIT 1)
) AS region_id,
(SELECT id FROM topical_channels WHERE slug='<this circle channel>') AS channel_id;
```

- **circles** — `INSERT INTO circles (id,name,slug,hub_id,type,member_cap,status,about,latitude,longitude,neighborhood,city,topical_channel_id,image_url,is_demo)`; `hub_id` = `NULL`, `type='in-person'`, `member_cap=50`, `status='active'`, `image_url='https://picsum.photos/seed/'||slug||'/400/400'`, `is_demo=true`. **Do NOT set `member_count`** — the membership trigger maintains it.
- **profiles** — `INSERT INTO profiles (id,auth_user_id,display_name,handle,community_role,nexus_region_id,bio,avatar_url,current_season_rank,current_season_zaps,lifetime_zaps,lifetime_gems,current_streak,longest_streak,achievement_count,season_challenges_complete,last_seen_at,is_active,is_demo)`. `auth_user_id=NULL`; `is_active=true`; `is_demo=true`. `avatar_url='https://i.pravatar.cc/240?u='||handle` for ~75%, else `NULL`. `last_seen_at = now() - (random minutes)` — leaders recent (mins–hrs), ghosts older (days). `season_challenges_complete=true` **only** for Luminaries (else false). Stats sit inside the rank's §3 band; `current_season_zaps` ≤ `lifetime_zaps`; `longest_streak ≥ current_streak`.
  - **community_role** (the volunteer title, an enum `member|crew|host|guide|mentor`): exactly **1 host** (the top-ranked person), **2 crew**, **1 guide**, optionally **1 mentor**; everyone else **member**. Rank (`current_season_rank`) is separate gamification — a `member` can still be a high-zap Operative.
  - **handles** globally unique — prefix-namespace yours so they never collide across circles (e.g. append nothing fancy, just use distinct real-sounding handles; if in doubt suffix a circle initial).
- **memberships** — `INSERT INTO memberships (profile_id,circle_id,status,volunteer_role) … status='active'::membership_status, volunteer_role = NULLIF(community_role,'member'::community_role)` (join profiles to read role, per template). One row per member → their own circle. **No cross-memberships here** (handled in the weave migration).
- **posts** — `INSERT INTO posts (id,author_id,scope_id,visibility,body,created_at,is_demo)`; `scope_id`=circle id, `visibility='group'::post_visibility`, `is_demo=true`, `created_at = now() - (random 0–45 days/hours)`. Posts-per-author by rank: Lum 4 · Con 3 · Agt 2 · Op ~1–2 · Run 1 · Ghost: **~75% write ONE short newcomer post, ~25% write none** (silent — they still get a membership). Voice each post to the author's role + the circle's vibe; ≥1 post should reference each of the circle's events (an announcement for upcoming, a recap for past). Use `''` to escape apostrophes.
- **replies** — same `posts` table with `parent_id` set to one of this circle's top-level post ids; use the reply UUID block. ~8–14 replies per circle, clustered on the liveliest 3–4 posts. `INSERT INTO posts (id,author_id,parent_id,scope_id,visibility,body,created_at,is_demo)`.
- **events** — `INSERT INTO events (id,host_id,scope_id,scope_type,title,slug,starts_at,ends_at,location,is_cancelled,is_demo)`; `host_id`=this circle's host profile id, `scope_id`=circle id, `scope_type='circle'`, `is_cancelled=false`, `is_demo=true`. Build times per B.4.
- **circle_practices** — one row: `INSERT INTO circle_practices (circle_id,practice_id,set_by,active) VALUES (<circle>, '<e1…active practice>', <host id>, true)`.
- Every insert ends with `ON CONFLICT (id) DO NOTHING` (or the natural-key conflict target for memberships/circle_practices), so re-runs are safe.

**Voice:** warm, specific, local, lower-case-casual, light emoji. Match the
register of the SD template's posts. No corporate tone. Real place names.
