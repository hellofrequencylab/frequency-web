# Member economy + Journeys (premium): spec (draft for review)

Status: ⏳ **draft, pre-build.** Extends ADR-084 (Beta = Crew) and the Quest economy
(zaps/gems/seasons). Decisions in §6 are open.

> ✅ **The economy is canonized in [REWARDS-ECONOMY.md](REWARDS-ECONOMY.md) (Rewards Economy v3,
> [ADR-305](DECISIONS.md), 2026-06-18).** Read that first for the live model. This page is the
> Journeys-and-membership context; its economy mechanics are updated to match v3 inline below.
> **Cut in v3 (do not build):** Co-op Pulse / Co-op Synchrony / Carrier Wave / Circle Current,
> the Practice Shelf (consistency/depth ladders), Side Quests, witnessed/secret awards, the
> retroactive reward *rules engine*, the recruiter reward *leaderboard*, and the v2 escalating
> per-Journey Gem bonus. **Added in v3:** validated creation rewards, the Certificate capstone,
> Gem gifting + buyable streak freeze, and the single payout-profile classifier. Wherever this
> doc still shows a cut mechanic, REWARDS-ECONOMY.md wins.

> 🔴 **Superseded in part by [ADR-152](DECISIONS.md) (2026-06-06): Quests + Journeys are FREE.**
> The premium-Journeys framing throughout this doc (§2 tiers row, §5 "premium marquee") no
> longer holds. The paywall on adopting/forking/publishing/starting is gone. The canon
> hierarchy is **Quest → Journey → Practice** ([NAMING.md](NAMING.md), ADR-208): **The Quest**
> (the game brand) → a **Quest** (a season's 13-week instance + its official, free container of
> Journeys) → **Journeys** (practice-combos; official inside a Quest, member-built in the open
> library) → **Practices**, all free. *("Seasonal Quest" is retired phrasing.)* **Only**
> rank-endorsement (ADR-141) and Gem **spend** (Store) remain Crew-gated. Read the rest of this
> doc as historical context for those *remaining* gates, not for Quests/Journeys.
>
> 🔴 **Naming canon ([NAMING.md](NAMING.md), ADR-208 + ADR-283 to 286):** wherever this doc says "points," read
> **Zaps/Gems**; the old 6-rank Zap-threshold ladder (Echo/Signal/Beacon/Conduit/Luminary) is
> **retired**. Ranks are now **Ghost → Initiate → Adept → Master** (completion-based, ADR-283);
> **Arc** is retired (the engine is dropped). Schema source of truth: migrations `2026061300*`
> and `20260628000000` / `20260628010000`.

## 1. The principle (lead with the answer)

**Everyone plays. Only payers cash in.** Every member (paying or not) can fully
use Circles, events, posting, friends, and practices, and **earns Zaps and Gems by
doing so**. The free tier is generous on *participation* and *earning*, but the
balance is **"dead"**: visible and racking up, but not spendable, not shown as
endorsements, and not enough to unlock the premium Journeys. That gap is the upsell:
*"look at everything you've earned. Upgrade to actually use it."*

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
| **Journeys** (the tracked, all-in-one flow) | ✅ *(free, ADR-152)* | ✅ |

This is the Launch member experience. **In Beta everyone is Crew (ADR-084)**, so the
whole thing is unlocked today; the gates below switch on when `BETA_MEMBERS_GET_CREW`
flips off. The `CrewGate` + preview-banner pattern (already shipped on the Store) is
how each gate reads: browse freely, muted, click → upgrade lightbox.

## 3. Two currencies, reconciled

- **Gems = the web / on-platform currency.** Earned by keeping the community warm
  between gatherings (post, comment, react, welcome, RSVP). Daily-capped so they
  can't be farmed; spendable in the Vault, by Crew. For a Member they pile up, inert.
  **Gems model (Rewards Economy v3, ADR-305):** `lifetime_gems` is **monotonic** (= total
  earned, only ever up); **spendable balance = `lifetime_gems` minus the sum of redemptions**.
  New Gem sinks: **gift Gems** to another member, and **buy a streak freeze**.
