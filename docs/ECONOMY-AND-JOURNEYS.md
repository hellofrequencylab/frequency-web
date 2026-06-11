# Member economy + Journeys (premium) — spec (draft for review)

Status: ⏳ **draft, pre-build.** Extends ADR-084 (Beta = Crew) and the Quest economy
(zaps/gems/seasons). Decisions in §6 are open.

> 🔴 **Superseded in part by [ADR-152](DECISIONS.md) (2026-06-06): Quests + Journeys are FREE.**
> The premium-Journeys framing throughout this doc (§2 tiers row, §5 "premium marquee") no
> longer holds — the paywall on adopting/forking/publishing/starting is gone. The canon
> hierarchy is **Quest → Journey → Practice** ([NAMING.md](NAMING.md), ADR-208): **The Quest**
> (the game brand) → a **Quest** (a season's 13-week instance + its official, free container of
> Journeys) → **Journeys** (practice-combos; official inside a Quest, member-built in the open
> library) → **Practices**, all free. *("Seasonal Quest" is retired phrasing.)* **Only**
> rank-endorsement (ADR-141) and Gem **spend** (Store) remain Crew-gated. Read the rest of this
> doc as historical context for those *remaining* gates, not for Quests/Journeys.
>
> 🔴 **Naming canon ([NAMING.md](NAMING.md), ADR-208):** wherever this doc says "points," read
> **Zaps/Gems**; ranks **Operative/Agent** are now **Signal/Beacon**; **Arc** is retired (the
> engine is dropped). Schema source of truth: migrations `2026061300*`.

## 1. The principle (lead with the answer)

**Everyone plays. Only payers cash in.** Every member — paying or not — can fully
use Circles, events, posting, friends, and practices, and **earns Zaps and Gems by
doing so**. The free tier is generous on *participation* and *earning*, but the
balance is **"dead"**: visible and racking up, but not spendable, not shown as
endorsements, and not enough to unlock the premium Journeys. That gap is the upsell:
*"look at everything you've earned — upgrade to actually use it."*

## 2. The tiers

| | **Member** (free) | **Crew** (paid · free in Beta) |
|---|---|---|
| Circles · events · posts · friends · practices | ✅ full | ✅ full |
| **Earn Gems** (web engagement) | ✅ easy | ✅ |
| **Earn Zaps** (showing up) | ✅ but **slow / level-capped** | ✅ full rate |
| See own Zaps/Gems + rewards racking up | ✅ (dead) | ✅ |
| **Spend Gems** (Store) | ❌ → upgrade lightbox | ✅ |
| **Zaps drive season ranks** | ❌ (inert) | ✅ |
| **Endorsements on public profile** (rank badge, titles, journey badges) | ❌ earned, not shown | ✅ |
| Keep personal **practice streaks** | ✅ always | ✅ |
| Choose/log **individual practices** | ✅ (the loose equivalent) | ✅ |
| **Journeys** (the tracked, all-in-one flow) | ✅ *(free — ADR-152)* | ✅ |

This is the Launch member experience. **In Beta everyone is Crew (ADR-084)**, so the
whole thing is unlocked today; the gates below switch on when `BETA_MEMBERS_GET_CREW`
flips off. The `CrewGate` + preview-banner pattern (already shipped on the Store) is
how each gate reads: browse freely, muted, click → upgrade lightbox.

## 3. Two currencies, reconciled

- **Gems = the web / on-platform currency.** Earned by keeping the community warm
  between gatherings (post, comment, react, welcome, RSVP). Daily-capped so they
  can't be farmed; spendable in the Vault — by Crew. For a Member they pile up, inert.
- **Zaps = the showing-up currency** that drives **season ranks** — *the weight of
  being there*. Earned by **in-person + outreach** acts (and **every practice log**,
  personal or circle — the real-world doing), the biggest rewards living off the
  screen. **Everyone earns at full rate** (Rewards Economy v2: the old
  `MEMBER_ZAP_RATE = 0.5` throttle is deleted — the free game is the principle;
  ADR-141 visibility gating is the membership value).
- **Amplitude — the lifetime layer (Rewards Economy v2).** `profiles.amplitude` =
  lifetime cumulative Zaps, hosting-class actions (`event_host`, `program_run`,
  `circle_start`, `circle_activate`) counting **2×**. Accrued ONLY in
  `after_zap_transaction()`; never decremented, never spent, never gates play.
  Level derives on read: largest L where `50·L·(L+1) ≤ amplitude`
  (`lib/amplitude.ts`); milestones at 1k/5k/10k/25k/50k/100k mint permanent Awards
  (1k "First Thousand" + 5k "Five K" seeded for S1). Displayed beside the season
  rank ("Beacon · 14,200"). Supersedes the ADR-037 lifetime-rank *display*; the
  `lifetime_rank` column + ratchet stay for the retro reward rules. **Gem tiers
  (New→Legend) are retired.**
