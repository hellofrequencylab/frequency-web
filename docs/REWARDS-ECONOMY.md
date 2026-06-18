# Rewards Economy v3 — the canonical spec (Season 1 clean rebuild)

> **The technical source of truth for Frequency's reworked rewards economy.** The code
> rework follows this doc. Status: ✅ **locked** (2026-06-18, [ADR-304](DECISIONS.md)).
> One classifier, two ledgers, a registry of amounts. Names defer to
> [NAMING.md](NAMING.md); member-facing copy follows [CONTENT-VOICE.md](CONTENT-VOICE.md)
> (no em dashes). Migration-level shape lands in [DATABASE.md](DATABASE.md) as built.

## Summary

| What | Decision |
| --- | --- |
| Currencies | **Zaps** (seasonal, status, not spendable) · **Gems** (continuous, spendable) |
| The rule | One **classifier** returns a payout profile `{ zaps, gems }` for any act |
| Real-world act | → Zaps · **Online act** → Gems · **Creation** → both |
| Logging a practice | Zaps only (the log is the record, not the point) |
| Creation payout | Small Gem token on publish; large payout on **first use by an established member** (validated, idempotent, uncapped) |
| Season rank | Completion-based: Ghost / Initiate / Adept / Master = Journeys finished (0/1/2/3) |
| Capstone | 3 Journeys → **Master** + the **Certificate** (unique cosmetic + 100 Gems) |
| Architecture | One classifier · two ledgers · trigger-owned totals · idempotency · actor/beneficiary · season-as-a-column |
| Season 1 | Beta reward data wiped; reseeded clean from this model |

**Status legend:** ✅ locked / live · ⏳ to build · 🔴 cut this rebuild.

---

## 1. The two currencies and their jobs

| | **Zaps** ⚡ | **Gems** 💎 |
| --- | --- | --- |
| Rewards | Real-world action + durable contribution | Online interaction |
| Lifespan | **Seasonal** — reset each season | **Continuous** — never reset |
| Role | The engagement / status metric | The spendable currency |
| Spendable? | **No** | **Yes** (the Vault Store) |
| Caps | **None** | Per-day caps on small acts |
| At season end | Roll into Gems at **5:1 floor** | Unaffected (carry over) |

- **Zaps** are the weight of being there: showing up, hosting, outreach, finishing a
  Journey, and durable contribution that a real member then uses. They set season standing
  and feed lifetime Amplitude. They are not money; you cannot spend them.
- **Gems** are the on-platform currency: keeping the community warm between gatherings, and
  the Zap rollover at season end. `lifetime_gems` is **monotonic** (it only ever increases =
  total Gems ever earned). The **spendable balance = `lifetime_gems` − sum of redemptions**.
  This split keeps a clean "earned" number for display and a separate "what's left to spend."

---

## 2. The single payout-profile classifier

There is **one** source of truth that maps any act to a **payout profile** `{ zaps, gems }`.
Every surface (practice logs, achievements, challenges, Journeys, creation) reads it, so
"what does this pay" has exactly one answer.

| Act kind | Pays |
| --- | --- |
| Real-world / durable act | **Zaps** |
| Online participation valuable in itself | **Gems** |
| **Creation** (a thing others can use) | **Both** (a Gem token now, the big payout on validation) |

### The two-question test

1. **Did they do something real or durable?** → **Zaps.**
2. **Is this online participation valuable in itself?** → **Gems.**

An act can answer yes to both (that is creation). The edge case the test settles:
**logging a practice is Zaps only.** The practice is the real-world doing; the log is just
the record of it, not the valuable online act. We never pay Gems for the act of logging.

---

## 3. Earn rates — Zaps

Cadence-based per the locked model ([ADR-303](DECISIONS.md)). **No caps on Zaps.**

| ⚡ Act | Zaps |
| --- | --: |
| Log a practice — Daily / 3x-week / Weekly cadence (`practices.reward_zaps`) | **10 / 15 / 25** |
| Log a practice — weight-class fallback light / standard / heavy (when `reward_zaps` is null) | **8 / 12 / 15** |
| Outreach task (flyer / QR) | **20** |
| Verified event check-in | **25** |
| Expression Challenge — in person at a Circle | **50** |
| Host an event | **60** |
| Finish a Journey (+ a Pillar Trophy) | **75** |
| Found / start a circle | **100** |
| **Validated creation** — your Journey is first used by an established member | **100** |
| **Validated creation** — your event is first used | **50** |
| **Validated creation** — your practice is first used | **40** |