- **Zaps = the showing-up currency**: *the weight of being there*. Earned by
  **in-person + outreach** acts (and **every practice log**, personal or circle: the
  real-world doing), the biggest rewards living off the screen. Also earned when
  finishing a Journey (+75 Zaps) or an Expression Challenge (+50 Zaps in person).
  Zaps accumulate and roll to Gems at season end (5 to 1 flat). They do **not** directly
  gate season rank: rank is completion-based (ADR-283). **Everyone earns at full rate**
  (Rewards Economy v2: the old `MEMBER_ZAP_RATE = 0.5` throttle is deleted, the free
  game is the principle; ADR-141 visibility gating is the membership value).
- **Amplitude: the lifetime layer (Rewards Economy v2).** `profiles.amplitude` =
  lifetime cumulative Zaps, hosting-class actions (`event_host`, `program_run`,
  `circle_start`, `circle_activate`) counting **2×**. Accrued ONLY in
  `after_zap_transaction()`; never decremented, never spent, never gates play.
  Level derives on read: largest L where `50·L·(L+1) ≤ amplitude`
  (`lib/amplitude.ts`); milestones at 1k/5k/10k/25k/50k/100k mint permanent Awards
  (1k "First Thousand" + 5k "Five K" seeded for S1). Displayed beside the season rank.
  Supersedes the ADR-037 lifetime-rank *display*; the `lifetime_rank` column + ratchet
  stay for the retro reward rules. **Gem tiers (New→Legend) are retired.**
- **Season rank: completion-based (ADR-283).** Season rank = how many Journeys
  the member finished this season: **Ghost (0) → Initiate (1) → Adept (2) → Master (3)**.
  Rank advances automatically the moment a Journey is finished. No Zap threshold, no
  manual promotion, no challenge gate. Resets to `ghost` at each `reset_season()`. The
  **lifetime rank** (`profiles.lifetime_rank`) is a separate locked peak that only ever
  moves up and survives every reset. The member sees it in the Vault; public display
  follows ADR-141. (`season_rank_enum` migrated to 4 values in
  `20260628010000_quest_completion_model.sql`; ADR-286.)
- **Journey completion rewards (Rewards Economy v3, ADR-305).** Finishing a Journey pays:
  - **+75 Zaps** (in-person activity credit)
  - **A Pillar Trophy** (Mind / Body / Spirit), minted in `season_trophies`
  - Finishing **all three** caps the set: **Master** rank + the **Certificate** (a unique
    cosmetic + **100 Gems**, no extra Zaps).

  🔴 **The v2 escalating per-Journey Gem bonus (Initiate 25 / Adept 50 / Master 100) is
  retired.** Recognition now rides Pillar Trophies + the Certificate. Per-act payouts stay
  modest on purpose (intrinsic-motivation framing; see REWARDS-ECONOMY.md §11).
- **Expression Challenge reward.** The Expression Challenge that caps each Journey pays
  **+50 Zaps** when completed in person at a Circle, or **+30 Gems** when posted solo
  online. Required to finish the Journey. Fires through `reward_grants` (claim-then-pay,
  can never double-pay).
- **Season-end Zap → Gem rollover: flat 5 to 1 (Rewards Economy v2).**
  At season end, `reset_season()` (migration `20260614200000`) converts
  `floor(season_zaps / 5)` into Gems **for everyone** (no rank bonus: the final-rank
  bonus is retired; per-Journey Trophy rewards replace it). The reset also mints a
  **season trophy** for every profile with ≥1 practice log or any season Zaps, and the
  Season 1 close grants the **Founding Season stamp** (the `season-one` achievement)
  to everyone who practiced. Rollover is claim-then-pay through `reward_grants`
  (re-running the reset can never double-pay).

> **Categorization is canonical (ADR-139): online → Gems, real life → Zaps. And
> it applies to the meta-layer too.** Achievements, season challenges, and Journeys
> pay the currency of the act they reward, not a flat zap bounty. So "Make 5 posts"
> pays gems; "Attend 8 events" pays zaps; a Journey that mixes both pays each step
> in kind and the chain in the currency of its real-world steps. One source of truth:
> `currencyForCriteria` (`lib/engagement/currency.ts`). Every grant is ledgered
> (`gem_transactions` / `zap_transactions`) and shown to the member in the Vault's
> **"how you earned" log** (`/crew/store/ledger`): the transparency that makes
> "look at everything you've earned" land.

**Reward ladder** (live in `gem_config` / `zap_config`; ADR-104 / the
`…_economy_rebalance` migration). Tuned so a member who finishes all three Journeys
reaches **Master** by season end. Journey rewards (Zaps + Trophy + Gems) are the primary
rank driver; the table below covers base activity:

