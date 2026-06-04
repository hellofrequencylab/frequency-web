# Member economy + Journeys (premium) — spec (draft for review)

Status: ⏳ **draft, pre-build.** Extends ADR-084 (Beta = Crew) and the Quest economy
(zaps/gems/seasons). Decisions in §6 are open. "Arcs" are renamed **Journeys**
(user-facing done; internal `arc_*` tables/route kept for now).

## 1. The principle (lead with the answer)

**Everyone plays. Only payers cash in.** Every member — paying or not — can fully
use Circles, events, posting, friends, and practices, and **earns points by doing
so**. The free tier is generous on *participation* and *earning*, but the points
are **"dead"**: visible and racking up, but not spendable, not shown as
endorsements, and not enough to unlock the premium Journeys. That gap is the upsell:
*"look at everything you've earned — upgrade to actually use it."*

## 2. The tiers

| | **Member** (free) | **Crew** (paid · free in Beta) |
|---|---|---|
| Circles · events · posts · friends · practices | ✅ full | ✅ full |
| **Earn Gems** (web engagement) | ✅ easy | ✅ |
| **Earn Zaps** (showing up) | ✅ but **slow / level-capped** | ✅ full rate |
| See own points + rewards racking up | ✅ (dead) | ✅ |
| **Spend Gems** (Store) | ❌ → upgrade lightbox | ✅ |
| **Zaps drive season ranks** | ❌ (inert) | ✅ |
| **Endorsements on public profile** (rank badge, titles, journey badges) | ❌ earned, not shown | ✅ |
| Keep personal **practice streaks** | ✅ always | ✅ |
| **Join a Journey** | ❌ browse only → upgrade | ✅ |
| Build a **DIY journey** from practices | ✅ basic | ✅ |

This is the Launch member experience. **In Beta everyone is Crew (ADR-084)**, so the
whole thing is unlocked today; the gates below switch on when `BETA_MEMBERS_GET_CREW`
flips off. The `CrewGate` + preview-banner pattern (already shipped on the Store) is
how each gate reads: browse freely, muted, click → upgrade lightbox.

## 3. Two currencies, reconciled

- **Gems = the web/engagement currency.** Easy to earn (post, comment, react, invite).
  Spendable in the Store — by Crew. For a Member they pile up, inert.
- **Zaps = the showing-up currency** that drives **season ranks**. Harder to earn, and
  for a Member **harder still** (a lower rate / level cap, §6). Member zaps accumulate
  but stay **inert** — no rank progression, no profile endorsement.

So a free member *feels* the game (counters climbing, streaks alive) without getting
its status payoff. Paying flips the points from dead to live.

## 4. Endorsements (the status layer)

Rewards split into **earned** vs **endorsed**:
- **Earned** (everyone): the underlying achievement/record exists and shows in *your
  own* dashboard.
- **Endorsed** (Crew only): rank badges, custom titles, store cosmetics, and
  **Journey-completion badges** that render on your **public profile + people cards**.
  A free member's public profile shows no rank/endorsement, however much they've
  earned. This is a core part of the upsell.

## 5. Journeys — the premium marquee

A **Journey** is a curated, multi-step **practice track** — a coaching package with a
narrative arc, built on the existing `arc_chains`/`arc_steps` engine.

- **Seasonal issuance.** Each season ships **4 primary tracks — one per Pillar**
  (Mind · Body · Spirit · Expression) — plus a handful of **bonus micro-journeys**
  (short, point-rackers).
- **Crew-only to JOIN.** Members can **browse** every journey (see the value, the
  steps, the coaching) but can't join or progress → upgrade lightbox on "Start".
- **DIY journeys.** Anyone can assemble a personal journey from multiple practices,
  but it's intentionally plainer than the curated tracks (no narrative, no seasonal
  rewards, no badge). The pre-built tracks are the draw.
- **Exclusivity.** You can only see the inside of Journeys you're part of; you can't
  engage with others' journeys.
- **Streaks stay free.** A member always keeps their own practice streaks and collects
  the (dead) rewards — the North-Star loop is never paywalled.

Net: Journeys become the clearest reason to pay — seasonal, pillar-aligned coaching
you can only *do* as Crew.

## 6. Open decisions (need your call)

1. **Member zap rate.** Harder-by-level means: (a) a flat lower multiplier (e.g. 0.25×),
   (b) a hard per-season zap cap, or (c) members earn **Gems only**, zero zaps. Which?
2. **Member rank display.** Show an inert "Ghost" rank, or **no rank** at all on a free
   member's profile?
3. **DIY journeys** available to members (basic), or Crew-only too?
4. **Endorsement set.** Confirm what becomes profile-endorsed (rank badge · titles ·
   store cosmetics · journey badges) vs merely earned.
5. **Authoring.** Who builds the seasonal journeys, and where (admin content tool)?
6. **Rename depth.** Keep `arc_*` tables + `/crew/arcs` route internal, or do the full
   DB/route rename to `journeys`? (Migration churn vs consistency.)

## 7. Build order (once §6 lands)

1. ✅ Rename Arcs → Journeys (user-facing).
2. **Earning stays open for members; ranks/endorsements/spend gate** — member zaps at
   the chosen rate; rank + endorsements suppressed on free profiles; Store spend gated
   (done). 
3. **Journey gating** — browse open, **Join** gated to Crew (CrewGate), preview banner.
4. **Seasonal journeys** — link `arc_chains` to a season + a Pillar; ship 4 primary +
   micro tracks per season; authoring surface.
5. **DIY journey builder** — pick practices → a personal journey.
6. **Endorsement layer** — the profile/people-card badge rendering, Crew-gated.