Cadence sets the per-log Zap value; effort/length never does. A daily core practice pays
10 each log; over a 28-day window that is 280 Zaps per Pillar, balanced across the four.

---

## 4. Earn rates — Gems

Small, **daily-capped** so they can't be farmed.

| 💎 Act | Gems | Cap |
| --- | --: | --- |
| React | **1** | 8 / day |
| Comment / reply | **2** | 8 / day |
| Share | **2** | 5 / day |
| Post | **3** | 5 / day |
| Daily presence | **2** | 1 / day |
| Welcome a newcomer | **8** | 3 / day |
| RSVP to an event | **5** | per event |
| Join a circle | **5** | per circle |

### Creation token (first publish only)

A small Gem token lands the moment you first publish a thing. **First publish only — never
on edits or duplicates.** Soft cap: 3 creation-tokens / day.

| First publish | Gem token |
| --- | --: |
| Journey | **+5** |
| Event | **+5** |
| Practice | **+3** |

### Validated creation bonus (Gems)

When the asset is first used by an established member (§5), the creator also gets a Gem
bonus alongside the validated Zaps.

| Validated creation | Gem bonus |
| --- | --: |
| Journey | **+25** |
| Event | **+10** |
| Practice | **+10** |

---

## 5. The creation reward model (Option B: validated creation)

Creation pays in two beats so we reward contribution that actually helps someone, not
volume.

1. **On first publish** → the small **Gem creation token** (§4). That's the whole publish reward.
2. **On first validated use** → the **large payout**: the validated Zaps (§3) **plus** the
   validated Gem bonus (§4).

**What counts as a validated use.** The asset is used by a **distinct, established member**:

- **email-verified**, and
- **not the creator**, and
- **not invited by the creator.**

*Use* means:

| Asset | Use that validates it |
| --- | --- |
| Journey | a member adopts / starts it |
| Practice | a member logs it |
| Event | a member RSVPs to it |

**Rules of the payout.**

- ✅ **Idempotent** — paid exactly once per asset, key `creation_validated:{type}:{id}`.
- ✅ **Never re-paid on edits** — editing a validated asset does not re-trigger it.
- ✅ **Uncapped** — the validation gate is the throttle, so there is no daily cap on the payout.
- ✅ **Actor + beneficiary** — member B's use (the actor) pays creator A (the beneficiary).
- ✅ **Deferred / event-driven** — the grant fires off the use event, not the publish.

**UX.** At publish: "you'll earn when a member uses this." When validation fires: the payout
arrives as a **notification**.

---

## 6. Season mechanics

- **Season** = a 13-week Quest instance. One active season at a time.
- **Season rank** (completion-based, ✅ live — [ADR-283](DECISIONS.md)):

  | Rank | Journeys finished this season |
  | --- | --- |
  | Ghost | 0 |
  | Initiate | 1 |
  | Adept | 2 |
  | Master | 3 |

  Rank advances **automatically** the moment a Journey is finished. No Zap threshold, no
  manual promotion. Member-built Journeys count toward rank **only when `ranked_eligible`**
  (Vera-approved, [ADR-288](DECISIONS.md)). Rank resets to **Ghost** each season.
- **Season end.** Zaps roll into Gems at **5:1 floor**. Gems, Trophies, the Certificate,
  Amplitude, and lifetime Gems all carry over.

---

## 7. Trophies and the Certificate

| Milestone | Reward |
| --- | --- |
| Finish a Journey | **+75 Zaps** + a **Pillar Trophy** (Mind / Body / Spirit) |
| Finish all three Journeys in a Quest | **Master** rank + the **Certificate** |

- A **Pillar Trophy** is minted per finished Journey.
- The **Certificate** is the **season capstone**: finishing all three Journeys grants a
  **unique cosmetic + 100 Gems** (no extra Zaps). Member-facing name proposed in
  [NAMING.md](NAMING.md) (flagged proposed).
- The Expression Challenge that caps a Journey pays **+50 Zaps** in person at a Circle, or
  **+30 Gems** posted solo online, and is required to finish the Journey.

---

## 8. The Vault Store and sinks

The Vault Store spends **Gems**. Lean catalog (✅ locked prices):