| ⚡ Zaps: real world + durable contribution (no caps) | | 💎 Gems: online (daily-capped) | |
| :-- | --: | :-- | --: |
| Found / start a circle | 100 | Welcome a newcomer (3/day) | 8 |
| Validated creation: your Journey first used | 100 | RSVP to an event (per event) | 5 |
| Finish a Journey (+ a Pillar Trophy) | 75 | Join a circle (per circle) | 5 |
| Host an event | 60 | Post (5/day) | 3 |
| Expression Challenge (in person at Circle) | 50 | Comment / reply (8/day) | 2 |
| Validated creation: your event first used | 50 | Share (5/day) | 2 |
| Validated creation: your practice first used | 40 | Daily presence (1/day) | 2 |
| Verified event check-in | 25 | React (8/day) | 1 |
| Outreach task (flyer/QR) | 20 | Creation token on first publish: Journey / event / practice | +5 / +5 / +3 |
| Log a practice: by cadence (Daily / 3x-wk / Weekly) | 10 / 15 / 25 | Validated creation bonus: Journey / event / practice | +25 / +10 / +10 |
| Log a practice: weight-class fallback (light / std / heavy) | 8 / 12 / 15 | Expression Challenge (solo online) | 30 |

**Classifier (Rewards Economy v3, ADR-305).** One source of truth returns a payout profile
`{ zaps, gems }` per act: real-world → Zaps, online → Gems, creation → both. **Logging a
practice is Zaps only** (the log is the record, not the point). A practice's per-log Zap value
is `reward_zaps` when set (cadence: Daily 10 / 3x-week 15 / Weekly 25, ADR-303), else the
`practices.weight_class` default (8/12/15).

**Validated creation (Rewards Economy v3).** Publishing a Journey / event / practice pays only
the small **Gem creation token** above (first publish only, never on edits/duplicates, soft cap
3/day). The **large payout** (the validated Zaps + the validated Gem bonus above) lands when the
asset is **first used by a distinct, established member** (email-verified, not the creator, not
invited by the creator; use = adopt a Journey / log a practice / RSVP to an event). Paid once
per asset (`creation_validated:{type}:{id}`), **uncapped**, carrying an actor (the user) and a
beneficiary (the creator). UX: publish says "you'll earn when a member uses this"; the payout
arrives as a notification.

**Streaks + variable layer (Rewards Economy v3).** **Welcome Back +10⚡** (first log after a 7+
day gap, once per gap, warm re-entry UI, never streak shame). A **streak freeze** the member can
earn *and also buy with Gems*. A light, low-frequency, capped **"Spark"** surprise bonus rides on
top of the deterministic base; the base payouts stay fixed and predictable.

🔴 **Cut in v3:** Co-op Pulse / Synchrony / Carrier Wave / Circle Current, the Practice Shelf
(In Motion / Groove / Deep Groove / Full Cycle; N Deep), Side Quests, witnessed/secret awards,
the retroactive reward *rules engine*, and the recruiter reward *leaderboard*.

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

## 5. Journeys: the premium marquee

> 🔴 **Superseded by [ADR-152](DECISIONS.md): Journeys are free.** This section described
> Journeys as the Crew-only upsell; that gate is removed. Kept for history. The *remaining*
> Crew gates are rank-endorsement (ADR-141) and Gem spend (Store), not Journeys.

A **Journey** is a curated, multi-step **practice track**: a coaching package with a
narrative arc. *(This section's old engine, the legacy action-chain engine (dropped,
ADR-152), is obsolete; the spine is now `journey_plans` and the chain engine is
dropped. See [JOURNEYS.md](JOURNEYS.md).)*

- **Seasonal structure (ADR-284).** Each Quest ships **exactly three Journeys**
  (Mind, then Body, then Spirit) run in sequence (~4 weeks each, 13 weeks total).
  Each Journey is capped by a single **Expression Challenge** (required to finish the
  Journey). Expression is never a fourth Journey; it is the capstone on each one.
- **All free.** Journeys, Challenges, and member-built library Journeys are all free to
  start and complete (ADR-152). The Crew gate applies only to rank-endorsement visibility
  on public profiles (ADR-141) and Gem spend in the Store.
