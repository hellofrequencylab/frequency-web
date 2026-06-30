# Next-Gen CRM - the Resonance Engine

**Thesis.** Frequency already owns the rarest, most expensive half of an AI-native CRM and barely uses it: a wide behavioral firehose (`engagement_events` + `interaction_events`), a governed nightly feature store (`member_traits`), live predictions (`churn_risk`, `activation_propensity`, `next_best_action`), a consent spine, a unified person, and an AI companion (Vera) with an audited action allow-list. The missing half is not data and not models. It is the **loop**: prediction and action are separate stages that never touch, so the intelligence dies in a table nobody reads. The Resonance Engine closes the loop. Every predicted trait binds to exactly one governed, reversible playbook; the single highest-resonance action becomes a one-tap Vera "Today" card; the operator's tap (or dismiss) writes back to `interaction_events` and teaches the next night's scores. We ship the loop visible, not the database.

**The core reframe: resonate, do not extract.** A sales CRM ranks actions by revenue pulled out of a person. The Resonance Engine ranks actions by **predicted resonance lift for the member**: did this move them along `stranger -> curious -> practicing -> resonant -> advocate`, and did it strengthen a real tie. The lifecycle ladder is a stored, monotonic-anchored field, not a funnel of leads. The defensible, no-clean-analog feature is the **Resonance Graph**: a reciprocal, consent-first matchmaking layer that introduces members who should meet and seeds Circles that should exist. Extraction CRMs cannot copy it, because their objective function is its opposite.

**Legend:** ✅ done (in repo today) · ⏳ in progress · ⚠️ risk · 🔴 not built yet.

---

## Architecture

**Answer first:** one new logical layer, the **Person Intelligence (PI) layer**, fuses four things that already exist independently (the timeline, the feature store, the predictions, and Vera) and adds two seams: a **Playbook Registry** (prediction to action) and the **Resonance Graph** (person to person). Everything else is wiring.

The PI layer is not a new service. It is a read-through composition over modules that already ship:

| Capability | Status | Real module | Role in the engine |
|---|---|---|---|
| Behavioral firehose (PI.1) | ✅ | `lib/analytics/engagement-read.ts`, `interaction_events` | Raw signals: streak break, Journey finish, Circle join, gem milestone |
| Feature store (PI.2) | ✅ | `lib/traits/compute.ts`, `lib/traits/registry.ts`, `app/api/cron/refresh-traits/route.ts` | Nightly computed traits: `lifecycle_stage`, `rfm_score`, `engagement_depth`, `wam_status` |
| Predictions (PI.3) | ✅ heuristic v1 | `lib/traits/compute.ts` (`churnRisk`, `activationPropensity`, `nextBestAction`) | Forward-looking `churn_risk`, `activation_propensity`, `next_best_action` |
| Unified person | ✅ | `lib/crm/person.ts` (`resolvePerson`, ADR-130) | Identity stitch across `contacts` + `profiles` + `network_contacts` by email |
| Unified timeline | ✅ | `lib/crm/interactions.ts` (`buildInteractionInsert`), `lib/crm/timeline.ts` | The one front door: append-only, idempotent, owner/Space scoped |
| AI companion + allow-list (PI.4) | ✅ | `lib/ai/vera/tools.ts`, `lib/ai/vera/execute.ts`, `lib/studio/site-actions.ts` | Governed, consent-gated, reversible, audited actions |
| Consent spine | ✅ | `lib/comms/send-gate.ts` (`resolveSendGate`) | No outbound touch fires without category consent |
| Voice governance | ✅ | `lib/ai/voice.ts` (`withVoice`, `VOICE_PRIMER`) | Every generated word passes the canon |
| **Playbook Registry** | 🔴 new | `lib/playbooks/registry.ts` (new) | Binds each prediction to one reversible action sequence |
| **Resonance Graph** | 🔴 new | `lib/resonance/*` (new), `pgvector` | Reciprocal affinity scoring + warm intros |
| **Today orchestrator** | 🔴 new | `lib/ai/vera/today.ts` (new) | Ranks the 5 cards that matter; closes the loop |

**Data flow (the loop, made visible):**

```
  signals                feature store        predictions          candidate actions        the surface
  -------                -------------        -----------          -----------------        -----------
 engagement_events  -->  member_traits   -->  churn_risk      -->  Playbook Registry   -->  Vera "Today"
 interaction_events       (nightly 02:30)     activation_prop       (prediction ->          5 one-tap cards
 comms webhooks                               next_best_action       playbook map)          [Do it][Tweak][Not now]
 Resonance Graph                              resonance_score                                     |
       ^                                                                                          | tap
       |                                                                                          v
       +------------------------- write-back: interaction_events <---- governed allow-list (PI.4)
                                  (accept / edit / dismiss = training signal)   consent-gated + reversible + audited
                                                                                       |
                                                                                       v
                                                              contact_interactions (canonical timeline)
```

**The two load-bearing seams:**