| Item | Gems |
| --- | --: |
| Entry cosmetic | **100** |
| Profile border or theme | **300** |
| Custom title | **600** |
| Premium cosmetic or collectible | **1000** |
| Operator perk | **1500–2000** |
| Physical merch | **3000+** |

Two new sinks beyond the catalog:

- **Gift Gems** to another member.
- **Buy a streak freeze** with Gems.

---

## 9. Amplitude, streaks, achievements, the variable layer, the leaderboard

- **Amplitude** (✅ kept) — lifetime XP = cumulative Zaps, hosting-class acts **2×**. Levels
  derive as `50·L·(L+1)`. Milestones mint permanent Awards. Never resets, never spent.
- **Streaks** (✅ kept, humane) — a daily practice streak. A **streak freeze** the member can
  earn *and also buy with Gems*. A no-shame **Welcome Back +10 Zaps** on the first log after
  a 7+ day gap. No streak-shame copy, ever.
- **Achievements** (lean core set only) — firsts, streak milestones, amplitude milestones,
  the **3 Pillar Trophies**, and the **Certificate**. Nothing else.
- **Variable layer** — a light, low-frequency, **capped "Spark"** surprise bonus layered
  **on top of** the deterministic base. The base payouts stay fixed and predictable; Spark
  is only ever extra.
- **Leaderboard** — **cooperative and local only**. No global competitive board.

---

## 10. Architecture

| Piece | What it does |
| --- | --- |
| **One classifier** | The payout-profile function — the only place an act maps to `{ zaps, gems }` |
| **Two ledgers** | `zap_transactions` and `gem_transactions` — append-only record of every grant |
| **Trigger-owned totals** | `season_zaps`, `amplitude`, `lifetime_gems` maintained by DB triggers off the ledger writes, never hand-incremented by app code |
| **Idempotency** | Durable one-time grants claim-then-pay through `reward_grants` on a stable `rule_key` (e.g. `creation_validated:{type}:{id}`); re-runs never double-pay |
| **Actor / beneficiary** | A grant records who acted and who is paid (validated-creation pays the creator off another member's use) |
| **Season as a column** | A grant carries its season; reset zeroes `season_zaps` and rolls to Gems, leaving continuous Gems and Amplitude untouched |

The `earn_rules` registry holds the amounts/caps from §3–§4 as data, so tuning is a row
change, not a code change. Exact columns are set during the build (open follow-up in
[ADR-304](DECISIONS.md)).

---

## 11. Intrinsic-motivation framing (why the numbers stay small)

Frequency is a practice app, so the economy is built to **not** poison the intrinsic
motivation it depends on. Heavy, payment-shaped rewards trigger the **over-justification
effect** (motivational crowding-out): people who were doing a thing for its own sake start
doing it for the payout, and stop when the payout does. So:

- Rewards are framed as **recognition of progress, never as payment.**
- **Per-act payouts stay modest.** Status leans on **Trophies, the Certificate, and
  recognition**, not on a big balance.
- The headline copy is always "showing up counts," never "earn rewards."

---

## 12. Retired / cut this rebuild 🔴

| Cut | Note |
| --- | --- |
| Witnessed peer awards | gone |
| Secret awards ("Quiet Ones") | gone |
| Co-op Pulse / Co-op Synchrony / Carrier Wave / Circle Current | all circle-collaborative reward mechanics gone |
| Practice Shelf (consistency / depth ladders) | gone |
| Side Quests | gone |
| Retroactive reward **rules engine** | gone — **but the `reward_grants` table stays** as the season-conversion + idempotency ledger |
| Recruiter / entry-point reward **leaderboard** | gone — **core QR entry-point capture stays** |
| **Founder's First Week onboarding** | ✅ **KEPT** (not cut) |

---

## 13. Season 1 clean start

Beta reward data is **wiped** and Season 1 ("Shine") is **reseeded** from this model:

- one active season + Quest;
- three Journeys (Mind / Body / Spirit), each capped by one Expression Challenge;
- the lean achievement set (§9);
- the lean store catalog (§8);
- an `earn_rules` registry holding the amounts/caps (§3–§4).

After S1 the model is additive; the wipe is a one-time event.

---

*Source of truth: this doc + [ADR-304](DECISIONS.md). Naming: [NAMING.md](NAMING.md).
Member copy: [CONTENT-VOICE.md](CONTENT-VOICE.md). Schema detail: [DATABASE.md](DATABASE.md).*