- **Streaks stay free.** A member always keeps their own practice streaks and collects
  the rewards. The North-Star loop is never paywalled.

Finishing all three Journeys = **Master** rank, the season's highest, plus three Pillar
Trophies and the **Certificate** (the season capstone: a unique cosmetic + 100 Gems) in the
Vault.

## 6. Decisions

**Locked:**
- ~~**Member zap rate → lower multiplier.**~~ 🔴 **Reversed by Rewards Economy v2**
  (see the superseding ADR): `MEMBER_ZAP_RATE` is deleted; everyone earns Zaps at
  full rate. It was inert in Beta, so zero behavior change; the membership value is
  ADR-141 visibility gating, not throttled earning.
- **Journeys are Crew-only: no member DIY.** Free members get individual practices,
  not the tracked all-in-one Journey flow. ✅ Join-gating done (ADR-140): `startQuest`
  is Crew-gated; `/crew/quests` browse + CrewGate Start.
- **Rename depth → full.** `arc_* → journey_*` tables + `/crew/journeys` route +
  `/crew/arcs` redirect. ✅ Done (ADR-085).

**Resolved ([ADR-141](DECISIONS.md)):**
- **Member rank display → no rank** at all on a free member's public profile (no inert
  chip). The rank reappears on upgrade. `isEndorsed(role)` gates it; inert in Beta.
- **Endorsement set → rank only, for now.** The rank badge is Crew-gated; streak,
  achievement count, and gem count stay visible for everyone as *earned* stats (gem
  *tiers* are retired, Rewards Economy v2). Cosmetics, titles, and Journey badges
  ride the same `isEndorsed` gate once they render publicly.

**Still open:**
- **Authoring.** Who builds the seasonal journeys, and where (admin content tool)?

## 7. Build order (once §6 lands)

1. ✅ Rename Arcs → Journeys (user-facing).
2. ✅ **Earning open + spend/rate gated**: member zap-rate multiplier (ADR-140); Store
   spend gated + balance = earned − spent (ADR-140). Rank/endorsement suppression on
   free profiles still pending (see Endorsement layer below).
3. ✅ **Journey gating**: `/crew/quests` browse; **Start** gated to Crew (CrewGate);
   preview banner (ADR-140).
4. ✅ **Seasonal journeys**: official Journeys are seeded one per Pillar for the active season
   (ADR-139/140; the spine is now `journey_plans`, the legacy action-chain engine is dropped, ADR-152).
   Authoring surface still pending.
5. ✅ **DIY journey builder**: the **Studio** window: pick practices → a personal journey,
   with emoji/accent identity, a markdown intro, drag-reorder steps, per-step cadence/note, a
   live Pillar balance, and share-to-library (Crew). Reusable shell for future entities (ADR-142).
6. ✅ **Endorsement layer**: rank shown on public profile + people cards + post flair is
   Crew-gated via `isEndorsed` (ADR-141); free profiles show earned stats but no rank.
   Cosmetics/titles/journey badges ride the same gate when they render.

## Active-Journey progress (2026-06-06, ADR-144)

Adopting a Journey adds its practices to the daily log (no separate tracker), and the
member's **live progress is derived from `practice_logs`**. There is **no new schema**.
`getActiveJourneyProgress()` (`lib/journey-plans.ts`) loads the member's active adoption
(`journey_plan_adoptions` + `journey_plan_items`), then for each step computes
**done-this-week** by comparing the logs in the current week against the step's cadence
target. `weeklyTargetFromCadence()` maps a daily cadence to "most days" and a weekly one
to once. A step is **on track** once it hits its weekly target; the first not-yet-on-track
step is the **current step**. `circleCompanions()` counts how many people in the member's
circle have adopted the same Journey ("N in your circle doing this too").

Surfaces:

- **`/crew/journey`**: the *Your Journey* Dashboard tab: the ordered, domain-grouped
  checklist, the highlighted next step with a quick **Log** button, and a rewards panel
  (season zaps/rank, streak, gems) reinforcing that logging a Journey practice is the one
  move that advances the Journey *and* earns the rewards.
- **Home feed**: the `JourneyBoard` shows the **current-step line** so the next thing to do
  greets the member on arrival.

This realizes **BACKLOG §Q** ("active Journey plan on the board"). Member-facing how-to
lives in `content/help/the-game/your-journey.md`.