- **Season rank vs. lifetime rank (ADR-164).** The **season rank** advances with this
  season's zaps and resets to `ghost` at each `reset_season()`. The **lifetime rank** is a
  separate, **locked peak** (`profiles.lifetime_rank`) that only ever moves up and survives
  every reset — the durable credential you "lock in." The zap trigger ratchets it to the
  season peak automatically; the season reset also locks it from the final rank (catching
  manual Luminary promotions) before wiping the season. The member sees it on their own Vault
  (the Store widget + the "how you earned" headline); public display still follows ADR-141.
  Ranks are `ghost → echo → signal → beacon → conduit → luminary` (`season_rank_enum`;
  renamed 2026 — see docs/NAMING.md; migration `20260613000030`).
- **Season-end Zap → Gem rollover — flat 5:1 + rank bonus (Rewards Economy v2).**
  At season end, `reset_season()` (migration `20260614200000`) converts
  `floor(season_zaps / 5)` into Gems **for everyone**, plus a **one-time
  final-rank bonus**:

  | Final rank | Bonus Gems |
  | :-- | --: |
  | Echo | 10 |
  | Signal | 25 |
  | Beacon | 50 |
  | Conduit | 100 |
  | Luminary | 250 |

  Both grants are claim-then-pay through `reward_grants` (re-running the reset can
  never double-pay). The reset also mints a **season trophy** (final rank + season
  Zaps stamped) for every profile with ≥1 practice log or any season Zaps, and the
  Season 1 close grants the **Founding Season stamp** (the `season-one`
  achievement) to everyone who practiced. This resolves the earlier provisional
  rank-based sliding ladder (5:1→1.5:1, retired).

> **Categorization is canonical (ADR-139): online → Gems, real life → Zaps — and
> it applies to the meta-layer too.** Achievements, season challenges, and Journeys
> pay the currency of the act they reward, not a flat zap bounty. So "Make 5 posts"
> pays gems; "Attend 8 events" pays zaps; a Journey that mixes both pays each step
> in kind and the chain in the currency of its real-world steps. One source of truth:
> `currencyForCriteria` (`lib/engagement/currency.ts`). Every grant is ledgered
> (`gem_transactions` / `zap_transactions`) and shown to the member in the Vault's
> **"how you earned" log** (`/crew/store/ledger`) — the transparency that makes
> "look at everything you've earned" land.

**Reward ladder** (live in `gem_config` / `zap_config`; ADR-104 / the
`…_economy_rebalance` migration). Tuned so a ~13-week season lands a **casual member
at Signal (300+)**, a **regular at Beacon (750+)**, and a **real leader at
Conduit→Luminary (1500–3000)** *(Signal/Beacon replace the retired Operative/Agent —
NAMING.md/ADR-208)*:

| ⚡ Zaps — in-person + outreach | | 💎 Gems — web / on-platform (capped) | |
| :-- | --: | :-- | --: |
| Found a real circle | 100 | Finish a Journey | 30 |
| Host an in-person event | 60 | Complete a season challenge | 15 |
| Activate / claim a circle | 40 | Welcome a newcomer | 8 |
| An invite you sent joins | 40 | RSVP to an event | 5 |
| Show up (verified check-in) | 25 | Join a circle | 5 |
| Outreach task (flyer/QR) | 20 | Post (≤3/day) | 3 |
| Log a practice — light / standard / heavy | 8 / 12 / 15 | Reply (≤5/day) | 2 |
| Capture a ghost node | 10 | Daily login (1/day) · React (≤5/day) | 2 · 1 |

**Rewards Economy v2 additions** (all live-tunable in `zap_config`):
`practices.weight_class` drives the per-log payout (8/12/15 — supersedes the
`reward_zaps` override) · **Co-op Pulse +3⚡** (3+ circle members log the same
adopted Journey the same day; nightly job, once per member/journey/day) ·
**Welcome Back +10⚡** (first log after a 7+ day gap, once per gap, warm re-entry
UI — never streak shame) · **Full Cycle +50⚡** (13 consecutive on-track weeks on
one practice, one-time per practice; all other per-practice tiers are badge-only).
Streak freezes gain a second earn path: **every 5 Full Day bonuses = +1 freeze**
(cap 2, banks while full; never purchasable). The **Practice Shelf** on the profile
shows each practice's consistency tier (In Motion 2w / Groove 4w / Deep Groove 8w /
Full Cycle 13w, permanent ring) + depth count (10/25/50/100 Deep, never resets).

So a free member *feels* the game (counters climbing, streaks alive) without getting
its status payoff. Paying flips the earned Zaps/Gems from dead to live.

## 4. Endorsements (the status layer)

Rewards split into **earned** vs **endorsed**:
- **Earned** (everyone): the underlying achievement/record exists and shows in *your
  own* dashboard.
- **Endorsed** (Crew only): rank badges, custom titles, store cosmetics, and
  **Journey-completion badges** that render on your **public profile + people cards**.
  A free member's public profile shows no rank/endorsement, however much they've
  earned. This is a core part of the upsell.

