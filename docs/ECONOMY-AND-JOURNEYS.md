# Member economy + Journeys (premium) — spec (draft for review)

Status: ⏳ **draft, pre-build.** Extends ADR-084 (Beta = Crew) and the Quest economy
(zaps/gems/seasons). Decisions in §6 are open.

> ⚠️ **Terminology updated ([ADR-087](DECISIONS.md)).** What this doc calls the premium,
> Crew-gated, tracked "Journey" engine is now named **"Quests"** (`quest_chains`,
> `/crew/quests`). The name **"Journeys"** now means the **open, free, member-built**
> practice-combo library (backlog §Q1) — *not* gated. So below: read "Journeys (premium)"
> as **"Quests (premium)"**; the free DIY practice-combo plans are the new open
> **Journeys**. This doc gets a full terminology pass when §Q1 builds.

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
| Choose/log **individual practices** | ✅ (the loose equivalent) | ✅ |
| **Journeys** (the tracked, all-in-one flow) | ❌ browse only → upgrade | ✅ |

This is the Launch member experience. **In Beta everyone is Crew (ADR-084)**, so the
whole thing is unlocked today; the gates below switch on when `BETA_MEMBERS_GET_CREW`
flips off. The `CrewGate` + preview-banner pattern (already shipped on the Store) is
how each gate reads: browse freely, muted, click → upgrade lightbox.

## 3. Two currencies, reconciled

- **Gems = the web / on-platform currency.** Earned by keeping the community warm
  between gatherings (post, comment, react, welcome, RSVP). Daily-capped so they
  can't be farmed; spendable in the Vault — by Crew. For a Member they pile up, inert.
- **Zaps = the showing-up currency** that drives **season ranks** — *the weight of
  being there*. Earned by **in-person + outreach** acts, the biggest rewards living
  off the screen. Harder to earn, and for a Member **harder still** (a lower rate /
  level cap, §6); Member zaps accumulate but stay **inert**.

**Reward ladder** (live in `gem_config` / `zap_config`; ADR-104 / the
`…_economy_rebalance` migration). Tuned so a ~13-week season lands a **casual member
at Operative (300+)**, a **regular at Agent (750+)**, and a **real leader at
Conduit→Luminary (1500–3000)**:

| ⚡ Zaps — in-person + outreach | | 💎 Gems — web / on-platform (capped) | |
| :-- | --: | :-- | --: |
| Found a real circle | 100 | Finish an Arc | 30 |
| Host an in-person event | 60 | Complete a season challenge | 15 |
| Activate / claim a circle | 40 | Welcome a newcomer | 8 |
| An invite you sent joins | 40 | RSVP to an event | 5 |
| Show up (verified check-in) | 25 | Join a circle | 5 |
| Outreach task (flyer/QR) | 20 | Post (≤3/day) | 3 |
| Log a real-world practice | 12 | Reply (≤5/day) | 2 |
| Capture a ghost node | 10 | Daily login (1/day) · React (≤5/day) | 2 · 1 |

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
- **Crew-only, full stop.** Journeys are tracked, gamified, all-in-one programs — a
  member can't join *or* build one. They can **browse** every journey (see the value,
  the steps, the coaching) → upgrade lightbox on "Start". The closest a free member
  gets is **choosing individual practices** on their own: it approximates a journey but
  isn't the cohesive, tracked, all-in-one flow, and it's harder to follow. That gap is
  deliberate — the curated tracked program is the premium thing.
- **Exclusivity.** You can only see the inside of Journeys you're part of; you can't
  engage with others' journeys.
- **Streaks stay free.** A member always keeps their own practice streaks and collects
  the (dead) rewards — the North-Star loop is never paywalled.

Net: Journeys become the clearest reason to pay — seasonal, pillar-aligned coaching
you can only *do* as Crew.

## 6. Decisions

**Locked:**
- **Member zap rate → lower multiplier.** Members earn Zaps at a reduced rate (they
  climb, slowly). Gems stay easy.
- **Journeys are Crew-only — no member DIY.** Free members get individual practices,
  not the tracked all-in-one Journey flow.
- **Rename depth → full.** `arc_* → journey_*` tables + `/crew/journeys` route +
  `/crew/arcs` redirect. ✅ Done (ADR-085).

**Still open:**
- **Member rank display.** Show an inert "Ghost" rank, or **no rank** at all on a free
  member's public profile?
- **Endorsement set.** Confirm what becomes profile-endorsed (rank badge · titles ·
  store cosmetics · journey badges) vs merely earned.
- **Authoring.** Who builds the seasonal journeys, and where (admin content tool)?

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