1. **`next_best_action` is the join key.** It already emits `reengage / activate / join_circle / deepen / invite / none` (`lib/traits/compute.ts`). The Playbook Registry is a typed map from each value (plus `churn_risk` tier) to exactly one governed action sequence. Adding a playbook is a registry entry, never a new mutation path. This mirrors the trait registry's "no trait exists without declaration" law (`lib/traits/registry.ts`).
2. **The timeline is the only write surface.** Every playbook action calls `buildInteractionInsert` with `source: 'playbook'` and `metadata.playbook_id`, so the timeline never drifts from reality and no action logs itself twice (idempotent on `idempotency_key`).

---

## Vera as the operating system

**Answer first:** the home screen is not a dashboard. It is **Vera "Today"**: inbox-zero of exactly **5** person-plus-action cards per Space, ranked by `churn_risk x activation_propensity x next_best_action`, each pre-drafted, each one tap. You reach zero when the 5 cards are cleared. Analytics lives one layer deeper.

**The card.** Every card is built before the operator arrives, composed in the Detail-template idiom and drawing from `resolvePerson` + `member_traits` + `lib/ai/memory.ts` (the member's confirmed facts), drafted through `withVoice` (`lib/ai/voice.ts`):

```
+--------------------------------------------------------------+
|  Maya  ·  Practicing · 14-day streak                          |
|  Why now: streak breaks tonight, last practice 2 days ago.   |   <- one concrete "why now" line + confidence chip
|  Save her streak with a freeze and a warm note.              |   <- the pre-drafted action, in voice
|                                                              |
|  [ Do it ]      [ Tweak ]      [ Not now ]                   |
+--------------------------------------------------------------+
```

- **Do it** executes via the governed allow-list (`lib/ai/vera/execute.ts`), records the touch on `contact_interactions`, and shows an Undo toast for reversible actions.
- **Tweak** opens the draft inline; the edit is captured and feeds the next night's draft.
- **Not now** dismisses; the dismissal is itself a training signal written to `interaction_events`.

**Three principles, all grounded:**

1. **Ask-or-be-told.** Vera is also the command surface, not a chat box in a corner. Cmd-K or "@Vera" from anywhere accepts plain language ("who's about to go quiet in the Sunrise Circle", "draft a winback for lapsed Beacons") and resolves to a **saveable segment** (`lib/traits/segments.ts`) or a **confirmable action card**, never a wall of prose. It compiles natural language into the existing segment grammar.
2. **Every insight is a one-tap action.** A bare score is never shown. `churn_risk = 0.78` always ships with its top contributing signals from `member_traits` and a proposed `next_best_action` already drafted.
3. **The cap is sacred.** Hard limit of 5. Overflow goes to a "Later" shelf, never onto Today. Cards are pre-sorted by lifecycle stage so triage is one decision each (welcome a curious newcomer, relight a practicing streak, ask a resonant member to advocate).

**New module:** `lib/ai/vera/today.ts` (orchestrator) reuses the existing `lib/ai/vera/concierge.ts` and `lib/ai/vera/loop.ts` scaffolding rather than inventing a new runtime.

---

## The engine: prediction -> playbook -> action

**Answer first:** prediction without a wired, measured action produces zero retention lift (the documented industry failure mode). So every signal binds to exactly one governed, reversible playbook, with autonomy graded by risk.

**The prediction-to-playbook map** (the Playbook Registry, `lib/playbooks/registry.ts`):

| Signal (from `member_traits`) | Playbook (governed, reversible) | What fires | Autonomy |
|---|---|---|---|
| `churn_risk` rising + freeze available | **Streak-save** | Vera spends the streak freeze (`lib/practice-streak.ts`, `lib/achievements.ts`), then a no-shame "I saved your streak" note next day | ✅ Auto (in-product, reversible) |
| `next_best_action = reengage`, dormant 7-30d | **Winback** | Value-led note (new Journey in their Pillar, "your Circle missed you"), retroactive gem gift via `lib/gems.ts`; price incentive only at sequence end, only for confirmed price-sensitive | ⚠️ Suggest (outbound, member-facing) |
| `activation_propensity` high + no Circle | **Onboarding nudge** | Invite to next gathering; warm first-week touch (Founder's First Week kept) | ⚠️ Suggest |
| Milestone crossed (Journey finish, Master rank) | **Celebrate + upsell** | Fire the celebration into the **Circle feed** (peer recognition, crowd-in), Vera-drafted; surface the natural next Journey | ✅ Auto for in-feed celebrate; ⚠️ Suggest for upsell |
| `lifecycle_stage = resonant`, recurring depth | **Upsell-ready offer** | Offer the depth tier matched to their practice, framed as belonging not price | 🔴 Never-auto (billing-adjacent) |
| High `resonance_score(A,B)`, both receptive | **Connect / warm intro** | Double-opt-in intro card; nothing sends until both tap yes | ⚠️ Suggest (always double-opt-in) |
| `lifecycle_stage = advocate` | **Advocacy / referral** | Invite to host a Circle, refer a friend, share a practice; reward with recognition (custom title, Vault Store) | ⚠️ Suggest |
| Failed payment (Practitioner/Space) | **Dunning** | Stripe Smart Retries + card account updater first, then a warm 72h note tied to what they'd lose (streak, Circle) | ✅ Auto for retry; ⚠️ Suggest for the note |

**How it reuses what exists:**
- **Allow-list.** Each playbook action is a registered, validated, reversible, audited call. New write tools (`send_playbook_email`, `tag_contact`, `move_contact_stage`, `save_streak`) register in `VERA_TOOLS` (`lib/ai/vera/tools.ts`) with `confirmLabel` + param validation; `executeConfirmedTool` (`lib/ai/vera/execute.ts`) dispatches them. New Studio actions (`trigger_playbook_for_segment`, `bulk_tag_contacts`) register in `lib/studio/site-actions.ts`.
- **Consent gating.** Every outbound action passes `resolveSendGate(profileId, channel, category)` (`lib/comms/send-gate.ts`). A member who opted out of lifecycle email never enters a `reengage` candidate list. Vera memory writes gate on `ai_memory` consent (`lib/ai/memory.ts`).

**Autonomy thresholds (graded, never all-or-nothing):**

| Tier | Examples | Rule |
|---|---|---|
| ✅ **Auto** | in-product nudge, surface a practice, streak save, small zap grant | Executes optimistically with a visible Undo; fully audited |
| ⚠️ **Suggest** | member-facing email, Circle/Nexus invite, warm intro, gem awards above threshold | Vera drafts, operator taps Approve |
| 🔴 **Never-auto** | bulk segment send, billing/tier change, role change | Explicit confirm dialog, no batching by default |

Two safety rails: a **per-Space autonomy slider** (dial Vera from "suggest only" to "run the safe stuff", gated via `lib/spaces/entitlements.ts`) and a **circuit breaker** that auto-pauses any playbook whose dismiss-rate or unsubscribe-rate spikes above its learned baseline. Defaulting member-facing actions to Suggest is the structural defense against autonomy-theater spam, which would be brand-fatal for a resonate-not-extract product.

---

## The brilliant admin dashboard

**Answer first:** three altitudes, one `DashboardTemplate`, progressive disclosure: **Platform cockpit -> click a Space -> Space cockpit -> click a person -> Person view**. Each altitude opens with **one computed verdict line**, then a `StatCard` row, then a ranked **"who needs attention"** worklist (people, not a chart), then drillable funnel and retention charts. Every chart point drills to a member list; every member drills to the `contact_interactions` timeline. Never a wall of equal-weight tiles. It passes the 5-second test: an owner who looks for five seconds knows the one thing to do next.

**Design principle: list-first (owner requirement, locked).** The **member list is the CRM's default view and is always one tap away.** Entering a Space CRM (`/spaces/[slug]/crm`) lands on the familiar People roster, not the cockpit. The cockpit (health summary + lifecycle funnel + worklist) and the pipeline are **secondary** views, reached from a persistent, always-visible tab bar (`components/spaces/crm/crm-view-tabs.tsx`, the `?view=people|pipeline|cockpit` switch, People is the default). That same tab bar renders on a person detail and on a funnel drill, so an owner returns to the roster in one tap from anywhere. The cockpit is the smart layer the operator opts into; the list is the front door they live in.

**Shared rules across all three:**
- Built from the real kit only. `DashboardTemplate` (`components/templates/dashboard-template.tsx`) provides the eyebrow + title + description + stat row + sections; the verdict line is `PageHeading` (`@/components/templates`); KPIs are `StatCard` (`components/ui/stat-card.tsx`); section breaks are `SectionHeader` (`components/ui/section-header.tsx`); empties are `EmptyState` (`components/ui/empty-state.tsx`). The worklist is composed of `SidebarCard` rows (`components/ui/sidebar-card.tsx`) until a shared `PersonCard` is extracted (tracked, not assumed). Rail is registered once in `lib/layout/page-chrome.ts` (`'scoped'` for admin), never toggled in a page.
- Source of truth is `engagement_events` (first-party, semantic), never GA4. Health, cohorts, and retention read the nightly `member_traits` refresh through SECURITY DEFINER RPCs and materialized views, never raw table scans.
- Per-section `<Suspense>`: the verdict line and worklist paint immediately; heavy aggregates load behind their own boundary (PAGE-FRAMEWORK §5).
- Every `StatCard` shows value + period delta + sparkline + baseline, colored by the canonical green/amber/red legend. No vanity metrics: no cumulative member count, no total zaps minted, no monotonic `lifetime_rank` dressed up as health.
- One governed **Resonance Health** score (0-100), declared as a computed trait in `lib/traits/registry.ts` and computed in `lib/traits/compute.ts`, rolling up `engagement_depth` + `rfm_score` + `wam_status` + streak health + predicted `churn_risk`. Tiered **Resonant** (green) / **Cooling** (amber) / **At Risk** (red). One number every altitude shares, so platform, Space, and person all speak the same language.

### Altitude 1 - Platform cockpit (`app/(main)/admin/crm/page.tsx`, new)

| Slot | Widget (real kit) | The metric, and why it earns its pixels |
|---|---|---|
| Verdict | `PageHeading` + hero `StatCard` | "Resonance is healthy. 12 members need you today." Computed from the at-risk worklist length, never hand-curated. The whole screen in one sentence. |
| Stat row | 4 `StatCard`s | **Resonance Health** (platform mean vs last week) · **At risk now** (members in red tier, delta) · **Resurrections this week** (dormant -> active, with 7/30/90-day re-retention so a one-day blip does not count) · **Advocacy invites accepted** (advocate-stage conversions) |
| Hero worklist | `SidebarCard` rows | Top-N members the model says are sliding, newest-risk first. Each row carries its `next_best_action` as a one-tap governed action and routes the tap into Vera Today. This is the part operators actually use. |
| Lifecycle funnel | drillable funnel | `stranger -> curious -> practicing -> resonant -> advocate` stage counts + step conversion + drop-off, drillable to the people stuck at each stage (`lifecycle_stage`). Answers "where do members stall." |
| Upsell funnel | second funnel | free My Contacts -> ceiling event hit -> Space CRM upgrade. The instrumented upgrade-trigger events, so growth is a measured path not a guess. |
| Retention | streak-health curve | WAM cohort retention by `join_cohort`, playbook-touched vs holdout overlaid. The curve that proves the loop works. |
| Rising members | "about to resonate" card | Untouched members whose `activation_propensity` matches past advocates. The overlooked-opportunity pattern: who would convert if you simply reached out. |

Drill-down: any chart point -> member list -> `contact_interactions` timeline. Alerting: hard thresholds for always-matters events (a Beacon's streak breaking tonight, an at-risk cohort crossing a size limit, an upsell ceiling hit); adaptive baselines for soft signals (resonance density below this Space's learned normal for the day-of-week). Each alert carries a `next_best_action` and routes to Today as one card. Correlate into one issue per Space; cap the daily count so the cockpit never cries wolf.

### Altitude 2 - Space cockpit (`app/(main)/spaces/[slug]/crm/page.tsx`, extend)

✅ **Shipped (Space surface, list-first).** Same template scoped to `space_id`, gated on `spaceHasEntitlement(space, 'crm')` (`lib/spaces/entitlements.ts`). The board is **list-first** (see the design principle above): it lands on the **People** roster (`components/spaces/crm/space-contacts.tsx` over `getContacts`, the familiar list) by default, with a persistent `CrmViewTabs` bar (People / Pipeline / Cockpit) at the top of every view. The **Cockpit** is a secondary `?view=cockpit` tab. The cockpit band (`app/(main)/spaces/[slug]/crm/space-cockpit-band.tsx`) renders the verdict line, the four `StatCard`s, the who-needs-attention `Worklist`, AND the **space-scoped lifecycle funnel** (`LifecycleFunnelPanel` over `getSpaceFunnel(spaceId)` in `lib/dashboard/scores.ts`). The funnel computes the `lifecycle_stage` split for the Space's reachable members off the `member_engagement_scores` matview (no dedicated RPC, no migration), fail-safe to zeros. Each funnel step drills to the Space's members at that stage on the board's own `?stage=` list (`components/spaces/crm/space-stage-list.tsx` over `listMembersByFilter(filter, { spaceId })`), each member opening their on-board detail; the persistent tab bar returns the owner to People in one tap. The existing reach funnel panel (`lib/spaces/crm-funnel.ts`, ADR-381) sits in the Pipeline view as the "Reachable contacts" seed.

| Slot | Widget (real kit) | The metric, and why it earns its pixels |
|---|---|---|
| Verdict | hero `StatCard` | "Your Circle resonated 34 times this week, up 8%. 3 practitioners are going dormant." The owner's whole week in one line. |
| Stat row | 4 `StatCard`s | **Space Resonance Health** · **Reachable contacts** (total / subscribed, from `lib/spaces/crm-funnel.ts`) · **At risk in this Space** · **Intros accepted** (double-opt-in completions) |
| Hero worklist | `SidebarCard` rows | This Space's at-risk members, each with a one-tap action gated by the Space's AI-depth tier. |
| Lifecycle funnel | `LifecycleFunnelPanel` | ✅ The `new -> activated -> engaged` climb + the `at_risk` / `dormant` leak for this Space's members, each step drilling to the people stuck there (`getSpaceFunnel`, no migration). |
| Pipeline | existing pipeline | `lib/crm/pipeline.ts` deals + stages, plus the `next_best_action` recommended playbook per contact. |
| Resonance tab | match suggestions | "People close by with your vibe", the Space-scoped Resonance Graph. |

Drill-down: contact row -> on-board contact detail (ADR-376, `lib/crm/space-contact-detail.ts`) -> timeline; funnel step -> `?stage=` Space member list -> on-board detail. Alerting is scoped to the Space; the autonomy slider lives here, on the owner's desk.

### Altitude 3 - Person view (Detail template over the timeline)

✅ **Shipped (Space surface).** The Space CRM contact detail (`components/spaces/crm/space-contact-detail.tsx` over `getSpaceContactDetail`) now carries the full Altitude 3 stack, not just identity + timeline: the **"where this person is" context band** + the **shared score row** (Resonance Health + churn + activation, each with the plain top-signals + confidence so a bare score is never shown), an **About panel** of the member's confirmed facts, and the **Resonance matches** section. All are member-only and fail-safe: a pure lead (no stitched profile) reads the calm "not scored yet" line, no score row, no About, and the "not a member yet" resonance state. The detail read resolves the contact's `profile_id` and folds `getMemberScores` + `draftContextLine` + `explainMemberScores` (`lib/dashboard/person-band.ts`) + `getMemberContext` (`lib/ai/memory.ts`) + `getResonanceMatchesForPerson` (`lib/resonance/surface.ts`). The platform-staff twin lives at `app/(main)/admin/marketing/contacts/[id]/page.tsx`.

| Slot | Widget | Source |
|---|---|---|
| Context band | Vera-generated 3-line "where this person is" brief | `resolvePerson` + `member_traits` + `lifecycle_stage`, drafted via `withVoice` |
| Score row | Resonance Health + `churn_risk` + `activation_propensity`, each with its top contributing signals | `member_traits` (explanation always shown, never a bare number) |
| Tab: Timeline | full `contact_interactions` stream | `lib/crm/timeline.ts` (`listContactInteractions`) |
| Tab: About | confirmed facts (interests, goals, neighborhood) | `lib/ai/memory.ts` |
| Tab: Resonance | top matches in this Space with affinity breakdown | Resonance Graph |
| Action | ✅ next-best-action playbook picker (one tap) | Playbook Registry (`lib/playbooks/resolve.ts` -> `components/spaces/crm/space-playbook-picker.tsx`) |

✅ **Shipped (Space surface) - the one-tap next-best-action playbook picker.** The Space contact detail now carries the **picker** directly, so the owner acts from the person without leaving for the platform Today. `getSpaceContactDetail` folds a `nextBestPlay` onto the insight: a PURE resolver (`lib/playbooks/resolve.ts` `resolvePlaybookForScores`) maps the member's `next_best_action` + `churn_risk` to exactly ONE registry playbook (the **same** choice the worklist + Today make, so all three agree by construction), with the **effective autonomy tier** baked in (the per-Space slider downgrades `auto` to Suggest when `suggest_only`, the default). The picker (`space-playbook-picker.tsx`) is the Today idiom (**Do it / Tweak / Not now**), gated to the Space owner: the server actions (`app/(main)/spaces/[slug]/crm/playbook-actions.ts`) re-resolve the Space by slug + re-gate `canEditProfile`, run the primary action through the SAME governed confirm-then-execute path (`lib/ai/vera/execute.ts`), consult the circuit breaker (Space-scoped), and log the run / dismissal training signal on `playbook_runs`. Member-only + fail-safe: a pure lead, a steady member, or a no-op playbook shows no picker; a staff read-only preview never sees it. Suggest-by-default holds: the outbound leg drafts + send-gates, never auto-sends. The code registry is also mirrored into the durable `playbooks` table (idempotent code-first seed, `lib/playbooks/seed.ts`), so the formerly-empty prod catalog now reflects the source of truth. Migration-free (existing `playbooks` / `playbook_runs` tables).

> **Deferred on the Space person detail (this slice):** the **affinity breakdown** on each match is the plain WHY line only (the coarse strength label + shared-belonging reasons), not a numeric vector, by the privacy rule in "The Resonance Graph" section. Intentional, not a gap in the data.

This is the drill-down floor. Every aggregate above eventually lands here, on the canonical timeline, preserving the one-front-door rule.

---

## The Resonance Graph

**Answer first:** the novel layer. A reciprocal, consent-first matchmaking engine built as a **two-stage funnel**: cheap multi-source candidate generation, then one governed re-ranker that emits a `resonance_score(A,B)` predicted trait. Vera surfaces the top shortlist as **double-opt-in** warm intros and Circle seeds. No clean sales-CRM analog exists, because the objective is connection, not extraction.

**Candidate generation (cheap, nightly):**
1. **Graph traversal / triadic closure** over edges Frequency already has: co-membership in a Circle/Hub/Nexus, shared Journey, co-attended practice, host/member ties. "Two members who share a Circle and a Pillar but have never met" is a triadic-closure candidate.
2. **Embedding retrieval.** Give every `resolvePerson` node a **resonance embedding** = content embedding (Pillars, Journeys, practices, intent/bio text) concatenated with a **structural** graph embedding (node2vec/GraphSAGE over the co-membership graph). Store as a `pgvector` column keyed to the unified person; recompute nightly in the feature store; serve via HNSW/ANN.

**Scoring (the re-ranker, the defensible part):**
- **Reciprocal:** `resonance_score(A,B) = harmonic_mean(want(A->B), want(B->A))`. Harmonic mean punishes one-sided matches, so Vera never pesters a quiet member to meet a power-host who would not engage back.
- `want` fuses cosine affinity with the existing PI receptiveness traits: `activation_propensity` up-weights, `churn_risk` down-weights as a target (do not route an at-risk member as someone else's intro target).
- **Complementary and serendipitous, not just similar:** match shared Pillars (resonance) with complementary Journey stages (one early, one finished = mentor/peer), plus an explicit diversity term calibrated to the spread of a member's Pillars (the `curious -> practicing` bridge) so it never collapses into echo-chamber cliques.

**How Vera uses it.** A Today card: "You and Maya both practice [Pillar] and she just finished the Journey you started. Want an intro?" Nothing sends until **both** tap yes (the warm-intro pattern, the literal expression of resonate-not-extract). The send routes through the existing governed, reversible, audited allow-list. Post-connection feedback (met / was it good / accepted the Circle invite) writes back as new `interaction_events` that retrain the ranker, closing the loop.

**One model, two products.** The same graph embedding powers member-to-member intros (link prediction) **and** Circle formation: Louvain/clustering surfaces "these 6 unaffiliated members already orbit the same Pillars and city; seed a Circle."

**Cold start.** A brand-new member has no edges, so seed their embedding from the Pillars they pick during onboarding (single low-friction screen) plus city, enabling a day-one intro (the `stranger -> curious` move). Behavioral and structural signal blends in as the prior decays.

**Privacy.** Resonance edges are classed **sensitive** PII in the trait registry (`lib/traits/registry.ts` already carries identity/sensitive/none + `retentionDays`), governed by the same consent + retention machinery. Every intro card shows a plain-language WHY ("you share the [Pillar] Pillar and both attend Tuesday practice") and never a stalking-adjacent signal. Members can mute suggestions and opt out of being a match target. This is the trust moat.

**Build seam:** `lib/resonance/*` (new: `embeddings.ts`, `candidates.ts`, `score.ts`), a `pgvector` column on the person, traversal queries reusing `lib/crm/person.ts`, scoring extending `lib/traits/compute.ts`, surfacing through `lib/ai/vera/tools.ts` (`suggest_resonance_match`, `send_intro_email`).

---

## Gamification + practice as fuel

**Answer first:** the economy is already non-monetary (zaps, gems, ranks, streaks), which is exactly the right shape for resonate-not-extract. We wire it as **input to engagement scoring** and as **playbook fuel**, leaning the emotional weight onto social recognition (the crowd-in channel) and keeping balances quiet.

| Mechanic | Real module | Feeds the engine as |
|---|---|---|
| Practice streak + freeze | `lib/practice-streak.ts`, `lib/achievements.ts` | Streak slope -> `churn_risk` signal; auto-spend freeze is the highest-ROI playbook (turns a churn signal into a re-activation moment, no shame) |
| Season ranks (Ghost/Initiate/Adept/Master) + monotonic `lifetime_rank` | `lib/season-ranks.ts` | Stage progression anchor: `lifetime_rank` guarantees `stranger -> advocate` never silently regresses; winback targets by prior depth |
| Zaps / Gems | `lib/zaps.ts`, `lib/gems.ts` | Retroactive reward grants as playbook side-effects (gift, not bribe); modest per-act payouts so intrinsic motivation is not crowded out |
| Achievements | `lib/achievements.ts` (`processGamificationEvent`) | New `playbook_complete` event fires retroactive milestones (e.g. `3_contacts_invited`); `connector`/`facilitator` reward the advocate state |

**Engagement scoring shape (recency + frequency + breadth + depth + milestones).** Compute one member Resonance Health score in `member_traits` on this shape, reframed to the ladder. The trip-wire: **7 days silent** promotes a member into Vera's at-risk Today queue. Add a time-to-churn (survival) framing so nudges fire in the right window, not just at a fixed inactivity threshold.

**Social streaks as the moat.** Add a cooperative, local-only Circle streak and a one-tap "nudge a Circle-mate about to break theirs." Social streaks beat solo ones; the nudge re-activates both people. Fire Journey/Master celebrations into the **Circle feed** (Peloton-style peer shoutout, Vera-drafted in voice), not a private modal. Members with zero Circle ties are flagged highest structural risk and routed to matchmaking, not content nudges. Guardrail: every mechanic must serve activation (get into a room), never dwell; Vera never writes "earn N Zaps."

---

## Scaling to Spaces + the upsell engine

**Answer first:** the entire PI layer is built **scoped to `space_id` from day one**. Every Space gets the same cockpit, the same Today, the same Resonance Graph over its own membership. **AI-depth is the paid lever**, surfaced contextually at the ceiling.

**The same layer, scoped.** `getSpaceCapabilities` (`lib/spaces/function-access.ts`) + `spaceHasEntitlement` (`lib/spaces/entitlements.ts`) already gate per-Space features. Add capability keys `crm.playbooks`, `crm.resonance`, `crm.resonance_ai`, `crm.autonomy`. Segments (`lib/spaces/segments.ts`), email templates (`lib/spaces/email-templates.ts`), and campaigns (`lib/spaces/campaigns.ts`) are already Space-scoped; extend their predicate grammar (`lib/spaces/audiences.ts`) to include resonance + engagement-depth facets.

**Space Vera co-pilot.** The same `lib/ai/vera/today.ts` orchestrator runs per Space, surfacing the 5 actions that matter for that Space's members; the Space owner gets the autonomy slider.

**AI-depth as the tier ladder:**

| Tier | Gets | Lever |
|---|---|---|
| Free Space | Today (suggest-only) + summaries + read-only scoring | The wedge, never paywalled |
| Practitioner+ Space | Governed auto-execution of safe playbooks, larger action volume, advanced segments | `crm.playbooks` + `crm.autonomy` |
| Top Space | Predictive churn/advocacy alerts, the full Resonance Graph + managed matching | `crm.resonance_ai` |

Meter on **outcome-shaped units** that fit the ethos (members re-activated, advocacy invites accepted, playbook actions run), never extractive per-message counts on member tiers (Practitioner, Supporter), where that would feel like a shakedown. Reserve consumption metering for Space and operator plans where it tracks delivered value. Tie to the existing pricing spine (`lib/pricing/plans.ts`).

---

## Data model additions

**Answer first:** every addition is additive (no destructive change), RLS-consistent with repo conventions (owner-scoped or Space-scoped reads, service-role writes), and registry-declared where it is a trait. Migrations live in `supabase/migrations/` (source of truth).

| Migration (new) | What | RLS | Notes |
|---|---|---|---|
| `*_playbook_registry.sql` | `playbooks` (id, trigger_signal, action_sequence jsonb, autonomy_tier, space_id nullable) | Service-role write; owner/Space read | Mirrors trait-registry "declare before exists" |
| `*_playbook_runs.sql` | `playbook_runs` (playbook_id, subject ref, status, started_at, outcome) | Owner/Space scoped | Audit + circuit-breaker input |
| `*_engagement_scores.sql` | Materialized view over `member_traits` for Resonance Health (0-100) + tier | Read via SECURITY DEFINER RPC | Nightly refresh, not live |
| `*_resonance_embeddings.sql` | `pgvector` column on the unified person + ANN index | Service-role write; sensitive-class read | Recomputed nightly |
| `*_resonance_edges.sql` | `resonance_edges` (a_pid, b_pid, score, reasons jsonb, expires_at) | Sensitive PII; consent + retention governed; opt-out honored | Stale edges expire, no junk drawer |
| `*_resonance_matches.sql` | `resonance_matches` (a_pid, b_pid, a_optin, b_optin, accepted_at) | Bilateral opt-in | Tracks reciprocal completion |
| `*_resonance_consent.sql` | granular opt-in for matching (extends `contacts.consent_state`) | Owner-scoped | Distinct from email subscription |

**Registry additions** (`lib/traits/registry.ts`, declared before computed in `lib/traits/compute.ts`): `resonance_health` (computed number), `resonance_cluster` (computed enum, nightly), `resonance_fit_score_primary` (predicted number), `resonance_match_count` (computed number), `decline_slope` (computed, week-over-week practice frequency), `notification_budget` (computed: frequency cap + quiet hours + preferred channel). Extend the `next_best_action` enum with `connect_nearby` and `suggest_circle`.

---

## Phased implementation plan

**Answer first:** highest-leverage, lowest-risk wiring ships first; the **Today surface lands in Phase 1**. Each phase is a worktree-isolated multi-agent fan-out with no file conflicts (agents own disjoint module trees and integrate only at typed seams). Effort is rough engineer-weeks. Phases 1 -> 2 -> 3 are sequential (the loop, then the cockpit over it, then the safety it needs to go autonomous). Phases 4, 5, 6 can run in parallel once Phase 3 lands.

| Phase | Goal | Nature | Effort | ADR | Depends on |
|---|---|---|---|---|---|
| 1 | Close the loop: Today + Playbook Registry | Mostly wiring | 2-3 wk | ADR-382 | none |
| 2 | Brilliant dashboard, 3 altitudes | Wiring + new UI | 3 wk | ADR-383 | 1 |
| 3 | Prediction explainability + circuit breaker | New | 2 wk | ADR-384 | 1 |
| 4 | Resonance Graph v1 (scoring + intros) | New | 3-4 wk | ADR-385 | 3 |
| 5 | Gamification fuel + winback/dunning playbooks | Wiring | 2 wk | ADR-386 | 3 |
| 6 | Per-Space AI-depth upsell + metering | Wiring | 2 wk | ADR-387 | 3 |

### Phase 1 - ADR-382 - Close the loop (Today + Playbook Registry)
**Deliverables:** `lib/playbooks/registry.ts` (new), `lib/ai/vera/today.ts` (new orchestrator, reuse `lib/ai/vera/concierge.ts` + `lib/ai/vera/loop.ts`), new write tools in `lib/ai/vera/tools.ts` (`save_streak`, `tag_contact`, `move_contact_stage`, `send_playbook_email`) + dispatch in `lib/ai/vera/execute.ts`, extend `lib/crm/interactions.ts` `InteractionSource` with `'playbook'`, migrations `*_playbook_registry.sql` + `*_playbook_runs.sql`. **Nature:** mostly wiring on existing seams. **Parallel split:** Agent A owns `lib/playbooks/*` + the two migrations; Agent B owns `lib/ai/vera/*`; Agent C owns the Today UI route. Integrate at the Playbook Registry type.

### Phase 2 - ADR-383 - The dashboard
**Deliverables:** `app/(main)/admin/crm/page.tsx` (Platform cockpit, new), extend `app/(main)/spaces/[slug]/crm/page.tsx` (Space cockpit), Detail-template Person view, `*_engagement_scores.sql` materialized view + RPC, register routes in `lib/layout/page-chrome.ts`, `resonance_health` trait in `lib/traits/registry.ts` + `lib/traits/compute.ts`. **Nature:** new UI composed from existing kit (`DashboardTemplate`, `StatCard`, `SectionHeader`, `SidebarCard`, `EmptyState`). **Parallel split:** Agent A owns the Platform route; Agent B owns the Space route extension; Agent C owns the trait + migration; Agent D owns the Person view. Shared kit is imported read-only, so no file conflict.

### Phase 3 - ADR-384 - Explainability + safety
**Deliverables:** top-contributing-signals surfacing on every score (`lib/traits/compute.ts` returns reasons), confidence chips on cards, circuit-breaker in `lib/playbooks/*` reading `playbook_runs`, autonomy slider in `lib/spaces/entitlements.ts`, backtest harness comparing predicted churn vs actual dormancy. **Nature:** new. **Parallel split:** Agent A owns explainability in `lib/traits/*`; Agent B owns circuit-breaker + slider in `lib/playbooks/*` + `lib/spaces/*`.

### Phase 4 - ADR-385 - Resonance Graph v1
**Deliverables:** `lib/resonance/embeddings.ts` + `candidates.ts` + `score.ts`, `pgvector` migration, `resonance_edges` + `resonance_matches` + `resonance_consent` migrations, `suggest_resonance_match` + `send_intro_email` tools in `lib/ai/vera/tools.ts`, resonance step in `app/api/cron/refresh-traits/route.ts`, registry additions, Resonance tab on Person view + Space cockpit. **Nature:** new (the novel layer). **Parallel split:** Agent A owns embeddings + candidate gen; Agent B owns scoring + the reciprocal re-ranker; Agent C owns migrations + registry; Agent D owns the intro UX + tools. Integrate at `resonance_score(A,B)`.

### Phase 5 - ADR-386 - Gamification fuel + retention playbooks
**Deliverables:** `decline_slope` + `notification_budget` traits, auto-freeze playbook wiring (`lib/practice-streak.ts`, `lib/achievements.ts`), winback + dunning playbook entries in the registry, Circle-feed celebration, cooperative Circle streak + nudge, `playbook_complete` event in `processGamificationEvent`. **Nature:** wiring. **Parallel split:** Agent A owns traits + scoring; Agent B owns the gamification side-effects; Agent C owns the winback/dunning playbook entries.

### Phase 6 - ADR-387 - Per-Space AI-depth upsell
**Deliverables:** capability keys (`crm.playbooks`, `crm.resonance`, `crm.resonance_ai`, `crm.autonomy`) in `lib/spaces/function-access.ts` + `lib/spaces/entitlements.ts`, outcome-unit metering, contextual upsell at the ceiling, predicate-grammar extension in `lib/spaces/audiences.ts`, tie to `lib/pricing/plans.ts`. **Nature:** wiring. **Parallel split:** Agent A owns entitlements/capabilities; Agent B owns metering + pricing tie-in; Agent C owns the upsell UI + segment grammar.

**Worktree discipline:** each agent runs in its own git worktree on a phase branch, owns a disjoint module tree, and integrates only at typed seams (registry entries, trait keys, score signatures). No two agents edit the same file; shared kit (`StatCard`, `DashboardTemplate`, `withVoice`) is imported read-only.

---

## Success metrics

**Answer first:** we know it works when retention rises, resonance density climbs, winback and upsell convert, and time-to-action collapses, measured first-party off `engagement_events`, never GA4, and reviewed quarterly against actuals.

| Metric | Definition | Target signal | Source |
|---|---|---|---|
| **Retention lift** | WAM cohort retention by `join_cohort`, members in playbooks vs holdout | Holdout-positive lift (proves the loop, not the model) | `member_traits`, retention view |
| **Resurrection rate** | resurrected / dormant, with 7/30/90-day re-retention | Rising, weighted to high-prior-depth lapsers | `member_traits`, `playbook_runs` |
| **Resonance density** | reciprocal connections + Circle ties per member, vs the Space's learned baseline | Up vs baseline (the moat metric) | `resonance_edges`, `resonance_matches` |
| **Winback rate** | dormant members re-activated per winback playbook | Beats generic-offer benchmark; value-led beats discount | `playbook_runs` |
| **Intro accept rate** | double-opt-in intros where both tapped yes | High and rising; low one-sided-ness | `resonance_matches` |
| **Upsell conversion** | free Space -> paid at the ceiling event | Rising, surfaced contextually not blasted | upsell funnel, `lib/pricing/*` |
| **Time-to-action** | signal fired -> action taken (the 24-72h window) | Shrinking; most saves land inside 72h | `interaction_events` |
| **Today inbox-zero rate** | operators clearing all 5 cards / day | High and sustained (the surface works) | Today orchestrator |
| **Score trustworthiness** | backtest of predicted `churn_risk` vs actual dormancy | Hit-rate shown to operators; recomputed quarterly | backtest harness |

Anti-metrics we deliberately do **not** lead with: cumulative member count, total zaps/gems minted, monotonic `lifetime_rank`, raw pageviews. They only go up and answer no operator question.