## 5. Journeys — the premium marquee

> 🔴 **Superseded by [ADR-152](DECISIONS.md): Journeys are free.** This section described
> Journeys as the Crew-only upsell; that gate is removed. Kept for history — the *remaining*
> Crew gates are rank-endorsement (ADR-141) and Gem spend (Store), not Journeys.

A **Journey** is a curated, multi-step **practice track** — a coaching package with a
narrative arc. *(This section's old engine — the legacy action-chain engine (dropped,
ADR-152) — is obsolete; the spine is now `journey_plans` and the chain engine is
dropped. See [JOURNEYS.md](JOURNEYS.md).)*

- **Seasonal issuance.** Each season ships **4 primary tracks — one per Pillar**
  (Mind · Body · Spirit · Expression) — plus a handful of **bonus micro-journeys**
  (short Zap/Gem earners).
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
- ~~**Member zap rate → lower multiplier.**~~ 🔴 **Reversed by Rewards Economy v2**
  (see the superseding ADR): `MEMBER_ZAP_RATE` is deleted — everyone earns Zaps at
  full rate. It was inert in Beta, so zero behavior change; the membership value is
  ADR-141 visibility gating, not throttled earning.
- **Journeys are Crew-only — no member DIY.** Free members get individual practices,
  not the tracked all-in-one Journey flow. ✅ Join-gating done (ADR-140): `startQuest`
  is Crew-gated; `/crew/quests` browse + CrewGate Start.
- **Rename depth → full.** `arc_* → journey_*` tables + `/crew/journeys` route +
  `/crew/arcs` redirect. ✅ Done (ADR-085).

**Resolved ([ADR-141](DECISIONS.md)):**
- **Member rank display → no rank** at all on a free member's public profile (no inert
  chip). The rank reappears on upgrade. `isEndorsed(role)` gates it; inert in Beta.
- **Endorsement set → rank only, for now.** The rank badge is Crew-gated; streak,
  achievement count, and gem count stay visible for everyone as *earned* stats (gem
  *tiers* are retired — Rewards Economy v2). Cosmetics, titles, and Journey badges
  ride the same `isEndorsed` gate once they render publicly.

**Still open:**
- **Authoring.** Who builds the seasonal journeys, and where (admin content tool)?

## 7. Build order (once §6 lands)

1. ✅ Rename Arcs → Journeys (user-facing).
2. ✅ **Earning open + spend/rate gated** — member zap-rate multiplier (ADR-140); Store
   spend gated + balance = earned − spent (ADR-140). Rank/endorsement suppression on
   free profiles still pending (see Endorsement layer below).
3. ✅ **Journey gating** — `/crew/quests` browse; **Start** gated to Crew (CrewGate);
   preview banner (ADR-140).
4. ✅ **Seasonal journeys** — official Journeys are seeded one per Pillar for the active season
   (ADR-139/140; the spine is now `journey_plans`, the legacy action-chain engine is dropped, ADR-152).
   Authoring surface still pending.
5. ✅ **DIY journey builder** — the **Studio** window: pick practices → a personal journey,
   with emoji/accent identity, a markdown intro, drag-reorder steps, per-step cadence/note, a
   live Pillar balance, and share-to-library (Crew). Reusable shell for future entities (ADR-142).
6. ✅ **Endorsement layer** — rank shown on public profile + people cards + post flair is
   Crew-gated via `isEndorsed` (ADR-141); free profiles show earned stats but no rank.
   Cosmetics/titles/journey badges ride the same gate when they render.

## Active-Journey progress (2026-06-06, ADR-144)

Adopting a Journey adds its practices to the daily log (no separate tracker), and the
member's **live progress is derived from `practice_logs`** — there is **no new schema**.
`getActiveJourneyProgress()` (`lib/journey-plans.ts`) loads the member's active adoption
(`journey_plan_adoptions` + `journey_plan_items`), then for each step computes
**done-this-week** by comparing the logs in the current week against the step's cadence
target — `weeklyTargetFromCadence()` maps a daily cadence to "most days" and a weekly one
to once. A step is **on track** once it hits its weekly target; the first not-yet-on-track
step is the **current step**. `circleCompanions()` counts how many people in the member's
circle have adopted the same Journey ("N in your circle doing this too").

Surfaces:

- **`/crew/journey`** — the *Your Journey* Dashboard tab: the ordered, domain-grouped
  checklist, the highlighted next step with a quick **Log** button, and a rewards panel
  (season zaps/rank, streak, gems) reinforcing that logging a Journey practice is the one
  move that advances the Journey *and* earns the rewards.
- **Home feed** — the `JourneyBoard` shows the **current-step line** so the next thing to do
  greets the member on arrival.

This realizes **BACKLOG §Q** ("active Journey plan on the board"). Member-facing how-to
lives in `content/help/the-game/your-journey.md`.
